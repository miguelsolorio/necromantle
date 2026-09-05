# Necromantle — mobile and responsive plan

Written 2026-09-05 after the character phase. Companion to `character-plan.md` and `technical-architecture.md`.

## Why

The game is linked from the README and deployed to GitHub Pages, so people open it on phones. Until this phase it was desktop-only: pointer lock plus WASD and mouse, a HUD scaled by a viewport unit that collapsed to ~7 px on a phone, a hover-driven inventory, title panels that assumed a wide window, an audio unlock that ran from the game loop (iOS only resumes audio inside a gesture), and a render setup tuned for an M1 Pro.

## Decisions (agreed with Miguel)

1. **Landscape-only play.** A rotate overlay covers the game in portrait while in play mode; title, select and inventory stay usable in both orientations.
2. **Drag to look, with wider aim assist**, not auto-aim. The right thumb drags the camera the way the mouse does; the soft-lock cone widens from 0.42 to 0.6 rad and projectile homing gets a 1.6× assist on touch.
3. **Layout.** Floating joystick in the left half, the six skills plus the potion in a thumb arc bottom-right (the desktop skill bar re-laid out by CSS, so cooldowns and ready flashes are the same elements), health and resource orbs flanking the XP bar bottom-centre, area and objective top-left, bag and pause buttons top-right.

## What was built

| Area | Where | Notes |
|---|---|---|
| Platform flags | `core/platform.ts` | `touch` from `(pointer: coarse)`, `phone` when the short screen edge is under 800 px, `tier` low on phones. URL overrides `?touch=1|0`, `?quality=low|high`, `?dev=1`. Sets `touch`, `phone`, `ios`, `lowq` classes on `<html>`. |
| Synthetic input | `input/input.ts` | `setAction(code, down)` and `tap(code)` feed the same key and button sets the keyboard does; `addLook`, `moveOverride`, `sprintOverride` for the stick and the look drag. Touch is treated like `?nolock`: the first tap sets `locked`; `wantsLock` re-engages at once when a screen closes. |
| Touch layer | `input/touch.ts` | Pointer-id tracking so stick, look and a held skill work together. Stick: 56 px travel, 0.15 dead zone, sprint when pushed past 1.35× the radius (drops back inside 1.1×). Look: `CAMERA.touchSensitivity` × the look setting. Skill slots carry `data-key` and are held through delegation on the bar. Prompt, death card, bag and pause are tappable. |
| Aim assist | `combat/targeting.ts`, `combat/projectiles.ts` | `maxAngle` 0.6 and `homingAssist` 1.6 on touch. |
| Lifecycle | `core/loop.ts`, `game.ts` | `GameLoop.hold(reason, on)` for system pauses (hidden tab, pause menu, rotate, launch). Touch devices do not run the hidden-tab timer; the harness (`?nolock`) still does. Saves on `visibilitychange` and `pagehide`. Audio unlock runs from the canvas pointerdown and the title button gesture. |
| Camera | `game.ts` | Portrait viewports switch to a horizontal-fixed field of view so the select stage stays framed; `orientationchange` resizes twice (iOS reports the old size first). |
| Quality tier | `rendering/setup.ts`, `core/engine.ts` | Low: no hardware MSAA (FXAA stays), bloom 32/0.25, no sharpen, glow at quarter ratio, 1024 px shadows without PCF and a 45 m reach, no SSAO, particle density 0.6. The backbuffer stays at CSS pixels on both tiers. |
| Settings | `persistence/save.ts`, `ui/title.ts` | `quality` (auto/low/high, applies on the next load) and `look` (0.5–2×). The pause button opens the same pause menu as Esc on desktop (`Game.pause`); Settings, with its mute button, sits inside it. |
| Responsive CSS | `ui/hud.css`, `ui/title.css` | `--u` floors at 8 px; safe-area insets; the touch HUD layout; phone inventory as GEAR / BAG / SKILLS tabs with an 8×5 bag and a bottom-sheet item card (Equip / Drop / Unequip); title and select re-flow under 900 px wide or 520 px tall, and stack into one column on portrait phones. On touch a class tile tap focuses the class and a second tap on it begins (handled on pointerup: iOS withholds the compat click when hover handlers change content). |
| Install | `index.html`, `public/manifest.webmanifest`, icons | `viewport-fit=cover`, standalone display, landscape orientation hint, home-screen icons. No service worker (the model set is ~50 MB). |

## Verified (desktop Browser pane, touch emulation, 2026-09-05)

Driven with `?touch=1&nolock&play=sorcerer` at 760×390 (the pane only emulates touch below 768 px wide) and synthetic touch pointer events, because the pane was hidden and real clicks cannot complete on a hidden page:

- Tap to play locks the controls and the audio context is running.
- Stick: 5.6 m of travel in one second (jog speed), sprint on push-out with hysteresis, clean release.
- Look drag: 110 px → 0.572 rad of yaw, 40 px → 0.208 rad of pitch.
- Held primary slot: three casts in 0.8 s, released cleanly; potion heals and starts its cooldown; a cooldown slot shows its sweep.
- Prompt pill talks to Maren; bag button opens the inventory; item card Equip / Drop; ✕ closes and play resumes without a second tap.
- Death card taps to respawn; the pause menu holds the sim, its Settings sheet saves look and quality, Resume hands the controls back.
- Rotate overlay covers portrait; the hold and the horizontal field of view follow the orientation events (which a hidden page defers until its next frame).
- Title and select at 760×390 and 375×812 (see the handover screenshots).

## Fixed after the first phone test (2026-09-05)

Nothing on a real phone was tappable, title menu included. The joystick layer's stylesheet rule was a bare `.touch` selector, and `touch` is also the platform flag class on `<html>`, so on every touch device the rule put `pointer-events: none` on the root and every element inherited it. The harness above never noticed because it dispatched synthetic events straight at elements, bypassing hit-testing. The layer is now `.touch-layer` (`input/touch.ts`, `ui/hud.css`). Re-verified with Playwright's iPhone emulation, real touch input through the browser's hit-testing: title to select, tile tap to focus, second tap or Begin to launch, stick drag, pause and resume. The `ui/tap.ts` click-swallow window is shared across elements, since the compat click after a tap that swaps the screen lands on whatever the new screen put under the finger. Touch activation also carries a `press` class from finger-down until a beat after the release (a gold flash on `#title` buttons, brighter than the primary fill), and hover styles are limited to `(hover: hover)` devices, since phones keep hover stuck on the last tapped button and it read like a selection.

Second phone test: a quick second tap in combat zoomed the page. `touch-action: manipulation` now sits on every element (`* {}` in hud.css; WebKit only carries it down to children that set it themselves, whereas `none` on the canvas and the skill arc does propagate), and `input/touch.ts` cancels the second `touchend` within 350 ms and Safari's `gesturestart` pinch as a backstop.

## Still to do on a real device

The pane cannot emulate two fingers at once. On a phone: `npm run dev:lan` (port 5174 on every interface; plain http, so WebGL2), then the Pages build (https, WebGPU on iOS 26 and Android Chrome). Check stick + look + a held skill together, frame rate with a 20-ghoul pack on the low tier (`?dev=1` shows the panel), backgrounding saves and holds, add-to-home-screen opens landscape and full screen. Record the numbers here.

## Out of scope

Bundle and model size for cellular loads (~8 MB JS, ~50 MB GLB), gamepad support, offline caching.
