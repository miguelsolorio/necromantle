/**
 * Touch-safe activation. iOS Safari withholds the compat `click` after a tap when the hover pass changes content
 * or starts a transition on the element (the title buttons animate on hover), so touch pointers activate on a
 * clean `pointerup` instead, and the late compat click is swallowed. Mice keep the plain click path.
 *
 * The swallow window is shared across elements: when the activation swaps the screen under the finger (title
 * menu to character select), the compat click can land on whatever now sits there, and that one is a ghost too.
 *
 * A touch also carries a `press` class from finger-down until a beat after the release, since phones have no hover
 * and a tap that only changes a line of text would otherwise give no sign of which button took it. Sliding off the
 * element drops the class at once, and no tap fires.
 */
let touchAt = 0;
const LINGER = 320;

export function onActivate(el: Element, fn: (e: Event) => void): void {
  let down: { x: number; y: number } | null = null;
  let linger = 0;
  const press = (on: boolean) => { window.clearTimeout(linger); el.classList.toggle('press', on); };
  el.addEventListener('pointerdown', (e) => { const p = e as PointerEvent; if (p.pointerType !== 'mouse') { down = { x: p.clientX, y: p.clientY }; press(true); } });
  el.addEventListener('pointerup', (e) => {
    const p = e as PointerEvent;
    if (p.pointerType === 'mouse' || !down) return;
    const tap = Math.hypot(p.clientX - down.x, p.clientY - down.y) < 12; down = null;
    if (!tap) { press(false); return; }
    linger = window.setTimeout(() => press(false), LINGER);
    touchAt = performance.now();
    fn(e);
  });
  // a touch leaves the element when it slides off; it also "leaves" right after its own pointerup, when `down` is already clear
  el.addEventListener('pointerleave', (e) => { if ((e as PointerEvent).pointerType !== 'mouse' && down) { down = null; press(false); } });
  el.addEventListener('pointercancel', () => { down = null; press(false); });
  el.addEventListener('click', (e) => { if (performance.now() - touchAt < 800) { e.preventDefault(); return; } fn(e); });
}
