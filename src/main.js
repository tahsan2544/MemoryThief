import './styles.css';

import * as THREE from 'three';

import { DISTRICTS } from './config/districts.js';
import { PALETTE } from './config/palette.js';
import {
  DEFAULTS,
  applyQuality,
  applyUrlOverrides,
  derived,
  setQuality,
  settings,
} from './config/settings.js';
import { App } from './core/app.js';
import { FlyCamera } from './core/flyCamera.js';
import { Input } from './core/input.js';
import { createLighting } from './environment/lighting.js';
import { createSky } from './environment/sky.js';
import { createRain } from './environment/weather.js';
import { createMotes } from './environment/motes.js';
import { createContactShadows } from './environment/contactShadows.js';
import { createFocus } from './interaction/focus.js';
import { CancelledError, buildWorld } from './world/world.js';
import { createMaterials, setWet } from './world/materials.js';
import { createLayout } from './world/layout.js';
import { hideLoading, setProgress, showLoading, showLoadingError } from './ui/loading.js';
import { initPanel } from './ui/panel.js';
import { isHudVisible, setHudVisible, toast } from './ui/hud.js';
import { closeInspect, hidePrompt, isInspectOpen, openInspect, showPrompt } from './ui/prompt.js';
import { nearestInteractable } from './interaction/interactables.js';
import { PlayerController } from './player/controller.js';
import { ThirdPersonCamera } from './player/thirdPersonCamera.js';
import { FRAGMENTS, FRAGMENT_BY_ID, EXTRACTION_DURATION } from './memories/fragments.js';
import { MemoryManager } from './memories/memoryManager.js';
import { ReconstructionPlayer } from './memories/reconstruction.js';
import { nearestSource } from './world/memorySites.js';
import {
  closeJournal,
  initMemoryUI,
  isJournalOpen,
  isExtracting,
  journalHandleKey,
  journalSelection,
  journalTab,
  openJournal,
  renderJournal,
  setExtractProgress,
  setJournalTab,
  setSiteRange,
  startExtract,
  endExtract,
} from './ui/memoryUI.js';
import {
  audioState,
  footstepCount,
  getVolumes,
  isAmbienceRunning,
  isAudioEnabled,
  playCue,
  playFootstep,
  resetVolumes,
  setAmbienceActive,
  setAudioEnabled,
  setRainLevel,
  setVolumes,
  startAmbience,
  stopAmbience,
  unlockAudio,
} from './audio/memoryAudio.js';
import { lineFor } from './npc/dialogue.js';
import { StealthSystem } from './stealth/stealthSystem.js';
import { initStealthHud, setStealthHudVisible, updateStealthHud } from './ui/stealthHud.js';
import { StoryState } from './story/storyState.js';
import { EVIDENCE } from './story/missionDefs.js';
import { MissionManager } from './story/missionManager.js';
import { resolveTree, workboxNode } from './story/dialogueDefs.js';
import {
  choose as chooseDialogue,
  closeDialogue,
  dialogueSnapshot,
  handleKey as dialogueKey,
  initDialogue,
  isDialogueOpen,
  openDialogue,
} from './story/dialogueRunner.js';

/* Phase 6 — progression (gameplay data, no DOM) ------------------------- */
import { Progression } from './progression/upgrades.js';
import { Discovery, LANDMARK_NAMES } from './progression/discovery.js';
import { buildSnapshot, clearAllProgress, readSave, saveStatus, writeSave } from './progression/saveManager.js';

/* Phase 6 — interface screens (presentation only) ----------------------- */
import { initTracker, trackerSnapshot, updateTracker } from './ui/hudTracker.js';
import {
  closeMap,
  initMapScreen,
  isMapOpen,
  mapHandleKey,
  mapSnapshot,
  openMap,
  updateMap,
} from './ui/mapScreen.js';
import {
  initMiniMap,
  miniMapSnapshot,
  setMiniMapVisible,
  toggleMiniMap,
  updateMiniMap,
} from './ui/miniMap.js';
import {
  closeEquipment,
  equipmentHandleKey,
  equipmentSnapshot,
  initEquipmentScreen,
  isEquipmentOpen,
  openEquipment,
  renderEquipment,
} from './ui/equipmentScreen.js';
import {
  closePause,
  initPauseMenu,
  isPauseOpen,
  openPause,
  pauseHandleKey,
  pauseSnapshot,
  refreshPause,
} from './ui/pauseMenu.js';
import { a11yPrefs, initA11y, setA11y } from './ui/accessibility.js';
import { createTouchControls } from './ui/touchControls.js';

/* --------------------------------------------------------------------- *
 * Bootstrap
 * --------------------------------------------------------------------- */

applyUrlOverrides();
applyQuality();

const container = document.getElementById('app');
const app = new App(container, settings, derived).init();
const input = new Input(app.renderer.domElement);
const flyCamera = new FlyCamera(app.camera, input);
const materials = createMaterials();

const sky = createSky(app.renderer);
app.scene.add(sky.group);

const rain = createRain();
app.scene.add(rain.mesh);

/* Phase 7 — ambient particles + touch layer ----------------------------- */
const motes = createMotes();
app.scene.add(motes.points);
motes.setCount(derived.quality.moteCount ?? 0);

/* Phase 8 — interaction focus marker + contact shadows under characters --- */
const focus = createFocus(app.scene);
const contact = createContactShadows(app.scene);
contact.setEnabled(derived.quality.contactShadows ?? false);
const contactBuf = []; // reused each frame to avoid per-frame allocation

const touch = createTouchControls({
  input,
  canvas: app.renderer.domElement,
});
touch.setGestureHook(() => unlockAudio()); // any touch is a user gesture

let world = null;
let layout = null;
let lighting = null;
let generationToken = 0;
let hudVisible = true;
// Tab toggles this; the frame loop ANDs it with "HUD on + no overlay", so a
// hidden mini-map stays hidden and an overlaid one comes back by itself.
let miniMapWanted = true;

/* --------------------------------------------------------------------- *
 * Game mode: 'play' (default, Riven Vale) | 'inspect' (Phase 1 fly camera)
 * --------------------------------------------------------------------- */

let mode = settings.startInInspect ? 'inspect' : 'play';
let player = null;
let spawnDistrict = 'oldquarter';
let nearInteractable = null;
let lastSpawn = null;

const $ = (id) => document.getElementById(id);
const hudMode = $('hud-mode');
const controlsPlay = $('controls-play');
const controlsInspect = $('controls-inspect');
const crosshairEl = $('crosshair');

const camRig = new ThirdPersonCamera(app.camera, input, () => world?.colliders ?? null, settings);

/* --------------------------------------------------------------------- *
 * Memory system (Phase 3)
 * --------------------------------------------------------------------- */

const memories = new MemoryManager();
const recon = new ReconstructionPlayer({ scene: app.scene, getLighting: () => lighting });
let RECON_RANGE = 14; // metres from a recording site where replay is allowed
// ↑ becomes 21 with the KEEN LENS upgrade (applyProgressionEffects)

/* Phase 6 — progression: glove upgrades + the charted city --------------- */
const progression = new Progression();
const discovery = new Discovery();
let channelScale = 1; // × EXTRACTION_DURATION (SWIFT CHANNEL)
let noiseScale = 1; // × extraction disturbance radius (MUFFLED CHANNEL)
let worldGenerations = 0; // successful builds — menus must never bump this
let programmaticUnlock = false; // we asked for the pointer release (not Esc)

let nearSourceRec = null;
let extracting = null; // { source, fragment, startedAt } while the glove reads
let elapsed = 0; // gameplay clock for NPC/marker animation

/* Phase 4 — living city + stealth read-out */
const stealth = new StealthSystem();
let nearAgent = null; // the Phase 4 agent under the prompt, if any
let lastZoneId = ''; // to fire the "you step into …" beat once per entry

/* Phase 5 — story: the Venn case ----------------------------------------- *
 * StoryState owns flags/evidence (persisted), MissionManager derives the
 * objective list from them, dialogueDefs turns the same state into lines.
 * Both are rebuilt nowhere: they outlive world rebuilds like memories do.
 * ---------------------------------------------------------------------- */
const story = new StoryState();
const missions = new MissionManager({
  state: story,
  memories,
  onEvent: (ev) => {
    if (ev.type === 'objectives') {
      for (const o of ev.list) toast(`Objective complete — ${o.text}`, 3000);
    } else if (ev.type === 'mission-complete') {
      playCue('deduce');
      toast(`${ev.mission.title} — complete`, 4200);
    }
  },
});

let nearStoryRec = null; // the story character under the prompt, if any

story.on('change', (ev) => {
  if (ev.kind === 'evidence' && ev.entry) toast(`Filed — ${ev.entry.title}`, 2600);
  syncStory();
});

/**
 * Re-derive everything derived: mission view, world markers, the cage's
 * presence in the interactable list, journal if it is open. Cheap (a handful
 * of flag checks), so it runs on every story change.
 */
function syncStory() {
  missions.refresh();
  world?.storyCast?.setMarkers(missions.markerTargets(world));
  syncCageWorld();
  updateTracker(missions.view()); // HUD objective read-out (Phase 6)
  if (isJournalOpen() && mode === 'play') renderJournal(memories, {});
}

/**
 * The case's locked location exists in the world only when it can honestly
 * be interacted with: the gate obeys mission state (a rebuild must not
 * re-lock what the key already opened), and its record never prompts through
 * a still-barred annex door.
 */
function syncCageWorld() {
  const cage = world?.memorySites?.cage;
  if (!cage || !world) return;
  const opened = story.has('cage-open');
  if (opened && !cage.isOpen()) cage.open({ instant: true });
  const doorOpen = !!world.memorySites.secretState?.()?.open;
  const want = opened ? cage.workBox : story.has('met-tomas') && doorOpen ? cage.interact : null;
  const list = world.interactables;
  for (const rec of [cage.interact, cage.workBox]) {
    const should = rec === want;
    const inList = list.includes(rec);
    if (should && !inList) list.push(rec);
    else if (!should && inList) list.splice(list.indexOf(rec), 1);
  }
}

/** The predicate world dialogue conditions read (same as the journal's). */
function storyCtx() {
  return missions.context();
}

setAudioEnabled(settings.audio);

initMemoryUI({
  getStory: () => missions.view(),
  onActivate: (id) => activateReconstruction(id),
  onDeduce: (pairId, believedId) => {
    const res = memories.setDeduction(pairId, believedId);
    if (res.ok) {
      playCue('deduce');
      toast('Deduction recorded — the glove keeps the evidence', 2400);
      renderJournal(memories, {});
    } else {
      toast('That record cannot be weighed yet', 1800);
    }
  },
});

initStealthHud();

/* Phase 5 — the choice card; effects funnel back into StoryState only. */
initDialogue({
  onEffect: (fx) => {
    if (fx?.t === 'flag') story.setFlag(fx.id);
    else if (fx?.t === 'evidence') story.addEvidence(EVIDENCE[fx.id]);
  },
  onClose: () => syncLock(),
});

/* --------------------------------------------------------------------- *
 * Phase 6 — interface screens + progression wiring
 *
 * All gameplay effects flow through applyProgressionEffects(): the UI
 * modules render progression data and send purchases back through
 * callbacks — they never touch player, world or city systems themselves.
 * --------------------------------------------------------------------- */

initA11y(); // read + apply scale / flicker / contrast preferences
initTracker();

/* Phase 7 — accessibility "reduce visual effects" gates the new FX. The
 * event keeps UI modules decoupled from gameplay systems. */
function applyFxPrefs(prefs) {
  motes.setReduced(!!prefs.reduceFx);
}
applyFxPrefs(a11yPrefs());
document.addEventListener('mt:a11y', (e) => applyFxPrefs(e.detail ?? {}));

initMapScreen({
  data: () => mapData(),
  onClose: () => syncLock(),
});

// the live mini-map reads the same snapshot as the full map, at ~8 Hz
initMiniMap({
  data: () => mapData(),
  districtAt: (x, z) => layout?.districtAt(x, z) ?? null,
});

initEquipmentScreen({
  data: () => gearData(),
  onBuy: (id) => {
    const res = progression.buy(id, motesCtx());
    if (res.ok) {
      playCue('deduce');
      toast(`${UPGRADE_NAME(id)} installed — the glove reads the change`, 3000);
      applyProgressionEffects();
      renderEquipment();
    } else if (res.reason === 'motes') {
      toast('Not enough resonance motes', 2200);
    }
  },
  onClose: () => syncLock(),
});

initPauseMenu({
  status: () => saveStatus(),
  onResume: () => {
    closePause();
    syncLock();
  },
  onSave: () => doSaveGame(),
  onLoad: () => doLoadGame(),
  onSettings: () => {
    closePause();
    panel.open();
    syncLock();
  },
  onNewGame: () => doNewGame(),
  onClose: () => syncLock(),
});

applyProgressionEffects(); // upgrades loaded from storage apply immediately
updateTracker(missions.view());

// The reconstruction reports its own lifecycle; consequences fire here so the
// manager stays the single owner of story state.
recon.onEvent = ({ type, fragment, completed, revealed }) => {
  if (type === 'reveal') {
    // the recorded event itself, not a generic line — this is the clue
    const text = fragment?.reconstruction?.reveal ?? 'The reconstruction shows its clue…';
    toast(text.length > 170 ? `${text.slice(0, 167)}…` : text, 6500);
    return;
  }
  if (type !== 'end') return;
  if (completed && revealed && fragment && memories.markReconstructed(fragment.id)) {
    applyConsequences(fragment);
    toast('The reconstruction settles — something has changed', 3400);
    syncStory();
  } else if (!completed) {
    toast('Reconstruction ended', 1400);
  }
};

/** Apply a fragment's world consequences (idempotent; silent on world load). */
function applyConsequences(fragment, { silent = false } = {}) {
  for (const c of fragment.consequences ?? []) {
    if (c.kind === 'door') {
      const opened = world?.memorySites?.revealDoor({ instant: silent });
      const cache = world?.memorySites?.cache;
      if (opened && cache && !world.interactables.includes(cache)) {
        cache.gated = false;
        world.interactables.push(cache); // the coffer becomes readable
      }
      if (opened && !silent) toast('Somewhere on the Floodworks canal walk, a door unbars', 3600);
    } else if (c.kind === 'clue') {
      world?.memorySites?.revealClue(c.target);
      if (!silent) toast('A clue marker now burns where you should look', 2800);
    } else if (c.kind === 'ability') {
      if (memories.unlockAbility(c.target) && !silent) {
        toast('Resonance Sight unlocked — press V', 3600);
      }
    }
    // dialogue consequences are checked live when talking to their NPC
  }
}

/* ------------------------------ extraction ------------------------------ */

const GLOVE_BASE_TINT = 0x9a7bff;

/** The glove takes the fragment's signature colour while the channel runs. */
function setGloveTint(hex) {
  const light = player?.rig?.parts?.gloveLight;
  if (light) light.color.setHex(hex ?? GLOVE_BASE_TINT);
}

/** Hide the channel HUD and hand the glove its resting colour back. */
function endExtractionHud() {
  endExtract();
  setGloveTint(null);
}

function startExtraction(source) {
  const fragment = source.fragmentId ? FRAGMENT_BY_ID[source.fragmentId] : null;
  if (!fragment) return false;
  if (memories.has(fragment.id)) return false;
  const cd = memories.gloveCooldown();
  if (cd > 0) {
    playCue('extract-fail');
    toast(`Glove recharging — ${cd.toFixed(1)}s`, 1600);
    return false;
  }
  extracting = { source, fragment, startedAt: performance.now() };
  startExtract(source.name, fragment.effect); // fragment's visual signature
  setGloveTint(fragment.tint);
  playCue('extract-charge');
  // the glove's light is not subtle: anyone with a line of sight can see a
  // reading start (cover silences it entirely — that is the positioning play)
  world?.cityLife?.emitFrom('extraction', player?.position.x ?? 0, player?.position.z ?? 0, { noiseScale });
  return true;
}

function cancelExtraction(message = 'Extraction interrupted') {
  if (!extracting) return false;
  extracting = null;
  endExtractionHud();
  playCue('extract-fail');
  toast(message, 1800);
  return true;
}

const EXTRACT_CANCEL_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'];

/** Drive the channel: movement cancels, wall clock completes. */
function tickExtraction() {
  if (!extracting) return;
  const moved = EXTRACT_CANCEL_KEYS.some((k) => input.isDown(k));
  if (moved) {
    cancelExtraction();
    return;
  }
  const t = (performance.now() - extracting.startedAt) / 1000 / (EXTRACTION_DURATION * channelScale);
  if (t < 1) {
    setExtractProgress(t);
    return;
  }
  const { fragment } = extracting;
  extracting = null;
  endExtractionHud();
  const res = memories.collect(fragment.id);
  if (res.ok) {
    playCue('extract-done');
    toast(`Memory recovered — ${fragment.title}`, 3200);
    openJournal(memories, { selectId: fragment.id });
    syncLock();
    syncStory(); // objectives can depend on which memories are held
  } else if (res.reason === 'already-held') {
    toast('That memory is already recorded', 1800);
  } else {
    playCue('extract-fail');
    toast('The glove could not hold the reading', 1800);
  }
}

/* --------------------------- reconstruction ----------------------------- */

function activateReconstruction(fragmentId) {
  const fragment = FRAGMENT_BY_ID[fragmentId];
  if (!fragment) return false;
  if (!memories.has(fragmentId)) {
    toast('That fragment is not recorded', 1800);
    return false;
  }
  if (mode !== 'play' || !player) {
    toast('Reconstructions need Riven on the ground', 2000);
    return false;
  }
  const site = world?.memorySites?.sourceByFragment(fragmentId);
  if (!site) {
    toast('No recording site in this city', 2000);
    return false;
  }
  const p = player.position;
  if (Math.hypot(p.x - site.x, p.z - site.z) > RECON_RANGE) {
    toast(`Too far from ${site.name} — walk back to the recording site`, 2800);
    return false;
  }
  closeJournal();
  syncLock();
  const ok = recon.start(fragment, { x: site.x, y: site.y, z: site.z });
  if (ok) toast(`Reconstructing — ${fragment.title}`, 2400);
  else toast('Another reconstruction is running', 1800);
  return ok;
}

/* -------------------------------- ability -------------------------------- */

function toggleAbility() {
  const st = memories.toggleAbility();
  if (!st.ok) {
    playCue('extract-fail');
    if (st.reason === 'locked') {
      toast('Resonance Sight is locked — recover the Underarchive memory', 2800);
    } else {
      toast(`Resonance recharging — ${st.remaining.toFixed(0)}s`, 1800);
    }
    return false;
  }
  const on = !st.ended;
  world?.memorySites?.setEchoes(on);
  if (st.started) {
    // resonance flares through the walls — guards nearby can see the glow
    world?.cityLife?.emitFrom('resonance', player?.position.x ?? 0, player?.position.z ?? 0);
  }
  playCue(on ? 'ability-on' : 'ability-off');
  toast(on ? 'Resonance Sight — echoes burn through the walls' : 'Resonance Sight off', 2200);
  return true;
}

/* -------------------------------- talking -------------------------------- */

/** NPC read-outs: a fragment's dialogue line unlocks once it is replayed. */
function talkToNpc(src) {
  const held = src.fragmentId ? FRAGMENT_BY_ID[src.fragmentId] : null;
  const unlocking = FRAGMENTS.find((f) =>
    (f.consequences ?? []).some((c) => c.kind === 'dialogue' && c.target === src.id),
  );
  const con = unlocking?.consequences.find((c) => c.kind === 'dialogue' && c.target === src.id);
  const unlocked = !!(unlocking && memories.has(unlocking.id) && memories.isReconstructed(unlocking.id));

  let body;
  if (unlocked && con?.line) {
    body = con.line;
  } else if (held && memories.has(held.id) && !memories.isReconstructed(held.id)) {
    body =
      `${src.name} watches the glove on your hand. "Finish the reading first," ` +
      `they say. "Then ask me what you think you saw."`;
  } else if (unlocking) {
    body =
      `${src.name} has nothing for you yet — not until you have recovered and ` +
      `replayed a memory that concerns them.`;
  } else {
    body = `${src.name} has nothing to say that a glove could not take.`;
  }

  // Phase 5: while a case is open this NPC may answer with the mission's
  // tree (the legacy line rides along as its body). Before the commission
  // — and for any NPC the case does not concern — nothing changes.
  if (talkWith({ kind: 'source', id: src.id, name: src.name, legacy: body })) return true;

  return openInspect({
    id: `talk-${src.id}`,
    kind: 'echo',
    title: `${src.name.toUpperCase()} — SPEAKING`,
    body,
  });
}

/** E on a Phase 4 agent: lines react to suspicion and to recorded memories. */
function talkToAgent(agent) {
  const { title, body } = lineFor(agent, memories, { aware: agent.awareness >= 0.7 });
  if (talkWith({ kind: 'agent', id: agent.id, name: agent.name, type: agent.type, legacy: body })) {
    return true;
  }
  return openInspect({ id: `talk-${agent.id}`, kind: 'echo', title, body });
}

function applyModeUi() {
  const play = mode === 'play';
  if (hudMode) hudMode.textContent = play ? 'RIVEN VALE' : 'INSPECTION CAMERA';
  controlsPlay?.classList.toggle('hidden', !play);
  controlsInspect?.classList.toggle('hidden', play);
  crosshairEl?.classList.toggle('hidden', !play);
  setStealthHudVisible(play);
}

function setMode(next) {
  if (next !== 'play' && next !== 'inspect') return mode;
  if (next === mode) return mode;
  mode = next;
  applyModeUi();

  if (mode === 'play') {
    if (player) {
      player.active = true;
      camRig.setYaw(player.facing + Math.PI);
      camRig.snapPivot(player.position.x, player.position.y, player.position.z);
      camRig.reset();
    }
    toast('Riven Vale — click to capture the mouse', 2400);
  } else {
    // hand the fly camera the current view so nothing jumps
    const dir = new THREE.Vector3();
    app.camera.getWorldDirection(dir);
    const p = app.camera.position;
    flyCamera.setPose(p.toArray(), [p.x + dir.x * 60, p.y + dir.y * 60, p.z + dir.z * 60]);
    // the lens is fixed at 58° — keep it that way through the hand-off
    app.camera.fov = 58;
    app.camera.updateProjectionMatrix();
    toast('Inspection camera — F5 to return to Riven Vale', 2400);
  }
  return mode;
}

/* --------------------------------------------------------------------- *
 * Viewpoints (inspect-mode keys 1–5 + overview + street)
 * --------------------------------------------------------------------- */

/**
 * Street-level viewpoint. It must sit *on* a road corridor: road centrelines
 * run along x = origin + ix·cell, so pick one and stand in the middle of it.
 */
function streetView(l) {
  const ix = Math.max(1, Math.min(l.grid - 1, Math.floor(l.grid * 0.28)));
  const x = l.origin + ix * l.cell;
  const z = l.origin + l.cell * (Math.floor(l.grid * 0.42) + 0.5);
  return { pos: [x, l.curb + 2.1, z], look: [x, l.curb + 4.4, z + 150] };
}

function viewpointsFor(l) {
  const map = {};
  map.overview = l.overview;
  for (const vp of l.viewpoints) map[vp.type] = vp;
  map.street = streetView(l);
  return map;
}

let VIEWPOINTS = {};

const VIEW_ORDER = ['tower', 'market', 'station', 'garden', 'archive'];

function applyView(name) {
  const vp = VIEWPOINTS[name];
  if (!vp) return false;
  flyCamera.setPose(vp.pos, vp.look);
  flyCamera.setHome(VIEWPOINTS.overview.pos, VIEWPOINTS.overview.look);
  return true;
}

/* --------------------------------------------------------------------- *
 * Player spawn points
 * --------------------------------------------------------------------- */

/**
 * Stand Riven Vale on the road beside the district's core block (its landmark
 * when it has one). Road centrelines sit at origin + ix·cell, and a z offset
 * of half a cell keeps the spawn clear of every intersection and of the canal.
 */
function spawnFor(l, districtId) {
  const info =
    l.districtInfo?.[districtId] ??
    l.districtInfo?.oldquarter ??
    Object.values(l.districtInfo ?? {})[0];
  if (!info) return { x: 0, z: 0, yaw: Math.PI / 2, district: districtId };

  const ix = Math.round(info.coreIx);
  const iz = Math.round(info.coreIz);
  const x = l.origin + ix * l.cell;
  const z = l.origin + (iz + 0.5) * l.cell;
  // face the core block (always +x from this road line)
  return { x, z, yaw: Math.PI / 2, district: info.id };
}

function respawnPlayer({ silent = false } = {}) {
  if (!player || !layout) return null;
  const sp = spawnFor(layout, spawnDistrict);
  player.spawn(sp.x, sp.z, sp.yaw);
  lastSpawn = sp;
  if (!silent) toast(`Riven Vale — ${DISTRICTS[sp.district]?.name ?? 'Eidolon City'}`, 1800);
  return sp;
}

/* --------------------------------------------------------------------- *
 * World generation
 * --------------------------------------------------------------------- */

async function generate({ quiet = false } = {}) {
  const token = ++generationToken;
  const isCancelled = () => token !== generationToken;

  showLoading();

  // stop any running memory playback *before* the world it is anchored to
  // disappears, so its fog/light capture restores the rig that captured it
  extracting = null;
  endExtractionHud();
  if (recon.isActive()) recon.end('cancelled');

  // the living city is world state: a fresh world starts from a clean slate
  stealth.reset();
  nearAgent = null;
  nearStoryRec = null;
  lastZoneId = '';

  // tear down the previous world (materials/textures are cached and reused)
  if (world) {
    app.scene.remove(world.root);
    world.dispose();
    world = null;
  }
  if (lighting) {
    lighting.dispose();
    lighting = null;
  }

  try {
    layout = createLayout({ seed: settings.seed, grid: settings.grid });

    lighting = createLighting(app.scene, layout, settings, derived.quality);
    app.applyEnvironment({ sky, lighting, weather: rain });
    lighting.update(app.camera.position, 1); // force an immediate light pick

    const built = await buildWorld({
      layout,
      settings,
      materials,
      quality: derived.quality,
      onProgress: (pct, label, detail) => setProgress(pct, label, detail),
      shouldCancel: isCancelled,
    });

    if (isCancelled()) {
      built.dispose();
      return false;
    }

    world = built;
    worldGenerations++; // successful builds only (menus must never bump this)
    app.scene.add(world.root);
    app.setWorld(world);
    VIEWPOINTS = viewpointsFor(layout);

    setWet(materials, settings.wet);
    rain.setEnabled(settings.rain && derived.quality.rain);

    // ---- place the character ------------------------------------------
    if (!player) {
      player = new PlayerController({
        input,
        getColliders: () => world?.colliders ?? null,
        cameraRig: camRig,
        settings,
      });
      // Phase 7 — footstep/landing audio driven by the stride animator
      player.onStep = (isRun) => playFootstep(isRun);
      player.onLand = () => playCue('land');
      app.scene.add(player.rig.group);
    }
    const sp = spawnFor(layout, spawnDistrict);
    player.spawn(sp.x, sp.z, sp.yaw);
    player.active = mode === 'play';
    lastSpawn = sp;

    // ---- re-apply memory progress to the fresh world --------------------
    for (const f of memories.list()) {
      if (memories.isReconstructed(f.id)) applyConsequences(f, { silent: true });
    }

    // ---- re-apply the case to the fresh world ---------------------------
    syncStory();
    announceIntro();

    if (mode === 'play') {
      applyModeUi();
    } else {
      applyView('overview');
    }

    if (!quiet) {
      toast(
        `Seed "${settings.seed}" · ${world.stats.cells} blocks · ` +
          `${world.stats.landmarks} landmarks · ${world.stats.triangles.toLocaleString()} tris`,
        4200,
      );
    }
    return true;
  } catch (err) {
    if (err instanceof CancelledError) return false;
    console.error('[world] generation failed:', err);
    showLoadingError(err?.message ?? String(err));
    throw err;
  }
}

/* --------------------------------------------------------------------- *
 * Input handling
 * --------------------------------------------------------------------- */

input.onLockChange = (locked) => {
  if (locked) {
    toast('Pointer captured — Esc to release', 1600);
    return;
  }
  // the player released the pointer by hand (Esc in play mode) → pause menu.
  // A DOM surface asking for the release sets a flag first, so opening the
  // journal/map/etc. can never double as "pause".
  if (programmaticUnlock) {
    programmaticUnlock = false;
    return;
  }
  if (mode === 'play' && !anyOverlayOpen()) {
    openPause();
  }
};

/** True while any DOM surface owns the screen (Phase 1–6 overlays). */
function anyOverlayOpen() {
  return (
    panel.isOpen() ||
    isInspectOpen() ||
    isJournalOpen() ||
    isDialogueOpen() ||
    recon.isActive() ||
    !!extracting ||
    isMapOpen() ||
    isEquipmentOpen() ||
    isPauseOpen()
  );
}

function syncLock() {
  // release the mouse whenever a DOM surface needs it
  if (!anyOverlayOpen()) return;
  if (input.locked) programmaticUnlock = true; // this unlock is ours, not Esc's
  input.exitLock();
}

app.renderer.domElement.addEventListener('click', () => {
  if (anyOverlayOpen()) return;
  if (unlockAudio()) startAmbience(); // browsers need a gesture before any cue can sound
  if (!input.locked) input.requestLock();
});

const panel = initPanel({
  onFog: (far) => app.setFog(far),
  onRain: (on) => rain.setEnabled(on && derived.quality.rain),
  onShadows: (on) => {
    app.renderer.shadowMap.enabled = on && derived.quality.shadows;
    app.renderer.shadowMap.needsUpdate = true;
    lighting?.setShadowEnabled(on && derived.quality.shadows);
  },
  onWet: (on) => setWet(materials, on),
  onAudio: (on) => setAudioEnabled(on),
  onQuality: (id, preset) => {
    app.applyRendererQuality();
    motes.setCount(preset.moteCount ?? 0);
    motes.setReduced(!!a11yPrefs().reduceFx);
    toast(`Quality: ${preset.label}`, 1600);
  },
  // render scale only resizes the drawing buffer — no geometry, no materials
  onRenderScale: () => app.resize(),
  onRebuild: () => {
    generate({ quiet: false });
  },
});

function handlePressed(codes) {
  for (const code of codes) {
    if (code === 'KeyP') {
      // pause menu (Settings lives inside it); P still closes a panel that
      // is already open — it was that toggle before Phase 6, and it stays one
      if (panel.isOpen()) {
        panel.toggle();
        syncLock();
      } else if (
        mode === 'play' &&
        !recon.isActive() &&
        !isExtracting() &&
        !isDialogueOpen() &&
        !isJournalOpen()
      ) {
        if (isPauseOpen()) closePause();
        else openPause();
        playCue('ui');
        syncLock();
      }
    } else if (code === 'KeyH') {
      hudVisible = !isHudVisible();
      setHudVisible(hudVisible);
    } else if (code === 'KeyN') {
      settings.seed = `eidolon-${Math.floor(Math.random() * 9000 + 1000)}`;
      panel.syncFromSettings();
      toast(`New seed: ${settings.seed}`, 2000);
      generate();
    } else if (code === 'F5') {
      setMode(mode === 'play' ? 'inspect' : 'play');
    } else if (code === 'KeyR') {
      if (mode === 'play') respawnPlayer();
      else {
        flyCamera.reset();
        toast('Camera reset', 1400);
      }
    } else if (code === 'KeyJ') {
      // journal (play mode only, never over another overlay) — M is the map
      if (
        mode === 'play' &&
        !panel.isOpen() &&
        !recon.isActive() &&
        !isExtracting() &&
        !isDialogueOpen()
      ) {
        if (isJournalOpen()) {
          closeJournal();
          syncLock();
        } else {
          openJournal(memories, {});
          playCue('ui');
          syncLock();
        }
      }
    } else if (code === 'KeyC') {
      // case file: C opens the journal straight onto it (or flips tabs once open)
      if (
        mode === 'play' &&
        !panel.isOpen() &&
        !recon.isActive() &&
        !isExtracting() &&
        !isDialogueOpen()
      ) {
        if (isJournalOpen()) {
          setJournalTab(journalTab() === 'case' ? 'fragments' : 'case');
        } else {
          setJournalTab('case');
          openJournal(memories, {});
          syncLock();
        }
      }
    } else if (code === 'KeyV') {
      if (
        mode === 'play' &&
        !panel.isOpen() &&
        !isJournalOpen() &&
        !recon.isActive() &&
        !isExtracting() &&
        !isDialogueOpen()
      ) {
        toggleAbility();
      }
    } else if (code === 'KeyM') {
      // city map (was Tab): toggle, play mode, never over another surface
      if (
        mode === 'play' &&
        !panel.isOpen() &&
        !isJournalOpen() &&
        !recon.isActive() &&
        !isExtracting() &&
        !isDialogueOpen()
      ) {
        if (isMapOpen()) closeMap();
        else {
          openMap();
          playCue('ui');
        }
        syncLock();
      }
    } else if (code === 'Tab') {
      // mini-map: toggle the corner radar (play mode only, never over a panel)
      if (
        mode === 'play' &&
        !panel.isOpen() &&
        !recon.isActive() &&
        !isExtracting() &&
        !isDialogueOpen()
      ) {
        miniMapWanted = toggleMiniMap();
        playCue('ui');
      }
    } else if (code === 'KeyI') {
      // equipment & inventory
      if (
        mode === 'play' &&
        !panel.isOpen() &&
        !isJournalOpen() &&
        !recon.isActive() &&
        !isExtracting() &&
        !isDialogueOpen()
      ) {
        if (isEquipmentOpen()) closeEquipment();
        else {
          openEquipment();
          playCue('ui');
        }
        syncLock();
      }
    } else if (code === 'Escape') {
      // in clean play, Esc opens the pause menu (it also releases the mouse)
      if (
        mode === 'play' &&
        !panel.isOpen() &&
        !isJournalOpen() &&
        !recon.isActive() &&
        !isExtracting() &&
        !isDialogueOpen() &&
        !isInspectOpen() &&
        !isMapOpen() &&
        !isEquipmentOpen()
      ) {
        openPause();
      }
    } else if (mode === 'inspect') {
      // fly-camera viewpoint keys only exist in inspection mode
      if (code === 'Digit1') applyView(VIEW_ORDER[0]);
      else if (code === 'Digit2') applyView(VIEW_ORDER[1]);
      else if (code === 'Digit3') applyView(VIEW_ORDER[2]);
      else if (code === 'Digit4') applyView(VIEW_ORDER[3]);
      else if (code === 'Digit5') applyView(VIEW_ORDER[4]);
      else if (code === 'Digit0') applyView('overview');
      else if (code === 'Digit6') applyView('street');
    }
  }
}

/* --------------------------------------------------------------------- *
 * Interaction (play mode only)
 * --------------------------------------------------------------------- */

/**
 * Phase 8: hand the contact-shadow system every visible character so each one
 * gets a soft grounded blob. A single instanced draw call covers the cast.
 */
function syncContactShadows() {
  const e = contactBuf;
  e.length = 0;
  if (player) e.push({ x: player.position.x, y: player.renderY, z: player.position.z, r: 0.6 });
  const agents = world?.cityLife?.agents;
  if (agents) for (const a of agents) e.push({ x: a.x, y: a.y, z: a.z, r: 0.5 });
  const cast = world?.storyCast?.targets;
  if (cast) for (const t of cast) e.push({ x: t.x, y: t.y ?? 0, z: t.z, r: 0.5 });
  const sites = world?.memorySites?.sources;
  if (sites) for (const s of sites) if (s.kind === 'npc') e.push({ x: s.x, y: s.y ?? 0, z: s.z, r: 0.5 });
  contact.update(e);
}

function updateInteractions(pressed) {
  const sites = world?.memorySites;
  if (
    !world ||
    !player ||
    isInspectOpen() ||
    isJournalOpen() ||
    isDialogueOpen() ||
    recon.isActive() ||
    extracting
  ) {
    nearSourceRec = null;
    nearInteractable = null;
    nearAgent = null;
    nearStoryRec = null;
    hidePrompt();
    focus.set(null);
    return;
  }
  const p = player.position;

  // memory sources (people and marked objects) take the prompt first — but a
  // fragment already in the journal falls back to the object's own read-out,
  // so nothing Phase 2 built ever becomes unreachable
  nearSourceRec = sites ? nearestSource(sites.sources, p.x, p.y, p.z) : null;
  nearInteractable = null;
  nearAgent = null;
  nearStoryRec = null;

  const src = nearSourceRec;
  let srcPrompt = null;
  if (src) {
    const held = src.fragmentId ? memories.has(src.fragmentId) : false;
    const cd = memories.gloveCooldown();
    if (!src.fragmentId) {
      srcPrompt = `Talk to the ${src.name.toLowerCase()}`; // dialogue-only NPC
    } else if (!held) {
      srcPrompt =
        cd > 0 ? `Glove recharging (${cd.toFixed(1)}s) — ${src.name}` : `Extract memory — ${src.name}`;
    } else if (src.kind === 'npc') {
      srcPrompt = `Talk to the ${src.name.toLowerCase()}`;
    }
    // held *object* source: no source prompt — falls through to its signage
  }

  // a story character (Phase 5) claims the prompt before the crowd does —
  // but never while a memory source is within reach (extraction is the loop)
  if (!srcPrompt && world.storyCast) {
    nearStoryRec = nearestSource(world.storyCast.targets, p.x, p.y, p.z);
  }
  const storyPrompt = nearStoryRec ? `Talk to ${nearStoryRec.name}` : null;

  // a living-city agent is the next claimant on the prompt: a conversation
  // beats reading a sign, but only inside arm's length (2.6 m)
  if (!srcPrompt && !storyPrompt && world.cityLife) {
    nearAgent = world.cityLife.nearestAgent(p.x, p.z, 2.6);
  }
  const agentPrompt = nearAgent ? `Talk to the ${nearAgent.name.toLowerCase()}` : null;

  if (srcPrompt) {
    showPrompt(srcPrompt);
  } else if (storyPrompt) {
    showPrompt(storyPrompt);
  } else if (agentPrompt) {
    showPrompt(agentPrompt);
  } else {
    const list = world.interactables;
    nearInteractable = nearestInteractable(list, p.x, p.y, p.z);
    if (nearInteractable) {
      const hint = src && src.fragmentId && memories.has(src.fragmentId) ? ' · M: memory' : '';
      showPrompt(nearInteractable.label + hint);
    } else hidePrompt();
  }

  // Phase 8: surface whichever target owns the prompt out in the world, so the
  // choice is visible as well as readable. Presentational only.
  focus.set(
    (srcPrompt && nearSourceRec && { x: nearSourceRec.x, y: nearSourceRec.y ?? 0, z: nearSourceRec.z }) ||
      (storyPrompt && nearStoryRec && { x: nearStoryRec.x, y: nearStoryRec.y ?? 0, z: nearStoryRec.z }) ||
      (agentPrompt && nearAgent && { x: nearAgent.x, y: nearAgent.y, z: nearAgent.z }) ||
      (nearInteractable && { x: nearInteractable.x, y: nearInteractable.y ?? 0, z: nearInteractable.z }) ||
      null,
  );

  if (pressed.includes('KeyE')) handleInteract();
}

/** Open a Phase 5 dialogue node (returns false when the character is silent). */
function talkWith(who) {
  const node = resolveTree(who, storyCtx());
  if (!node) return false;
  openDialogue(node);
  syncLock(); // hand the cursor back so choices can be clicked
  return true;
}

/** E: extract / talk at a source, otherwise the Phase 2 read-out card. */
function handleInteract() {
  player?.gesture('reach'); // Phase 8: Riven reaches toward whatever she touches
  const src = nearSourceRec;
  if (src) {
    const held = src.fragmentId ? memories.has(src.fragmentId) : false;
    if (!src.fragmentId) {
      talkToNpc(src); // dialogue-only NPC (the night clerk)
      return;
    }
    if (!held) {
      startExtraction(src);
      return;
    }
    if (src.kind === 'npc') {
      talkToNpc(src);
      return;
    }
    // held object source falls through to the signage card below
  }
  if (nearStoryRec) {
    // a story character always answers through the choice card
    if (!talkWith({ kind: 'story', id: nearStoryRec.id, name: nearStoryRec.name })) {
      openInspect({
        kind: 'note',
        label: nearStoryRec.name,
        title: `${String(nearStoryRec.name).toUpperCase()} — SPEAKING`,
        body: 'They have nothing to add to the case right now.',
      });
    }
    return;
  }
  if (nearAgent) {
    talkToAgent(nearAgent);
    return;
  }
  if (nearInteractable) {
    // the mission's locked location and its payoff own their E-press
    if (nearInteractable.id === 'records-cage') {
      interactRecordsCage();
      return;
    }
    if (nearInteractable.id === 'mira-workbox') {
      openWorkbox();
      return;
    }
    playCue('interact'); // reading a plaque / sign / terminal
    openInspect(nearInteractable);
  }
}

/* --------------------------------------------------------------------- *
 * The records cage + the work box (Phase 5's locked location)
 * --------------------------------------------------------------------- */

function interactRecordsCage() {
  const cage = world?.memorySites?.cage;
  if (!cage) return;

  if (story.has('annex-key')) {
    if (cage.open()) {
      story.setFlag('cage-open'); // syncCageWorld swaps in the work box
      playCue('deduce');
      toast('Mira’s key turns — the records cage gate drops', 3400);
      syncStory();
    }
    return;
  }

  // locked: say why it is locked, honestly (the record only exists while
  // the case is open and the annex door stands unbarred)
  openInspect({
    id: 'records-cage',
    kind: 'door',
    label: cage.interact.label,
    title: cage.interact.title,
    body:
      'Mira’s work box is behind this gate — but Tomas keeps the key until ' +
      'the night market, the Floodworks station and Palisade Tower are all ' +
      'answered for. Bring him three findings.',
  });
}

/** The chapter finale: Mira's ledger, then the intake row with your name. */
function openWorkbox() {
  const node = workboxNode(storyCtx());
  openDialogue(node);
  syncLock();
}

let introShown = false;

/** One line at the top of a new story so the case is discoverable. */
function announceIntro() {
  if (introShown || story.has('met-tomas')) return;
  introShown = true;
  toast('A commission waits in Old Quarter — the Venn case (M · C: case file)', 5600);
}

/* --------------------------------------------------------------------- *
 * Phase 6 — progression effects, screens data, save / load / new game
 * --------------------------------------------------------------------- */

function UPGRADE_NAME(id) {
  return id
    .split('-')
    .map((w) => w.toUpperCase())
    .join(' ');
}

/**
 * Push owned upgrade effects into the gameplay values that consume them.
 * Runs at boot, after every purchase and after every load — the only place
 * progression reaches into gameplay (the UI never does).
 */
function applyProgressionEffects() {
  const fx = progression.effects();
  RECON_RANGE = fx.reconRange;
  channelScale = fx.channelScale;
  noiseScale = fx.noiseScale;
  memories.abilityTuning = {
    durationScale: fx.sightDurationScale,
    cooldownScale: fx.sightCooldownScale,
  };
}

/** Lifetime mote income from what the player has actually done. */
function motesCtx() {
  let reconstructed = 0;
  for (const f of FRAGMENTS) if (memories.isReconstructed(f.id)) reconstructed++;
  return { reconstructed, evidence: story.listEvidence().length };
}

/** Snapshot the map screen renders from (layout + position + discovery). */
function mapData() {
  if (!layout) return null;
  const p = player?.position;
  return {
    layout: {
      origin: layout.origin,
      extent: layout.extent,
      grid: layout.grid,
      cell: layout.cell,
      halfRoad: layout.halfRoad,
      cells: layout.cells.map((c) => ({
        x0: c.x0,
        x1: c.x1,
        z0: c.z0,
        z1: c.z1,
        cx: c.cx,
        cz: c.cz,
        district: c.district,
      })),
      districtInfo: Object.fromEntries(
        Object.entries(layout.districtInfo).map(([k, v]) => [
          k,
          { cells: v.cells.map((c) => ({ cx: c.cx, cz: c.cz })) },
        ]),
      ),
      canal: layout.canal,
      landmarks: layout.landmarks.map((lm) => ({ type: lm.type, x: lm.x, z: lm.z })),
    },
    player: p ? { x: p.x, z: p.z, yaw: player.facing ?? 0 } : null,
    discovery: { districts: [...discovery.districts], landmarks: [...discovery.landmarks] },
    markers: (world?.storyCast?.markerState() ?? [])
      .filter((m) => m.visible && m.pos)
      .map((m) => ({ id: m.id, x: m.pos.x, z: m.pos.z })),
    sources: (world?.memorySites?.sources ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      x: s.x,
      z: s.z,
      held: s.fragmentId ? memories.has(s.fragmentId) : false,
    })),
  };
}

/** Snapshot the equipment screen renders from (motes, effects, evidence). */
function gearData() {
  return {
    motes: progression.motes(motesCtx()),
    owned: [...progression.spent],
    effects: progression.effects(),
    evidence: story.listEvidence(),
  };
}

/** Write the checkpoint: every progress system, position and seed. */
function doSaveGame() {
  if (!player || !layout) return { ok: false, error: 'no world yet' };
  const doc = buildSnapshot({
    seed: settings.seed,
    player: {
      x: player.position.x,
      z: player.position.z,
      yaw: player.facing ?? 0,
      district: layout.districtAt(player.position.x, player.position.z),
    },
    memories: memories.exportState(),
    story: story.exportState(),
    discovery: discovery.snapshot(),
    progression: progression.snapshot(),
  });
  const r = writeSave(doc);
  toast(r.ok ? 'Game saved — checkpoint written' : `Save failed — ${r.error}`, 2800);
  refreshPause();
  return r;
}

/**
 * Restore the checkpoint. A deliberate full rebuild (identical seed) —
 * exactly what a page reload does — so world state and story agree.
 * Refuses safely on missing/corrupt/outdated/newer checkpoints.
 */
async function doLoadGame() {
  const r = readSave();
  if (r.status !== 'ok') {
    const why =
      {
        missing: 'no checkpoint yet',
        corrupt: 'checkpoint unreadable',
        outdated: 'checkpoint is from an older build',
        future: 'checkpoint is from a newer build',
      }[r.status] ?? r.status;
    toast(`Load failed — ${why}`, 3400);
    refreshPause();
    return r;
  }
  const doc = r.doc;
  closePause(); // release the menu before the loading screen takes over
  memories.applyState(doc.memories);
  story.applyState(doc.story); // emits change → syncStory()
  discovery.applySnapshot(doc.discovery);
  progression.applySnapshot(doc.progression);
  applyProgressionEffects();
  if (doc.seed) settings.seed = doc.seed;
  await generate({ quiet: true });
  if (doc.player) player.spawn(doc.player.x, doc.player.z, doc.player.yaw || Math.PI / 2);
  syncStory();
  toast('Game loaded', 2600);
  syncLock();
  return r;
}

/** New game: erase every progress key (a11y prefs survive), rebuild fresh. */
async function doNewGame() {
  closePause(); // release the menu before the loading screen takes over
  clearAllProgress();
  memories.reset();
  story.reset();
  discovery.reset();
  progression.reset();
  applyProgressionEffects();
  await generate({ quiet: true });
  syncStory();
  toast('New game — the case begins again', 3200);
  closePause();
  syncLock();
  return true;
}

/* --------------------------------------------------------------------- *
 * Frame hooks
 * --------------------------------------------------------------------- */

let statTimer = 0;
let lastDistrict = '';
const pivotTarget = new THREE.Vector3();

app.onUpdate((dt) => {
  const pressed = input.consumePressed();
  elapsed += dt;

  // ---- overlay key routing ---------------------------------------------
  // Each overlay owns the keys it needs; consumed keys are spliced out so
  // the same press can never fall through to gameplay underneath.
  const strip = (code) => {
    const i = pressed.indexOf(code);
    if (i >= 0) pressed.splice(i, 1);
  };
  if (recon.isActive()) {
    // the reconstruction plays out; E / Esc end it early
    if (pressed.includes('KeyE') || pressed.includes('Escape')) {
      recon.end('cancelled');
      strip('KeyE');
      strip('Escape');
    }
    strip('KeyJ'); // journal stays closed while ghosts are out
  } else if (isJournalOpen()) {
    for (const code of ['KeyJ', 'Escape', 'KeyE']) {
      if (pressed.includes(code)) {
        closeJournal();
        syncLock();
        strip(code);
      }
    }
    for (const code of pressed.slice()) if (journalHandleKey(code, memories)) strip(code);
  } else if (extracting) {
    if (pressed.includes('KeyE') || pressed.includes('Escape')) {
      cancelExtraction('Extraction cancelled');
      strip('KeyE');
      strip('Escape');
    }
  } else if (isInspectOpen()) {
    // E / Esc close the read-out card first, so the same press can never
    // immediately re-open it on the same frame
    if (pressed.includes('KeyE') || pressed.includes('Escape')) {
      closeInspect();
      strip('KeyE');
      strip('Escape');
    }
  } else if (isDialogueOpen()) {
    // a conversation owns every key while it is open: 1/2/3 answer,
    // E/Esc step away — nothing falls through to the world underneath
    for (const code of pressed.slice()) dialogueKey(code);
    pressed.length = 0;
  } else if (isMapOpen()) {
    // Tab / Esc / M close the map; every other key is swallowed while open
    for (const code of pressed.slice()) mapHandleKey(code);
    pressed.length = 0;
  } else if (isEquipmentOpen()) {
    // I / Esc close the loadout
    for (const code of pressed.slice()) equipmentHandleKey(code);
    pressed.length = 0;
  } else if (isPauseOpen()) {
    // P / Esc resume (Esc first cancels a pending confirmation)
    for (const code of pressed.slice()) pauseHandleKey(code);
    pressed.length = 0;
  }

  if (pressed.length) handlePressed(pressed);

  // ---- memory playback and timers: wall clock, in every mode -------------
  // A reconstruction must finish (and restore the world) even if the player
  // flips to the inspection camera mid-replay.
  if (recon.isActive()) recon.update(dt);
  if (memories.tick()) {
    // resonance sight ran out on its cooldown timer
    world?.memorySites?.setEchoes(false);
    toast('Resonance Sight fades', 2000);
    playCue('ability-off');
  }

  const overlayOpen = anyOverlayOpen();

  // ---- mini-map: live corner radar. It follows the HUD (H), only runs in
  // play mode, and steps aside for any overlay (full map, journal, dialogue,
  // pause…), so it is on screen exactly while you are walking the streets.
  setMiniMapVisible(mode === 'play' && miniMapWanted && isHudVisible() && !overlayOpen);
  updateMiniMap();

  if (mode === 'play' && player) {
    player.update(dt, pressed, { frozen: overlayOpen });
    player.cameraTarget(pivotTarget);
    camRig.update(dt, pivotTarget, player.speed);
    player.setChannel(!!extracting); // Phase 8: hold the glove-up pose while channeling

    // ---- memory world state (runs even under overlays: ghosts keep playing)
    world?.memorySites?.update(dt, elapsed, player.position);
    // ---- story cast: Tomas's idle, objective markers (Phase 5)
    world?.storyCast?.update(dt, elapsed, player.position);
    // ---- map screen: keep the player chevron live while it is open
    updateMap();

    // ---- living city + stealth (Phase 4) --------------------------------
    const life = world?.cityLife;
    if (life) {
      const p = player.position;
      const zone = life.zoneAt(p.x, p.z);
      const lctx = {
        zone,
        cover: life.inCover(p.x, p.z),
        sprinting: player.speed > 4.0,
        extracting: !!extracting,
        ability: memories.abilityState().active,
      };
      life.update(dt, elapsed, p, lctx);
      updateStealthHud(stealth.update(life.profiles(), lctx));
      // stepping into restricted ground is itself conspicuous
      const zid = zone?.id ?? '';
      if (zid && zid !== lastZoneId) {
        toast(`You step into ${zone.label}`, 2200);
        life.emitFrom('restricted', p.x, p.z);
      }
      lastZoneId = zid;
    }
    if (extracting) tickExtraction();
    if (isJournalOpen() && player) {
      // keep the activate button honest about the recording-site distance
      const sel = journalSelection();
      const site = sel ? world?.memorySites?.sourceByFragment(sel) : null;
      const p = player.position;
      setSiteRange(
        site
          ? {
              fragmentId: sel,
              inRange: Math.hypot(p.x - site.x, p.z - site.z) <= RECON_RANGE,
              sourceName: site.name,
            }
          : null,
      );
    }

    if (!overlayOpen) updateInteractions(pressed);
    else {
      nearSourceRec = null;
      nearInteractable = null;
      nearAgent = null;
      hidePrompt();
    }
  } else {
    flyCamera.update(dt);
  }

  sky.update(app.camera.position);
  lighting?.update(app.camera.position, dt);
  rain.update(dt, app.camera.position);
  motes.update(dt, app.camera.position);

  // Phase 8 — focus marker glides to whatever the prompt is pointing at, and
  // every visible character gets a soft contact-shadow decal under it
  focus.update(dt, app.camera, elapsed);
  contact.setEnabled(derived.quality.contactShadows ?? false);
  if (derived.quality.contactShadows) syncContactShadows();

  // slow scroll of the water normal map so canals/flooded blocks feel alive
  const nm = materials.water.normalMap;
  if (nm) {
    nm.offset.x = (nm.offset.x + dt * 0.012) % 1;
    nm.offset.y = (nm.offset.y + dt * 0.02) % 1;
  }

  statTimer -= dt;
  if (statTimer <= 0) {
    statTimer = 0.25;
    // ---- ambience + touch sync (Phase 7, cheap state guards) ------------
    const overlays = anyOverlayOpen();
    setAmbienceActive(!overlays);
    setRainLevel(settings.rain && derived.quality.rain ? 1 : 0);
    touch.setVisible(mode === 'play' && !overlays);

    const info = app.renderInfo;
    const p = mode === 'play' && player ? player.position : app.camera.position;
    const district = layout ? layout.districtAt(p.x, p.z) : 'outskirts';
    if (district !== lastDistrict) {
      lastDistrict = district;
      const D = DISTRICTS[district];
      // first time here → the district lights up on the map (Phase 6)
      const first = district !== 'outskirts' && discovery.visitDistrict(district);
      if (D) toast(first ? `${D.name} charted on your map` : `Entering ${D.name}`, first ? 2400 : 1800);
    }
    // landmarks chart themselves once you walk close (Phase 6 discovery)
    if (mode === 'play' && player && layout && layout.landmarks.length) {
      for (const lm of layout.landmarks) {
        if (discovery.hasLandmark(lm.type)) continue;
        if (Math.hypot(p.x - lm.x, p.z - lm.z) < 55 && discovery.visitLandmark(lm.type)) {
          toast(`Landmark charted — ${LANDMARK_NAMES[lm.type] ?? lm.type}`, 3200);
        }
      }
    }
  }
});

/* --------------------------------------------------------------------- *
 * Go
 * --------------------------------------------------------------------- */

applyModeUi();
app.start();

generate()
  .then((ok) => {
    if (ok) {
      hideLoading();
      // give the first frame a moment, then release the overlay
      window.__MT_READY__ = true;
      if (mode === 'play') {
        toast('Click to capture the mouse · WASD to move · E to inspect', 4200);
      }
    }
  })
  .catch((err) => {
    console.error(err);
    window.__MT_ERROR__ = String(err?.message ?? err);
  });

/* --------------------------------------------------------------------- *
 * Test hooks used by scripts/smoke.mjs
 * --------------------------------------------------------------------- */

window.__MT_VIEW__ = (name) => {
  setMode('inspect'); // viewpoints are fly-camera poses
  return applyView(name);
};
window.__MT_STATS__ = () => ({
  ready: !!window.__MT_READY__,
  fps: app.fps,
  frame: app.renderer.info.render.frame, // monotonic — counts render passes, proves the loop is alive
  appFrame: app.frameCount, // completed app frames — the only honest basis for a frame rate
  calls: app.renderer.info.render.calls,
  triangles: app.renderer.info.render.triangles,
  world: world ? world.stats : null,
  camera: app.camera.position.toArray(),
  views: Object.keys(VIEWPOINTS),
  materials: Object.keys(materials).length,
  /* Phase 7 — graphics-preset cost evidence + health metrics */
  quality: settings.quality,
  pixelRatio: app.renderer.getPixelRatio(),
  shadow: {
    enabled: app.renderer.shadowMap.enabled,
    autoUpdate: app.renderer.shadowMap.autoUpdate,
    hz: derived.quality.shadowHz ?? 0,
  },
  lights: lighting?.counts() ?? null,
  rain: { enabled: rain.mesh.visible },
  // where the last frame's milliseconds went (EMA — see App.frame)
  stages: { ...app.stageMs },
  memory: {
    geometries: app.renderer.info.memory.geometries,
    textures: app.renderer.info.memory.textures,
    // compiled shader programs — a count that only ever climbs when a preset
    // switches to a feature combination three.js has never seen, so watching it
    // tells a genuine recompile storm apart from a preset that is simply slow
    programs: app.renderer.info.programs?.length ?? 0,
  },
});

/**
 * Phase 7 — apply a graphics preset and return honest before/after cost
 * evidence. Renderer-only (no world rebuild): prop density / detail level
 * take effect on the next rebuild via the panel's Apply button, exactly as
 * they always have. Used by smoke to prove presets change real costs.
 */
window.__MT_QUALITY__ = async (name) => {
  if (!['low', 'medium', 'high'].includes(name)) return { ok: false, reason: 'unknown preset' };
  const snap = () => ({
    quality: settings.quality,
    pixelRatio: app.renderer.getPixelRatio(),
    shadowEnabled: app.renderer.shadowMap.enabled,
    hz: derived.quality.shadowHz ?? 0,
    lightsVisible: lighting?.counts().pointVisible ?? -1,
    moteCount: motes.count,
    rainVisible: rain.mesh.visible,
  });
  const before = snap();
  setQuality(name);
  app.applyRendererQuality();
  app.requestShadowUpdate();
  motes.setCount(derived.quality.moteCount ?? 0);
  motes.setReduced(!!a11yPrefs().reduceFx);
  await new Promise((r) => setTimeout(r, 120)); // let a frame or two land
  return { ok: true, before, after: snap() };
};

/**
 * Set the internal render scale (0.5 – 1) and report the pixel ratio that came
 * out of it. Renderer-only by construction: it resizes the drawing buffer and
 * nothing else, so the world, the materials and the colliders are untouched —
 * which is what makes it safe to sweep mid-run for a frame-rate measurement.
 */
window.__MT_RES__ = (scale) => {
  const v = Number(scale);
  settings.renderScale = Number.isFinite(v) ? Math.min(1, Math.max(0.5, v)) : 1;
  app.resize();
  return { scale: settings.renderScale, pixelRatio: app.renderer.getPixelRatio() };
};

/* Phase 7 — audio / particles / touch state for the smoke suite ---------- */
// Named _STATE (not __MT_AUDIO__) because a Phase-3 hook already claims
// __MT_AUDIO__ further down and returns audioState() as a string.
window.__MT_AUDIO_STATE__ = () => ({
  enabled: isAudioEnabled(),
  state: audioState(),
  ambience: isAmbienceRunning(),
  volumes: getVolumes(),
  steps: footstepCount(),
});
window.__MT_AUDIO_CUE__ = (name) => playCue(name);
window.__MT_AUDIO_STEP__ = (run) => playFootstep(!!run);
window.__MT_AUDIO_AMBIENCE__ = (on) => (on ? startAmbience() : stopAmbience());
window.__MT_AUDIO_VOLUMES__ = (patch) => (patch ? setVolumes(patch) : getVolumes());
window.__MT_AUDIO_RESET_VOLUMES__ = () => resetVolumes();
window.__MT_FX__ = () => ({
  motes: motes.stats(),
  reduceFx: !!a11yPrefs().reduceFx,
  presetCount: derived.quality.moteCount ?? 0,
});
window.__MT_TOUCH__ = () => ({ ...touch.state });
/** Force a shadow-map refresh on the next frame so a profiler can observe
 *  the depth pass deterministically (shadows are cadence-throttled). */
window.__MT_SHADOW_REFRESH__ = () => {
  app.requestShadowUpdate();
  return true;
};
window.__MT_SETTINGS__ = settings;
window.__MT_LIGHTS__ = () => {
  const out = [];
  app.scene.traverse((o) => {
    if (o.isPointLight || o.isDirectionalLight) {
      out.push({
        type: o.type,
        pos: o.position.toArray().map((v) => Math.round(v)),
        intensity: o.intensity,
        distance: o.distance,
        visible: o.visible,
        color: o.color.getHexString(),
      });
    }
  });
  return out;
};
window.__MT_GENERATE__ = (seed) => {
  settings.seed = seed;
  return generate();
};

/* ---- Phase 2 hooks --------------------------------------------------- */

window.__MT_SET_MODE__ = (m) => setMode(m);
// read the current mode: `player.active` follows `mode === 'play'`, so a test
// that needs the player to move has to be able to see that it actually can.
window.__MT_MODE__ = () => mode;
// the movement gate itself (anyOverlayOpen covers panel/inspect/journal/
// dialogue/reconstruction/extraction/map/equipment/pause). Exposed so "the
// player cannot move" is reportable as a fact instead of inferred from a
// position that never changes — which is exactly how the door-walk failure
// disguised itself as a door that was still shut.
window.__MT_OVERLAY_OPEN__ = () => anyOverlayOpen();
window.__MT_PLAYER__ = () => player?.snapshot() ?? null;
window.__MT_SPAWN__ = (district) => {
  spawnDistrict = district ?? spawnDistrict;
  const sp = respawnPlayer({ silent: true });
  return sp ? { x: sp.x, z: sp.z, yaw: sp.yaw, district: sp.district } : null;
};
window.__MT_TP__ = (x, z, yaw) => {
  if (!player) return null;
  player.spawn(x, z, yaw ?? player.facing);
  return player.snapshot();
};
window.__MT_KEY__ = (code, down) => input.setKey(code, down);
window.__MT_PRESS__ = (code) => input.injectPress(code);
window.__MT_LOOK__ = (dx, dy) => input.simulateMouse(dx, dy);
window.__MT_COLLIDES__ = (x, y, z) => world?.colliders.isPointBlocked(x, y, z) ?? false;
// height second, optional radius (tests pass the *agent* radius, 0.32)
window.__MT_HITS__ = (x, y, z, r) => world?.colliders.hits(x, z, y, r) ?? false;
window.__MT_GROUND__ = (x, z) => world?.colliders.groundAt(x, z, 0.18) ?? 0;
window.__MT_CAM__ = () => ({
  pos: app.camera.position.toArray(),
  dist: camRig.boomDistance,
  collided: camRig.cameraCollided,
  yaw: camRig.yaw,
  pitch: camRig.pitch,
  fov: app.camera.fov, // fixed lens: the camera never breathes with speed
});
// corner mini-map: visibility, size, the world point it was last drawn at
window.__MT_MINIMAP__ = () => miniMapSnapshot();
window.__MT_INTERACT__ = () => ({
  near: nearInteractable?.id ?? null,
  prompt: !document.getElementById('prompt')?.classList.contains('hidden'),
  open: isInspectOpen(),
  count: world?.interactables?.length ?? 0,
});
window.__MT_COLLIDERS__ = () => world?.colliders.stats() ?? null;
window.__MT_INTERACTABLES__ = () =>
  world?.interactables.map((it) => ({
    id: it.id,
    x: it.x,
    y: it.y,
    z: it.z,
    radius: it.radius,
    label: it.label,
  })) ?? [];
window.__MT_LAYOUT__ = () =>
  layout
    ? {
        origin: layout.origin,
        cell: layout.cell,
        grid: layout.grid,
        extent: layout.extent,
        curb: layout.curb,
        halfRoad: layout.halfRoad,
        road: layout.road,
        canal: {
          x0: layout.canal.x0,
          x1: layout.canal.x1,
          z: layout.canal.z,
          width: layout.canal.width,
          depth: layout.canal.depth,
          bridges: layout.canal.bridges,
        },
        districts: Object.fromEntries(
          Object.entries(layout.districtInfo).map(([k, v]) => [
            k,
            {
              id: v.id,
              coreIx: v.coreIx,
              coreIz: v.coreIz,
              cells: v.cells.map((c) => ({
                ix: c.ix,
                iz: c.iz,
                x0: c.x0,
                x1: c.x1,
                z0: c.z0,
                z1: c.z1,
                cx: c.cx,
                cz: c.cz,
                district: c.district,
                landmark: c.landmark,
                flooded: c.flooded,
              })),
            },
          ]),
        ),
        landmarks: layout.landmarks.map((lm) => ({
          type: lm.type,
          x: lm.x,
          z: lm.z,
          cell: { x0: lm.cell.x0, x1: lm.cell.x1, z0: lm.cell.z0, z1: lm.cell.z1, cx: lm.cell.cx, cz: lm.cell.cz },
        })),
      }
    : null;

/* ---- Phase 3 hooks (memory mechanic) ---------------------------------- */

window.__MT_MEM__ = () => memories.snapshot();
window.__MT_MEM_RESET__ = () => {
  memories.reset();
  world?.memorySites?.setEchoes(false);
  return true;
};
window.__MT_SOURCES__ = () =>
  world?.memorySites?.sources.map((s) => ({
    id: s.id,
    fragmentId: s.fragmentId,
    kind: s.kind,
    name: s.name,
    x: s.x,
    y: s.y,
    z: s.z,
    radius: s.radius,
  })) ?? [];
window.__MT_NEAR__ = () => ({
  source: nearSourceRec?.id ?? null,
  interactable: nearInteractable?.id ?? null,
});
window.__MT_JOURNAL__ = (open) => {
  if (open === undefined) return isJournalOpen();
  if (open) {
    openJournal(memories, {});
    syncLock();
  } else {
    closeJournal();
    syncLock();
  }
  return isJournalOpen();
};
window.__MT_JSEL__ = () => journalSelection();
window.__MT_EXTRACT__ = () => ({
  active: !!extracting,
  fragment: extracting?.fragment.id ?? null,
  hud: !document.getElementById('extract')?.classList.contains('hidden'),
  // per-fragment visual signature: channel effect class + glove light colour
  fx: document.getElementById('extract')?.dataset.fx ?? '',
  glove: player?.rig?.parts?.gloveLight?.color.getHex() ?? null,
  // the channel length THIS tick actually uses (base × upgrade scale)
  duration: +(EXTRACTION_DURATION * channelScale).toFixed(2),
});
window.__MT_RECON__ = () => ({
  ...recon.state(),
  audio: audioState(),
  bodyClass: document.body.className,
});
window.__MT_RECON_START__ = (id) => activateReconstruction(id);
// test hooks: force the glove cooldown / stretch a replay so slow software
// rendering can never race a timed window
window.__MT_GLOVE_CD__ = (seconds = 0) => {
  memories.gloveReadyAt = performance.now() + Math.max(0, seconds) * 1000;
  return memories.gloveCooldown();
};
window.__MT_RECON_DUR__ = (seconds = 9) => {
  recon.durationMs = Math.max(1, seconds) * 1000;
  return recon.durationMs;
};
window.__MT_ABILITY__ = () => ({
  ...memories.abilityState(),
  echoes: world?.memorySites?.echoesOn() ?? false,
  echoesTotal: world?.memorySites?.echoCount() ?? 0,
});
window.__MT_SECRET__ = () => world?.memorySites?.secretState() ?? null;
window.__MT_CLUE__ = (targetId) => world?.memorySites?.clueRevealed(targetId) ?? false;
window.__MT_DEDUCE__ = (pairId, believedId) => memories.setDeduction(pairId, believedId);
window.__MT_AUDIO__ = () => audioState();

/* ---- Phase 4: living city + stealth ---------------------------------- */
window.__MT_AGENTS__ = () => (world?.cityLife?.agents ?? []).map((a) => a.snapshot());
window.__MT_LIFE__ = () => world?.cityLife?.stats() ?? null;
window.__MT_STEALTH__ = () => {
  const p = player?.position;
  const life = world?.cityLife;
  return {
    ...stealth.view(),
    cover: p && life ? life.inCover(p.x, p.z) : false,
    zone: p && life ? (life.zoneAt(p.x, p.z)?.id ?? null) : null,
    extracting: !!extracting,
  };
};
window.__MT_HIDE__ = () => (world?.cityLife?.hideSpots ?? []).map((s) => ({ ...s }));
window.__MT_ZONES__ = () => (world?.cityLife?.zones ?? []).map((z) => ({ ...z }));
// fixture: stand an agent somewhere else (routes and perception stay real);
// optional faceX/faceZ points the agent's attention at a spot
window.__MT_AGENT_POS__ = (id, x, z, faceX, faceZ) => world?.cityLife?.relocate(id, x, z, faceX, faceZ) ?? false;
// seam: start the otherwise game-timed stand-and-pause early
window.__MT_AGENT_PAUSE__ = (id, seconds = 0.15) => world?.cityLife?.forcePause(id, seconds) ?? false;
// the real disturbance path (cover + zone aware) without needing a fragment
window.__MT_EMIT__ = (label = 'extraction') =>
  player && world?.cityLife
    ? world.cityLife.emitFrom(label, player.position.x, player.position.z, { noiseScale })
    : 0;
// which prompt claimant won, and where every source actually is
window.__MT_PROMPT_DBG__ = () => {
  const el = document.getElementById('prompt');
  const shown = !!el && !el.classList.contains('hidden');
  return {
    label: shown ? (document.getElementById('prompt-label')?.textContent ?? '') : '',
    shown,
    src: nearSourceRec
      ? {
          id: nearSourceRec.id,
          name: nearSourceRec.name,
          radius: nearSourceRec.radius,
          d: Math.hypot(player.position.x - nearSourceRec.x, player.position.z - nearSourceRec.z),
        }
      : null,
    agent: nearAgent ? { id: nearAgent.id, name: nearAgent.name } : null,
    story: nearStoryRec ? { id: nearStoryRec.id, name: nearStoryRec.name } : null,
    it: nearInteractable?.id ?? null,
    p: [player?.position.x, player?.position.z],
    sources: (world?.memorySites?.sources ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      x: s.x,
      z: s.z,
      r: s.radius,
    })),
  };
};

/* ---- Phase 5: story, missions, dialogue ------------------------------- */
// full view model + world markers + the locked location's real state
window.__MT_STORY__ = () => {
  const view = missions.view();
  const cage = world?.memorySites?.cage;
  return {
    ...view,
    markers: world?.storyCast?.markerState() ?? [],
    cage: cage
      ? {
          open: cage.isOpen(),
          interactInWorld: world.interactables.includes(cage.interact),
          boxInWorld: world.interactables.includes(cage.workBox),
        }
      : null,
  };
};
// explicit reset (fresh story) — mirrors a clean localStorage profile
window.__MT_STORY_RESET__ = () => {
  story.reset();
  syncStory();
  return true;
};
// where a story character actually stands (prompts/tests use the real spot)
window.__MT_STORY_POS__ = (id) => {
  const t = (world?.storyCast?.targets ?? []).find((x) => x.id === id);
  return t ? { id: t.id, name: t.name, x: t.x, y: t.y, z: t.z, r: t.radius } : null;
};
window.__MT_DIALOGUE__ = () => dialogueSnapshot();
window.__MT_DIALOGUE_CHOOSE__ = (i) => chooseDialogue(i);
window.__MT_DIALOGUE_CLOSE__ = () => closeDialogue();
// case-file tab: force the tab, then read what the journal actually shows
window.__MT_CASE__ = (tab) => {
  if (typeof tab === 'string') setJournalTab(tab);
  const objs = [...document.querySelectorAll('.case-obj')];
  const evs = [...document.querySelectorAll('.case-ev')];
  return {
    tab: journalTab(),
    open: isJournalOpen(),
    objectives: objs.length,
    objectivesDone: objs.filter((o) => o.classList.contains('done')).length,
    objectiveIds: objs.filter((o) => o.classList.contains('done')).map((o) => o.dataset.objective),
    missions: [...document.querySelectorAll('.case-mission')].map((m) => m.dataset.mission),
    evidence: evs.map((b) => b.dataset.evidence),
    discrepancy: !!document.querySelector('.case-discrepancy'),
    expandedBody: document.querySelector('.case-ev.open .case-ev-body')?.textContent ?? null,
  };
};

/* ---- Phase 6: UI screens + progression -------------------------------- */
// successful world generations: open/close every menu and this must not move
window.__MT_GEN__ = () => worldGenerations;
// the HUD mission tracker
window.__MT_TRACKER__ = () => trackerSnapshot();
// city map: force open/close (true/false) or just read the state
window.__MT_MAP__ = (open) => {
  if (open === true && !isMapOpen()) {
    openMap();
    syncLock();
  } else if (open === false && isMapOpen()) {
    closeMap();
    syncLock();
  }
  return mapSnapshot();
};
// equipment & inventory: force open/close or read motes/ownership/stats
window.__MT_GEAR__ = (open) => {
  if (open === true && !isEquipmentOpen()) {
    openEquipment();
    syncLock();
  } else if (open === false && isEquipmentOpen()) {
    closeEquipment();
    syncLock();
  }
  return equipmentSnapshot();
};
// pause menu state (open/close, confirm box, button list)
window.__MT_PAUSE__ = (open) => {
  if (open === true && !isPauseOpen()) openPause();
  else if (open === false && isPauseOpen()) closePause();
  return pauseSnapshot();
};
// save checkpoint control: 'status' | 'save' | 'load' | 'raw' | 'write' | 'new'
window.__MT_SAVE__ = async (op = 'status', text = null) => {
  if (op === 'save') return doSaveGame();
  if (op === 'load') return await doLoadGame();
  if (op === 'raw') {
    try {
      return window.localStorage.getItem('mt.save.v1');
    } catch {
      return null;
    }
  }
  if (op === 'write' && typeof text === 'string') {
    try {
      window.localStorage.setItem('mt.save.v1', text);
      return true;
    } catch {
      return false;
    }
  }
  if (op === 'new') return await doNewGame();
  return { ...saveStatus() };
};
// accessibility preferences (read or patch) — persisted under mt.a11y.v1
window.__MT_A11Y__ = (patch) => (patch ? setA11y(patch) : a11yPrefs());

export { app, flyCamera as camera, generate, settings, DEFAULTS, setQuality, PALETTE };
