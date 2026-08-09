import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

function finiteRange(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (usable.length === 0) {
    return { minimum: 0, maximum: 1 };
  }
  const minimum = Math.min(...usable);
  const maximum = Math.max(...usable);
  return { minimum, maximum: maximum === minimum ? minimum + 1 : maximum };
}

function fillGrid(values) {
  const all = values.flat().filter((value) => Number.isFinite(value));
  const fallback = all.length ? all.reduce((sum, value) => sum + value, 0) / all.length : 0;
  let imputedCells = 0;
  const grid = values.map((row) => row.map((value) => {
    if (Number.isFinite(value)) return value;
    imputedCells += 1;
    return fallback;
  }));
  return { grid, imputedCells };
}

function axisLine(points, color = 0x657369) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(...point)));
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
}

export class SurfaceView {
  constructor(element, { onSelect } = {}) {
    this.element = element;
    this.onSelect = onSelect;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080d0b);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    // Retaining the buffer lets local users and regression tests inspect the rendered analytical surface.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.element.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 18;
    this.controls.target.set(0, 0, 0);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.rawGroup = new THREE.Group();
    this.group.add(this.rawGroup);
    this.axisGuide = document.createElement("div");
    this.axisGuide.className = "surface-axis-guide";
    this.axisGuide.setAttribute("aria-hidden", "true");
    this.axisLabels = {
      x: document.createElement("span"),
      y: document.createElement("span"),
      z: document.createElement("span")
    };
    this.axisLabels.x.className = "surface-axis x";
    this.axisLabels.y.className = "surface-axis y";
    this.axisLabels.z.className = "surface-axis z";
    this.axisGuide.append(this.axisLabels.x, this.axisLabels.y, this.axisLabels.z);
    this.element.append(this.axisGuide);
    this.wire = null;
    this.mesh = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.resetCamera();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.element);
    this.renderer.domElement.addEventListener("pointerdown", (event) => this.pick(event));
    this.running = true;
    this.frame();
  }

  resetCamera() {
    this.camera.position.set(7.8, 7, 8.8);
    this.controls.target.set(0, 0, 0.4);
    this.controls.update();
  }

  resize() {
    const width = Math.max(1, this.element.clientWidth);
    const height = Math.max(1, this.element.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  frame() {
    if (!this.running) {
      return;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(() => this.frame());
  }

  clear() {
    while (this.group.children.length) {
      const child = this.group.children.pop();
      child.traverse?.((entry) => {
        entry.geometry?.dispose?.();
        entry.material?.dispose?.();
      });
    }
    this.rawGroup = new THREE.Group();
    this.group.add(this.rawGroup);
    this.mesh = null;
    this.wire = null;
  }

  update({ values, rawPoints = [], showRaw = true, showWire = true, valueLabel = "Value", axes = {}, onSelect }) {
    this.clear();
    if (onSelect) {
      this.onSelect = onSelect;
    }
    const gridResult = fillGrid(values);
    const grid = gridResult.grid;
    const rows = grid.length;
    const columns = grid[0]?.length ?? 0;
    this.valueLabel = valueLabel;
    this.axisLabels.x.textContent = axes.x ?? "X";
    this.axisLabels.y.textContent = axes.y ?? "Y";
    this.axisLabels.z.textContent = axes.z ?? valueLabel;
    if (rows < 2 || columns < 2) {
      this.resize();
      return { rows, columns, imputedCells: gridResult.imputedCells };
    }
    const range = finiteRange(grid.flat());
    const width = 8;
    const height = 5.4;
    const depth = 2.65;
    const vertices = [];
    const colors = [];
    const indices = [];
    const color = new THREE.Color();
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const raw = grid[row][column];
        const normal = (raw - range.minimum) / (range.maximum - range.minimum);
        const x = -width / 2 + (column / (columns - 1)) * width;
        const y = -height / 2 + (row / (rows - 1)) * height;
        const z = -depth / 2 + normal * depth;
        vertices.push(x, y, z);
        color.setHSL(0.45 - normal * 0.08, 0.5, 0.32 + normal * 0.22);
        colors.push(color.r, color.g, color.b);
      }
    }
    for (let row = 0; row < rows - 1; row += 1) {
      for (let column = 0; column < columns - 1; column += 1) {
        const a = row * columns + column;
        const b = a + 1;
        const c = a + columns;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.67, metalness: 0.08, side: THREE.DoubleSide })
    );
    this.group.add(this.mesh);
    this.wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x9ec7b9, transparent: true, opacity: 0.46 })
    );
    this.wire.visible = showWire;
    this.group.add(this.wire);

    const base = axisLine([[-width / 2, -height / 2, -depth / 2], [width / 2, -height / 2, -depth / 2], [width / 2, height / 2, -depth / 2]], 0x657369);
    this.group.add(base);
    const light = new THREE.DirectionalLight(0xf4e8c8, 1.25);
    light.position.set(4, -2, 8);
    this.group.add(light);
    const fill = new THREE.AmbientLight(0x759a8d, 0.65);
    this.group.add(fill);

    const sphere = new THREE.SphereGeometry(0.078, 12, 12);
    for (const point of rawPoints) {
      if (!Number.isFinite(point.value)) {
        continue;
      }
      const x = -width / 2 + (point.column / Math.max(1, columns - 1)) * width;
      const y = -height / 2 + (point.row / Math.max(1, rows - 1)) * height;
      const normal = (point.value - range.minimum) / (range.maximum - range.minimum);
      const z = -depth / 2 + normal * depth + 0.03;
      const pointColor = point.status === "valid" ? 0xf2eee0 : point.status === "wide" ? 0xf0b35c : 0xf06c69;
      const material = new THREE.MeshStandardMaterial({ color: pointColor, roughness: 0.34, metalness: 0.14 });
      const marker = new THREE.Mesh(sphere, material);
      marker.position.set(x, y, z);
      marker.userData = point;
      this.rawGroup.add(marker);
    }
    this.rawGroup.visible = showRaw;
    this.resize();
    return { rows, columns, imputedCells: gridResult.imputedCells };
  }

  setRawVisible(value) {
    this.rawGroup.visible = Boolean(value);
  }

  setWireVisible(value) {
    if (this.wire) {
      this.wire.visible = Boolean(value);
    }
  }

  pick(event) {
    if (!this.rawGroup.visible || this.rawGroup.children.length === 0) {
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.rawGroup.children, false);
    if (hits[0]?.object?.userData && this.onSelect) {
      this.onSelect(hits[0].object.userData);
    }
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.clear();
    this.renderer.dispose();
  }
}
