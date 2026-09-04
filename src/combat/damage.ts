import type { Element } from '@/content/abilities';
import { rand } from '@/core/mathx';

export interface DamageRoll { amount: number; crit: boolean; element: Element }

/** Base × spell power × variance, with crits. Armor is applied on the receiving side. */
export function rollDamage(base: number, spellPower: number, critChance: number, critDamage: number, element: Element, mult = 1): DamageRoll {
  const crit = Math.random() < critChance;
  let amount = base * spellPower * rand(0.9, 1.1) * mult;
  if (crit) amount *= critDamage;
  return { amount: Math.round(amount), crit, element };
}
