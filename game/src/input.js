// Keyboard + mouse (pointer lock) input. Desktop browser only.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.locked = false;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      }
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  pressed(code) {
    return this.justPressed.has(code);
  }

  takeLook() {
    const out = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return out;
  }

  endFrame() {
    this.justPressed.clear();
  }

  lock() {
    if (!this.locked) {
      try {
        this.canvas.requestPointerLock();
      } catch {
        // Pointer lock unavailable (headless screenshots): mouse look is skipped.
      }
    }
  }

  unlock() {
    if (this.locked) document.exitPointerLock();
  }
}
