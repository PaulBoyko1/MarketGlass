export const REPLAY_SPEEDS = Object.freeze([0.25, 1, 5, 20, 100]);

function boundedIndex(length, value) {
  const numeric = Number(value);
  const index = Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
  return Math.max(0, Math.min(length - 1, index));
}

export function createReplayState(length, initialIndex = 0) {
  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError("Replay length must be a positive integer.");
  }
  return Object.freeze({
    length,
    index: boundedIndex(length, initialIndex),
    playing: false,
    speed: 1
  });
}

export function reduceReplay(state, action) {
  const move = (amount) => {
    const numeric = Number(amount);
    return boundedIndex(state.length, state.index + (Number.isFinite(numeric) ? Math.trunc(numeric) : 0));
  };
  switch (action.type) {
    case "play":
      return { ...state, playing: state.index < state.length - 1 };
    case "pause":
      return { ...state, playing: false };
    case "seek":
      return { ...state, index: boundedIndex(state.length, action.index), playing: false };
    case "step":
      return { ...state, index: move(Number(action.direction) || 1), playing: false };
    case "speed":
      return REPLAY_SPEEDS.includes(Number(action.speed)) ? { ...state, speed: Number(action.speed) } : state;
    case "tick": {
      if (!state.playing) {
        return state;
      }
      const next = move(Math.max(1, Math.round(state.speed)));
      return { ...state, index: next, playing: next < state.length - 1 };
    }
    default:
      return state;
  }
}
