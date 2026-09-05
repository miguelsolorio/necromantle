# Visual gap analysis

Compared: `docs/screenshots/m1-*.png` (off-screen 1080p captures from the benchmark courtyard) against `references/`. Rules cited as R-xx come from `reference-analysis.md`. Each entry has a status: **open**, **mitigated** (placeholder-level fix in), or **fixed**.

## Milestone 1–2 pass (benchmark courtyard, first enemy, Arcane Bolt)

| # | Gap | Rule | Impact | Status | Action |
|---|---|---|---|---|---|
| 1 | Scene under-lit and flat: no warm/cool split, black sky, no horizon | R-08, R-15, R-16 | high | fixed | Moon moved front-left at 1.9 intensity, hemispheric fill 0.8, fog lightened to a blue-grey, procedural star-field dome (the materials-library gradient shader rendered black on WebGPU) |
| 2 | Torches gave no light or glow; the courtyard had no warm locals | R-15 | high | fixed | Two-layer flame billboards with flicker on every torch, three merged warm point lights (WebGPU allows 8 lights per mesh, so torch pairs share a light and spells take priority) |
| 3 | Floor read as a pale, perfectly clean tile grid | R-06, R-14 | high | mitigated | Kit floor albedo darkened to 40%, 46 grime blotch decals over the flagstones. Still a low-poly hex grid: needs authored flagstone modules or a triplanar wear shader |
| 4 | Enemies read tan/cream instead of near-black with a rim | R-07 | high | mitigated | Skeleton albedo multiplied to ~0.2, glowing eyes per archetype. A true rim-light material plugin is still needed |
| 5 | Pack clumped on the player's back instead of ringing | R-03 | high | fixed | Melee ring radius = attack range + 0.25 m with 8 inner slots, second ring at +3.2 m, stronger separation and a player keep-out radius |
| 6 | Staff held like a lance | R-21 | medium | fixed | Staff rolled upright on the hand slot, scaled 1.15×, crystal tip and violet light at the tip |
| 7 | Point lights at close range blew characters out to white | R-18 | medium | fixed | Staff light 2.2, orb light 10, bloom threshold kept high |
| 8 | Nova scorch decal rendered as a bright orange patch | R-24 | medium | fixed | Decal now dark with an ember rim, ring stays orange |
| 9 | Distant world ends at the courtyard wall | R-04, R-05 | medium | mitigated | Scaled kit pieces as fogged silhouettes (cathedral mass north, towers east/west) and an arcane portal in the door. Real skyline needs authored towers and a fog-lit cathedral |
| 10 | Architecture is faceted low-poly with a flat gradient atlas; stone has no chips, grime or painterly variation | R-14 | high | open | Placeholder pack limit. Plan: triplanar detail/wear overlay in a material plugin, then authored kit |
| 11 | Character silhouettes are chibi-proportioned (big heads, short legs) | R-20, R-21 | high | open | Placeholder pack limit. Archetype shapes are still distinct; replace with authored rigs when available |
| 12 | Player robe is crimson (health colour) | R-10 | low | mitigated | Albedo tinted toward violet; a proper recolour needs an authored texture |
| 13 | No cloth motion, no idle breathing exaggeration | R-22 | low | open | Animation set is fixed by the pack |
| 14 | Camera coverage: exploration 6.5 m / combat 8.8 m, FOV 60–68°, player on the left third | R-01, R-02 | — | fixed | Matches the storyboard. Combat blend driven by enemies within 14 m |
| 15 | No bloom halo on emissives in captures | R-18 | low | open | Verify on-screen (captures use the render-target path); tune once the pane is visible |

## Questions from the brief, answered for this pass

- Too bright / too dark? Was too dark; now mid-value floor with dark corners. Watch for over-brightness on the floor after the albedo change.
- Too realistic / too cartoony? Cartoony: the placeholder pack is chunkier and rounder than the references. Lighting and fog pull it toward the mood; geometry cannot.
- Too empty? Props and rubble fill the edges; the centre is deliberately open for combat. Add more mid-ground breakage (fallen columns) in Milestone 8.
- Architecture large enough? Yes: 6 m walls, 8 m pillars, 10 m door. Reads as oversized from the gameplay camera.
- Player readable? Yes (brightest, most saturated figure, violet light at the staff). Enemies readable? Yes by eyes and motion; silhouettes still too similar between ghoul and cultist at distance.
- Spells large enough? Orb yes (head-sized with a 6 m light), nova yes (8 m ring), bolt needs a longer visible trail.
- Enemy groups dense enough? 8 in the opener, waves grow to 24. Fine for M3 tuning.
- Does it still feel like a Diablo-style ARPG? Rhythm yes (generate, spend, ring of enemies). Look: mood yes, materials no.

## Next highest-impact items

1. Triplanar wear/grime material plugin for kit stone (10).
2. Rim-light plugin for characters: violet rim on the player, rust/gold on enemies (4).
3. Longer bolt trail and a brighter impact pop (15).
4. Verify bloom and SSAO on-screen once the Browser pane is visible; tune thresholds.

## Milestone 3 pass (combat sandbox: Orb, Nova, Rift Step, waves, elites)

Captures: `m3-nova-fight.png`, `m3-orb-fight.png`, `m3-rift.png`, `m1-hero.png`, `m1-door-vista.png`.

| # | Gap | Rule | Impact | Status | Action |
|---|---|---|---|---|---|
| 16 | Nothing collided: the kit meshes' mirrored winding and Babylon's per-render-id world-matrix cache meant every fixed-step move passed through walls | — | blocker | fixed | Box colliders per placement, `computeWorldMatrix(true)` before every collision move (see technical-architecture.md gotchas) |
| 17 | Stairs too steep to climb, players could walk under the platform and out through the open arch | R-11 | high | fixed | Stairs squashed to a 28° ramp with an analytic surface; under-platform and door blockers |
| 18 | Hit flash rendered enemies solid white | R-24 | medium | fixed | Emissive pulse on the per-enemy body materials instead of the overlay |
| 19 | Orb core blew out to white | R-18 | low | fixed | Core tinted cyan-blue, light 10 |
| 20 | Rift Step ghosts were opaque purple capsules | R-23 | medium | fixed | Three additive ghosts at 28% alpha along the path, cyan flash at the landing |
| 21 | Knockback barely moved the pack | R-24 | medium | mitigated | Nova 15 m/s, orb blast 11 m/s (≈2.5 m throw). A ragdoll-lite arc for lethal hits is still to do |
| 22 | Render CPU 14 ms with 24 enemies in the hidden-tab harness (488 draws) | perf | high | open | Enemy shadows became blob decals (1453 → 488 draws). Remaining cost is per-draw submission plus 24 skinned rigs; next: merge enemy sub-meshes per archetype, VAT or instanced skinning, SSAO off by default on integrated GPUs. Needs an on-screen 60 fps check |
| 23 | Ghouls still read tan under the moon | R-07 | low | open | A rim/fresnel material plugin would let the body go darker while keeping the silhouette edge |
| 24 | Nova scorch decal now almost invisible | R-24 | low | open | Raise the ember rim a little; keep the dark centre |

Feel check against the design's final sentence: with 18 ghouls, three cultists and an elite knight the loop reads as generate → surround → spend → scatter. Kill rate at level 2–3 is ~12 kills in 5 s once the pack closes, which is the "overwhelmed, then dominate" beat. Wave HP scales +12% per wave so it does not stay trivial.

## Playtest round (levels, waves, audio)

| # | Gap | Rule | Impact | Status | Action |
|---|---|---|---|---|---|
| 25 | Thin threshold slab, visible underside, enemies trapped beside the stair | R-11 | blocker | fixed | Closed stone plinth, slots beside the stair walled, spawn surfaces flagged, safety relocation |
| 26 | Courtyard read empty between the walls and pillars | R-04 | high | fixed | Banner or torch on every wall bay, pillars between every segment, 60+ scattered props with keep-out lanes, floor patches |
| 27 | Blank frames after a level swap on WebGPU (destroyed light uniform buffers) | — | blocker | fixed | Level lights are pooled and reused, never disposed |
| 28 | Nave open to the sky; the kit has no roof pieces | R-13 | medium | open | Reads as a ruin. Roof needs authored vaults; a fog ceiling could stand in |
| 29 | Large crates scale up to 3.4 m and crowd the aisle | R-12 | low | open | Cap box_large scale at 1.4 |

## Milestone 4 pass (Frost Field, Cataclysm)

Captures: `m4-frost.png`, `m4-frozen.png`, `m4-cataclysm.png`.

| # | Gap | Rule | Impact | Status | Action |
|---|---|---|---|---|---|
| 30 | Frost crystals read white under bloom, not ice-blue | R-10 | low | open | Lower crystal emissive, add a cyan rim, or a refractive-looking gradient texture |
| 31 | Cataclysm beam is thin; strike reads more like a laser than a pillar of the sky | R-23 | medium | open | Wider, softer beam with a bright core and a cloud flash above the frame edge |
| 32 | Storm lighting shift works (moon and fill go violet, fog brightens) | R-17 | — | fixed | Keep; consider a brief screen flash per strike |

## Milestone 5 pass (archetypes, elites)

Capture: `m5-brute-necro.png`.

| # | Gap | Rule | Impact | Status | Action |
|---|---|---|---|---|---|
| 33 | Brute and Necromancer reuse the knight and cultist rigs at larger scale with darker tints | R-20 | medium | mitigated | Silhouettes differ by scale and colour; authored rigs remain the fix |
| 34 | Elite affix is only readable from the nameplate | R-28 | medium | open | Add an affix-coloured floor aura per modifier (ember ring for Scorched, frost ring for Chilling, violet for Blinking) |
| 35 | Charge telegraph is the Taunt clip plus a smoke puff | R-22 | medium | open | Add a ground arrow decal along the charge line and a low horn |

## Milestone 6 pass (loot)

Capture: `m6-drops.png`.

| # | Gap | Rule | Impact | Status | Action |
|---|---|---|---|---|---|
| 36 | Drop bodies are primitives (box, torus, sphere) tinted by rarity | R-30 | medium | mitigated | Beams and labels carry readability; authored item meshes or icon billboards later |
| 37 | Inventory icons are line glyphs, not painted item art | R-35 | medium | open | Painted icon set per base item once the art pass starts |
| 38 | Loot balance: one rare staff triples spell power | — | high | mitigated | Weapon curve flattened to 0.5 + damage/40; enemy HP scales per wave and level. Needs a tuning pass with the progression milestone |

## Milestone 8 pass (world)

Captures: `m8-village.png`, `m8-road.png`, `m8-crypt.png`, `m8-ossuary.png`.

| # | Gap | Rule | Impact | Status | Action |
|---|---|---|---|---|---|
| 39 | Huts are wall boxes with flat slab roofs; no thatch or pitched roofs in the kit | R-11 | medium | open | Authored roof modules; until then the dark slab reads as tar roofing at night |
| 40 | Road was under-lit; trees read as silhouettes but nothing else did | R-06 | high | fixed | Moon boost 1.6 on the road, standing torches every 30 m, lighter fog |
| 41 | Crypt and ossuary showed the sky | R-13 | high | fixed | Dark ceiling slabs; the crypt's teal fog now reads |
| 42 | The Hollow King is a scaled knight rig with violet emissive | R-20 | high | open | Needs an authored boss rig with wings; scale, aura, slam ring and the boss bar carry it for now |
| 43 | NPCs idle only; no lip movement or gesture beyond the Interact clip | — | low | open | Fine for a hub in a slice |
