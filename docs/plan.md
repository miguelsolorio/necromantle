# Necromantle — build plan (Babylon.js third-person gothic ARPG), through Milestone 3

## Context

`/Users/miguelsolorio/Developer/diablo` contains only `references/` (14 Diablo III screenshots; 3 are AVIF and were viewed via converted copies). There is no code, no git repo, no package.json. The brief is a full "master build prompt" for an original third-person Diablo-style ARPG on the web. This run covers the brief's initial execution list (steps 1–17: docs, scaffold, visual benchmark, controller/camera, one enemy, Arcane Bolt, soft targeting, gothic environment, lighting/VFX, run + compare, gap analysis + fixes) and then continues through **Milestone 3: the combat sandbox** (Astral Orb, Flame Nova, Rift Step, health/energy, 10–20 enemies, tuned). Milestones 4–9 are architected for but not built in this run.

Decisions already made with the user:
- **Assets:** download CC0 packs (KayKit + Quaternius), wrapped behind an asset registry so they remain replaceable.
- **Scope:** stop after Milestone 3 for review.
- **Git:** `git init`, `.gitignore`, one commit per milestone boundary.

Environment facts verified: Node 25.2, npm 11.6; the default npm registry is a private Artifact Registry proxy that returns nothing, so the project gets a `.npmrc` pinning `https://registry.npmjs.org/`. Latest versions: `@babylonjs/core` 9.25.0, `@babylonjs/havok` 1.3.14, `vite` 8.2.2. The in-app browser (Chrome 148, Apple M1 Pro) reports WebGPU available and WebGL2 fallback, so both paths can be tested locally.

## Reference takeaways that drive the build (full write-up goes in `docs/reference-analysis.md`)

- **Density is the identity.** The skeleton-horde shot shows ~60 enemies on screen; combat shots show 8–20 in a ring around the player. Enemies are small, dark, and silhouetted against a brighter, lower-frequency ground. The player is the brightest, most saturated humanoid.
- **Value structure:** ground plane mid-value (never black), characters dark, VFX and loot the highest values. Deep shadow only in corners/verticals. Warm local light (lanterns, fire, lava) vs. cool ambient (moon, teal crypt, blue arcane).
- **Scale:** doors, columns, stairs and statues are 2–4× realistic; the player is ~1/10 of the vertical frame; props (barrels, carts, chests) are chunky and readable at gameplay distance.
- **Painterly materials:** low texture frequency, large color blocks, grime at edges, strong AO in creases, almost no specular pinpoints except metal edges.
- **VFX:** spells are big (arcane orbs ≈ player height), high-emissive cores with soft additive halos, long trails, ground-illuminating; impacts have a decal/shockwave ring plus debris. Damage numbers are white/yellow, crits bigger.
- **Readability language:** red HP bars on enemies, elite name plates + colored auras, red health globe, orange/gold loot beams, cyan/purple arcane = friendly, green/red = enemy/poison.
- **UI:** two big orbs (red health / blue-cyan resource), central skill bar with rune-framed icons, warm gold typography on dark carved stone; inventory has a character preview + paper-doll + grid; stat rows right-aligned. We build an original UI with this grammar, not these textures.
- **Camera (theirs vs ours):** D3 shows ~25 m of ground at ~45° top-down. Our over-the-shoulder camera must reproduce that *coverage*: default combat distance ~7–8 m, pitch ~25–30°, FOV ~60° widening to ~68° in combat, player offset left-of-center so the right two-thirds of the frame is battlefield.

## Tech stack

TypeScript (strict) · Vite 8 · `@babylonjs/core` 9 + `@babylonjs/loaders` (glTF) + `@babylonjs/gui` (only for world-space labels if needed; HUD is HTML/CSS) · `@babylonjs/havok` for props/ragdoll (introduced in M3 only if time allows; gameplay collision is custom, below) · WebGPU engine with automatic WebGL2 fallback · GPU particle systems where supported, CPU fallback · glTF/GLB assets. No React.

## Project layout (create in this run)

```
package.json, vite.config.ts, tsconfig.json, .npmrc, .gitignore, index.html
docs/reference-analysis.md, game-design.md, technical-architecture.md, visual-gap-analysis.md, asset-conventions.md
public/assets/{characters,enemies,environment,props,vfx,audio,ui}/   (downloaded packs + LICENSE files; placeholder markers)
src/main.ts                       bootstrap: engine (WebGPU→WebGL2), scene, game loop, HUD mount
src/core/                         Engine wrapper, GameLoop (fixed-step sim + render), EventBus, ObjectPool, Time, Random
src/input/                        InputManager (keyboard/mouse/pointer-lock, action map)
src/rendering/                    RenderSetup (lights, fog, shadows, post pipeline), MaterialLibrary (painterly PBR presets, triplanar grime overlay), Atmosphere
src/camera/                       ThirdPersonCamera (yaw/pitch, offset, collision/obstruction, combat FOV/distance blend, shake)
src/player/                       PlayerController (kinematic capsule, accel/decel, sprint, strafe), PlayerAnimator, PlayerStats, Resources (health, arcane energy)
src/combat/                       Targeting (soft-lock scorer), Damage (crits, elemental, numbers), Projectiles (pooled), StatusEffects (burn/chill/freeze), Hitbox queries
src/abilities/                    AbilitySystem (cooldowns/cost), data-driven definitions, one module per ability (ArcaneBolt, AstralOrb, FlameNova, RiftStep; FrostField/Cataclysm stubs)
src/enemies/                      EnemyManager (pooled, spatial grid), Enemy (state machine), archetype data, flocking/separation steering, HP bars, hit reactions
src/vfx/                          VfxLibrary (composed effects: anticipation/travel/impact/aftermath), ParticlePresets, Decals, LightPool (pooled point lights for spells)
src/world/                        Level loader for modular kits, BenchmarkScene / CombatArena builders, StaticColliders
src/ui/                           Hud (health/energy orbs, skill bar, cooldowns, floating numbers), DebugPanel (dev tools), Crosshair
src/content/                      abilities.ts, enemies.ts, player.ts (pure data; items/loot/progression stubs with typed schemas)
src/assets/                       AssetRegistry (logical id → GLB path/animation clip names), loaders, LICENSE tracking
src/audio/                        AudioManager with named events + silent/placeholder samples (architecture only this run)
src/persistence/                  Save schema v1 stub (not wired this run)
```

## Asset plan (needs approval for downloads — listed explicitly here)

All CC0 1.0, fetched with `git clone --depth 1` into `public/assets/_packs/` (kept out of git via `.gitignore`; a `scripts/fetch-assets.sh` reproduces it), then the needed GLBs are copied/renamed into `public/assets/...` with each pack's LICENSE alongside:

| Pack | Source | Use |
|---|---|---|
| KayKit Character Pack: Adventurers 1.0 (4 rigged humanoids incl. Mage, 75 anims, staffs/wands) | `github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0` | Player Sorcerer base (Mage) |
| KayKit Character Pack: Skeletons 1.0 (Minion/Rogue/Warrior/Mage, 90+ anims) | `github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0` | Ghoul (Minion), Fallen Knight (Warrior), Cultist (Mage), Wraith (Rogue, ghost material) |
| KayKit Dungeon Remastered 1.0 (200+ modular walls/floors/stairs/columns/props) | `github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0` | Benchmark scene + combat arena architecture |
| Quaternius Universal Animation Library (glTF-only mirror) | `github.com/J-Ponzo/gltf-universal-animation-library` | Extra locomotion/cast clips if KayKit rigs lack them (only retargeted if rigs are compatible; otherwise skipped) |
| Kenney Graveyard Kit / Castle Kit (later milestones, not this run) | kenney.nl | Wilderness/village/cathedral in M8 |

Repo sizes are not published; each is expected to be tens of MB (FBX+GLTF+OBJ), and the `--depth 1` clone plus copying only GLTF files keeps the project small. If any clone fails, fall back to procedural placeholders for that slot and mark it in `docs/asset-conventions.md`.

**Art-direction caveat, stated in the docs:** these packs are stylized low-poly with a flat gradient atlas. They are treated as *structural placeholders that already read well at distance*, not the visual target. Lighting, fog, scale exaggeration, post-processing, emissive VFX, ground decals, and a triplanar grime/AO overlay material carry the painterly look; `visual-gap-analysis.md` tracks what real authored assets must replace.

## Status (2026-09-04)

- Milestones 1–2 committed (`627530c`): benchmark courtyard, controller, camera, enemies, Arcane Bolt.
- Milestone 3 committed: Astral Orb, Flame Nova, Rift Step, waves, elites, collision and performance fixes. See `visual-gap-analysis.md` for the open items.
- Playtest round (2026-09-04): audio (procedural soundtrack + effects), level structure (`KitLevel` base, Outer Court, Nave), three scripted waves per level with the door as the exit, dense dressing, closed stair plinth.
- Milestone 4 built: Frost Field (chill, freeze, shatter), Cataclysm (rune ring, strikes, storm lighting), status tints, ragdoll-lite death arcs.
- Milestone 5 built: Brute (charge), Necromancer (aura, summons), wraith blink, six elite affixes with nameplates, class-definition groundwork and ability registry.
- Milestone 6 built: item data and generator (four rarities, affix pool, name tables, five legendaries), physical drops with beams and labels, walk-over pickup, inventory screen with comparison tooltips, gear-driven stats, legendary powers (Starfall, Ashen, Fold, Hollow Crown, Cinder Band).
- Next: Milestone 7 (progression: passives, ability improvements, level-up celebration, save system).

## Gate before execution: style storyboard review

`docs/storyboard.html` is a static style board (palette, type, seven framed moments, HUD states, enemy silhouettes, ability VFX shapes, loot rarity, dev panel). Nothing below starts until the user has reviewed it and asked for the build. Feedback on the board becomes the first entries of `docs/visual-gap-analysis.md`, and its HUD/inventory/loot CSS is lifted into `src/ui/` as-is.

## Execution order

### Phase A — brief steps 1–17 (Milestones 1 + 2)

1. `git init`, `.gitignore` (node_modules, dist, `public/assets/_packs`, .DS_Store), `.npmrc`, scaffold Vite + TS + Babylon 9; verify `npm run dev` serves a blank Babylon scene on WebGPU and on forced WebGL2 (`?webgl=1`).
2. Write `docs/reference-analysis.md` (per-image observations + extracted rules above), `docs/game-design.md` (loop, class, abilities, enemies, world, HUD, originality rules), `docs/technical-architecture.md` (module map, update order, pooling, data-driven content, asset registry, save schema).
3. Fetch assets (script above), build `AssetRegistry` + `docs/asset-conventions.md`; inspect the GLBs' animation clip names via a small node script and record them.
4. **Visual benchmark scene** (`BenchmarkScene`): a ~40 m courtyard from the dungeon kit — one oversized gate (3× scale), two rows of massive columns, broken walls, barrels/crates/banners, ground with 2 material zones, lanterns. Lighting: cool directional moon + shadow generator, 6–8 warm pooled point lights, exponential fog, ambient tinted cool, HDR image-based lighting from a small generated env, bloom (low threshold, low weight), vignette, FXAA/TAA, subtle color grading (LUT-free curves), SSAO2 if WebGPU path allows. No DoF.
5. **Player + camera** (`PlayerController`, `ThirdPersonCamera`): kinematic capsule with `moveWithCollisions` against static kit colliders; camera-relative WASD, accel/decel curves, sprint (Shift), strafe when in combat stance (aiming/attacking), pointer-lock mouse yaw/pitch, spring-arm distance with sphere-cast obstruction, shoulder offset, exploration vs combat distance/FOV blend driven by nearby-enemy count, shake API. Animator blends idle/walk/jog/sprint/strafe/cast/hit/death from the KayKit clips.
6. **First enemy** (Ghoul): pooled `Enemy` with HP, seek + separation steering (spatial hash), surround behaviour (assign ring slots around player), lunge attack with anticipation, hit flash (emissive pulse), directional stagger/knockback, death (pose + sink, ragdoll later), world-space HP bar.
7. **Arcane Bolt**: data-driven ability; pooled projectile mesh + trail + small pooled light; slight homing toward soft target; impact splash burst + decal; generates energy on hit; damage numbers.
8. **Soft targeting**: scorer over candidates (screen-center angle, screen distance, world distance, range, LOS raycast, archetype priority), configurable weights; also returns a "cluster point" for AoE aim.
9. **Debug panel** (minimal now, grows later): hide HUD, freeze AI, spawn N enemies, camera distance/FOV sliders, particle density, FPS/enemy count, screenshot key.
10. Run in the in-app browser (`preview_start`), screenshot at 1920×1080, compare against references, write `docs/visual-gap-analysis.md`, fix top discrepancies (expected: ground too flat, columns too small, fog/bloom tuning, camera too close). **Commit: "Milestone 1–2: visual benchmark, controller, camera, first enemy, Arcane Bolt".**

### Phase B — Milestone 3: combat sandbox

11. Resources: health + Arcane Energy (max 100, slow regen, gained on Bolt hits); HUD orbs, skill bar with cooldown sweeps and "not enough energy" state; XP/level bar drawn but inert.
12. **Astral Orb** (spender): large slow piercing orb, damage on pass-through, long trail, explodes at max range, illuminates ground. **Flame Nova**: radial burst (mesh ring + shockwave + ember particles + burning decal), strong knockback, burn status ticking. **Rift Step**: instant teleport toward aim with i-frames, trail/after-image, cooldown; blocked by collision sweep.
13. Status effects (burn now; chill/freeze data-typed for M4), enemy reactions per effect, generic knockback/ragdoll-lite (pose + physics-free arc).
14. `CombatArena` scene: same kit, larger, spawner waves of 10–20 Ghouls with a couple of Skeleton Warriors as durable placeholders; wave controls in the debug panel; god mode and infinite energy toggles.
15. Tune loop: bolt cadence, energy economy, orb damage vs pack size, nova radius/knockback, teleport distance, camera combat pullback, hit-stop and shake magnitudes, number density throttling. Profile with Babylon's instrumentation; enforce pooling, thin instances for HP bars/decals if needed. Target 60 FPS with 20 enemies + effects on the M1 Pro.
16. Re-run the visual comparison, update `visual-gap-analysis.md`, **commit: "Milestone 3: combat sandbox"**, then stop and report with screenshots.

## Key design details to reuse across milestones

- **Ability data** (`content/abilities.ts`): `{ id, name, kind: generator|spender|cooldown|utility, cost, cooldown, range, radius, speed, damage: {base, scaling, element}, effects[], vfx: {anticipation, travel, impact, aftermath}, sfx }`. Ability modules only read data, so legendary modifiers (M6) can patch it.
- **Enemy data** (`content/enemies.ts`): `{ id, model, anims, hp, speed, damage, attack: {range, windup, recovery}, behaviour, xp, lootTable, elitePool }`.
- **Update order per fixed step:** input → player → abilities → projectiles → enemies (AI in a spatial grid, 1/2-rate for far enemies) → status effects → damage resolution → VFX/lights → camera → HUD.
- **Readability rules encoded in code:** enemy albedo darkened/desaturated relative to player; player rim-light; VFX colors from a single palette module (arcane violet/cyan, fire orange/crimson, health red, legendary orange/gold).

## Verification

- `npm run dev` boots; `npm run build` and `npx tsc --noEmit` pass.
- In-app browser: WebGPU path and `?webgl=1` path both render the benchmark; console free of errors.
- Manual checks driven via the browser tools and debug panel: walk/sprint/strafe against walls and stairs; camera never clips through columns; spawn 20 ghouls, they surround rather than queue; Bolt soft-locks the intended target from off-center aim; energy fills from Bolts and drains from Orb; Nova scatters a ring of enemies; Rift Step is instant and cannot pass walls.
- Screenshots at 1920×1080 saved to `docs/screenshots/` and compared against `references/` before each commit; discrepancies logged in `docs/visual-gap-analysis.md`.
- Performance: FPS overlay ≥ 60 with 20 enemies + Orb + Nova on this machine; if not, profile and fix before finishing.

## Explicitly out of scope for this run (architected, not built)

Frost Field, Cataclysm, elites, all six archetypes with full behaviours, health globes, loot/items/inventory, XP/levels/passives, village/wilderness/cathedral/crypt/boss, save system, audio assets (manager + event names only), Havok ragdolls (only if M3 tuning time allows).
