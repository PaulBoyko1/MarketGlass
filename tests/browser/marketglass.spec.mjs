import { expect, test } from "@playwright/test";

async function nonBackgroundWebglPixels(canvas) {
  return canvas.evaluate((node) => {
    const width = Math.max(1, Math.min(node.width, 192));
    const height = Math.max(1, Math.min(node.height, 192));
    const snapshot = document.createElement("canvas");
    snapshot.width = width;
    snapshot.height = height;
    const context = snapshot.getContext("2d", { willReadFrequently: true });
    if (!context) return { available: false, nonBackground: 0, pixels: 0 };
    context.drawImage(node, 0, 0, width, height);
    const values = context.getImageData(0, 0, width, height).data;
    let nonBackground = 0;
    for (let index = 0; index < values.length; index += 4) {
      if (values[index] > 35 || values[index + 1] > 42 || values[index + 2] > 40) nonBackground += 1;
    }
    return { available: true, nonBackground, pixels: width * height };
  });
}

async function waitForWorkbench(page) {
  await expect(page.locator("#state-readout")).toContainText("SPY session return");
}

test.describe("desktop market workbench", () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test("renders the session microscope, interactive surfaces, and chronological workflow", async ({ page }) => {
    await page.goto("/");
    await waitForWorkbench(page);
    await expect(page.getByRole("heading", { name: "Price is moving. Who is moving with it?" })).toBeVisible();
    await expect(page.locator("#market-chart svg")).toBeVisible();
    await page.getByRole("button", { name: "Step +", exact: true }).click();
    await expect(page.locator("#market-clock")).toHaveText("13:45 ET");

    await page.getByRole("button", { name: "Options lab", exact: true }).click();
    await page.getByRole("button", { name: "IV surface", exact: true }).click();
    const ivCanvas = page.locator("#iv-surface canvas");
    await expect(ivCanvas).toBeVisible();
    await expect(page.getByText(/Surface quality:/)).toBeVisible();
    await page.waitForTimeout(350);
    const ivPixels = await nonBackgroundWebglPixels(ivCanvas);
    expect(ivPixels.available).toBe(true);
    expect(ivPixels.nonBackground).toBeGreaterThan(ivPixels.pixels * 0.01);

    await page.getByRole("button", { name: "0DTE time surface", exact: true }).click();
    await expect(page.locator("#odte-surface canvas")).toBeVisible();
    await page.getByRole("button", { name: "Gamma assumptions", exact: true }).click();
    await expect(page.getByText("POSITION SIGN IS NOT OBSERVED.")).toBeVisible();
    await page.getByRole("button", { name: "P&L scenario", exact: true }).click();
    await expect(page.locator("#pnl-surface canvas")).toBeVisible();

    await page.getByRole("button", { name: "Market state", exact: true }).click();
    await page.getByRole("button", { name: "Formalize observation", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Show the compiled logic before you see the answer." })).toBeVisible();
    await expect(page.locator("#compiled-test")).toContainText("ivChange");
    await page.getByRole("button", { name: "Run chronological test", exact: true }).click();
    await expect(page.locator("#result-summary")).not.toContainText("No experiment run");
    await expect(page.locator("#result-summary")).not.toContainText("N\n0");
    await expect(page.getByText("Untouched holdout")).toBeVisible();
  });

  test("adds a structured notebook falsifier that evaluates against the selected state", async ({ page }) => {
    await page.goto("/");
    await waitForWorkbench(page);
    await page.getByRole("button", { name: "Research notebook", exact: true }).click();
    const notebook = page.locator("#notebook-root");
    const form = notebook.locator(".falsifier-form");
    await form.getByPlaceholder("Condition that would weaken this note").fill("Breadth falls below the selected threshold");
    await form.getByRole("checkbox").check();
    await form.getByRole("combobox").nth(0).selectOption("breadthPct");
    await form.getByRole("combobox").nth(1).selectOption("<");
    await form.getByRole("spinbutton").fill("50");
    await form.getByRole("button", { name: "Add falsifier", exact: true }).click();
    await expect(notebook.getByText("Breadth falls below the selected threshold", { exact: true })).toBeVisible();
    await expect(notebook.getByText(/Positive breadth .* (condition met|watching)/)).toBeVisible();
  });
});

test.describe("mobile workbench", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps the 3D laboratory usable without horizontal document overflow", async ({ page }) => {
    await page.goto("/");
    await waitForWorkbench(page);
    await page.getByRole("button", { name: "Options lab", exact: true }).click();
    await page.getByRole("button", { name: "IV surface", exact: true }).click();
    const canvas = page.locator("#iv-surface canvas");
    await expect(canvas).toBeVisible();
    const geometry = await canvas.evaluate((node) => ({ width: node.clientWidth, height: node.clientHeight, documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    expect(geometry.width).toBeGreaterThan(250);
    expect(geometry.height).toBeGreaterThan(250);
    expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
    const pixels = await nonBackgroundWebglPixels(canvas);
    expect(pixels.available).toBe(true);
    expect(pixels.nonBackground).toBeGreaterThan(pixels.pixels * 0.005);
  });
});
