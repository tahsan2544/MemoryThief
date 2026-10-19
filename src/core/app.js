import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { PostFX } from './postfx.js';

/** Fog distance slider value -> FogExp2 density (~90 % fog at `far` metres). */
function fogDensity(far) {
  return 1.518 / Math.max(100, far);
}

/**
 * Application shell: renderer, scene, camera, frame loop, quality and
 * distance culling. Everything gameplay-specific is plugged in from outside.
 */

export class App {
  constructor(container, settings, derived) {
    this.container = container;
    this.settings = settings;
    this.derived = derived;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.clock = new THREE.Clock();
    this.running = false;
    this.hooks = { update: [], afterRender: [] };
    this.fps = 0;
    this._frames = 0;
    this._fpsTimer = 0;
    // Monotonic count of completed app frames. `renderer.info.render.frame`
    // cannot stand in for this: it bumps once per renderer.render() call, and a
    // post-processing frame makes many of them (every fullscreen quad pass),
    // so it counts passes on medium/high and frames on low.
    this.frameCount = 0;
    this._world = null;
    this._cullTimer = 0;
    // Rolling per-stage frame cost (ms). A single fps figure cannot tell you
    // whether a slow frame was spent running game logic or waiting on the
    // driver — these can, so a stall is diagnosable instead of guessed at.
    this.stageMs = { update: 0, logic: 0, render: 0 };
  }

  init() {
    const q = this.derived.quality;

    this.renderer = new THREE.WebGLRenderer({
      // Context MSAA is OFF, deliberately. A WebGL context fixes its multisample
      // state at creation and can never change it, so a per-preset `antialias`
      // flag was a lie: the page boots on Medium (true), and Low — which
      // declares false — then paid for 4x multisampling anyway on the only path
      // that reaches the default framebuffer at all. Medium and High draw the
      // scene into the composer's non-multisampled target, where this flag
      // never did anything. Measured under software GL: Low ran 0.33 fps
      // against 0.73 for medium at the very same 75% scale.
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(this.targetPixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = this.settings.shadows && q.shadows;
    // PCFSoftShadowMap was removed upstream; PCF is the shipping filter and is
    // requested explicitly so three never logs a deprecation for an enum that
    // no longer exists.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Phase 8: with post-processing the scene renders into a target before a
    // final copy pass, so three's automatic per-render reset would leave the
    // counters holding only the last pass. We own the reset (once per frame in
    // frame()) so renderInfo keeps reporting the scene's real draw calls.
    this.renderer.info.autoReset = false;
    // Phase 7: the shadow map is expensive (it re-renders every shadow caster
    // in the scene). We update it on a fixed cadence instead of every frame —
    // the light follows the camera, so 4-6 Hz is visually indistinguishable
    // and roughly halves the render cost on integrated GPUs.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this._shadowTimer = 0; // counts down to the next shadow refresh
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // Exponential-squared fog: crisp near, long aerial perspective, so both
    // street level and the city-wide overview read correctly.
    this.scene.fog = new THREE.FogExp2(PALETTE.fog, fogDensity(this.settings.fogFar));

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 1, 9000);
    this.camera.position.set(0, 220, 480);

    // Phase 8 — bloom (see postfx.js). Off on Low, on for Medium/High.
    this.postfx = new PostFX(this.renderer, this.scene, this.camera);
    this.postfx.applyQuality(this.derived.quality);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    return this;
  }

  /* ------------------------------ environment --------------------------- */

  applyEnvironment({ sky, lighting, weather }) {
    this.sky = sky;
    this.lighting = lighting;
    this.weather = weather;
    if (sky?.envTexture) {
      this.scene.environment = sky.envTexture;
      if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = 0.55;
    }
    if (lighting) lighting.applyQuality(this.derived.quality);
    this.renderer.shadowMap.enabled = this.settings.shadows && this.derived.quality.shadows;
    this.renderer.shadowMap.needsUpdate = true;
  }

  setFog(far) {
    this.scene.fog.density = fogDensity(far);
  }

  /** Fog colour follows the day/night horizon (Phase 11). */
  setFogColor(hex) {
    this.scene.fog.color.set(hex);
  }

  applyRendererQuality() {
    const q = this.derived.quality;
    this.renderer.setPixelRatio(this.targetPixelRatio());
    this.renderer.shadowMap.enabled = this.settings.shadows && q.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this._shadowTimer = 0; // refresh shadows right away after a quality change
    this.lighting?.applyQuality(q);
    this.weather?.setEnabled(this.settings.rain && q.rain);
    this.postfx?.applyQuality(q);
    this.setFog(this.settings.fogFar);
    this.resize();
  }

  /** Ask for a shadow refresh on the next frame (teleports, rebuilds, …). */
  requestShadowUpdate() {
    this.renderer.shadowMap.needsUpdate = true;
    this._shadowTimer = 0;
  }

  setWorld(world) {
    this._world = world;
  }

  /* --------------------------------- loop ------------------------------- */

  onUpdate(fn) {
    this.hooks.update.push(fn);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      this.frame();
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  frame() {
    const rawDt = this.clock.getDelta();
    // Simulation steps on a clamped dt — a multi-second stall must not fling
    // the player across the map — but the *frame rate* is a fact about real
    // time. Accumulating the clamped step instead made every frame slower than
    // 100 ms report exactly 10 fps, which is why the harness kept reading "10"
    // while frames were actually taking seconds.
    const dt = Math.min(rawDt, 0.1);

    // own the per-frame draw-call counter (autoReset is off — see init)
    this.renderer.info.reset();

    const t0 = performance.now();
    for (const fn of this.hooks.update) fn(dt, this);
    const t1 = performance.now();

    this.cull(dt);
    this.tickShadows(dt);
    const t2 = performance.now();
    if (this.postfx?.enabled) this.postfx.render();
    else this.renderer.render(this.scene, this.camera);
    const t3 = performance.now();
    this.frameCount++;

    // exponential moving averages: one hitch cannot own the number, and a
    // steady stall shows up immediately in the stage it belongs to
    const ema = (prev, cur) => prev + (cur - prev) * 0.1;
    this.stageMs.update = ema(this.stageMs.update, t1 - t0);
    this.stageMs.logic = ema(this.stageMs.logic, t2 - t1);
    this.stageMs.render = ema(this.stageMs.render, t3 - t2);

    this._frames++;
    this._fpsTimer += rawDt;
    if (this._fpsTimer >= 0.5) {
      this.fps = Math.round(this._frames / this._fpsTimer);
      this._frames = 0;
      this._fpsTimer = 0;
    }
  }

  /**
   * Shadow cadence: with autoUpdate off, three.js only re-renders the shadow
   * map when `needsUpdate` is set. We set it every 1/shadowHz seconds — the
   * directional light tracks the camera, so stale shadows are never more
   * than a few pixels off. shadowHz 0 (Low preset) means never.
   */
  tickShadows(dt) {
    if (!this.renderer.shadowMap.enabled) return;
    const hz = this.derived.quality.shadowHz ?? 0;
    if (hz <= 0) return;
    if (this.renderer.shadowMap.needsUpdate) return; // already refreshing
    this._shadowTimer -= dt;
    if (this._shadowTimer <= 0) {
      this.renderer.shadowMap.needsUpdate = true;
      this._shadowTimer = 1 / hz;
    }
  }

  /** Distance-based chunk culling on top of the renderer's frustum culling. */
  cull(dt) {
    this._cullTimer -= dt;
    if (this._cullTimer > 0) return;
    this._cullTimer = 0.2;

    const world = this._world;
    if (!world) return;
    const limit = this.derived.viewDistance;
    const p = this.camera.position;
    for (const chunk of world.chunks) {
      if (!chunk.group) continue;
      const dx = chunk.cxCenter - p.x;
      const dz = chunk.czCenter - p.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      chunk.group.visible = dist < limit + 140;
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // re-cap the device pixel ratio: dragging the window to another monitor
    // (or waking a HiDPI screen) changes devicePixelRatio at runtime
    const pr = this.targetPixelRatio();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.postfx?.resize(w, h, pr);
  }

  /**
   * Drawing-buffer pixel ratio: the preset's HiDPI cap, then the render scale
   * on top, then the preset's own scale (Low renders at 75% internally). The
   * scale is the only control that changes how many pixels the 3D scene costs —
   * every other quality flag changes what is drawn instead — so it is computed
   * in exactly one place and the three call sites (boot, preset switch, window
   * resize) cannot drift apart.
   */
  targetPixelRatio() {
    const q = this.derived.quality;
    const clamp = (v) => Math.min(1, Math.max(0.5, v ?? 1));
    const scale = clamp(this.settings.renderScale) * clamp(q.renderScale);
    return Math.min(window.devicePixelRatio || 1, q.maxPixelRatio) * scale;
  }

  get renderInfo() {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      fps: this.fps,
    };
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.postfx?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
