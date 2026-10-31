// Input: keyboard + mouse (pointer lock) on desktop, touch controls in landscape on mobile.
// Everything ends up in one state the game reads each frame: move (-1..1 x/y), look deltas
// (radians), and actions held or pressed this frame.

// a phone or tablet: the main pointer is a finger. (A laptop with a touchscreen has a mouse or
// touchpad as its main pointer, and plays with that.)
export const TOUCH = matchMedia('(pointer: coarse)').matches;

export class Input {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // edge-triggered this frame
    this.look = [0, 0];
    this.mouse = { left: false, right: false };
    this.move = [0, 0];         // touch joystick
    this.touch = TOUCH;
    this.sensitivity = 0.0022;
    this.touchLook = 0.006;
    this.stickRun = false;      // the stick pushed right out runs
    this.enabled = true;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Tab', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.release());
    canvas.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) {
        if (this.enabled && !this.touch) canvas.requestPointerLock?.();
        return;
      }
      if (e.button === 0) { this.mouse.left = true; this.pressed.add('Mouse0'); }
      if (e.button === 2) { this.mouse.right = true; this.pressed.add('Mouse2'); }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.look[0] += e.movementX * this.sensitivity;
      this.look[1] += e.movementY * this.sensitivity;
    });
    if (this.touch) this.setupTouch(ui);
  }

  get locked() { return document.pointerLockElement === this.canvas; }

  /** Let go of everything held (the window lost focus, or the touch controls were put away). */
  release() {
    this.keys.clear();
    this.mouse.left = this.mouse.right = false;
    this.move = [0, 0]; this.stickRun = false;
    this.resetTouch?.();
  }

  setupTouch(ui) {
    const stick = ui.querySelector('#stick'), knob = ui.querySelector('#knob');
    let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
    const R = 56;
    this.resetTouch = () => {
      stickId = lookId = null;
      knob.style.transform = ''; stick.style.opacity = 0.35;
      for (const b of ui.querySelectorAll('.tbtn.down')) b.classList.remove('down');
    };
    // iOS Safari zooms on a pinch whatever the viewport tag says
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    const onStart = (e) => {
      for (const t of e.changedTouches) {
        if (t.target.closest('.tbtn')) continue;
        if (t.clientX < innerWidth * 0.4 && stickId === null) {
          stickId = t.identifier; sx = t.clientX; sy = t.clientY;
          stick.style.left = sx - R + 'px'; stick.style.top = sy - R + 'px'; stick.style.opacity = 1;
        } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = t.clientX - sx, dy = t.clientY - sy;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx *= R / d; dy *= R / d; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.move = [dx / R, -dy / R];
          this.stickRun = d >= R * 0.95;
        } else if (t.identifier === lookId) {
          this.look[0] += (t.clientX - lx) * this.touchLook; this.look[1] += (t.clientY - ly) * this.touchLook;
          lx = t.clientX; ly = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; this.move = [0, 0]; this.stickRun = false; knob.style.transform = ''; stick.style.opacity = 0.35; }
        if (t.identifier === lookId) lookId = null;
      }
    };
    const layer = ui.querySelector('#touchlayer');
    layer.addEventListener('touchstart', onStart, { passive: false });
    layer.addEventListener('touchmove', onMove, { passive: false });
    layer.addEventListener('touchend', onEnd);
    layer.addEventListener('touchcancel', onEnd);
    for (const btn of ui.querySelectorAll('.tbtn')) {
      const code = btn.dataset.code;
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.keys.add(code); this.pressed.add(code);
        if (code === 'Mouse0') this.mouse.left = true;
        if (code === 'Mouse2') this.mouse.right = true;
        btn.classList.add('down');
      }, { passive: false });
      const up = (e) => {
        e.preventDefault();
        this.keys.delete(code);
        if (code === 'Mouse0') this.mouse.left = false;
        if (code === 'Mouse2') this.mouse.right = false;
        btn.classList.remove('down');
      };
      btn.addEventListener('touchend', up, { passive: false });
      btn.addEventListener('touchcancel', up, { passive: false });
    }
  }

  axes() {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    x += this.move[0]; y += this.move[1];
    const l = Math.hypot(x, y);
    return l > 1 ? [x / l, y / l] : [x, y];
  }

  was(code) { return this.pressed.has(code); }
  held(code) { return this.keys.has(code) || (code === 'Mouse0' && this.mouse.left) || (code === 'Mouse2' && this.mouse.right); }
  endFrame() { this.pressed.clear(); this.look = [0, 0]; }
}
