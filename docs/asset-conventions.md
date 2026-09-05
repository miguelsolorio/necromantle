# Asset conventions

All runtime assets live under `public/assets/` and are addressed by logical id through `src/assets/registry.ts`. Gameplay code never references a file path.

```
public/assets/characters/   player models, weapons        (sorcerer.glb, staff.gltf)
public/assets/enemies/      enemy models                  (ghoul.glb, fallen_knight.glb, cultist.glb, wraith.glb)
public/assets/environment/  modular kits by set           (dungeon/*.glb)
public/assets/props/        standalone props
public/assets/vfx/          particle/decal textures (procedural today)
public/assets/audio/        sounds (silent placeholders today)
public/assets/ui/           icons, frames (inline SVG today)
public/assets/_packs/       raw downloaded packs, git-ignored, restored by `npm run assets`
```

Every folder that contains third-party files carries that pack's LICENSE file next to them.

## Current sources (all CC0 1.0)

| Logical role | File | Source pack |
|---|---|---|
| Player (Arcane Sorcerer) | `characters/sorcerer.glb` (KayKit "Mage") | KayKit Character Pack: Adventurers 1.0 |
| Player staff | `characters/staff.gltf` | same |
| Ghoul | `enemies/ghoul.glb` (Skeleton_Minion) | KayKit Character Pack: Skeletons 1.0 |
| Fallen Knight | `enemies/fallen_knight.glb` (Skeleton_Warrior) | same |
| Cultist | `enemies/cultist.glb` (Skeleton_Mage) | same |
| Wraith | `enemies/wraith.glb` (Skeleton_Rogue) | same |
| Architecture and props | `environment/dungeon/*.glb` | KayKit Dungeon Remastered 1.0 |

Measured sizes: walls 4×4×1 m, large floor tile 4×4 m, pillar 1.5×4 m, stairs_wide 7×5.1×4 m, characters ≈2.17 m tall. The game scales architecture by 1.5–2.5× (`KIT_SCALE` constants in `src/world/`) and normalizes characters to design heights (player 1.9 m, ghoul 1.75 m, knight 2.2 m, brute 3 m).

## Replacement rule

These packs are structural placeholders that read well at gameplay distance. They are not the visual target (see `visual-gap-analysis.md`). A replacement asset must keep: the logical id, the animation clip names listed in `src/content/*.ts` (or update the mapping there), the origin at feet/center-bottom, and Y-up metric scale.

## Animation clip names in use

Player: `Idle`, `Walking_A`, `Running_A`, `Running_Strafe_Left`, `Running_Strafe_Right`, `Walking_Backwards`, `Spellcast_Shoot`, `Spellcast_Raise`, `Spellcast_Long`, `Dodge_Forward`, `Hit_A`, `Death_A`.
Enemies: `Idle_Combat`, `Running_A`/`Running_C`, `Walking_D_Skeletons`, `Unarmed_Melee_Attack_Punch_A`, `1H_Melee_Attack_Slice_Diagonal`, `2H_Melee_Attack_Chop`, `Spellcast_Shoot`, `Hit_A`, `Death_A`, `Death_B`, `Spawn_Ground_Skeletons`, `Skeletons_Awaken_Floor`.

## Missing asset behaviour

If a registry id fails to load, the loader returns a magenta placeholder mesh of the expected size and logs a warning. Placeholders are never left in a milestone commit without an entry in `visual-gap-analysis.md`.

## Audio (procedural, no files yet)

All sound is synthesized at runtime with the Web Audio API (`src/audio/`): the soundtrack (`music.ts`, a generative D-minor score with drone, plucked lute, choir pad, wind, and a war layer driven by combat intensity) and every effect (`sfx.ts`, keyed by `SfxName`). The context unlocks on the first click; `M` mutes; the dev panel has music and effects sliders, saved to `localStorage`.

To replace a sound with a recorded asset, put the file under `public/assets/audio/` and map its `SfxName` to a buffer in `Sfx.play`; positional panning and distance attenuation in `audio/index.ts` apply either way.


Class rigs (2026-09-05): `characters/knight.glb`, `hunter.glb` (Rogue_Hooded), `reaver.glb` (Barbarian) copied from the KayKit Adventurers pack; all share the Mage's clip names, so `ClassDef.anims` and `chain` pick per-weapon attack clips.
