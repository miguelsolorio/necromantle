import { CAMERA } from '@/content/player';
import type { Input } from './input';
import { onActivate } from '@/ui/tap';

export interface TouchHooks { pause(): void }

/** Keep receiving moves after the finger leaves the element. Throws if the pointer is already gone, which is fine to ignore. */
function capture(el: Element, id: number): void { try { el.setPointerCapture(id); } catch { /* pointer already released */ } }

/**
 * Back to 1x. iOS keeps the pinch scale across a reload, so a page that came back zoomed would stay zoomed.
 * Dropping the scale limits from the viewport meta and putting them straight back makes WebKit re-read it and
 * clamp the live scale into the declared 1x (index.html) — the mutation is the whole point, so both writes have
 * to change the string. Synchronous on purpose: a hidden tab never runs the animation frame a deferred restore
 * would need. `pageshow` repeats it for the back-forward cache, which restores the old scale without a fresh load.
 */
export function resetZoom(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  const pinned = meta.content;
  const loose = pinned.replace(/,\s*(?:min|max)imum-scale=[^,]*/g, '');
  const snap = (): void => { meta.content = loose; meta.content = pinned; };
  snap();
  addEventListener('pageshow', snap);
}

/** The surfaces the game is played on: everything a thumb lands on during combat. Menus are deliberately not here. */
const PLAY_SURFACES = '#game, .skillbar, .touch-layer, .prompt, .dead';

/**
 * iOS zoom guard. `touch-action` (hud.css) is the declared fix for double-tap zoom and WebKit zoomed on a fast
 * second tap on the skill arc regardless, so on the play surfaces the touch default is cancelled outright.
 * Cancelling `touchstart` is the half that matters: by `touchend` the gesture is already recognised. Nothing is
 * lost — touch activation runs on pointerup (ui/tap.ts), and pointer events still fire for a cancelled touch.
 *
 * Menus keep their ordinary touches, including flick scrolling, so there the guard stays the narrow one: drop the
 * second `touchend` of a quick double tap and leave form controls alone. `gesturestart` is Safari's pinch: two
 * thumbs on the world must not zoom the page either.
 */
function guardZoom(): void {
  let last = 0;
  const onPlaySurface = (e: TouchEvent) => e.target instanceof Element && !!e.target.closest(PLAY_SURFACES);
  document.addEventListener('touchstart', (e) => {
    if (e.cancelable && onPlaySurface(e)) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchend', (e) => {
    const now = performance.now();
    const fast = now - last < 350 && !(e.target instanceof Element && e.target.closest('input, select, textarea'));
    if (e.cancelable && (fast || onPlaySurface(e))) e.preventDefault();
    last = now;
  }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
}

/**
 * Touch layer: a floating joystick on the left, look-drag everywhere else on the world, and the HUD's own
 * skill slots as hold-to-use buttons. Every pointer is tracked by id so a thumb on the stick, a thumb aiming
 * and a held skill work at once. Everything it does goes through `Input`'s synthetic-action API, so the game,
 * the abilities and the player controller never know a touch from a key.
 */
export class TouchControls {
  readonly el: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private joyId: number | null = null;
  private joyX = 0; private joyY = 0;
  private lookId: number | null = null;
  private lookX = 0; private lookY = 0;
  private held = new Map<number, { key: string; el: HTMLElement }>();
  private sprint = false;
  /** Look multiplier from the settings slider (0.5–2). */
  lookScale = 1;
  /** Knob travel in CSS px; pushing past `sprintAt` × this sprints, back inside `walkAt` × this stops. */
  private readonly radius = 56;
  private readonly dead = 0.15;
  private readonly sprintAt = 1.35;
  private readonly walkAt = 1.1;

  constructor(private input: Input, hud: HTMLElement, private canvas: HTMLCanvasElement, hooks: TouchHooks) {
    guardZoom();
    this.el = document.createElement('div'); this.el.className = 'touch-layer';
    this.el.innerHTML = `
      <div class="stick"><div class="knob"></div></div>
      <div class="tbtns">
        <button class="tbtn bag" aria-label="Inventory"><svg viewBox="0 0 40 40"><path d="M8 14h24l-2 20H10z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M14 14V9a6 6 0 0 1 12 0v5" fill="none" stroke="currentColor" stroke-width="3"/></svg></button>
        <button class="tbtn pause" aria-label="Pause"><svg viewBox="0 0 40 40"><rect x="10" y="8" width="7" height="24" fill="currentColor"/><rect x="23" y="8" width="7" height="24" fill="currentColor"/></svg></button>
      </div>`;
    hud.appendChild(this.el);
    this.stick = this.el.querySelector('.stick')!; this.knob = this.el.querySelector('.knob')!;
    onActivate(this.el.querySelector('.bag')!, () => input.tap('KeyI'));
    onActivate(this.el.querySelector('.pause')!, () => hooks.pause());
    // contextual buttons the HUD already draws: the interaction prompt and the death card
    onActivate(hud.querySelector('.prompt')!, () => input.tap('KeyE'));
    onActivate(hud.querySelector('.dead')!, () => input.tap('KeyR'));

    // world touches: joystick zone on the left, look-drag elsewhere
    canvas.addEventListener('pointerdown', (e) => this.onWorldDown(e));
    canvas.addEventListener('pointermove', (e) => this.onWorldMove(e));
    canvas.addEventListener('pointerup', (e) => this.onWorldUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onWorldUp(e));

    // skill slots: hold to use (delegated, the bar is rebuilt per class)
    const bar = hud.querySelector('.skillbar') as HTMLElement;
    bar.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      const slot = (e.target as Element).closest<HTMLElement>('.slot[data-key]'); if (!slot) return;
      e.preventDefault(); e.stopPropagation();
      capture(slot, e.pointerId);
      this.held.set(e.pointerId, { key: slot.dataset.key!, el: slot });
      slot.classList.add('press');
      if (!input.locked) input.engage();
      input.setAction(slot.dataset.key!, true);
    });
    const releaseSlot = (e: PointerEvent) => { const h = this.held.get(e.pointerId); if (!h) return; this.held.delete(e.pointerId); h.el.classList.remove('press'); input.setAction(h.key, false); };
    bar.addEventListener('pointerup', releaseSlot); bar.addEventListener('pointercancel', releaseSlot); bar.addEventListener('lostpointercapture', releaseSlot);
    bar.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }

  setLook(scale: number): void { this.lookScale = scale; }

  /** Drop every active pointer (tab hidden, focus lost, screen opened over the game). */
  reset(): void {
    for (const h of this.held.values()) { h.el.classList.remove('press'); this.input.setAction(h.key, false); }
    this.held.clear();
    this.endJoy(); this.lookId = null;
  }

  private inJoyZone(x: number, y: number): boolean { return x < innerWidth * 0.45 && y > innerHeight * 0.2; }

  private onWorldDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    e.preventDefault(); // no compat mouse events: the canvas click/mousedown paths are for real mice
    if (!this.input.locked) this.input.engage();
    capture(this.canvas, e.pointerId);
    if (this.joyId === null && this.inJoyZone(e.clientX, e.clientY)) {
      this.joyId = e.pointerId; this.joyX = e.clientX; this.joyY = e.clientY;
      this.stick.style.left = `${e.clientX}px`; this.stick.style.top = `${e.clientY}px`; this.stick.classList.add('on');
      this.knob.style.transform = 'translate(0px, 0px)';
      this.input.moveOverride = { x: 0, z: 0 };
    } else if (this.lookId === null) {
      this.lookId = e.pointerId; this.lookX = e.clientX; this.lookY = e.clientY;
    }
  }

  private onWorldMove(e: PointerEvent): void {
    if (e.pointerId === this.joyId) {
      const dx = e.clientX - this.joyX, dy = e.clientY - this.joyY;
      const len = Math.hypot(dx, dy);
      const r = this.radius;
      const k = Math.min(1, len / r);
      const kx = len > 0 ? (dx / len) * k * r : 0, ky = len > 0 ? (dy / len) * k * r : 0;
      this.knob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
      // dead zone, then a linear ramp to the rim
      const m = k < this.dead ? 0 : (k - this.dead) / (1 - this.dead);
      this.input.moveOverride = len > 0 ? { x: (dx / len) * m, z: (-dy / len) * m } : { x: 0, z: 0 };
      if (!this.sprint && len > r * this.sprintAt) this.sprint = true;
      else if (this.sprint && len < r * this.walkAt) this.sprint = false;
      this.input.sprintOverride = this.sprint; this.stick.classList.toggle('sprint', this.sprint);
    } else if (e.pointerId === this.lookId) {
      const k = (CAMERA.touchSensitivity / CAMERA.sensitivity) * this.lookScale;
      this.input.addLook((e.clientX - this.lookX) * k, (e.clientY - this.lookY) * k);
      this.lookX = e.clientX; this.lookY = e.clientY;
    }
  }

  private onWorldUp(e: PointerEvent): void {
    if (e.pointerId === this.joyId) this.endJoy();
    else if (e.pointerId === this.lookId) this.lookId = null;
  }

  private endJoy(): void {
    this.joyId = null; this.sprint = false;
    this.stick.classList.remove('on', 'sprint');
    this.input.moveOverride = null; this.input.sprintOverride = false;
  }
}
