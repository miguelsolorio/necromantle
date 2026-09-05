/**
 * `?probe=1`: an on-screen log of the input events the page receives, with what sits under the finger, for
 * phones where a tap seems to do nothing. Also catches boot errors and unhandled rejections. Dev aid only.
 */
export function startProbe(): void {
  const el = document.createElement('div'); el.id = 'probe';
  el.style.cssText = 'position:fixed;left:0;top:0;right:0;z-index:100;pointer-events:none;font:11px/1.35 Menlo,monospace;color:#7dff9a;background:rgba(0,0,0,.75);padding:6px 8px;white-space:pre-wrap;word-break:break-all;max-height:48vh;overflow:hidden';
  document.body.appendChild(el);
  const lines: string[] = [];
  const desc = (t: EventTarget | null): string => {
    if (!(t instanceof Element)) return String(t);
    const cls = typeof t.className === 'string' && t.className ? '.' + t.className.trim().split(/\s+/).join('.') : '';
    return `${t.tagName.toLowerCase()}${t.id ? '#' + t.id : ''}${cls}`;
  };
  const render = () => {
    const rotate = document.getElementById('rotate'); const boot = document.getElementById('boot');
    el.textContent = `${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 90)}\nvp ${innerWidth}x${innerHeight} vv ${Math.round(visualViewport?.width ?? 0)}x${Math.round(visualViewport?.height ?? 0)} secure ${isSecureContext} touchPoints ${navigator.maxTouchPoints} coarse ${matchMedia('(pointer: coarse)').matches}\nhtml.${document.documentElement.className} boot.${boot?.className ?? '-'} rotate ${rotate ? getComputedStyle(rotate).display : '-'} title.${document.getElementById('title')?.className ?? '-'}\n` + lines.join('\n');
  };
  const push = (s: string) => { lines.push(s); if (lines.length > 10) lines.shift(); render(); };
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'mousedown', 'click']) {
    document.addEventListener(type, (e) => {
      const p = e as PointerEvent; const t0 = (e as TouchEvent).changedTouches?.[0];
      const x = t0 ? t0.clientX : p.clientX, y = t0 ? t0.clientY : p.clientY;
      const under = typeof x === 'number' ? desc(document.elementFromPoint(x, y)) : '';
      push(`${type}${p.pointerType ? ':' + p.pointerType : ''} → ${desc(e.target)} @${Math.round(x ?? -1)},${Math.round(y ?? -1)} under ${under}${e.defaultPrevented ? ' PREVENTED' : ''}`);
    }, true);
  }
  window.addEventListener('error', (e) => push(`ERROR ${e.message} (${e.filename?.split('/').pop()}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => push(`REJECT ${(e.reason && (e.reason.stack || e.reason.message)) || e.reason}`.slice(0, 220)));
  render(); setInterval(render, 1000);
}
