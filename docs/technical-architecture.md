# Technical architecture

Stack: TypeScript (strict) · Vite 8 · Babylon.js 9 (`@babylonjs/core`, `/loaders`, `/materials`) · WebGPU with automatic WebGL2 fallback · HTML/CSS HUD (no React) · glTF/GLB assets · Havok (optional, props/ragdoll later).

## Module map (`src/`)

| Folder | Responsibility | Key exports |
|---|---|---|
| `core/` | engine creation, fixed-step game loop, event bus, object pool, time, seeded random | `createEngine`, `GameLoop`, `EventBus`, `Pool` |
| `input/` | keyboard/mouse/pointer-lock, action map | `Input` |
| `rendering/` | lights, fog, shadows, post pipeline, material presets, atmosphere | `setupRendering`, `Materials` |
| `camera/` | third-person spring-arm camera, obstruction, combat blend, shake | `ThirdPersonCamera` |
| `player/` | kinematic controller, animator, stats, resources | `Player` |
| `combat/` | targeting scorer, damage resolution, projectiles, status effects | `Targeting`, `Damage`, `Projectiles`, `Status` |
| `abilities/` | ability runtime + one module per ability | `AbilitySystem`, `abilities/*` |
| `enemies/` | manager (pool + spatial hash), state machine, steering, archetypes | `EnemyManager`, `Enemy` |
| `vfx/` | composed effects (anticipation/travel/impact/aftermath), particle presets, decals, pooled lights | `Vfx` |
| `world/` | scene builders from modular kits, static colliders, spawners | `BenchmarkScene`, `CombatArena` |
| `ui/` | HUD, floating numbers, debug panel, crosshair | `Hud`, `DebugPanel` |
| `content/` | pure data: abilities, enemies, player, palette; item/loot/progression schemas | `ABILITIES`, `ENEMIES`, `PLAYER`, `PALETTE` |
| `assets/` | registry mapping logical ids → GLB path + clip names; loader with caching and instancing | `AssetRegistry`, `loadCharacter` |
| `audio/` | event-named audio manager with silent placeholders | `Audio` |
| `persistence/` | versioned save schema (stub until Milestone 7) | `SaveV1` |

Dependency direction: `content` ← everything; `core/input/assets` ← gameplay; gameplay (`player/combat/abilities/enemies`) ← `world`; `ui` observes gameplay through the event bus and read-only state. `rendering/vfx` never import gameplay.

## Update order (fixed step 1/60 s, render every frame with interpolation where it matters)

input → player controller → ability system → projectiles → enemies (AI on a spatial hash; far enemies tick at half rate) → status effects → damage resolution and deaths → VFX/light pool → camera → HUD sync.

## Rendering

- `createEngine`: try `WebGPUEngine` (async init, `?webgl=1` forces WebGL2); fallback `Engine`. Both report which path is active to the debug panel.
- Lights: one directional key (moon/sky) with a cascaded shadow generator on static geometry + player; up to 12 pooled point lights for lanterns and spells; hemispheric fill tinted cool with a warm ground color.
- Fog: exponential, tinted per scene. Post: `DefaultRenderingPipeline` with bloom (threshold 0.85, weight 0.25, kernel 64), FXAA/TAA, vignette, tone-mapped image processing with mild contrast; SSAO2 on WebGPU only. No DoF in play.
- Materials: PBR with low roughness variation; a `grime` overlay (triplanar noise darkening creases/edges) applied to kit materials so flat-atlas assets pick up painterly wear. Enemy materials are darkened and desaturated at load; the player gets a rim light material plugin.
- Instancing: environment kit pieces are `InstancedMesh`/thin instances by module; enemies of the same archetype share a skeleton-instanced mesh where the engine allows (`instantiateHierarchy` with shared animation groups per instance otherwise).

## Gameplay collision (custom, no physics engine)

- Player and enemies are kinematic capsules moved with `moveWithCollisions` against static kit colliders (simplified boxes generated per module) plus circle-vs-circle separation between agents in a spatial hash.
- Projectiles are swept spheres tested against enemy capsules and static colliders.
- Havok is reserved for debris and ragdolls and is loaded lazily.

## Data-driven content

`content/abilities.ts`: `{ id, name, kind, cost, cooldown, range, radius, speed, damage:{base, scale, element}, effects[], vfx:{anticipation, travel, impact, aftermath}, sfx }`.
`content/enemies.ts`: `{ id, model, anims, hp, speed, damage, attack:{range, windup, recovery}, behaviour, xp, lootTable, elitePool }`.
Ability and enemy modules read data only; legendary effects (Milestone 6) patch data or subscribe to ability events.

## Assets

Logical ids resolve through `assets/registry.ts` to files under `public/assets/`. Every downloaded pack keeps its LICENSE next to its files. Missing asset → procedural placeholder mesh flagged with a magenta tint in debug mode and logged. See `asset-conventions.md`.

## Save data

`SaveV1 { version:1, level, xp, inventory, equipped, unlockedAbilities, passives, checkpoint }` in `localStorage`, versioned migrations.

## Performance plan

Pool projectiles, numbers, decals, lights and enemies. Profile with the engine instrumentation panel before optimizing. Targets: 60 fps at 1080p with 20–30 enemies on a modern discrete GPU (this machine: M1 Pro).
