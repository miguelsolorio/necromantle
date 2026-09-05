export interface DebugState { god: boolean; infiniteEnergy: boolean; freezeAI: boolean; hideHud: boolean; unlockAll: boolean; camDist: number; fov: number; density: number; cdMult: number; hpMult: number; }
export interface DebugHooks { spawn(kind: string, n: number, elite?: boolean): void; clear(): void; screenshot(): void; teleport(where: string): void; levelUp(): void; volume(bus: 'music' | 'sfx', v: number): void; getVolume(bus: 'music' | 'sfx'): number; }

/** Developer panel (design section 43). F1 toggles it; sliders map straight onto live systems. */
export class DebugPanel {
  state: DebugState = { god: false, infiniteEnergy: false, freezeAI: false, hideHud: false, unlockAll: false, camDist: 0, fov: 0, density: 1, cdMult: 1, hpMult: 1 };
  private el: HTMLElement;
  private stat: HTMLElement;
  private title: HTMLElement;
  visible = false;

  constructor(private hooks: DebugHooks, private input: { wantsLock: boolean; release(): void }) {
    this.el = document.createElement('div'); this.el.className = 'dbg';
    this.el.innerHTML = `<h6>NECROMANTLE · DEV <span data-fps></span></h6>`;
    this.title = this.el.querySelector('[data-fps]')!;
    const check = (label: string, key: keyof DebugState) => { const r = document.createElement('label'); r.className = 'row'; r.innerHTML = `<span>${label}</span><input type="checkbox">`; const c = r.querySelector('input')!; c.checked = !!this.state[key]; c.onchange = () => { (this.state as any)[key] = c.checked; }; this.el.appendChild(r); };
    const range = (label: string, key: keyof DebugState, min: number, max: number, step: number, fmt: (v: number) => string) => { const r = document.createElement('label'); r.className = 'row'; r.innerHTML = `<span>${label} <output></output></span><input type="range" min="${min}" max="${max}" step="${step}">`; const i = r.querySelector('input')!, o = r.querySelector('output')!; i.value = `${this.state[key]}`; o.textContent = fmt(+i.value); i.oninput = () => { (this.state as any)[key] = +i.value; o.textContent = fmt(+i.value); }; this.el.appendChild(r); };
    check('God mode', 'god'); check('Infinite energy', 'infiniteEnergy'); check('Freeze AI', 'freezeAI'); check('Hide HUD', 'hideHud'); check('Unlock all abilities', 'unlockAll');
    range('Camera distance', 'camDist', 0, 16, 0.5, (v) => (v === 0 ? 'auto' : `${v} m`));
    range('FOV', 'fov', 0, 100, 1, (v) => (v === 0 ? 'auto' : `${v}°`));
    range('Particle density', 'density', 0, 2, 0.1, (v) => `${Math.round(v * 100)}%`);
    range('Cooldown ×', 'cdMult', 0, 2, 0.1, (v) => v.toFixed(1));
    range('Enemy HP ×', 'hpMult', 0.1, 5, 0.1, (v) => v.toFixed(1));
    const vol = (label: string, bus: 'music' | 'sfx') => { const r = document.createElement('label'); r.className = 'row'; r.innerHTML = `<span>${label} <output></output></span><input type="range" min="0" max="1" step="0.05">`; const i = r.querySelector('input')!, o = r.querySelector('output')!; i.value = `${hooks.getVolume(bus)}`; o.textContent = `${Math.round(+i.value * 100)}%`; i.oninput = () => { hooks.volume(bus, +i.value); o.textContent = `${Math.round(+i.value * 100)}%`; }; this.el.appendChild(r); };
    vol('Music volume', 'music'); vol('Effects volume', 'sfx');
    const btns = document.createElement('div'); btns.className = 'btns';
    const b = (label: string, fn: () => void) => { const x = document.createElement('button'); x.textContent = label; x.onclick = (e) => { e.preventDefault(); fn(); }; btns.appendChild(x); };
    b('+10 ghouls', () => hooks.spawn('ghoul', 10)); b('+20 ghouls', () => hooks.spawn('ghoul', 20)); b('+4 knights', () => hooks.spawn('fallen_knight', 4)); b('+4 cultists', () => hooks.spawn('cultist', 4)); b('+3 wraiths', () => hooks.spawn('wraith', 3)); b('+ elite knight', () => hooks.spawn('fallen_knight', 1, true)); b('+ brute', () => hooks.spawn('brute', 1)); b('+ necromancer', () => hooks.spawn('necromancer', 1)); b('+ elite ghoul', () => hooks.spawn('ghoul', 1, true));
    b('clear', () => hooks.clear()); b('level up', () => hooks.levelUp()); b('tp court', () => hooks.teleport('court')); b('tp door', () => hooks.teleport('door')); b('screenshot', () => hooks.screenshot());
    this.el.appendChild(btns);
    this.stat = document.createElement('div'); this.stat.className = 'stat'; this.el.appendChild(this.stat);
    document.getElementById('hud')!.appendChild(this.el);
  }
  toggle(): void { this.visible = !this.visible; this.el.classList.toggle('on', this.visible); this.input.wantsLock = !this.visible; if (this.visible) this.input.release(); }
  setStats(fps: number, lines: string): void { this.title.textContent = `${fps.toFixed(0)} fps`; this.stat.innerHTML = lines; }
}
