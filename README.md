<div align="center">

# 🕵️ MEMORY THIEF

**A procedural open-world memory-noir mystery — built entirely in code.**

One rain-soaked city. Six unreliable memories. A case that ends with your own
name on an intake list.

[![🌐 Live](https://img.shields.io/badge/%F0%9F%8C%90%20Live-Play%20now-2563eb?style=flat-square&logo=vercel&logoColor=white)](https://memorythief.vercel.app)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?style=flat-square&logo=threedotjs&logoColor=white)](https://threejs.org)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![Smoke](https://img.shields.io/badge/Smoke%20checks-367%2F367-brightgreen?style=flat-square)](#-testing)
[![Assets](https://img.shields.io/badge/Assets-100%25%20procedural-orange?style=flat-square)](#-art--audio--honesty)

*Every building, texture, prop, landmark and sound is generated at load time —
no downloaded assets, no paid services, no external APIs.*

</div>

---

## 📖 Table of contents

- [🎮 About](#-about)
- [✨ Features](#-features)
- [🚀 Quick start](#-quick-start)
- [🎯 Controls](#-controls)
- [🧠 The memory glove](#-the-memory-glove)
- [🏙️ Living city & stealth](#-living-city--stealth)
- [📁 The case file](#-the-case-file)
- [🧭 HUD, map & progression](#-hud-map--progression)
- [🎨 Visuals, audio & performance](#-visuals-audio--performance)
- [🪄 World realism & animation](#-world-realism--animation)
- [📷 Camera, solidity & the mini-map](#-camera-solidity--the-mini-map)
- [🏗️ Architecture](#️-architecture)
- [🗂️ Project layout](#️-project-layout)
- [🧪 Testing](#-testing)
- [⚙️ Settings & URL overrides](#️-settings--url-overrides)
- [🚢 Deployment](#-deployment)
- [👀 What you should see](#-what-you-should-see)
- [⚠️ Known limitations](#️-known-limitations)

---

## 🎮 About

**MEMORY THIEF** is a procedural, single-world open city built with
**Three.js + Vite**. It is one game, one world, one continuous case — not a
collection of demos.

You play **Riven Vale**, a third-person character walking a living city of
patrolling agents behind a readable stealth system, wearing a
memory-extraction glove. The journal it feeds *weighs* what it recorded, and
the reconstructions you trigger **change the world** when they finish: a door
unbars, a marker burns, a person will finally talk.

The game ships its complete opening chapter — **THE VENN CASE** — in which
Riven Vale is hired to find a missing woman and finds his own name instead.

## ✨ Features

- 🏙️ **Fully procedural city** — seeded layout, buildings, facades, props,
  neon signage and wet-street materials generated in code; the same seed
  always rebuilds the same city.
- 🧠 **Six unreliable memories** — extract fragments from people and objects,
  each with its own colour signature, animation and *reliability rating*;
  two accounts of the same night contradict each other, and the journal lets
  you tag which one you believe.
- 👻 **World-changing reconstructions** — replay a memory at its recording
  site and the city is permanently different afterwards.
- 🚶 **Living city** — twelve agents (guards, civilians, vendors and a mark)
  walking validated street rounds with pause points, on a fixed 10 Hz
  wall-clock heartbeat.
- 🕶️ **Readable stealth** — HIDDEN / SUSPICIOUS / DETECTED / SEARCHING, always
  with a plain-language reason; cover, restricted zones, guard alerts and
  disturbances that respect line of sight.
- 📖 **A complete playable case** — the Venn case from commission to finale:
  two branching choices, three order-independent findings, a locked records
  cage, an optional side case, and a case-file journal that keeps up.
- 📈 **Honest progression** — four glove upgrades bought with *derived*
  resonance motes (never farmed), plus a save/load system that refuses broken
  checkpoints with a reason instead of eating them.
- 🗺️ **Map suite** — a **top-right mini-map** (`Tab`) for walking the city,
  the full generated city map (`M`), and a case-file journal (`C`).
- 🎨 **Selective bloom & procedural materials** — HDR half-float rendering,
  ACES tone mapping, procedural normal maps, contact-shadow decals.
- 🔊 **100% procedural audio** — a WebAudio soundscape (ambience bed,
  footsteps, extraction/reconstruction cues) synthesised at runtime; no audio
  files exist.
- 🎮 **Accessibility & touch** — interface scale, reduce-flicker,
  high-contrast cards (persisted separately from saves), and a minimal
  touch layer on coarse-pointer devices.
- ✅ **367 automated checks** — one headless smoke suite plays the game
  end-to-end and fails the build on any regression.

## 🚀 Quick start

```bash
npm install
npm run dev        # 👉 http://localhost:6030
```

Click the canvas once to capture the mouse; `Esc` releases it.

Production build / preview:

```bash
npm run build      # → dist/  (3 files, byte-identical to what is live)
npm run preview    # http://localhost:4173
```

## 🎯 Controls

### 🕹️ Play mode (default)

| Input | Action |
| --- | --- |
| Click canvas | Capture mouse (pointer lock) |
| Mouse | Orbit camera (character turns to face movement) |
| `W A S D` | Move (camera-relative) |
| `Shift` | Sprint |
| `Ctrl` | Crouch / sneak (hold) — slower, lower profile |
| `Space` | Jump |
| Mouse wheel | Camera distance (2.2–9 m) |
| `E` | Extract memory · talk · open the cage & work box · close card |
| `J` | Memory journal (`↑ ↓` select · `Enter` reconstruct · `1` `2` weigh) |
| `C` | Case file — missions, objectives, evidence |
| `1` `2` `3` | Pick a dialogue choice while a conversation is open |
| `V` | Resonance Sight (once unlocked) |
| `Tab` | Toggle the **mini-map** (top-right: streets around you, live position) |
| `M` | City map — the whole generated layout, districts, landmarks, pins |
| `I` | Equipment & inventory — glove stats, upgrades, carried papers |
| `R` | Respawn at the district spawn |
| `F5` | Toggle inspection camera (dev) |
| `N` | New random seed (rebuilds the world) |
| `P` | Pause menu (save / load / settings / new game) |
| `H` | Toggle HUD |
| `Esc` | Release mouse · pause menu in play · close the open surface |

### 🔭 Inspection camera (`F5` or `?dev=1`)

| Input | Action |
| --- | --- |
| `W A S D` + `Q` / `E` | Fly (or `Ctrl` / `Space`) |
| `Shift` | Boost (4.2×) |
| Mouse wheel | Adjust flight speed |
| `R` | Reset camera to overview |
| `0` | Overview viewpoint |
| `1`–`5` | Tower · Market · Station · Garden · Underarchive landmarks |
| `6` | Street-level viewpoint (standing on a road) |

## 🧠 The memory glove

Six **fragments** are recorded across the city — three on objects (the canal
valve, the Palisade Tower directory, the conservatory plaque) and three on
people (the station attendant, the night market trader, the Underarchive
warden). A seventh person, the Glassline night clerk, carries no fragment of
his own but has things to say once someone else's memory is replayed.

**Extraction** — walk up to a source and press `E`. The glove channels for
1.3 s (ring HUD); moving or `Esc` cancels it, and every use starts a 3.5 s
cooldown. Each fragment records its identifier, source, district, the
information it carries, discrete clues, a reliability rating and its own
**visual signature**: while the channel runs the glove light takes the
fragment's colour and the HUD animates its own way (shimmer, pulse, flicker,
warp, drift or scrub) — six memories never read the same way twice.

**Unreliable memories** — fragments are *evidence, not truth*. Two are marked
`suspect` (something was cropped), two `manipulated` (one was edited to
implicate Riven). The attendant's and the warden's memories fix the same event
at 23:40 and cannot both hold; once you hold both, the journal lets you tag
which account you believe (`1` / `2`). The glove keeps the evidence either
way.

**Reconstruction** — open the journal (`J`), select a fragment and press
`Enter` while standing within 14 m of its recording site. For nine seconds
the site is overlaid with the recorded event: translucent ghost figures in
recorded poses, memory panels, a focus light, fog and ambient light dragged
toward the memory's tint, a procedural drone and a screen-space distortion.
At the halfway point the reconstruction shows its **reveal** — the specific
clue the fragment was hiding. `E` / `Esc` ends a replay early; a cancelled
replay changes nothing.

**Consequences** (fire once, when a replay completes):

| Fragment | Consequence |
| --- | --- |
| 🏮 *The Lantern Vigil* | Unbars the hidden **Floodworks service annex** — its door sinks away, the sealed coffer inside can be read |
| 🔦 *The Last Look* | Lights a clue marker over the Line 4 departure board |
| 🌿 *The Observance* | Lights a clue marker over the conservatory plaque |
| 🧾 *Sold Once, Bought Twice* | The trader will talk about the second sale |
| 🛗 *Forty, Pressed Twice* | The night clerk will admit what runs the lift |
| ⚡ *The Sealing* | Unlocks **Resonance Sight** (`V`) — through-wall echo pillars for 16 s, 45 s cooldown |

Progress **persists** in `localStorage` (`mt.memories.v1`) across journal
close/reopen, page reloads and world rebuilds; replaying a fragment is always
free, but consequences never fire twice. Test hook `__MT_MEM_RESET__` clears
it.

## 🏙️ Living city & stealth

Twelve six-mesh figures walk the streets with real behaviour, and a readable
stealth system decides what the city notices about you — and *why*.

- 👮 **Archetypes** — 3 security guards, 6 civilians, 2 market vendors and 1
  investigation target (the Palisade courier), each with its own view radius
  (civilian 9 m, vendor 8 m, guard 14 m, target 11 m), walking pace and
  awareness ceiling (only guards and the target can fully "burn" you).
- 🚶 **Rounds, not rails** — every agent walks a validated street route
  (sampled against the real collider hash, keep-out lists and restricted
  zones) with designated pause points, looks around while it stands, and
  resumes when the pause ends. The city runs on its own fixed 10 Hz
  wall-clock heartbeat with catch-up, so perception and patrols keep steady
  time even if the renderer crawls.
- 📊 **Awareness meter** — unseen agents decay; seen agents gain
  `0.10 + 0.55·(1 − d/viewRadius)` per second, multiplied ×1.8 while you
  sprint, ×3 while you channel an extraction near someone, ×2.2 with
  Resonance Sight active, and boosted inside restricted zones. A conspicuous
  act can carry the meter past the normal 0.5 "suspicious" cap.
- 🚦 **Four readable states** — HIDDEN / SUSPICIOUS / DETECTED / SEARCHING on
  the stealth HUD, always with a plain-language reason: *"A guard is watching
  you"*, *"Caught sprinting"*, *"Caught inside the sealed Underarchive
  square"*, *"Behind cover — no line of sight"*, *"Someone is searching the
  area for you"*.
- 🚨 **Investigate and alert** — a detecting guard walks to your last known
  position, searches for a few seconds, then returns to its round. Detected
  guards shout: every other guard within 18 m with line of sight switches to
  investigate; civilians who clock you (≥0.8 awareness) tip the nearest guard
  off at a weaker boost.
- 💥 **Disturbances** — extracting a memory, resonance flashes and stepping
  into a restricted zone emit a disturbance with a radius and strength.
  Standing behind a hide-spot crate silences it entirely; open ground in a
  restricted zone amplifies it. Timing and position genuinely matter.
- 📦 **Hiding and restricted space** — six crate clusters act as cover (line
  of sight blocked, awareness drains fast). The Underarchive square and the
  canal-lane annex approach are restricted zones that notice you simply for
  being there.
- 💬 **People talk** — walking up to any agent offers `Talk to the …`. Lines
  change when the agent is suspicious of you, and some open up only once the
  right fragment is in your journal — the courier explains the tower's empty
  23:40 lift only after you have reconstructed floor 40.

Test hooks (used by `npm run smoke`): `__MT_AGENTS__`, `__MT_STEALTH__`,
`__MT_HIDE__`, `__MT_ZONES__`, `__MT_AGENT_POS__`, `__MT_AGENT_PAUSE__`,
`__MT_EMIT__`, `__MT_PROMPT_DBG__`.

## 📁 The case file

The story is told through the same evidence-first voice as the memories:
short lines, conflicting accounts, and nothing handed over that you could not
go and check yourself.

**THE VENN CASE.** A man named **Tomas Venn** waits at the Old Quarter market
charter (amber marker while the case is open). His sister Mira — a Palisade
records clerk — has been missing for eleven days, and the official intake
sheets insist she never worked there. He hires you to prove otherwise.

- 🎭 **The commission is a choice.** *"I'll take it"* earns the route note
  Mira wrote home — immediately. *"What's in it for me?"* earns ward scrip
  instead (the retainer is dated **next week**) and a colder tone; the route
  note arrives later, after your first finding. Both paths converge — the
  chapter plays out identically afterwards, but the evidence in your case
  file does not.
- 🔍 **Three findings, any order.** The night market trader remembers a coil
  of sleeve she carried; the station attendant is the last person who saw her
  board; the Palisade courier can be told the truth (he goes cold, and you
  take the cut ledger page he was told to lose) or a cover story (he stays
  talkative and adds the 23:40 hint). Every objective is derived from current
  state — talk to Tomas mid-case and he tells you exactly what is still
  outstanding.
- 🔒 **A locked location.** Behind the Floodworks annex, inside the records
  cage, sits Mira's work box. The cage has no prompt before the case opens, a
  lock that explains itself before Tomas hands you the key, and a dropped
  gate (and her box) once he does. It is the only place in the chapter gated
  behind progress; every witness is reachable from the start.
- 📜 **The finale.** Mira's ledger records a Line 4 departure at **23:52** and
  a lift to **floor 40** — the event the records deny. Under it, the intake
  list for the dead: an eleventh name, **Riven Vale**. The chapter ends
  pointing at your own missing memories without explaining them.
- 🌿 **THE OBSERVANCE** is the optional side case: the night clerk and the
  conservatory plaque's memorial garden. It adds context and two evidence
  entries and *never* blocks the main mission — the case completes cleanly
  with it left untouched.

**Systems.** Missions are pure data (`src/story/missionDefs.js`): each
declares its start condition, objectives with `visible`/`done` predicates,
completion conditions and evidence rewards — the next chapter is data, not
code. Dialogue trees (`src/story/dialogueDefs.js`) resolve against the same
live state the journal uses (flags, held memories, completed objectives), so
conversations always match your case. Choices apply `flag`/`evidence` effects
through one funnel; nothing else writes story state. Flags only ever turn on
and evidence never duplicates, so replaying a fragment, rebuilding the world
or reloading the page can never lose or double-count progress
(`localStorage: mt.story.v1`, cleared by `__MT_STORY_RESET__`).

**The case-file tab.** `C` opens the journal straight onto it (or flips tabs
if it is already open): missions and live objectives on the left, evidence
with expandable bodies on the right, and — once two witnesses disagree about
the same night — the discrepancy note on top.

Test hooks (used by `npm run smoke` and `scripts/probe-story.mjs`):
`__MT_STORY__`, `__MT_STORY_RESET__`, `__MT_STORY_POS__`, `__MT_DIALOGUE__`,
`__MT_DIALOGUE_CHOOSE__`, `__MT_DIALOGUE_CLOSE__`, `__MT_CASE__`.

## 🧭 HUD, map & progression

Everything the player needs to *read* their game is on screen, the glove can
be improved in small honest steps, and the save file never silently breaks.

**The interface.** A minimal HUD — title and mode at the top left, the
**mission tracker** under it (active case, up to three unfinished objectives,
one quiet line for the side job — all derived live from `missions.view()`),
the stealth chip top-centre, and the **mini-map in the top-right corner**.
Three full-screen surfaces share the game's visual language:

- 🗺️ **City map (`M`)** — the *generated* layout, not a picture: district
  blocks tinted by identity, the Floodworks canal with its bridges, named
  landmark pins (you chart one by walking within 55 m of it; unknown ones
  show as faint `?`), the readings you hold, amber case markers, and your
  position as a chevron with heading. Hover a pin for its name, click it for
  a read-out card. Districts chart themselves the moment you step into them.
- 🧰 **Equipment (`I`)** — the glove's live stats (channel time, noise radius,
  replay range, sight duration/recharge; upgraded rows turn green), the four
  purchasable upgrades with plain-numbers descriptions, your mote balance,
  and the papers people have handed you (route note, ward scrip, commission).
- ⏸️ **Pause menu (`P` or `Esc`)** — resume, save, load, settings, and **new
  game**. A checkpoint status line says exactly what exists on disk (none /
  saved at / unreadable / wrong build), and *New game…* always passes through
  a red confirmation box before anything is erased — cancel keeps everything.

**Accessibility** lives in the settings panel: interface scale (100/115/130%
via `--ui-scale`), *reduce flicker & flash* (strips strobe animations without
breaking timers) and *high-contrast cards*. Preferences persist under their
own key (`mt.a11y.v1`) and — deliberately — survive a new game.

**Progression.** Four single-purchase glove upgrades bought with **resonance
motes**: `KEEN LENS` (replay range 14 → 21 m), `MUFFLED CHANNEL` (extraction
noise radius 12 → 6 m), `SWIFT CHANNEL` (channel 1.30 s → 0.91 s) and
`ECHO CELL` (Sight 16 s / 45 s → 20 s / 31 s). Motes are *derived*, never
farmed: **3 per reconstructed memory + 1 per evidence entry**, computed from
state on every read — so progress made before this system existed counts
retroactively, loading an old save can never double-pay, and the costs
(total 20) are always reachable by playing the chapter.

**Save / load.** `P → Save game` writes one checkpoint document
(`localStorage: mt.save.v1`) holding memories, story, discovery, upgrades,
player position and the seed. *Load* validates it first: a missing,
unparseable, older-version or newer-version checkpoint is **refused with a
reason and nothing is touched**; a valid one restores every system and
rebuilds the world from the same seed (exactly what a page reload does).
Everyday menu round-trips never rebuild — the smoke suite asserts the
generation counter and player position hold still across every screen.

**Systems.** Interface code never touches gameplay: `src/progression/`
(`upgrades.js`, `discovery.js`, `saveManager.js`) is DOM-free data and rules,
`src/ui/` (`hudTracker`, `mapScreen`, `equipmentScreen`, `pauseMenu`,
`accessibility`) is presentation that receives snapshots and returns
decisions through callbacks. `main.js` is the only place progression effects
reach gameplay (`applyProgressionEffects()` at boot, on purchase and on load).

Test hooks: `__MT_GEN__`, `__MT_TRACKER__`, `__MT_MAP__`, `__MT_GEAR__`,
`__MT_PAUSE__`, `__MT_SAVE__`, `__MT_A11Y__`, `__MT_MINIMAP__` (plus
`duration` on `__MT_EXTRACT__`).

## 🎨 Visuals, audio & performance

This layer polishes what already works rather than replacing it: the same
city, the same case, now with weighted air, a mixed soundscape, and rendering
costs that scale honestly with the graphics preset.

**Ambient particles.** A single additive `Points` cloud of slow-drifting dust
and ash (`src/environment/motes.js`) wraps around the camera — one draw call.
Its count follows the graphics preset (Low 0 · Medium 240 · High 460) and it
is hidden entirely by the **Reduce visual effects** accessibility option.

**Memory world reads differently.** Reconstructions already tint the fog and
drag the ambient light; *reduce visual effects* also strips the heavy overlay
animations (glitch bars, hue drift, grain jitter) so the memory world stays
distinct without the strobe. **Clue markers are never affected** — they
render with `depthTest: false` and stay visible through geometry by design.

**Camera motion.** Sprinting eases the field of view open by 4° and settles it
back at walking pace (`thirdPersonCamera.js`); switching to the inspection
camera resets the lens to neutral. The stride animator emits **heel-strike
events** that drive footstep audio, and a landing fires a thud.

**Sound design — fully procedural, no audio files.** `src/audio/memoryAudio.js`
synthesises everything with WebAudio (oscillators, filtered noise buffers) and
routes it through three buses so the settings panel can mix the game:

- 🔊 **Master / Ambience / Effects** volume sliders (persist under
  `mt.audio.v1`, survive a new game like the accessibility options).
- 🌧️ **Ambience bed** — a looping filtered-noise city hum with a slow breath,
  a wind layer, a rain layer (level follows the weather setting), and a
  sparse scheduler that drops in distant machinery: metal clanks, a heavy
  thrum, an occasional far-off horn. It ducks while a menu owns the screen.
- 👣 **Footsteps** (softer walk / harder run, with pitch jitter so they never
  machine-gun), a **landing** thud, **interact/pickup/ui** cues, and the
  distinctive **extraction** (charge/done/fail) and **reconstruction**
  (start/reveal/end) cues.
- 🔇 Every entry point degrades to silence if WebAudio is missing or blocked —
  the game runs fully without audio (headless tests prove it).

**Performance.** Profiling (`scripts/probe-perf.mjs`, measured on
SwiftShader) drove three changes, all verifiable through the smoke suite:

- 🕐 **Shadow-map cadence** — the depth pass no longer re-renders every
  frame; `shadowMap.autoUpdate` is off and the map refreshes on a fixed
  schedule (Low 0 Hz · Medium 4 Hz · High 6 Hz). Measured: the depth pass
  costs about **+150 draw calls / +354k triangles** whenever it lands, so
  skipping most of them roughly halves the render cost on weak GPUs.
- 💡 **Distance-based light budget** — only the *nearest* N district/landmark
  accent lights are visible (N from the preset: Low 0 · Medium 8 · High 10),
  picked twice a second. This fixes an old quirk where the first districts
  by index kept their light no matter where you stood, and cuts per-fragment
  lighting cost.
- 🖥️ **Resize re-caps the device pixel ratio** (dragging to a HiDPI monitor
  no longer doubles fill-rate silently).

Measured preset scaling (same seed, same street view, peak per-frame cost
including the shadow pass, plus the sustained rate over three 15 s windows of
completed app frames):

| preset | render scale | draw calls | triangles | point lights | shadow Hz | motes | sustained FPS |
| ------ | ------------ | ---------- | --------- | ------------ | --------- | ----- | ------------- |
| low    | 0.75         | 407        | 467,270   | 0            | 0         | 0     | 1.07          |
| medium | 1.00         | 580        | 822,370   | 8            | 4         | 240   | 0.47          |
| high   | 1.00         | 589        | 828,140   | 10           | 6         | 460   | 0.47          |

*(Measured under SwiftShader software rendering; the absolute FPS there is
not representative of real hardware — the relative deltas are the point.)*

**Frame rate — measurements first.** Three separate metric bugs made every
frame-rate number in this project unusable. Each is worth naming, because
each produced a confident wrong answer:

- `stats.fps` accumulated a **dt clamped to 100 ms**, so any frame slower
  than 100 ms reported exactly **10 fps** — a ceiling that read like a
  measurement. Every software-GL frame exceeds 100 ms, so the profiler
  printed a flat `10` regardless of what was happening.
- `renderer.info.render.frame` increments **once per `renderer.render()`
  call** (`WebGLInfo.reset` never zeroes it), and a post-processing frame
  makes many such calls — one per fullscreen-quad pass. Bloom-enabled
  presets were therefore counting *passes* while Low counted *frames*, which
  made Low look ~10× slower than High while it was rendering the same game.
  `stats.appFrame` now counts completed frames, once each.
- The probe's own sampling inherited both. It now visits every preset once
  before measuring (discarding shader compilation — reported as `programs`
  before → after, flat meaning it rendered rather than recompiled) and
  reports the median of three 15 s windows of completed app frames.

With honest metrics the headline reversed: **Low was never the slow preset.**

**…and the actual bottleneck.** One sweep — medium preset, identical content,
only the drawing buffer changes:

| render scale | pixels | sustained FPS | frame time |
| ------------ | ------ | ------------- | ---------- |
| 100%         | 1.00×  | 0.47          | 2.13 s     |
| 75%          | 0.56×  | 0.73          | 1.37 s     |
| 50%          | 0.25×  | 1.40          | 0.71 s     |

**A quarter of the pixels buys ~3× the frame rate** (0.47 → 1.40). Fitting
`frame time = fixed + fill × pixels` leaves roughly **0.24 s of fixed cost
against ~1.9 s of fill at 100% — about 90% of every frame is per-pixel
rasterisation.** Everything else in the preset table (2× the triangles,
0 → 10 lights, shadows and bloom on or off) barely moved the needle, because
all of it was paying the same per-pixel bill.

**What that produced:**

- **Low's context MSAA was a ~2× tax it never asked for.** A WebGL context
  fixes its multisample state at creation and cannot change it, so the
  per-preset `antialias` flag was decoration: the page boots on Medium
  (`true`), and Low — which declares `false` — paid 4× multisampling anyway
  on the only path that reaches the default framebuffer (Medium and High
  draw into the composer's non-multisampled target, where the flag never did
  anything). Context MSAA is now off, the dead flag is gone, and Low went
  **0.33 → 1.07 fps at the same 0.75 scale**, with its synchronous render
  stage falling **136 ms → 4.8 ms**. The load-independent proof: Low went
  from running *2.2× slower* than Medium at that identical scale — with half
  the features — to *1.5× faster* than it, the ordering its feature set
  always implied.
- **A render-scale control, because resolution is the only lever that
  reaches the bottleneck.** `settings.renderScale` (settings-panel slider,
  `?rs=` URL parameter, `__MT_RES__` test hook) multiplies the
  drawing-buffer ratio in exactly one place, so boot, preset switch and
  window resize cannot drift apart; Low carries its own 75% on top. The DOM
  HUD always draws at native size — only the 3D scene scales.
- **Structural trims where fill was provably wasted:** shadow maps Medium
  2048 → 1536 and High 3072 → 2048 with a tighter frustum (130 → 120,
  170 → 150 — the shadow camera tracks the player, so this sharpens shadows
  as it shrinks the depth pass), and the bloom pyramid at 0.4 instead of 0.5
  of device resolution.

**Touch controls.** On coarse-pointer devices a minimal layer appears: a
left-thumb virtual stick (movement keys), right-side drag-to-look, and
`E` / jump / sprint buttons. It feeds the *same* injection APIs the tests
use (`Input.setKey` / `injectPress` / `simulateMouse`), so the controller
and camera never learn touch exists. Desktop and headless browsers get no
touch DOM at all. Menus remain keyboard+mouse.

**Honest scope.** The memory effects are geometry, lighting and CSS overlays.
The only post-processing is a *selective* bloom pass (below) — deliberately
nothing from a frame-graph (no SSAO, no motion blur, no screen-space
reflections). Building silhouettes, neon signage and wet-street reflections
are all procedural. See *Known limitations* for what was and was not
measured.

Test hooks: `__MT_QUALITY__` (apply a preset, returns before/after cost),
`__MT_RES__` (set the render scale, returns the resulting pixel ratio),
`__MT_MODE__` / `__MT_OVERLAY_OPEN__` (movement gate: current mode, and
whether any DOM surface owns the screen), `__MT_AUDIO__`, `__MT_AUDIO_CUE__`,
`__MT_AUDIO_STEP__`, `__MT_AUDIO_AMBIENCE__`, `__MT_AUDIO_VOLUMES__`,
`__MT_FX__`, `__MT_TOUCH__`, `__MT_SHADOW_REFRESH__` (`fov` on `__MT_CAM__`
proves the lens is *fixed* at 58° — there is no sprint FOV ease).

## 🪄 World realism & animation

The same city pushed toward photorealism, with real bodies and many kinds of
motion — without touching the gameplay rules, the prompt strings, or the
draw-call budget.

**Selective bloom.** The single biggest realism win for a wet neon city at
night is light *bleed*: bright sources spill into their surroundings.
`src/core/postfx.js` runs `RenderPass → UnrealBloomPass → OutputPass`, so
the scene renders to an HDR (half-float) buffer, bright emissive surfaces
(neon, the extraction glove, lamp cores, the moon) bloom, and `OutputPass`
applies the ACES tone map + sRGB exactly once. It is **off on Low** and on
for Medium/High, and the blur pyramid runs at **half resolution** (bloom is
low-frequency, so this is visually identical for a fraction of the fill
cost). Because the scene renders into a target before a final copy,
`renderer.info.autoReset` is off and the app resets the draw-call counter
once per frame, so `renderInfo.calls` still reports the scene's real draw
calls.

**Lighting and surfaces.** A dim cool **rim/back light** grazes silhouettes
so figures and kerbs separate from the dark background. Ground, roads and
facades gained **procedural normal maps** (`buildSurfaceNormal` — tileable
value noise → Sobel), so light and neon catch real surface relief instead of
sliding over mathematically perfect planes. Every character also gets a soft
**contact shadow** decal: one instanced quad + one texture for the entire
cast, one draw call total, so feet read as touching the ground even between
shadow-map refreshes.

**Characters.** Each bystander is still six meshes (same draw-call cost), but
every limb is *merged* from several boxes — thigh/shin/foot,
upper/forearm/hand, pelvis/chest/shoulders/collar, neck/skull/hair — so a
person reads as a person. Roles get distinct silhouettes: guards are broad
with shoulder pads and a helmet, vendors wear an apron, investigation
targets carry a coat tail and satchel. A per-seed height/build jitter keeps
a crowd from looking cloned.

**Animation — many types.** `src/npc/npcAnim.js` is a clip library of ~18
procedural poses (walk, brisk walk, run, idle, weight-shift, phone-check,
arms-crossed, at-attention, lean, sit, carry, talk, point, wave, vendor-hail,
device-check, search-sweep, cautious-investigate, startle). `clipFor()` picks
the right one from an agent's **role + AI mode + awareness**, so guards
stand at attention, vendors call out, searching figures shield their eyes
and scan, and the mark is always checking a device. The rig eases toward
each clip's targets, so mode/alert changes blend instead of snapping.

Riven Vale gained new states, all additive on top of locomotion so they can
never break the walk/run/jump poses: **crouch/sneak** (hold `Ctrl`), the
**extraction channel** pose (glove hand raised for the whole channel), a
one-shot **reach gesture** whenever you press `E`, a landing absorb, and
idle micro-life (slow weight shift plus an occasional glance down at the
glove).

**Interaction.** The prompt already said *what* was in reach; it now shows
*where*. A soft additive **focus ring** on the ground plus a floating marker
glide to whichever target owns the prompt (source, story character, agent or
interactable). The prompt eases up into place and its `E` badge pulses. All
of this is presentational: every key, prompt string and priority rule is
unchanged, so the existing tests still pass verbatim.

**Honest performance.** Bloom, per-fragment normal maps and an extra
directional light are real GPU work. Under the headless **SwiftShader**
software renderer these drop measured FPS materially versus the base
renderer; that number is a property of the software rasteriser, not of the
game. On real hardware these are standard, cheap effects. If a machine
struggles, drop the quality preset — Low disables bloom, contact shadows,
point lights and the shadow pass entirely.

## 📷 Camera, solidity & the mini-map

**A steady camera.** The lens never breathes: a fixed **58°** field of view
at every speed, and a fixed, tiny look-ahead offset — so the character sits
in the same place in frame at a walk and at a full sprint. Pivot smoothing
is tight (26/22/26 per axis) and the boom keeps its wall sweep (16 steps,
retreating out of any solid it ends up inside). The important fix is at the
bottom of the pitch range: looking straight down from a full 9 m boom used
to sink the lens **below the street**. The boom end is now clamped to stand
`0.55 m` above the terrain under it (`Colliders.baseGround`), so the camera
may look down but can never go under the ground.

**A watertight city.** Three changes close every void the camera could find:

1. The base plane is a **closed slab** (top, sides and a bottom face, 4 m
   deep) instead of a single quad at `y = -0.08`.
2. Block slabs emit their **bottom face**, and roads are **0.38 m tarmac
   slabs** buried into that base instead of floating quads with a 9 cm gap.
3. Every building tier is emitted with `shell: 0.06` — `MeshBuilder.box()`
   now also writes an **inward-facing inner box**. From outside it is
   backface-culled (no extra fill cost, +12 triangles per tier), but when
   the camera clips inside a building you see dark interior walls, floor and
   ceiling rather than the sky through the far facade.

**An articulated Riven Vale.** The rig has real joints: every leg is
thigh → **knee pivot** → shin + boot (the sole lands exactly on `y = 0`),
and every arm is upper → **elbow pivot** → forearm + hand/glove, with the
glove light and emitter glow parented to the forearm so they track the hand.
The silhouette gained a tapered ribcage, belt buckle, shoulder straps, jaw,
respirator and hood point. Because the animator can bend a knee *while* the
thigh swings, the walk reads as a person; the pelvis counter-rotates against
the chest and the head stays level through the twist.

**More animation, everywhere.** New additive states on top of the existing
locomotion: a **turn-on-the-spot shuffle** (detected from the rig's own yaw
rate — spinning in place now steps instead of statue-pivoting), a deeper
**crouch-walk**, sprint elbows folded to 0.9, take-off tuck and
ground-reaching drop, a knee-bending **landing absorb**, and a rotating set
of four **idle beats** (glance at the glove, adjust the collar strap, an
over-the-shoulder check, a weight-stamp) on a 9.5 s cycle. `fireGesture()`
is a named table — `reach`, `point`, `brace`, `adjust`, `wave` — used by
interactions and dialogue.

**A mini-map, not a map viewer.** `src/ui/miniMap.js` draws a 184 px radar in
the **top-right corner** at ~8 Hz from the *same* snapshot the full map uses:
the streets and blocks within **±120 m**, district tints, the canal and its
bridges, landmark pins, held readings, amber case markers, and you as a
chevron with a facing cone. It deliberately does **not** show people —
guards stay off the radar, so stealth is still played by eye. It follows the
HUD (`H`), steps aside for any overlay, and `Tab` toggles it. The full city
map moved to `M` (and the journal to `J`), so nothing was lost — the map
screen is still there, it is just no longer the thing you press fifty times
an hour.

**Honest cost.** Shells, road slabs and the base box add a few thousand
triangles to a ~0.8 M triangle city and zero draw calls (they join existing
buckets). The mini-map is a 2D canvas at 8 Hz — no WebGL work at all.

Test hooks: `__MT_MINIMAP__` (visibility, canvas size, the world point the
radar was last drawn at, district label, pin counts) and `gait` on
`__MT_PLAYER__` (live knee / elbow / torso channels — proof the rig is
actually articulating).

## 🏗️ Architecture

- **One continuous grid** — `grid × grid` cells of 100 m with 16 m roads
  centred on cell boundaries. Districts are rectangular *regions* of that
  grid, so all five are connected by the same streets; the Underarchive
  entrance is a single overridden cell and the Floodworks canal replaces one
  road corridor.
- 🎲 **Deterministic** — a seeded RNG (`src/core/rng.js`) drives layout,
  facades, props and landmarks; the same seed always produces the same city.
- 📞 **Draw-call discipline** — geometry is accumulated into per-chunk
  (2×2 cells) buckets keyed by material and merged; props are instanced;
  chunks are distance-culled on top of frustum culling.
- 🖼️ **Textures** are painted into canvases at startup (facades, road, water
  normal, signage) and shared by every chunk that uses them.
- 🧱 **Collision without a physics engine** — `src/player/collision.js`
  collects boxes and circles while the world is built into a spatial hash.
  The player is an XZ circle (r 0.34, height 1.8, step 0.36) moved per-axis
  with bisection, so it slides along walls and can climb curbs but never
  penetrates geometry. The third-person camera ray-sweeps the same hash to
  shorten its boom near walls. Runtime `disable`/`enable` toggles a single
  collider and rebuilds the hash (the hidden door uses this), and
  authoring-time probes (`findFlatFace`, `occupancyFree`) let new geometry
  seat against real walls on any seed.
- 🚧 **Blocked space is visible, not invisible walls** — pits, canal drops
  and hedges are guarded by parapets, barrier rings and hedges you can see,
  so the city reads as a real place rather than a maze of invisible limits.
- 🧍 **Riven Vale** is ~10 merged vertex-coloured meshes (one per movable
  part) with a procedural animator and a violet memory-extraction glove
  that casts real light. To swap in a rigged GLTF later, expose the same
  `{ group, parts, height, dispose }` shape.
- 🧠 **Memory state has one owner** — `MemoryManager` (collect /
  reconstruct / deductions / ability / persistence). The reconstruction
  player is a pure viewer anchored at local offsets from a source, captures
  the fog and light it borrows, and restores them even when playback
  throws. All memory timers are wall clock, so channels, cooldowns and
  replays last the same real seconds at 60 fps and at the fraction-of-a-fps
  a headless software renderer manages.
- 🚪 **The hidden annex is seed-robust** — the world builder probes the raw
  collider list for a flat building face on the Floodworks canal bank (three
  scan lines must agree), checks the footprint *and* the door-front lane are
  prop-free, and falls back to a freestanding alcove if the city argues.

## 🗂️ Project layout

```
index.html            UI shell: loading screen, HUD, settings panel, prompts,
                      memory journal, extraction ring, reconstruction overlay
src/
  main.js             bootstrap, mode manager (play/inspect), memory wiring,
                      test hooks
  styles.css
  config/             palette, district definitions, quality/defaults/URL overrides
  core/               app shell (renderer/loop/culling), seeded RNG, input, fly camera
  utils/geo.js        MeshBuilder — merged vertex-coloured geometry
  world/              layout, textures, materials, buildings, props, landmarks,
                      details, colliders, memory sites, city life (routes,
                      agents, hide spots, zones), world orchestrator
  environment/        sky + env map, lighting rig, rain
  character/          Riven Vale model + procedural animator
  npc/                bystander figures, NPC agent (perception + behaviour
                      state machine), dialogue lines
  stealth/            stealth system (awareness states + reasons)
  player/             collision system, movement controller, third-person camera
  interaction/        interactable objects placed from the layout
  memories/           fragment catalogue, memory manager, reconstruction player
  story/              story state (flags + evidence, persisted), mission
                      definitions + manager, dialogue definitions + runner,
                      story cast (Tomas Venn)
  audio/              procedural WebAudio cues (no sample files)
  ui/                 loading screen, HUD, settings panel, prompt/read-out card,
                      memory journal + case-file tab + extraction channel,
                      stealth HUD, dialogue card, city map, corner mini-map
scripts/smoke.mjs     headless screenshot/error/gameplay/memory/city-life/story
                      smoke test (367 checks, exit code reflects failures)
scripts/probe.mjs     headless runtime probe (stats + lights, no screenshots)
scripts/probe-story.mjs  focused chapter walkthrough probe (fresh save, both
                      choice paths, PASS/FAIL per step)
scripts/probe-ui.mjs  focused UI probe (mini-map, map/journal keys, camera
                      ground clamp, articulated gait)
scripts/probe-geo.mjs focused geometry probe (how renderer.info counts
                      geometries; same-seed rebuild determinism)
```

## 🧪 Testing

One headless smoke suite (`scripts/smoke.mjs`, headless Edge + Puppeteer)
starts the dev server, plays the game and asserts **367 checks** in six
groups — the exit code reflects failures, so it gates every change:

| 🔍 Group | Checks | What it proves |
| --- | --- | --- |
| 🎮 Gameplay | 30 | walking, sprinting, jumping, collision (walls, barriers, camera boom), prompts, read-out cards |
| 🧠 Memory | 63 | extraction + cooldown/cancel paths, journal, contradictions, reconstruction playback/cancellation, the hidden door, dialogue unlocks, Resonance Sight |
| 🏙️ City life | 30 | population & archetypes, hide spots, restricted zones, patrol movement, SUSPICIOUS→DETECTED escalation with reasons, investigate→search→return cycle, cover breaking line of sight |
| 📖 Story | 113 | the Venn case end to end: both dialogue-choice paths, order-independent objectives, the locked cage, the optional side case, case-file journal, reload persistence |
| 📈 Progression | 88 | HUD tracker, city map & pins, mini-map + `Tab` toggle, extraction noise, upgrade shop, pause/settings/save-load/new-game round-trips |
| ✅ Quality | 43 | low/medium/high presets, draw-call & GPU-resource leak budgets, same-seed rebuild determinism, volume buses, reduce-FX, fixed-lens camera |

```bash
npm run smoke        # ~10 min under software GL; writes smoke/ screenshots
```

The suite can also be pointed straight at production (the deployed bytes are
the local build):

```powershell
# PowerShell
$env:SMOKE_URL="https://memorythief.vercel.app"; $env:SMOKE_OUT="smoke-live"; npm run smoke
```

```bash
SMOKE_URL=https://memorythief.vercel.app SMOKE_OUT=smoke-live npm run smoke
```

Faster focused probes for iteration:

```bash
node scripts/probe.mjs market        # runtime probe (world stats + light rig)
node scripts/probe-story.mjs         # whole chapter walkthrough, PASS/FAIL per step
node scripts/probe-ui.mjs            # mini-map, map/journal keys, camera clamp, gait
```

## ⚙️ Settings & URL overrides

- ▶️ **Live (no rebuild):** fog distance, rain, shadows, wet streets, quality
  preset, render scale, mouse sensitivity, camera distance, invert-Y,
  procedural sound cues.
- 🔁 **Rebuild:** seed, world scale (8 / 12 / 16 blocks), district density.
- ♿ **Accessibility** (own storage key, survives a new game): interface
  scale, reduce flicker & flash, high-contrast cards.

URL overrides are supported for testing and screenshots:

```
http://localhost:6030/?seed=eidolon-77&grid=12&quality=high&density=1.1&fog=800&rain=1&shadows=1&wet=1&sens=1.0&dist=4.6&invert=0&audio=1
```

`?dev=1` starts in the inspection camera instead of play mode.

## 🚢 Deployment

The game is a pure static site: `npm run build` writes `dist/`, and that
exact bundle is what ships. No build runs on Vercel, so what is live is
byte-for-byte what was tested locally.

> ### 🌐 The one live URL: **[memorythief.vercel.app](https://memorythief.vercel.app)**

- Project `memory-thief`, personal scope, `framework: null`
- Deployed via Vercel's file API (three `dist/` files + SHA-1 digests);
  `framework: null` is what makes Vercel serve the files as-is instead of
  trying to run a build on a directory with no `package.json`.
- After every production deploy the two legacy-host **alias redirects are
  re-applied** with `assign_alias({ ..., redirect: "memorythief.vercel.app" })`
  (bare hostname — the API prepends `https://` itself; 307, path + query
  preserved).

**Why only one URL.** `memory-thief.vercel.app` itself was never available
(it belongs to another account). The two older hosts no longer serve the
game:

- `memory-thief-omega.vercel.app` → **alias-level 307 redirect** to the live
  URL (`…/?seed=eidolon-77&quality=medium` lands on the same path+query).
- `memory-thief-tahsan2544-projects.vercel.app` → the auto-generated
  deployment URL sits behind **SSO protection**
  (`ssoProtection: all_except_custom_domains`), so visitors get Vercel's
  login wall — never a second copy of the game. Protection must stay on.

**Why redirects live at the alias layer, not in `vercel.json`.** Redirect
rules in a `vercel.json` uploaded through Vercel's file API are **validated
at build but never applied** to such deployments. Verified directly: a
deployment carrying an unconditional canary redirect returned `200/404`
instead of `308`, while the alias-level redirect worked on the same
deployment. There is no API to delete a project domain or to PATCH its
redirect, so removing the legacy domains entirely is a one-click dashboard
action (Project → Domains → Remove). If a git remote is ever connected,
`vercel.json` redirects *would* apply; the tested config is preserved for
that future:

```json
{
  "redirects": [
    { "source": "/:path*", "destination": "https://memorythief.vercel.app/:path*", "permanent": true,
      "has": [{ "type": "host", "value": "memory-thief-omega.vercel.app" }] },
    { "source": "/:path*", "destination": "https://memorythief.vercel.app/:path*", "permanent": true,
      "has": [{ "type": "host", "value": "memory-thief-tahsan2544-projects.vercel.app" }] }
  ]
}
```

## 👀 What you should see

A night city in the rain, seen over Riven Vale's shoulder: amber-windowed
Old Quarter, cold blue Glassline towers, teal Floodworks with a canal and a
flooded station pit, green Verdant Ward, and a sealed red-hazed Underarchive
square in the middle. Wet asphalt picks up the district colours; fog falls
off into the distance rather than hiding the skyline.

People stand at the landmarks — an attendant at the station board, a trader
at the market charter, a warden at the archive notices, a clerk at the tower
directory. Walk close and the glove offers to read them; a valve, a
directory or a plaque offers the same. A successful reading opens the
journal on the recovered fragment. Replay it at its site and violet ghosts
play the recorded event around you while the fog closes in — then the city
is subtly different: a door unbars on the canal bank, a marker burns over a
clue, a person will finally talk.

The streets *live*: guards patrol with their hands clasped, civilians walk
with shopping, vendors stand their market corner, and the Palisade courier
crosses the city on an errand. Sprint past a guard and the HUD chip climbs
from `HIDDEN` to `SUSPICIOUS` with the reason "A guard is watching you";
keep it up and it flips to `DETECTED — Caught sprinting`, the guard breaks
into a run toward you and shouts to the next patrol over. Duck behind a
crate cluster and the chip reads `HIDDEN — Behind cover — no line of sight`
while the guard searches the spot you vanished from. Channel an extraction
in the open and everyone within earshot turns; do it behind cover and no
one notices at all.

An amber marker leads to a patient man at the market charter: Tomas Venn,
who hires you on the spot for his missing sister. Open the case file (`C`)
and the journal grows a second face — objectives on the left, evidence on
the right. Talk to the trader, the attendant and the courier in any order
and the case file keeps up; talk to Tomas instead and he reads the
outstanding work back to you. When he finally hands you the key, the records
cage inside the canal annex drops its gate and Mira's work box is waiting —
with a ledger that says the city's own records lie, and an intake list with
your name on it. Conversations are cards with numbered choices; picking the
hard truth at the courier changes what he will ever say to you again.

At the default (medium) preset and 12×12 grid the world is ~410 merged
meshes, ~4 900 instanced props and roughly 500 k generated triangles, drawn
in 130–450 calls depending on how much of the city is on screen (play mode
culls more aggressively than the overview). The memory layer adds four
six-mesh figures, one small annex and a handful of additive markers — under
50 extra draw calls, and only while they are on screen. The city adds twelve
six-mesh agents (each one mesh per body part, shared geometry and materials
per archetype) for ~440 total draw calls in the street test — comfortably
inside the budget; the figures' documented scale-up route is instancing if
the population grows. The story adds one figure and a handful of additive
markers — under five extra draw calls, and only while they are on screen.

## ⚠️ Known limitations

- 🚪 **No interiors** — the hidden service annex is the first enterable
  space; every other door is visual and buildings are solid blocks. (The
  interior shells mean a camera that clips inside a wall reads as a dark
  room rather than seeing through the city — a visual fix, not a room.)
- 🚶 **Only Riven Vale is articulated** — bystanders keep the merged-limb
  rig (thigh/shin drawn as one solid, animated by the clip library); giving
  the crowd real knees and elbows is the next rig pass.
- The city edge is sealed by an **invisible boundary wall** (the world just
  ends beyond the outer road); everything *inside* the city uses visible
  blockers.
- Collision volumes are simplified (boxes/circles per building, prop and
  parapet) — no per-stair-step or per-railing geometry.
- The inspection camera (`F5`) is still a development tool; it clips
  through geometry by design.
- Point lights are large district/landmark accents plus the glove light and
  the annex cache light, not per-street-lamp lights.
- Rain is a fixed volume around the camera; there is no lightning or wind
  variation yet.
- Quality presets cap pixel ratio, shadow map size, prop density and
  visible light count; "Low" disables shadows and rain entirely.
- **Agents walk through each other and through the player** — they avoid
  the world's static geometry (validated routes, per-axis collision) but
  have no agent-agent or agent-player collision.
- **No canal-bridge routing** — routes are validated to stay on their own
  bank, so nobody crosses the Floodworks canal; the canal-lane patrol and
  the annex approach live on the east side only.
- **The population is deliberately small** (12 agents, 6 hide spots, 2
  restricted zones) — the first working set, sized to keep the behaviour
  readable; more agents or instanced figures are the scale-up route.
- **Line of sight is sampled at chest height in 2D** — a guard above a pit
  "sees" across it; hiding spots and walls model their blocking as radius
  volumes rather than per-fragment occlusion.
- **No schedules** — agents repeat their round indefinitely; there is no
  time-of-day behaviour and no free-form dialogue (talk is scripted per
  suspicion state, fragment consequence and mission state).
- **The opening chapter is fully authored but singular** — one complete case
  with two branching choices; the mission/dialogue systems are generic
  (data + predicates), but no second chapter exists yet.
- **Story characters stand at their posts** — Tomas Venn idles at the market
  charter like the landmark figures; only the courier actually walks.
- **The records cage gate animates open, not shut** — the story reset hook
  (`__MT_STORY_RESET__`) restores the *logic* (the lock refuses without the
  key) but the gate mesh stays down until the world is rebuilt.
- **Landmark figures still idle** — the four memory-source people stand at
  their posts (they are extraction sources first, patrollers second).
- **Reconstructions play at the recording site only** — you must walk back
  to the source to replay (the journal tells you how far you are).
- Memory state persists in `localStorage`; if storage is unavailable
  (private mode), the game keeps working but forgets between reloads.
- Headless smoke tests render with SwiftShader (0.4–1.4 real FPS at street
  level, depending on preset and render scale), so gameplay checks poll for
  progress instead of waiting fixed times — low FPS in `smoke/` runs is the
  software renderer, not the game. On such slow renderers the city
  heartbeat catches up only 0.8 s of city time per rendered frame (capped,
  to keep the SUSPICIOUS→DETECTED escalation observable), so the city runs
  at a fraction of wall speed there — at 60 fps it runs at full speed.
- **All performance work was measured only under SwiftShader** (software
  GL, headless Edge). The draw-call / triangle / light-count deltas between
  presets are real and reproducible, but **no real-GPU frame rate was
  measured** — do not read the probe's FPS column as hardware performance.
- **Shadow maps refresh on a cadence, not every frame** (Medium 4 Hz ·
  High 6 Hz), so a fast-moving character's shadow can lag the mesh by up to
  ~250 ms. Low turns shadows off entirely. The cost saving is deliberate
  and large.
- **The dynamic light budget picks the nearest N accent lights twice per
  second** — a light can pop on/off at the selection boundary, and distant
  districts lose their coloured fill until you walk closer. This is the
  price of a bounded per-fragment light count in a forward renderer.
- **Bloom is the only post-processing** — no SSAO, no motion blur, no
  screen-space reflections. Wet-street "reflections" are a scrolling normal
  map, and the memory-world effects are geometry + lighting + CSS overlays,
  not a frame-graph, which is why they stay cheap on integrated GPUs.
- **Procedural audio only** — every sound is synthesised at runtime; there
  are no recorded samples, so footsteps and machinery are convincing but
  not photoreal. Browsers without WebAudio run the game silently by design.
- **Touch controls cover movement, look, interact, jump and sprint only.**
  Menus, the journal, the map and dialogue remain keyboard+mouse — a touch
  device can play the game but cannot easily navigate every screen. This is
  a minimal practical layer, not a full mobile control scheme, and it was
  not tested on physical touch hardware (only that it stays out of the way
  on desktop).
- **Ambient motes are new motion** — they are gated by the graphics preset
  (Low removes motes) and by *reduce visual effects*. The camera has no
  motion effects of its own: there is no sprint FOV kick and no look-ahead
  swing, so there is nothing extra to toggle there.

---

<div align="center">

**Built with 💜 by [@tahsan2544](https://github.com/tahsan2544)**

*Three.js · Vite · WebAudio — every byte generated in code.*

[![Live](https://img.shields.io/badge/%F0%9F%8C%90%20Play%20MEMORY%20THIEF-2563eb?style=for-the-badge&logo=vercel&logoColor=white)](https://memorythief.vercel.app)

</div>
