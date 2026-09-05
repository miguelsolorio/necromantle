import { PLATFORM } from '@/core/platform';

/**
 * Keyboard + pointer-locked mouse, plus a synthetic-action API the touch layer drives (`input/touch.ts`).
 * Edge-triggered `pressed` sets are cleared each frame by the game loop.
 *
 * `locked` is the "controls are live" flag: pointer lock on desktop, the first tap on touch (which is treated
 * like `?nolock`, since touch devices have no pointer lock).
 */
export class Input {
  readonly keys = new Set<string>();
  readonly pressed = new Set<string>();
  readonly buttons = new Set<number>();
  readonly buttonsPressed = new Set<number>();
  locked = false;
  private dx = 0;
  private dy = 0;
  private _wantsLock = true;
  /** `?nolock` lets automated tests drive the game without pointer lock (movementX still works); touch never locks. */
  readonly noLock: boolean;
  /** Touch joystick: replaces the WASD axis while set. */
  moveOverride: { x: number; z: number } | null = null;
  sprintOverride = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.noLock = new URLSearchParams(location.search).has('nolock') || PLATFORM.touch;
    canvas.addEventListener('click', () => this.engage());
    document.addEventListener('pointerlockchange', () => { if (this.noLock) return; this.locked = document.pointerLockElement === canvas; if (!this.locked) { this.keys.clear(); this.buttons.clear(); } });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
      if (['Tab', 'Space', 'F1', 'F2'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    canvas.addEventListener('mousemove', (e) => { if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; } });
    // Mouse buttons only: touch pointers belong to the touch layer, which prevents the compat mouse events.
    canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || !this.locked) return; this.buttons.add(e.button); this.buttonsPressed.add(e.button); });
    window.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') this.buttons.delete(e.button); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Take the controls: pointer lock on desktop, a flag on touch and in the harness. */
  engage(): void {
    if (!this._wantsLock || this.locked) return;
    if (this.noLock) { this.locked = true; return; }
    this.canvas.requestPointerLock();
  }

  /** False while a screen (inventory, dev panel) owns the pointer. Without pointer lock, flipping it back re-engages at once. */
  get wantsLock(): boolean { return this._wantsLock; }
  set wantsLock(v: boolean) { this._wantsLock = v; if (v && this.noLock && !this.locked) this.locked = true; }

  isDown(code: string): boolean { return this.keys.has(code); }
  wasPressed(code: string): boolean { return this.pressed.has(code); }
  buttonDown(b: number): boolean { return this.buttons.has(b); }
  buttonPressed(b: number): boolean { return this.buttonsPressed.has(b); }

  /** Hold or release an action by key code. `Mouse<n>` codes map to mouse buttons, everything else to keys. */
  setAction(code: string, down: boolean): void {
    if (code.startsWith('Mouse')) {
      const b = +code.slice(5);
      if (down) { if (!this.buttons.has(b)) this.buttonsPressed.add(b); this.buttons.add(b); } else this.buttons.delete(b);
    } else if (down) { if (!this.keys.has(code)) this.pressed.add(code); this.keys.add(code); } else this.keys.delete(code);
  }
  /** One-frame press for actions read through `wasPressed` (interact, inventory, respawn, potion). */
  tap(code: string): void { this.pressed.add(code); }
  /** Camera look from a touch drag, in the same units as mouse movement. */
  addLook(dx: number, dy: number): void { if (this.locked) { this.dx += dx; this.dy += dy; } }

  /** Raw WASD axis, x = strafe (+right), z = forward (+forward). The joystick takes over when no key is down. */
  moveAxis(): { x: number; z: number } {
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (x === 0 && z === 0 && this.moveOverride) { x = this.moveOverride.x; z = this.moveOverride.z; }
    const l = Math.hypot(x, z);
    return l > 1 ? { x: x / l, z: z / l } : { x, z };
  }
  get sprint(): boolean { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.sprintOverride; }

  consumeMouse(): { dx: number; dy: number } { const r = { dx: this.dx, dy: this.dy }; this.dx = 0; this.dy = 0; return r; }
  endFrame(): void { this.pressed.clear(); this.buttonsPressed.clear(); }
  release(): void { if (this.noLock) { this.locked = false; return; } if (this.locked) document.exitPointerLock(); }
}
