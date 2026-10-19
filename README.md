<div align="center">

# 🕵️ MEMORY THIEF

**A procedural open-world memory-noir mystery — built entirely in code.**

One rain-soaked city. Six unreliable memories. A glove that steals them — and
changes the street when you play them back.

[![🌐 Live](https://img.shields.io/badge/%F0%9F%8C%90%20Live-Play%20now-2563eb?style=flat-square&logo=vercel&logoColor=white)](https://memorythief.vercel.app)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?style=flat-square&logo=threedotjs&logoColor=white)](https://threejs.org)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![Smoke](https://img.shields.io/badge/Smoke%20checks-262%2F262-brightgreen?style=flat-square)](#-testing)
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
- [🧭 HUD, map & progression](#-hud-map--progression)
- [🎨 Visuals, audio & performance](#-visuals-audio--performance)
- [🪄 World realism & animation](#-world-realism--animation)
- [📷 Camera, solidity & the mini-map](#-camera-solidity--the-mini-map)
- [🕛 Day/night & weather by the clock](#-daynight--weather-by-the-clock)
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
**Three.js + Vite**. It is one game, one world, not a collection of demos.

You play **Riven Vale**, a third-person character walking a living city of
patrolling agents behind a readable stealth system, wearing a
memory-extraction glove. The journal it feeds *weighs* what it recorded, and
the reconstructions you trigger **change the world** when they finish: a door
unbars, a marker burns. Six unreliable memories — city echoes recorded on
people and places — are yours to recover, weigh and replay.

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
- 🗝️ **A hidden place worth finding** — reconstruct the right memory and the
  sealed service annex on the canal bank opens; what was cached inside can be
  read, and the street plan quietly makes room for it.
- 📈 **Honest progression** — four glove upgrades bought with *derived*
  resonance motes (never farmed), plus a save/load system that refuses broken
  checkpoints with a reason instead of eating them.
- 🗺️ **Map suite** — a **top-right mini-map** (`Tab`) for walking the city:
  north-up radar with a facing cone, **speed-linked zoom** (120 m → 150 m at a
  sprint) and **edge arrows** that keep off-screen landmarks/readings pointed
  out. Plus the full generated city map (`M`) and the memory journal (`J`).
- 🕛 **Day/night cycle with weather by the clock** — a 12-minute day: dawn,
  overcast day, amber dusk, archive night; a seeded schedule brings rain
  fronts and morning fog by the hour, streets wet under the rain and dry
  after it; district lamps sleep by day and wake at dusk. A live clock with
  the phase sits under the radar.
- 🎨 **Selective bloom & procedural materials** — HDR half-float rendering,
  ACES tone mapping, procedural normal maps, contact-shadow decals.
- 🔊 **100% procedural audio** — a WebAudio soundscape (ambience bed,
  footsteps, extraction/reconstruction cues) synthesised at runtime; no audio
  files exist.
- 🎮 **Accessibility & touch** — interface scale, reduce-flicker,
  high-contrast cards (persisted separately from saves), and a minimal
  touch layer on coarse-pointer devices.
- ✅ **262 automated checks** — one headless smoke suite plays the game
  end-to-end and fails the build on any regression.

## 🚀 Quick start

```bash
npm install
npm run dev        # 👉 http://localhost:6030
```

When the city is ready, the welcome title card greets you — floating over the
**live city**, with the running clock and the world stamp under the buttons
(`22:00 · NIGHT · EIDOLON-77 · 12×12`). **BEGIN THE WALK** starts the game
(that click also unlocks the sound). Then click the canvas once
to capture the mouse; `Esc` releases it.

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
| `E` | Extract memory · open the annex door & sealed coffer · close card |
| `J` | Memory journal (`↑ ↓` select · `Enter` reconstruct · `1` `2` weigh) |
| `V` | Resonance Sight (once unlocked) |
| `Tab` | Toggle the **mini-map** (top-right: streets around you, live position) |
| `M` | City map — the whole generated layout, districts, landmarks, pins |
| `I` | Equipment & inventory — glove stats, upgrades, mote balance |
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
warden). The Glassline night clerk stands nearby as city scenery —
fragment-less, with nothing to say.

**Extraction** — walk up to a source and press `E`. The glove channels for
1.3 s (ring HUD); moving or `Esc` cancels it, and every use starts a 3.5 s
cooldown. Each fragment records its identifier, source, district, the
information it carries, discrete clues, a reliability rating and its own
**visual signature**: while the channel runs the glove light takes the
fragment's colour and the HUD animates its own way (shimmer, pulse, flicker,
warp, drift or scrub) — six memories never read the same way twice.

**Unreliable memories** — fragments are *impressions, not truth*. Two are
marked `suspect` (something was cropped), two `manipulated` (one was edited —
a pasted violet-gloved hand that belongs to no one at the stall). The
attendant's and the warden's memories fix the same event at 23:40 and cannot
both hold; once you hold both, the journal lets you tag which account you
believe (`1` / `2`). The glove keeps the fragment either way.

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
| ⚡ *The Sealing* | Unlocks **Resonance Sight** (`V`) — through-wall echo pillars for 16 s, 45 s cooldown |

The other two fragments change nothing but your journal — an echo does not
have to move the world to be worth keeping.

Progress **persists** in `localStorage` (`mt.memories.v1`) across journal
close/reopen, page reloads and world rebuilds; replaying a fragment is always
free, but consequences never fire twice. Test hook `__MT_MEM_RESET__` clears
it.

## 🏙️ Living city & stealth

Twelve ten-mesh figures walk the streets with real behaviour, and a readable
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

Test hooks (used by `npm run smoke`): `__MT_AGENTS__`, `__MT_STEALTH__`,
`__MT_HIDE__`, `__MT_ZONES__`, `__MT_AGENT_POS__`, `__MT_AGENT_PAUSE__`,
`__MT_EMIT__`, `__MT_PROMPT_DBG__`.

## 🧭 HUD, map & progression

Everything the player needs to *read* their game is on screen, the glove can
be improved in small honest steps, and the save file never silently breaks.

**The interface.** A minimal HUD — title and mode at the top left, the
stealth chip top-centre, and the **mini-map in the top-right corner**.
Three full-screen surfaces share the game's visual language:

- 🗺️ **City map (`M`)** — the *generated* layout, not a picture: district
  blocks tinted by identity, the Floodworks canal with its bridges, named
  landmark pins (you chart one by walking within 55 m of it; unknown ones
  show as faint `?`), the readings you hold, and your
  position as a chevron with heading. Hover a pin for its name, click it for
  a read-out card. Districts chart themselves the moment you step into them.
- 🧰 **Equipment (`I`)** — the glove's live stats (channel time, noise radius,
  replay range, sight duration/recharge; upgraded rows turn green), the four
  purchasable upgrades with plain-numbers descriptions, and your mote
  balance.
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
farmed: **4 per reconstructed memory**, computed from state on every read —
so progress made before this system existed counts retroactively, loading an
old save can never double-pay, and the costs (total 20) are always reachable
by reconstructing all six memories.

**Save / load.** `P → Save game` writes one checkpoint document
(`localStorage: mt.save.v1`) holding memories, discovery, upgrades,
player position and the seed. *Load* validates it first: a missing,
unparseable, older-version or newer-version checkpoint is **refused with a
reason and nothing is touched**; a valid one restores every system and
rebuilds the world from the same seed (exactly what a page reload does).
Everyday menu round-trips never rebuild — the smoke suite asserts the
generation counter and player position hold still across every screen.

**Systems.** Interface code never touches gameplay: `src/progression/`
(`upgrades.js`, `discovery.js`, `saveManager.js`) is DOM-free data and rules,
`src/ui/` (`mapScreen`, `equipmentScreen`, `pauseMenu`,
`accessibility`) is presentation that receives snapshots and returns
decisions through callbacks. `main.js` is the only place progression effects
reach gameplay (`applyProgressionEffects()` at boot, on purchase and on load).

Test hooks: `__MT_GEN__`, `__MT_MAP__`, `__MT_GEAR__`,
`__MT_PAUSE__`, `__MT_SAVE__`, `__MT_A11Y__`, `__MT_MINIMAP__` (plus
`duration` on `__MT_EXTRACT__`).

## 🎨 Visuals, audio & performance

This layer polishes what already works rather than replacing it: the same
city, now with weighted air, a mixed soundscape, and rendering
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
SwiftShader) drove four changes, all verifiable through the smoke suite:

- 🕐 **Shadow-map cadence** — the depth pass no longer re-renders every
  frame; `shadowMap.autoUpdate` is off and the map refreshes on a fixed
  schedule (Low 0 Hz · Medium 4 Hz · High 6 Hz). Measured: the depth pass
  costs about **+166 draw calls / +430k triangles** whenever it lands, so
  skipping most of them roughly halves the render cost on weak GPUs.
- 💡 **Distance-based light budget** — only the *nearest* N district/landmark
  accent lights are visible (N from the preset: Low 0 · Medium 8 · High 10),
  picked twice a second. This fixes an old quirk where the first districts
  by index kept their light no matter where you stood, and cuts per-fragment
  lighting cost.
- 🖥️ **Resize re-caps the device pixel ratio** (dragging to a HiDPI monitor
  no longer doubles fill-rate silently).
- 🪞 **Software-GL auto-degrade** — the boot path reads the unmasked renderer
  string once; SwiftShader / llvmpipe / Microsoft Basic Render (no usable
  GPU — this project's own probes measure it below one frame per second at
  Medium) starts on **Low at 50% internal resolution** instead of a
  slideshow. Explicit `?quality=` / `?rs=` pins still win, so tests and
  screenshots measure exactly what they ask for, and `stats.softwareGL`
  reports the probe (`{ detected, renderer, applied }`) so a degraded start
  is visible rather than silent. In-game, Settings → Graphics overrides it.

Measured preset scaling (same seed, same street view, peak per-frame cost
including the shadow pass, plus the sustained rate over three 15 s windows of
completed app frames):

| preset | render scale | draw calls | triangles | point lights | shadow Hz | motes | sustained FPS |
| ------ | ------------ | ---------- | --------- | ------------ | --------- | ----- | ------------- |
| low    | 0.75         | 446        | 623,434   | 0            | 0         | 0     | 0.66          |
| medium | 1.00         | 659        | 1,054,236 | 8            | 4         | 240   | 0.27          |
| high   | 1.00         | 649        | 1,069,342 | 10           | 6         | 460   | 0.26          |

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
| 100%         | 1.00×  | 0.27          | 3.70 s     |
| 75%          | 0.56×  | 0.46          | 2.17 s     |
| 50%          | 0.25×  | 0.93          | 1.08 s     |

**A quarter of the pixels buys ~3.5× the frame rate** (0.27 → 0.93). Fitting
`frame time = fixed + fill × pixels` leaves roughly **0.20 s of fixed cost
against ~3.5 s of fill at 100% — about 95% of every frame is per-pixel
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
  **0.33 → 1.07 fps at the same 0.75 scale** (measured then; today's heavier
  build re-measures Low at 0.66 fps — see the preset table above), with its
  synchronous render stage falling **136 ms → 4.8 ms**. The load-independent
  proof: Low went
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

**Characters.** Each bystander is **ten meshes** — thigh, shin, upper arm,
forearm, torso and head all move as separate pivots — so knees and elbows are
real joints the clip solver bends, not painted creases. Heads carry a
**procedural face atlas** (seeded eyes / brows / mouth per person, plus a
guard-visor variant) on a lighter face plate, and the coat/skin materials
share a **fabric normal map** (basket-weave relief) so light catches cloth
instead of sliding over flat colour. Roles keep distinct silhouettes: guards
are broad with shoulder pads and a helmet, vendors wear an apron and
bandanna, investigation targets carry a coat tail and satchel, station
attendants get a cap and reflective vest. Per-seed height, build, skin,
hair and palette keep a crowd from looking cloned.

**Animation — everyone moves differently.** `src/npc/npcAnim.js` is a clip
library of **27 procedural poses** (walk, guard march, brisk walk, carry,
run, a family of idles, arms-crossed, at-attention, lean, sit, talk, point,
wave, vendor-hail/wipe, guard-scan, clerk-gaze, warden-keys, device-check,
search-sweep, cautious-investigate, startle). `clipFor()` picks the right
one from an agent's **role + AI mode + awareness + seed**: guards march and
scan, vendors wipe the counter and call out, clerks gaze up at the skyline,
wardens jangle keys — and every figure's stride length, cadence and arm
swing come from its own **seeded gait style**, so no two walks match. Seeded
per-figure idle pools pick the pause beats too. The rig eases toward each
clip's targets, so mode/alert changes blend instead of snapping.

Riven Vale gained new states, all additive on top of locomotion so they can
never break the walk/run/jump poses: **crouch/sneak** (hold `Ctrl`), the
**extraction channel** pose (glove hand raised for the whole channel), a
one-shot **reach gesture** whenever you press `E`, a landing absorb, and
idle micro-life (slow weight shift plus an occasional glance down at the
glove).

**Interaction.** The prompt already said *what* was in reach; it now shows
*where*. A soft additive **focus ring** on the ground plus a floating marker
glide to whichever target owns the prompt (source, agent or
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
of six **idle beats** (glance at the glove, adjust the collar strap, an
over-the-shoulder check, a weight-stamp, a shoulder roll, a deep breath /
neck roll) on a 13.4 s cycle. `fireGesture()`
is a named table — `reach`, `point`, `brace`, `adjust`, `wave` — used by
interactions.

**A mini-map, not a map viewer.** `src/ui/miniMap.js` draws a 184 px radar in
the **top-right corner** at ~8 Hz from the *same* snapshot the full map uses:
the streets and blocks around you, district tints, the canal and its
bridges, landmark pins, held readings, and you as a
chevron with a facing cone. It deliberately does **not** show people —
guards stay off the radar, so stealth is still played by eye. It follows the
HUD (`H`), steps aside for any overlay, and `Tab` toggles it. The full city
map moved to `M` (and the journal to `J`), so nothing was lost — the map
screen is still there, it is just no longer the thing you press fifty times
an hour.

Three navigation conventions make it *work* rather than merely exist:

- **Speed-linked zoom** — the window opens from 120 m at a stroll to 150 m at
  a sprint, smoothed across redraws so it never pops (the travel zoom racing
  games use).
- **Edge arrows** — every landmark or held reading outside the window
  collapses into a small arrow clamped to the frame edge, pointing outward at
  it. Off-screen never means *gone*.
- **North-up with a called-out compass** — N is marked amber so the fixed
  orientation is a visible fact, and the radar stays aligned with the full
  city map. A live clock (`HH:MM · phase`, `· RAIN` when the schedule says
  so) sits under the district label.

**Honest cost.** Shells, road slabs and the base box add a few thousand
triangles to a ~0.8 M triangle city and zero draw calls (they join existing
buckets). The mini-map is a 2D canvas at 8 Hz — no WebGL work at all.

Test hooks: `__MT_MINIMAP__` (visibility, canvas size, live zoom window,
north-up flag, the world point the radar was last drawn at, district label,
pin counts, on-map/off-screen pin split, live speed) and `gait` on
`__MT_PLAYER__` (live knee / elbow / torso channels — proof the rig is
actually articulating).

## 🕛 Day/night & weather by the clock

`src/environment/dayNight.js` owns one authoritative game hour and every
system that follows it:

- **The clock.** Boots at **22:00** — the archive hour, the city's
  signature night (night palettes *are* the shipped `PALETTE` values, so a
  frozen clock renders exactly the look the game always had). A full day
  takes **12 real minutes** (30 s per game hour): smooth ~2.5 h shoulders at
  dawn and dusk, deliberately time-shaped rather than a raw sine so both
  last long enough to watch. The clock is presentation state — not saved.
- **Sky.** The dome repaints from a blended palette (night → overcast
  teal-grey day, warmed by a dawn/dusk amber bell), stars and moon fade with
  the night, a warm sun disc rides the day arc, and the PMREM environment
  map re-bakes on meaningful changes of light (throttled ≥20 s, skipped
  entirely on Low — the tier software-GL machines run).
- **Light.** Ambient/hemi/key colours and intensity follow the clock; the
  key light sits on the sun's arc by day and the moon's by night, dipping
  through twilight exactly where the direction changes hands; district and
  landmark lamps scale with darkness (×1 at night → ×0.18 at noon).
- **Weather by time.** A seeded per-day schedule (`createRng(seed·day)`)
  lays 1–3 rain fronts and a morning fog window on the timeline — the same
  city seed always gets the same weather, day 0 always opens on an evening
  rain front. Rain intensity, fog thickness (fog distance × the window) and
  wet streets (wet under ≥0.35 rain for 12 s, dry 60 s after it stops) all
  follow it. Explicit `?rain=1/0` pins always win, and a frozen clock holds
  weather exactly as it was.
- **UI.** A `HH:MM · phase` clock under the radar and on the welcome card;
  Settings → Graphics gains a live **Day/night cycle** toggle (freezing the
  clock freezes the weather with it).

URL pins for tests/screenshots: `?time=12.5` (start hour) and `?cycle=0`
(freeze — the smoke suite pins this, which is why every time-driven check is
exact). Test hooks: `__MT_TIME__` (set/read, `peek` for scans), `__MT_WEATHER__`
(pure schedule reads, seed-pinnable), `__MT_SKY__`, `__MT_LIGHT_TIME__`.

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
  normal, signage) and shared by every chunk that uses them. Facades are a
  4×4 module grid whose **bottom row is a street-level shopfront band** —
  display glazing, recessed doors with kick plates, lit interiors — because
  every facade box samples texture v = 0 at its base; the upper rows carry
  lintels, sills, blinds and weathering streaks per style.
- 🏙️ **Buildings** stack podium / shaft / crown tiers with a **cornice at
  every setback**, and the ground floor gets pilasters, a string course, one
  lit entrance (door, lintel, step, canopy, strip light) and projecting
  **blade signs**; roofs gain stair bulkheads and legged water tanks beside
  the existing machinery and masts. Every piece joins the existing
  per-chunk buckets, so the richer silhouette costs **zero extra draw
  calls**.
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
index.html            UI shell: loading screen, welcome title screen, HUD,
                      settings panel, prompts, memory journal, extraction ring,
                      reconstruction overlay
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
  environment/        sky + env map, lighting rig, rain, day/night clock
                      + seeded weather-by-the-hour schedule
  character/          Riven Vale model + procedural animator
  npc/                bystander figures (ten-mesh articulated rigs, procedural
                      face atlas + fabric normals), NPC agent (perception +
                      behaviour state machine)
  stealth/            stealth system (awareness states + reasons)
  player/             collision system, movement controller, third-person camera
  interaction/        interactable objects placed from the layout
  memories/           fragment catalogue, memory manager, reconstruction player
  audio/              procedural WebAudio cues (no sample files)
  ui/                 loading + welcome screens, HUD, settings panel,
                      prompt/read-out card, memory journal + extraction
                      channel, stealth HUD, city map,
                      corner mini-map
scripts/smoke.mjs     headless screenshot/error/welcome/gameplay/memory/city-life
                      smoke test (262 checks, exit code reflects failures)
scripts/probe.mjs     headless runtime probe (stats + lights, no screenshots)
scripts/probe-ui.mjs  focused UI probe (mini-map, map/journal keys, camera
                      ground clamp, articulated gait)
scripts/probe-geo.mjs focused geometry probe (how renderer.info counts
                      geometries; same-seed rebuild determinism)
scripts/probe-figures.mjs visual probe — per-role figure close-ups (body
                      poses, 1 m face shots via the 2.2 m boom clamp), NPC
                      memory archetype, city views
scripts/probe-buildings.mjs visual probe — every inspect fly-camera view plus
                      pavement-level close-ups aimed at real building lines
                      (reads `__MT_LAYOUT__` cells)
scripts/probe-daynight.mjs visual probe — welcome card over the live city, a
                      full day from overview + street level, rain-vs-clear
                      hours from the live schedule, mini-map idle/sprint zoom
```

## 🧪 Testing

One headless smoke suite (`scripts/smoke.mjs`, headless Edge + Puppeteer)
starts the dev server, plays the game and asserts **262 checks** in seven
groups — the exit code reflects failures, so it gates every change:

| 🔍 Group | Checks | What it proves |
| --- | --- | --- |
| 🛈 Welcome | 5 | the title screen greets you before play (with the live city clock), the movement gate holds behind it, BEGIN starts the walk, it never comes back |
| 🎮 Gameplay | 30 | walking, sprinting, jumping, collision (walls, barriers, camera boom), prompts, read-out cards |
| 🧠 Memory | 59 | extraction + cooldown/cancel paths, journal, contradictions, reconstruction playback/cancellation, the hidden door, replay gating, Resonance Sight |
| 🏙️ City life | 26 | population & archetypes, hide spots, restricted zones, patrol movement, SUSPICIOUS→DETECTED escalation with reasons, investigate→search→return cycle, cover breaking line of sight |
| 📈 Progression | 83 | city map & pins, mini-map + `Tab` toggle + off-screen edge arrows + north-up contract + sprint zoom, extraction noise, upgrade shop, pause/settings/save-load/new-game round-trips |
| ✅ Quality | 45 | low/medium/high presets, draw-call & GPU-resource leak budgets, same-seed rebuild determinism, volume buses, reduce-FX, fixed-lens camera, software-GL detection + auto-degrade |
| 🕛 Day/night | 14 | the clock boots frozen at 22:00 and holds, HUD clock text, dawn/noon/dusk/night sky + star/moon/sun response, lamps sleeping by day and waking at night, the schedule's rain/fog windows by hour, fog thickening the air live, weather seeded by the city |

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
node scripts/probe-ui.mjs            # mini-map, map/journal keys, camera clamp, gait
```

## ⚙️ Settings & URL overrides

- ▶️ **Live (no rebuild):** fog distance, rain, shadows, wet streets,
  day/night cycle (freezing the clock freezes the weather), quality
  preset, render scale, mouse sensitivity, camera distance, invert-Y,
  procedural sound cues.
- 🔁 **Rebuild:** seed, world scale (8 / 12 / 16 blocks), district density.
- ♿ **Accessibility** (own storage key, survives a new game): interface
  scale, reduce flicker & flash, high-contrast cards.

URL overrides are supported for testing and screenshots:

```
http://localhost:6030/?seed=eidolon-77&grid=12&quality=high&density=1.1&fog=800&rain=1&shadows=1&wet=1&sens=1.0&dist=4.6&invert=0&audio=1&time=18.5&cycle=0
```

- `?dev=1` starts in the inspection camera instead of play mode.
- `?time=18.5` starts the clock at 18:30; `?cycle=0` freezes it (weather
  holds too) — the smoke suite pins `?cycle=0`, so every time-driven check
  is exact.

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
clue.

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

Two of the six memories fix the same event at 23:40 and cannot both hold.
Once the journal holds both, it shows the discrepancy and lets you tag which
account you believe (`1` / `2`) — the glove keeps the fragment either way.

At the default (medium) preset and 12×12 grid the world is ~410 merged
meshes, ~5 000 instanced props and roughly 725 k generated triangles. In the
smoke suite's street test — twelve ten-mesh agents walking, rain and the
shadow pass on — the city renders in **372 draw calls against a budget of
800**; play mode culls the district around you while the overview camera
sees more of it, and a peak frame (the one that runs the shadow depth pass)
costs a little more. The memory layer adds the articulated ghost actors
(ten meshes per figure), one small annex and a handful of additive markers —
a few dozen extra draw calls, and only while they are on screen. Each agent
draws one call per articulated part with shared geometry and materials per
archetype; the figures' documented scale-up route is instancing if the
population grows.

## ⚠️ Known limitations

- 🚪 **No interiors** — the hidden service annex is the first enterable
  space; every other door is visual and buildings are solid blocks. (The
  interior shells mean a camera that clips inside a wall reads as a dark
  room rather than seeing through the city — a visual fix, not a room.)
- 🚶 **Crowd articulation ships** — bystanders now share the jointed rig
  (knees, elbows, face atlas) that Riven Vale pioneered; twelve agents stay
  one draw call per mesh, and the documented scale-up route beyond that is
  instancing, which the current population does not need.
- The city edge is sealed by an **invisible boundary wall** (the world just
  ends beyond the outer road); everything *inside* the city uses visible
  blockers.
- Collision volumes are simplified (boxes/circles per building, prop and
  parapet) — no per-stair-step or per-railing geometry.
- The inspection camera (`F5`) is still a development tool; it clips
  through geometry by design.
- Point lights are large district/landmark accents plus the glove light and
  the annex cache light, not per-street-lamp lights.
- Rain is a fixed volume around the camera; when the day/night schedule
  brings a front, its *intensity* follows the clock, but there is still no
  lightning and no wind variation (the rain volume's wind is constant).
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
  time-of-day behaviour and no dialogue — agents are non-interactive walkers
  by design.
- **Landmark figures still idle** — the four memory-source people and the
  fragment-less night clerk stand at their posts (they are extraction
  sources first, patrollers second).
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
  Menus, the journal and the map remain keyboard+mouse — a touch
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
