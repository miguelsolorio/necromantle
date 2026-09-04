/** Keyboard + pointer-locked mouse. Edge-triggered `pressed` sets are cleared each frame by the game loop. */
export class Input {
  readonly keys = new Set<string>();
  readonly pressed = new Set<string>();
  readonly buttons = new Set<number>();
  readonly buttonsPressed = new Set<number>();
  locked = false;
  private dx = 0;
  private dy = 0;
  wantsLock = true;
  /** `?nolock` lets automated tests drive the game without pointer lock (movementX still works). */
  readonly noLock = new URLSearchParams(location.search).has("nolock");

  constructor(private canvas: HTMLCanvasElement) {
    canvas.addEventListener("click", () => { if (!this.wantsLock || this.locked) return; if (this.noLock) { this.locked = true; return; } canvas.requestPointerLock(); });
    document.addEventListener("pointerlockchange", () => { if (this.noLock) return; this.locked = document.pointerLockElement === canvas; if (!this.locked) { this.keys.clear(); this.buttons.clear(); } });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
      if (['Tab', 'Space', 'F1', 'F2'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    canvas.addEventListener('mousemove', (e) => { if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; } });
    canvas.addEventListener('mousedown', (e) => { if (this.locked) { this.buttons.add(e.button); this.buttonsPressed.add(e.button); } });
    window.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code: string): boolean { return this.keys.has(code); }
  wasPressed(code: string): boolean { return this.pressed.has(code); }
  buttonDown(b: number): boolean { return this.buttons.has(b); }
  buttonPressed(b: number): boolean { return this.buttonsPressed.has(b); }

  /** Raw WASD axis, x = strafe (+right), z = forward (+forward). */
  moveAxis(): { x: number; z: number } {
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, z);
    return l > 1 ? { x: x / l, z: z / l } : { x, z };
  }
  get sprint(): boolean { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }

  consumeMouse(): { dx: number; dy: number } { const r = { dx: this.dx, dy: this.dy }; this.dx = 0; this.dy = 0; return r; }
  endFrame(): void { this.pressed.clear(); this.buttonsPressed.clear(); }
  release(): void { if (this.noLock) { this.locked = false; return; } if (this.locked) document.exitPointerLock(); }
}
