import { Color3, PointLight, Scene, Vector3 } from '@babylonjs/core';

interface Slot { light: PointLight; t: number; dur: number; peak: number }

/** A handful of reusable point lights for spell flashes (rule R-17). Oldest is recycled when all are busy. */
export class LightPool {
  private slots: Slot[] = [];
  constructor(scene: Scene, count = 3) {
    for (let i = 0; i < count; i++) {
      const light = new PointLight(`vfxLight${i}`, Vector3.Zero(), scene);
      light.intensity = 0; light.range = 8; light.setEnabled(false); light.renderPriority = 70;
      this.slots.push({ light, t: 0, dur: 0, peak: 0 });
    }
  }
  flash(pos: Vector3, color: Color3, intensity: number, duration: number, range = 8): PointLight {
    let s = this.slots.find((x) => x.t <= 0) ?? this.slots.reduce((a, b) => (a.t < b.t ? a : b));
    s.light.position.copyFrom(pos); s.light.diffuse = color; s.light.specular = color.scale(0.3);
    s.light.range = range; s.light.intensity = intensity; s.light.setEnabled(true);
    s.t = duration; s.dur = duration; s.peak = intensity;
    return s.light;
  }
  update(dt: number): void {
    for (const s of this.slots) {
      if (s.t <= 0) continue;
      s.t -= dt;
      const k = Math.max(0, s.t / s.dur);
      s.light.intensity = s.peak * k * k;
      if (s.t <= 0) s.light.setEnabled(false);
    }
  }
}
