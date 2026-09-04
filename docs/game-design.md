# Necromantle — game design summary

**Working title:** Necromantle. **Region:** the village of Hollowmere and the Cathedral of St. Vessel above it.
**One sentence:** A Diablo-style action RPG (speed, hordes, loot, progression, readability, power fantasy) played from an immersive GTA/RDR-style third-person camera.

## The loop

Explore → fight a pack → loot → grow → fight a bigger pack. Every system exists to make the "overwhelmed for three seconds, then dominate" transformation happen more often and feel better.

## Player: the Arcane Sorcerer

One class. Elemental and arcane magic, ranged, crowd control, teleportation, explosive AoE.

**Resources.** Health (orb, bottom-left). Arcane Energy (orb, bottom-right), max 100, slow regen, primarily built by Arcane Bolt hits. Rhythm: generate → position → spend → destroy group → reposition → generate.

**Abilities** (data in `src/content/abilities.ts`):

| Key | Ability | Role | Notes |
|---|---|---|---|
| LMB | Arcane Bolt | generator | fast violet lance, +6 energy on hit, slight homing, splash |
| RMB | Astral Orb | spender (40) | slow, large, piercing, explodes at range, lights the floor |
| 1 | Rift Step | utility, 6 s cd | 8 m teleport toward aim, 0.3 s invulnerable, after-image trail |
| 2 | Flame Nova | cooldown 10 s | 4 m radial burst, knockback, burn |
| 3 | Frost Field | cooldown 14 s | ground disc, chill → freeze weaker enemies (Milestone 4) |
| 4 | Cataclysm | ultimate 60 s | 6 s storm of arcane column strikes, knockback, room lighting change (Milestone 4) |

**Stats.** Vitality, Power, Intelligence, Armor, Critical Chance, Critical Damage, Attack Speed. Intelligence scales spell damage; weapons set base spell damage.

**Levels 1–10** (data-driven): 1 Bolt · 2 Orb · 3 Rift Step · 4 Nova · 5 passive slot · 6 Frost Field · 8 second passive slot · 10 Cataclysm.

**Passives** (Milestone 7): Arcane Momentum (energy gain → speed), Glass Star (+damage, −max health), Frozen Heart (frozen enemies take more), Chain Reaction (burning kills explode).

## Enemies

Archetypes are silhouettes first: Ghoul (fast swarm, hunched), Fallen Knight (slow, armored, wide), Cultist (ranged, thin, green staff), Wraith (mobile, floats, phases), Brute (elite melee, huge, club), Necromancer (support, tall, horned staff, summons/buffs). Boss: the Hollow King (winged, crimson-violet aura, summons adds).

Encounter sizes: typical 6–12, large 15–25, major 20–35. Packs surround via assigned ring slots; ranged keep distance; wraiths reposition.

Elites: enhanced health, gold rim, 1.3× scale, nameplate + affix, floor aura, better loot. Affixes: scorched ground, blink, barrier, radial volley, summoner, pull, slow zone.

## Combat feel rules

Anticipation → execution → impact → enemy response → visual feedback → audio. Enemies stagger, flash, get pushed, freeze, burn, explode, fall. Camera: small hits none, heavy hits small impulse, big spells controlled shake, boss attacks directional shake.

Targeting: generous soft-lock scoring candidates by angle to reticle, screen distance, world distance, range, LOS and priority. Projectiles curve ≤ 8° toward the lock. AoE aims at the cluster the reticle is nearest.

## Loot and items

Rarities: Common (white), Magic (blue), Rare (yellow), Legendary (orange). Physical drops with launch, bounce, glow and beam; labels for Rare+ without hover. Slots: weapon, head, chest, gloves, boots, amulet, ring ×2. Items: name, rarity, item level, base stats, affixes, optional special property. Legendaries change rules (Starfall Circlet: Orb splits into three after four pierces; Ashen Grimoire: Nova leaves burning ground; Boots of the Fold: extra Rift Step charge).

## World

Village (Hollowmere: smith Maren, merchant, cemetery, cathedral visible) → Sexton's Road wilderness (farms, graves, shrine ruins, ambushes) → Cathedral of St. Vessel (nave, rose window, light shafts, ambush) → Crypt (repeating arches, ossuary, roots, teal supernatural light) → the Hollow King's chamber. Tension curve: quiet → small ambush → exploration → swarm → elite → quiet cathedral door → interior ambush → density ramps → crypt → major encounter → boss.

## HUD

Health orb, energy orb, six ability slots with cooldown sweep / no-energy / locked states, potion, XP bar with level rune, area name and objective top-right, boss bar top-center, floating numbers, loot labels, level-up banner. Style: carved dark stone, bronze rims, gilt Cinzel capitals, Crimson Pro body. See `storyboard.html`.

## Originality

Everything named here is original. Diablo III is a reference for systems, mood, composition, pacing and readability only (see `reference-analysis.md`).

## Success criteria (vertical slice)

A new player can start in Hollowmere, understand movement immediately, walk an atmospheric road, meet a pack, aim roughly, get soft-targeting help, generate and spend energy, teleport out, kill many enemies fast, see them react, grab globes, see loot burst, compare and equip, level up, unlock abilities, enter the cathedral, descend, fight escalating packs, beat the boss, get an exciting drop, and want to keep going.
