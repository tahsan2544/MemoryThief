/**
 * Reconstruction — playback of a recovered memory in the place it happened.
 *
 * While a reconstruction runs, the real world is *overlaid*, not replaced:
 * ghost silhouettes and translucent panels stand where the recorded event
 * occurred, the fog and ambient light are dragged toward the memory's tint,
 * a focus light breathes at the scene's heart, a procedural drone plays, and
 * a CSS distortion overlay jitters the frame. Everything is captured up
 * front and restored in `end()` — even when playback throws — so the city
 * can never be left half-remembered.
 *
 * All timers are wall clock (`performance.now`): a reconstruction lasts the
 * same nine seconds at 60 fps and at the 0.3 fps a headless software
 * renderer manages.
 */

import * as THREE from 'three';
import { playCue, startDrone, stopDrone } from '../audio/memoryAudio.js';

const DURATION = 9; // seconds
const FADE_IN = 1.1;
const FADE_OUT = 1.6;
const REVEAL_AT = 0.42; // fraction of progress where the clue lands

const DISTORTION_CLASS = {
  flicker: 'recon-flicker',
  warp: 'recon-warp',
  stutter: 'recon-stutter',
  scrub: 'recon-scrub',
  drift: 'recon-drift',
};

function ghostMaterial(tint, opacity) {
  return new THREE.MeshBasicMaterial({
    color: tint,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  });
}

/** A translucent human-shaped stand-in for whoever was recorded. */
function makeGhostActor(spec, mat) {
  const group = new THREE.Group();
  const part = (w, h, d, x, y, z, pivotTop = 0) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (pivotTop) geo.translate(0, -pivotTop, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const legs = [
    part(0.17, 0.86, 0.2, -0.12, 0.86, 0, 0.43),
    part(0.17, 0.86, 0.2, 0.12, 0.86, 0, 0.43),
  ];
  const torso = part(0.46, 0.62, 0.28, 0, 1.16, 0);
  const arms = [
    part(0.12, 0.56, 0.16, -0.3, 1.45, 0, 0.28),
    part(0.12, 0.56, 0.16, 0.3, 1.45, 0, 0.28),
  ];
  const head = part(0.23, 0.25, 0.24, 0, 1.6, 0);
  void torso;
  return {
    group,
    legs,
    arms,
    head,
    pose: spec.pose ?? 'still',
    phase: Math.random() * Math.PI * 2,
    drift: { x: spec.dx, z: spec.dz },
    dispose() {
      for (const m of [...legs, ...arms, torso, head]) m.geometry.dispose();
    },
  };
}

export class ReconstructionPlayer {
  /**
   * @param {{scene: THREE.Scene, getLighting: () => any}} opts
   *   `getLighting` is read at start time because the lighting rig is rebuilt
   *   with every world generation.
   */
  constructor({ scene, getLighting }) {
    this.scene = scene;
    this.getLighting = getLighting;
    this.group = null;
    this.fragment = null;
    this.startedAt = 0;
    this.durationMs = DURATION * 1000; // mutable: tests stretch a replay so a
    // slow software-rendered screenshot can never race the cancel window
    this.revealed = false;
    this.focusLight = null;
    this.actors = [];
    this.panels = [];
    this.mats = [];
    this.env = null;
    this.onEvent = null; // ({ type: 'reveal' | 'end', fragment, completed })
  }

  isActive() {
    return this.group !== null;
  }

  currentId() {
    return this.fragment?.id ?? null;
  }

  /** 0..1 playback progress (1 = finished). */
  progress() {
    if (!this.group) return 0;
    return Math.min(1, (performance.now() - this.startedAt) / this.durationMs);
  }

  state() {
    return {
      active: this.isActive(),
      id: this.currentId(),
      progress: this.progress(),
      actors: this.actors.length,
      panels: this.panels.length,
      revealed: this.revealed,
      env: this.env
        ? {
            fogChanged: this.env.fogChanged,
            tint: this.env.tintHex,
            ambientDimmed: this.env.ambientDimmed,
          }
        : null,
    };
  }

  /**
   * Start playback anchored at the recording site.
   * @param {object} fragment catalogue entry from fragments.js
   * @param {{x:number,y:number,z:number}} anchor world position of the source
   * @returns {boolean} false when a reconstruction is already running
   */
  start(fragment, anchor) {
    if (!fragment?.reconstruction || !anchor) return false;
    if (this.isActive()) return false;
    const rec = fragment.reconstruction;
    const tint = fragment.tint ?? 0x9a7bff;

    try {
      this.fragment = fragment;
      this.revealed = false;
      this.group = new THREE.Group();
      this.group.name = `reconstruction:${fragment.id}`;
      this.group.position.set(anchor.x, anchor.y, anchor.z);

      const mats = [];
      const matFor = (c, o) => {
        const m = ghostMaterial(c, o);
        mats.push(m);
        return m;
      };

      // ---- ghost actors ------------------------------------------------
      for (const spec of rec.actors ?? []) {
        const actor = makeGhostActor(spec, matFor(spec.tint ?? tint, 0.3));
        actor.group.position.set(spec.dx, 0.02, spec.dz);
        actor.group.rotation.y = spec.yaw ?? 0;
        this.group.add(actor.group);
        this.actors.push(actor);
      }

      // ---- translucent panels (walls, boards, thresholds) ---------------
      for (const p of rec.panels ?? []) {
        const geo = new THREE.BoxGeometry(p.w, p.h, 0.08);
        const mesh = new THREE.Mesh(geo, matFor(p.tint ?? tint, p.opacity ?? 0.16));
        mesh.position.set(p.dx, (p.y ?? 0) + p.h / 2, p.dz);
        this.group.add(mesh);
        this.panels.push({ mesh, geo, baseOpacity: p.opacity ?? 0.6, phase: Math.random() * 6 });
      }

      // ---- focus light --------------------------------------------------
      this.focusLight = new THREE.PointLight(tint, 0, 34, 1.8);
      this.focusLight.position.set(0, 2.6, -2.5);
      this.group.add(this.focusLight);

      this.scene.add(this.group);
      this.mats = mats;
      this.startedAt = performance.now();

      // ---- capture + alter the environment ------------------------------
      this._captureEnv(tint, rec.fog);

      // ---- sound + screen distortion ------------------------------------
      startDrone(((tint & 0xff) / 255) * 0.6 + 0.4);
      playCue('recon-start');
      document.body.classList.add('recon-active', DISTORTION_CLASS[rec.distortion] ?? 'recon-flicker');
      const tintEl = document.getElementById('recon-tint');
      if (tintEl) {
        tintEl.style.background = `radial-gradient(ellipse at 50% 52%, ${cssRgba(tint, 0.28)} 0%, ${cssRgba(tint, 0.05)} 55%, transparent 78%)`;
        tintEl.style.opacity = '1';
      }
      return true;
    } catch (err) {
      console.error('[reconstruction] start failed:', err);
      this.end('error');
      return false;
    }
  }

  _captureEnv(tint, fogSpec) {
    const lighting = this.getLighting?.();
    const fog = this.scene.fog;
    this.env = {
      tintHex: '#' + tint.toString(16).padStart(6, '0'),
      prevFogColor: fog ? fog.color.clone() : null,
      prevFogDensity: fog && 'density' in fog ? fog.density : null,
      prevBg: this.scene.background?.clone?.() ?? null,
      prevAmbient: lighting?.ambient ? lighting.ambient.intensity : null,
      prevHemi: lighting?.hemi ? lighting.hemi.intensity : null,
      fogChanged: !!fog && !!fogSpec,
      ambientDimmed: lighting?.ambient != null,
      fogSpec,
      tint,
    };

    if (fog && fogSpec) {
      fog.color.setHex(fogSpec.color);
      if ('density' in fog && fogSpec.density) fog.density = fogSpec.density;
    }
    if (lighting?.ambient) lighting.ambient.intensity *= 0.42;
    if (lighting?.hemi) lighting.hemi.intensity *= 0.5;
  }

  _restoreEnv() {
    const e = this.env;
    const lighting = this.getLighting?.();
    if (!e) return;
    try {
      if (e.prevFogColor && this.scene.fog) this.scene.fog.color.copy(e.prevFogColor);
      if (e.prevFogDensity != null && this.scene.fog && 'density' in this.scene.fog) {
        this.scene.fog.density = e.prevFogDensity;
      }
      if (e.prevAmbient != null && lighting?.ambient) lighting.ambient.intensity = e.prevAmbient;
      if (e.prevHemi != null && lighting?.hemi) lighting.hemi.intensity = e.prevHemi;
    } catch (err) {
      console.warn('[reconstruction] env restore failed:', err);
    }
    this.env = null;
  }

  /**
   * Drive playback. Safe to call every frame; no-ops when inactive.
   * @param {number} dt unused (kept for call-site symmetry) — progress is wall clock
   */
  update(dt) {
    void dt;
    if (!this.group) return;
    const t = performance.now() - this.startedAt;
    const p = Math.min(1, t / this.durationMs);

    // fade envelope
    const inK = Math.min(1, t / 1000 / FADE_IN);
    const outK = Math.min(1, (this.durationMs - t) / 1000 / FADE_OUT);
    const env = inK * outK;

    // ---- animate ghosts -------------------------------------------------
    const time = t / 1000;
    for (const a of this.actors) {
      const s = Math.sin(time * 1.7 + a.phase);
      a.group.position.y = 0.02 + s * 0.015;
      a.head.rotation.y = Math.sin(time * 0.7 + a.phase) * 0.4;
      if (a.pose === 'reach') {
        a.arms[0].rotation.x = -1.15 + s * 0.06;
        a.arms[1].rotation.x = -0.5 - s * 0.04;
      } else if (a.pose === 'walk') {
        a.legs[0].rotation.x = s * 0.5;
        a.legs[1].rotation.x = -s * 0.5;
        a.arms[0].rotation.x = -s * 0.3;
        a.arms[1].rotation.x = s * 0.3;
      } else if (a.pose === 'turn') {
        a.group.rotation.y += dt * 0.35;
        a.legs[0].rotation.x = s * 0.12;
        a.legs[1].rotation.x = -s * 0.12;
      } else {
        a.arms[0].rotation.x = s * 0.05;
        a.arms[1].rotation.x = -s * 0.05;
      }
    }
    for (const panel of this.panels) {
      panel.mesh.material.opacity = panel.baseOpacity * env * (0.72 + 0.28 * Math.sin(time * 2.2 + panel.phase));
    }
    for (const a of this.actors) {
      const base = a.pose === 'still' ? 0.3 : 0.26;
      a.group.traverse((o) => {
        if (o.isMesh) o.material.opacity = base * env;
      });
    }

    // ---- focus light breathes, then flares at the reveal ----------------
    if (this.focusLight) {
      const flare = p > REVEAL_AT && p < REVEAL_AT + 0.16 ? 1.8 : 1;
      this.focusLight.intensity = (10 + 5 * Math.sin(time * 2.4)) * env * flare;
    }

    // ---- the reveal ------------------------------------------------------
    if (!this.revealed && p >= REVEAL_AT) {
      this.revealed = true;
      playCue('recon-reveal');
      this.onEvent?.({ type: 'reveal', fragment: this.fragment });
    }

    // ---- the tint overlay breathes with the memory ------------------------
    const tintEl = document.getElementById('recon-tint');
    if (tintEl) tintEl.style.opacity = String(0.35 + 0.65 * env);

    if (p >= 1) this.end('completed');
  }

  /**
   * Stop playback and restore the world. Idempotent; also the error path.
   * @param {string} reason 'completed' | 'cancelled' | 'error'
   */
  end(reason = 'cancelled') {
    if (!this.group && !this.fragment) return false;
    const fragment = this.fragment;
    const completed = reason === 'completed';

    try {
      if (this.group) {
        this.scene.remove(this.group);
        this.group.clear();
      }
      for (const a of this.actors) a.dispose();
      for (const p of this.panels) p.geo.dispose();
      for (const m of this.mats) m.dispose();
    } catch (err) {
      console.warn('[reconstruction] teardown issue:', err);
    } finally {
      this.group = null;
      this.actors = [];
      this.panels = [];
      this.mats = [];
      this.focusLight = null;
    }

    this._restoreEnv();
    stopDrone();
    playCue('recon-end');
    document.body.classList.remove(
      'recon-active',
      'recon-flicker',
      'recon-warp',
      'recon-stutter',
      'recon-scrub',
      'recon-drift',
    );
    const tintEl = document.getElementById('recon-tint');
    if (tintEl) tintEl.style.opacity = '0';

    const wasRevealed = this.revealed;
    this.fragment = null;
    this.revealed = false;
    this.onEvent?.({ type: 'end', fragment, completed, revealed: wasRevealed, reason });
    return true;
  }
}

function cssRgba(hex, a) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
