import { Color3, Color4 } from '@babylonjs/core';

/** Gameplay-critical hues. Everything else in the world stays desaturated (reference rule R-09/R-10). */
export const PALETTE = {
  arcane: Color3.FromHexString('#8B5CF6'),
  arcaneCore: Color3.FromHexString('#37D2F0'),
  arcaneWhite: Color3.FromHexString('#E8F7FF'),
  fire: Color3.FromHexString('#FF7A1A'),
  fireCore: Color3.FromHexString('#FFD27A'),
  crimson: Color3.FromHexString('#C8283A'),
  health: Color3.FromHexString('#B3121F'),
  healthBright: Color3.FromHexString('#FF4D4D'),
  legend: Color3.FromHexString('#FF9A1E'),
  frost: Color3.FromHexString('#9CF1FF'),
  bone: Color3.FromHexString('#CDC3AE'),
  gilt: Color3.FromHexString('#D9B56A'),
  torch: Color3.FromHexString('#FFB347'),
  moon: Color3.FromHexString('#9FB3E6'),
  fog: Color3.FromHexString('#1A2140'),
  sky: Color3.FromHexString('#070912'),
  horizon: Color3.FromHexString('#1B2140'),
  enemyEye: Color3.FromHexString('#FF5A3C'),
  eliteEye: Color3.FromHexString('#FFB347'),
} as const;

export const c4 = (c: Color3, a = 1) => new Color4(c.r, c.g, c.b, a);
