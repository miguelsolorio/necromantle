import type { AbstractEngine, Scene } from '@babylonjs/core';

/**
 * Fixed-step simulation (60 Hz) with a variable-rate render.
 * When the tab is hidden, requestAnimationFrame stops; a timer keeps the game ticking (throttled by the browser)
 * so automated tests and background loads still progress.
 */
export class GameLoop {
  readonly step = 1 / 60;
  time = 0;
  private acc = 0;
  paused = false;
  private hiddenTimer: number | null = null;
  constructor(
    private engine: AbstractEngine,
    private scene: Scene,
    private fixed: (dt: number) => void,
    private frame: (dt: number) => void,
  ) {}

  private tick(rawDt: number, manualFrame = false): void {
    const dt = Math.min(rawDt, 0.25);
    if (!this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= this.step && n < 8) {
        this.fixed(this.step);
        this.time += this.step;
        this.acc -= this.step;
        n++;
      }
      if (n === 8) this.acc = 0;
    }
    this.frame(dt);
    if (manualFrame) this.engine.beginFrame();
    this.scene.render();
    if (manualFrame) this.engine.endFrame();
  }

  start(): void {
    this.engine.runRenderLoop(() => this.tick(this.engine.getDeltaTime() / 1000));
    let last = performance.now();
    const onVisibility = () => {
      if (document.hidden && this.hiddenTimer === null) {
        last = performance.now();
        this.hiddenTimer = window.setInterval(() => { const now = performance.now(); const dt = (now - last) / 1000; last = now; this.tick(dt, true); }, 16);
      } else if (!document.hidden && this.hiddenTimer !== null) {
        window.clearInterval(this.hiddenTimer); this.hiddenTimer = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
  }
}
