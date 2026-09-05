# Necromantle — music plan: making it scarier

Written 2026-09-05. Miguel's note: the current soundtrack does not match the vibe.

## Why the current score sounds safe

`src/audio/music.ts` is a generative D-minor piece: a sustained drone, a plucked lute wandering stepwise through D aeolian, a soft formant choir changing chord every eight bars over i–VI–iv–V, a distant bell, and taiko plus tremolo strings faded in by combat intensity at 66–110 bpm. Every part of that is pleasant on its own:

- The chord loop resolves (VI–iv–V is a folk cadence) and the aeolian scale has no rubbing intervals.
- The lute plays a melody, so the ear follows a tune instead of listening for danger.
- The choir has long, smooth attacks and a warm formant, which reads as sacred rather than haunted.
- The drone is a steady bed; nothing in it moves unpredictably.
- The bell is a comfort cue (a village at dusk), not a threat.

Horror scoring works the other way: unstable pitch, intervals that refuse to resolve, sounds that arrive without a beat to predict them, and silence that the player fills with their own tension.

## Direction

Three layers, each driven by the same `intensity` value the game already sets, plus a per-level mood.

### 1. Dread bed (always on, replaces the drone)
- Sub drone on D1 with two detuned partials beating at 0.3–0.7 Hz so the pitch never sits still; a very slow random walk of ±20 cents.
- Breath layer: filtered pink noise with a 4–6 s inhale/exhale envelope and a resonant band-pass that drifts between 300 and 900 Hz. Reads as something breathing in the dark.
- Metallic shimmer: an inharmonic FM voice (ratio 1:2.41) at −30 dB, rare, resonating on the reverb send.
- Whispers: short bursts of band-passed noise with formant sweeps, panned hard left or right, every 20–50 s in the quiet, never in combat (their job is the empty corridor).

### 2. Tension events (aleatoric, no beat)
- Replace the lute with a damped, detuned prepared-piano pluck: two Karplus-Strong strings a minor second apart, struck together, low register (D2–A2), one every 6–14 s, no melody.
- Cluster stabs: three saw voices a semitone apart with a 5 ms attack and a 1.2 s decay, at random intervals of 15–40 s while intensity is under 0.3. The startle is the point; keep them at −8 dB under the bed so they are felt more than heard.
- Riser: reversed-cymbal shape (noise through a rising band-pass, 2.5 s) fired 2.5 s before a wave starts and before an elite spawns, so the music warns first.
- Heartbeat: two low sine thumps (60 Hz, 80 ms) at 55 bpm, faded in when player health is below 35 %. Off otherwise.

### 3. Combat (intensity above 0.2)
- Keep the taiko, but drop the tremolo strings for a Phrygian ostinato: a low staccato voice cycling D–Eb–D–A–Bb at 100–120 bpm with a tritone (G#) inserted on the fourth bar.
- Choir returns as a threat: cluster voices on D–Eb–A with a short attack, one octave lower, ducking when the Cataclysm fires.
- Boss (ossuary): add a slow pipe-organ pedal (square-ish additive voice) on D1 and a half-step slide into each phase change (`boss:phase` event already exists).

### Per-level mood (set in `enterLevel`)

| Level | Bed | Tension | Notes |
|---|---|---|---|
| Hollowmere (village) | sub drone at half level, wind, distant single bell every 60 s | none | The only warm place; stays quiet so the road feels colder |
| Sexton's Road | breath layer, wolves (filtered howl sweep) every 30–70 s | prepared-piano plucks | Wind gusts follow the tree line |
| Outer Court | full dread bed | stabs and risers | Metallic shimmer from the gate |
| Nave | organ pedal instead of sub drone, choir cluster | stabs | Long reverb tail (the send already exists) |
| Crypt | drips (short filtered clicks with pitch decay), whispers doubled | plucks only | Lowest volume of all levels, so the crypt feels like listening |
| Ossuary (boss) | organ pedal + sub drone | Phrygian ostinato on entry | Riser on each phase change |

## Engineering steps

| # | Step | Files | Estimate |
|---|---|---|---|
| 1 | Refactor `Music` into layers (`bed`, `tension`, `combat`) with a `mood` object per level and `setMood(id)` | `audio/music.ts`, `audio/index.ts` | 0.5 day |
| 2 | Build the dread bed voices (sub, breath, shimmer, whispers) and remove the lute melody | `audio/music.ts` | 0.5 day |
| 3 | Tension events with the wave and elite risers wired to `startWave` and elite spawns, heartbeat to player health | `game.ts`, `enemies/manager.ts` | 0.5 day |
| 4 | Combat layer: Phrygian ostinato, cluster choir, boss organ and phase slide | `audio/music.ts` | 0.5 day |
| 5 | Per-level moods, mix pass with the limiter (target −18 dB RMS bed, −10 dB peaks in combat), offline `renderDemo` per level into `docs/screenshots/soundtrack-<level>.wav` | `audio/music.ts`, `game.ts` | 0.5 day |

Total: about two and a half days. Step 2 alone changes the feel the most and can ship first.

## Acceptance

- Standing still in the Outer Court for 60 seconds should produce at least two moments that make a listener look over their shoulder, and no recognisable melody.
- The wave-start riser lands before the first spawn every time.
- Nothing clips: the limiter never reduces by more than 3 dB in the demo renders.
- Village stays quiet enough that walking onto the road is an audible change.
