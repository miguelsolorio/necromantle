/**
 * Touch-safe activation. iOS Safari withholds the compat `click` after a tap when the hover pass changes content
 * or starts a transition on the element (the title buttons animate on hover), so touch pointers activate on a
 * clean `pointerup` instead, and the late compat click is swallowed. Mice keep the plain click path.
 */
export function onActivate(el: Element, fn: (e: Event) => void): void {
  let down: { x: number; y: number } | null = null;
  let touchAt = 0;
  el.addEventListener('pointerdown', (e) => { const p = e as PointerEvent; if (p.pointerType !== 'mouse') down = { x: p.clientX, y: p.clientY }; });
  el.addEventListener('pointerup', (e) => {
    const p = e as PointerEvent;
    if (p.pointerType === 'mouse' || !down) return;
    const tap = Math.hypot(p.clientX - down.x, p.clientY - down.y) < 12; down = null;
    if (!tap) return;
    touchAt = performance.now();
    fn(e);
  });
  el.addEventListener('pointercancel', () => { down = null; });
  el.addEventListener('click', (e) => { if (performance.now() - touchAt < 800) { e.preventDefault(); return; } fn(e); });
}
