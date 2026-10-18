import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Post-processing (Phase 8) — selective bloom.
 *
 * Eidolon is a wet neon city at night, and the single biggest thing missing
 * from the raw forward render was *light bleed*: real bright sources spill
 * into their surroundings, and an HDR bloom pass is how a screen fakes that.
 * Emissive signage, the extraction glove, the moon and lamp cores all sit
 * above the bloom threshold and now glow instead of clipping to flat white.
 *
 * Pipeline:  scene -> HalfFloat buffer (linear, tone-mapping deferred)
 *            -> UnrealBloom (bright-pass + separable blur pyramid)
 *            -> OutputPass (ACES tone map + sRGB) -> screen.
 *
 * Two honest notes:
 *   - Bloom is OFF on the Low preset (software GL / weak GPUs) and ON for
 *     Medium/High, so the cheapest tier never pays for a full-screen pass.
 *   - Because the scene now renders into a target before the final copy, the
 *     renderer's per-frame draw-call counter would otherwise be left holding
 *     the *last* pass's numbers. App sets `renderer.info.autoReset = false`
 *     and resets it once per frame so `renderInfo.calls` still reports the
 *     scene's real draw calls (see app.js frame()).
 */
export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = false;
    this._pr = 1;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    // Half-resolution bloom by default: the blur is low-frequency, so paying
    // full screen res for it is wasted fill-rate on integrated GPUs.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.6, 0.8);
    this.composer.addPass(this.bloom);

    // Tone map + colour-space conversion happen here (and only here) while
    // post is active, so the look matches the direct-render path exactly.
    this.composer.addPass(new OutputPass());
  }

  /** Apply a quality preset's bloom settings (see QUALITY_PRESETS). */
  applyQuality(q) {
    this.enabled = !!q.bloom;
    if (!this.enabled) return;
    this.bloom.strength = q.bloomStrength ?? 0.6;
    this.bloom.radius = q.bloomRadius ?? 0.6;
    this.bloom.threshold = q.bloomThreshold ?? 0.8;
  }

  resize(width, height, pixelRatio) {
    this._pr = pixelRatio;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    // Bloom pyramid at 40% of the composer's device resolution: the blur is
    // low-frequency, so paying more than that for it is wasted fill-rate (the
    // measurement that matters here — every preset converged on the same frame
    // rate, which only happens when they are all paying the same per-pixel bill).
    const ew = Math.round(width * pixelRatio * 0.4);
    const eh = Math.round(height * pixelRatio * 0.4);
    this.bloom.setSize(ew, eh);
  }

  render() {
    this.composer.render();
  }

  dispose() {
    this.bloom.dispose?.();
    this.composer.dispose?.();
  }
}
