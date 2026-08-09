import assert from "node:assert/strict";
import test from "node:test";

import { createReplayState, reduceReplay } from "../src/core/replay.mjs";

test("replay state clamps to integer recorded snapshots and stops at the boundary", () => {
  let replay = createReplayState(5, 1.8);
  assert.equal(replay.index, 1);
  replay = reduceReplay(replay, { type: "seek", index: 3.9 });
  assert.equal(replay.index, 3);
  replay = reduceReplay(replay, { type: "speed", speed: 20 });
  replay = reduceReplay(replay, { type: "play" });
  replay = reduceReplay(replay, { type: "tick" });
  assert.equal(replay.index, 4);
  assert.equal(replay.playing, false);
});

test("replay never interpolates or advances while paused", () => {
  const replay = createReplayState(3, 0);
  assert.deepEqual(reduceReplay(replay, { type: "tick" }), replay);
  assert.equal(reduceReplay(replay, { type: "step", direction: 1.7 }).index, 1);
  assert.throws(() => createReplayState(0), /positive integer/);
});
