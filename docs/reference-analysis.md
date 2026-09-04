# Reference analysis

Source: 14 Diablo III screenshots in `references/` (11 unique; three pairs are duplicates). This document extracts reusable rules, not "make it look like Diablo". It is revisited whenever new references are added. Rules are numbered so `visual-gap-analysis.md` can cite them (R-xx).

## Image inventory

| File | What it shows | Used for |
|---|---|---|
| `d3_malenecro_gameplay_.avif` | Necromancer vs ~60 skeletons on a warm desert floor, corpse explosion | horde density, value structure, gore/VFX scale |
| `Diablo-3-Free-Download-6(-1).jpg` | Rakkis Crossing bridge fight, ~12 enemies, lava, objectives HUD | combat framing, warm/cool lighting, PC HUD |
| `Diablo-III-Reaper-of-Soul-008.avif` | Console 2-player fight in a blue-lit yard, big arcane VFX | spell emissive scale, console HUD corners |
| `975672421.jpg` | Console 4-player arena, big boss, colored player markers | multi-target readability, projectile scale |
| `diablo-3.png` | Skills window over a crypt, passive icons, orbs + skill bar | UI grammar: carved panel, icon frames, orbs |
| `images.jpg` | Character stat sheet (Polish localization) + skill icons | stat sheet layout, right-aligned numbers |
| `diablo_challenge_rift_header_barbarian(-1).webp` | Inventory paper-doll + Kanai's Cube + skill row | inventory layout, item frames, rarity colors |
| `mvaet0k9wnjf1.jpg` | Main menu: hero on snowy ridge, chat, "New class" callout | title/menu composition, hero pedestal |
| `maxresdefault.jpg` | Character select: Wizard on a moonlit dead-tree hill | class fantasy, moonlight + fog, gold type |
| `maxresdefault-1.jpg` | Crypt of the Skeleton King, teal fog, throne stairs | interior crypt lighting, verticality |
| `Screenshot045.avif` | Passive skill picker | skill UI rows, icon-plus-name lists |

## Composition

- **R-01 Coverage.** D3's camera shows roughly a 25 m wide slice of ground at ~45° elevation. Our over-the-shoulder camera must reproduce the *coverage*, not the angle: combat distance 7.5–9 m, pitch 24–30°, FOV 64–68°, with the player on the left third so two-thirds of the frame is battlefield.
- **R-02 Player size.** In gameplay shots the hero is 8–12% of frame height. Exploration can go to 30% (camera 6.5 m, pitch 18°); combat must fall back toward ~20–22%.
- **R-03 Ring, not queue.** Enemy packs form a rough ring or crescent around the hero (Rakkis Crossing, arena). Encounter AI must assign surround slots; melee should approach from multiple bearings.
- **R-04 Depth layers.** Every exterior shot has three planes: dark foreground props (walls, pillars, cart edge), mid-value playfield, and a lit or fogged background (lava, moon, distant tower). Interiors substitute a bright far element (rose window, light shaft, throne).
- **R-05 Landmark on the horizon.** Menu and exploration shots keep a single distant structure or light source as a destination.

## Value and color

- **R-06 Ground is mid-value.** Floors are never black. Desert sand, wet cobbles, and crypt stone sit around 30–45% luminance so dark silhouettes read on them.
- **R-07 Enemies are the darkest shapes.** Skeletons and demons are near-black with a rust or bone rim; the hero is the brightest and most saturated humanoid on screen.
- **R-08 Warm vs cool.** Every frame pairs a cool ambient (moonlight, teal fog, blue arcane) with warm local light (lava, torches, fire spells). Neutral grey light does not appear anywhere.
- **R-09 Accent hue budget.** Roughly: 70% desaturated environment, 20% warm/cool lighting, 10% saturated gameplay accents (spells, blood, loot). The saturated 10% is what the eye tracks.
- **R-10 Reserved colors.** Red = health/damage/danger. Orange-gold = legendary and fire. Cyan/violet = player arcane. Green = poison/enemy magic. Nothing else may use these hues at high saturation.

## Scale and architecture

- **R-11 Exaggeration factor 2–4×.** Bridge parapets are shoulder height on a giant; crypt stairs are 20+ steps wide; throne backs are three heroes tall. Model architecture at 2–4× human scale.
- **R-12 Chunky props.** Barrels, chests, carts and gravestones have simplified, oversized forms with thick edges. Thin realistic detail vanishes at gameplay distance.
- **R-13 Repetition with breaks.** Columns and arches repeat every 4–6 m but are interrupted by rubble, banners, or collapsed sections so the eye never reads a grid.
- **R-14 Painterly surfaces.** Textures are low frequency, hand-shaded blocks of color with darkened creases and edge grime. Specular is nearly absent except metal edges and wet stone.

## Lighting

- **R-15 One key, many locals.** A single cool directional key (moon or overcast sky) plus 4–10 warm point lights per screen (candles, lava, braziers). Locals have visible falloff pools on the floor.
- **R-16 Fog at the horizon.** Exteriors have a fog band at the horizon; interiors have volumetric-looking haze in light shafts. Fog color is tinted (blue-grey outside, teal in crypts), never neutral.
- **R-17 Spells are lights.** Arcane and fire effects illuminate nearby floor and characters. A large spell is the brightest light in the frame for its duration.
- **R-18 Bloom under control.** Emissives glow with a soft halo but cores keep their hue; there are no white blobs. Threshold high, weight low, radius wide.
- **R-19 Vignette and contact shadow.** Frame corners are darker; every character sits in a soft contact shadow so it reads as grounded.

## Characters

- **R-20 Silhouette first.** Each class/monster is identifiable from a blob at 9 m: hunched swarm, wide armored, thin robed, floating tattered, massive elite, tall horned support.
- **R-21 Weapons and shoulders oversized.** Staffs are taller than the wielder; shoulder pieces are head-sized; hands are large.
- **R-22 Pose language.** Casters plant the back foot and thrust the staff forward; melee lunge with the whole torso. Anticipation is a visible lean, not a subtle blend.

## Combat VFX

- **R-23 Projectile scale.** Primary bolts are forearm length with a bright head and a trailing tail; spender orbs are player-head sized or larger.
- **R-24 Impact = pop + decal + debris.** Every hit has a brief bright flash, a ground mark that lingers seconds, and a few physical bits (sparks, bone, ember).
- **R-25 Area spells are rings or discs.** AoE reads as a flattened ellipse in perspective with a clear edge so the radius is never a guess.
- **R-26 Gore is confetti.** Corpse explosions throw saturated red chunks and a white flash; it reads as reward, not horror.
- **R-27 Numbers.** White for normal, larger yellow for crits, colored by element for damage-over-time. Numbers drift up and fade in about a second; density is throttled in big fights.

## Readability language

- **R-28 Enemy bars.** Thin red bars appear over damaged enemies only. Elites get a nameplate in gold with an affix line.
- **R-29 Health globes.** Red glass spheres with a floor glow, the only red objects on the ground.
- **R-30 Loot.** Vertical rarity-colored beams and labels; white common, blue magic, yellow rare, orange legendary. Legendary drops add sound and a floor flash.
- **R-31 Interactables** glow softly on approach and get a label; hazards (lava, fire pools) are the most saturated environment surfaces.

## UI grammar

- **R-32 Orbs.** A large red health orb bottom-left and a resource orb bottom-right, both liquid, both framed by carved dark stone with a bronze rim.
- **R-33 Skill bar.** Six framed icon slots centered between the orbs, with key labels beneath and a cooldown sweep on top; potion and menu icons beside them.
- **R-34 Panels.** Carved dark panel, bronze double border, a red-tinted header tab, gold tracked capitals for titles, serif body text, right-aligned numerals in stat rows.
- **R-35 Inventory.** Paper-doll left with slots hugging a lit character preview, grid right, hover tooltips with rarity-colored title and comparison deltas.
- **R-36 Menu.** Hero on a pedestal over a dramatic vista, flat carved buttons on the left, a small news/callout plate on the right.

## What we deliberately do NOT copy

Named characters, monster designs, maps, quest text, icon art, UI textures, logos, fonts (Exocet) or audio. The rules above are treatment rules; all content is original (see `game-design.md`).
