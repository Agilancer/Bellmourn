// Keyboard state sampled once per fixed tick: held / pressed (this tick) / released (this tick).
const BINDINGS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyC: 'jump', KeyV: 'attack', KeyX: 'cast',
  KeyB: 'debugBlood', Backquote: 'debug',
};

export class Input {
  constructor() {
    this.down = new Set();      // physical state, updated by events
    this.held = {};
    this.pressed = {};
    this.released = {};
    this.queued = new Set();    // presses that happened between ticks (never lost)
    addEventListener('keydown', (e) => {
      const a = BINDINGS[e.code];
      if (!a) return;
      e.preventDefault();
      if (!this.down.has(a)) this.queued.add(a);
      this.down.add(a);
    });
    addEventListener('keyup', (e) => {
      const a = BINDINGS[e.code];
      if (!a) return;
      e.preventDefault();
      this.down.delete(a);
    });
    addEventListener('blur', () => this.down.clear());
  }

  tick() {
    const prev = this.held;
    this.held = {};
    this.pressed = {};
    this.released = {};
    for (const a of new Set(Object.values(BINDINGS))) {
      this.held[a] = this.down.has(a) || this.queued.has(a);
      this.pressed[a] = this.queued.has(a);
      this.released[a] = !!prev[a] && !this.down.has(a);
    }
    this.queued.clear();
  }

  // -1, 0 or 1. When both are held the most recent wins via order of the set.
  axisX() {
    return (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
  }
}
