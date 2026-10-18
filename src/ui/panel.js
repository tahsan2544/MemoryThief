import { DEFAULTS, QUALITY_PRESETS, applyQuality, settings } from '../config/settings.js';
import { a11yPrefs, setA11y } from './accessibility.js';
import { getVolumes, resetVolumes, setVolumes } from '../audio/memoryAudio.js';

/**
 * Settings panel.
 *
 * Live controls (fog, rain, shadows, wet streets) apply immediately through
 * callbacks; anything that changes generated geometry triggers a full rebuild.
 */
export function initPanel(callbacks) {
  const panel = document.getElementById('panel');
  const $ = (id) => document.getElementById(id);

  const seedInput = $('set-seed');
  const scaleSel = $('set-scale');
  const qualitySel = $('set-quality');
  const res = $('set-res');
  const resOut = $('out-res');
  const density = $('set-density');
  const densityOut = $('out-density');
  const fog = $('set-fog');
  const fogOut = $('out-fog');
  const rain = $('set-rain');
  const shadows = $('set-shadows');
  const wet = $('set-wet');
  const sens = $('set-sens');
  const sensOut = $('out-sens');
  const dist = $('set-dist');
  const distOut = $('out-dist');
  const invert = $('set-invert');
  const audio = $('set-audio');
  const volMaster = $('set-vol-master');
  const volMasterOut = $('out-vol-master');
  const volAmbience = $('set-vol-ambience');
  const volAmbienceOut = $('out-vol-ambience');
  const volEffects = $('set-vol-effects');
  const volEffectsOut = $('out-vol-effects');
  const uiScale = $('set-uiscale');
  const flicker = $('set-flicker');
  const reduceFx = $('set-reducefx');
  const contrast = $('set-contrast');

  function syncFromSettings() {
    seedInput.value = settings.seed;
    scaleSel.value = String(settings.grid);
    qualitySel.value = settings.quality;
    if (res) res.value = String(settings.renderScale);
    if (resOut) resOut.textContent = `${Math.round(settings.renderScale * 100)}%`;
    density.value = String(settings.density);
    densityOut.textContent = `${Number(settings.density).toFixed(2)}×`;
    fog.value = String(settings.fogFar);
    fogOut.textContent = `${settings.fogFar} m`;
    rain.checked = settings.rain;
    shadows.checked = settings.shadows;
    wet.checked = settings.wet;
    if (sens) sens.value = String(settings.sensitivity);
    if (sensOut) sensOut.textContent = `${Number(settings.sensitivity).toFixed(2)}×`;
    if (dist) dist.value = String(settings.camDistance);
    if (distOut) distOut.textContent = `${Number(settings.camDistance).toFixed(1)} m`;
    if (invert) invert.checked = !!settings.invertY;
    if (audio) audio.checked = !!settings.audio;
    // audio volumes live in their own storage (mt.audio.v1)
    syncVolumes();
    // accessibility preferences live in their own storage (mt.a11y.v1)
    const a11y = a11yPrefs();
    if (uiScale) uiScale.value = String(a11y.scale);
    if (flicker) flicker.checked = !!a11y.reduceFlicker;
    if (reduceFx) reduceFx.checked = !!a11y.reduceFx;
    if (contrast) contrast.checked = !!a11y.highContrast;
  }

  function syncVolumes() {
    const v = getVolumes();
    if (volMaster) volMaster.value = String(Math.round(v.master * 100));
    if (volMasterOut) volMasterOut.textContent = `${Math.round(v.master * 100)}%`;
    if (volAmbience) volAmbience.value = String(Math.round(v.ambience * 100));
    if (volAmbienceOut) volAmbienceOut.textContent = `${Math.round(v.ambience * 100)}%`;
    if (volEffects) volEffects.value = String(Math.round(v.effects * 100));
    if (volEffectsOut) volEffectsOut.textContent = `${Math.round(v.effects * 100)}%`;
  }

  function open(v = true) {
    panel.classList.toggle('hidden', !v);
  }
  function toggle() {
    panel.classList.toggle('hidden');
  }
  function isOpen() {
    return !panel.classList.contains('hidden');
  }

  $('panel-close').addEventListener('click', () => open(false));

  $('set-random').addEventListener('click', () => {
    seedInput.value = randomSeed();
  });

  density.addEventListener('input', () => {
    densityOut.textContent = `${Number(density.value).toFixed(2)}×`;
  });

  // render scale is live (like fog): it resizes the drawing buffer, it does not
  // touch geometry, so there is nothing to rebuild and no reason to wait for Apply
  res?.addEventListener('input', () => {
    settings.renderScale = Number(res.value);
    resOut.textContent = `${Math.round(settings.renderScale * 100)}%`;
    callbacks.onRenderScale?.(settings.renderScale);
  });

  fog.addEventListener('input', () => {
    settings.fogFar = Number(fog.value);
    fogOut.textContent = `${settings.fogFar} m`;
    applyQuality();
    callbacks.onFog?.(settings.fogFar);
  });

  rain.addEventListener('change', () => {
    settings.rain = rain.checked;
    callbacks.onRain?.(settings.rain);
  });

  shadows.addEventListener('change', () => {
    settings.shadows = shadows.checked;
    callbacks.onShadows?.(settings.shadows);
  });

  wet.addEventListener('change', () => {
    settings.wet = wet.checked;
    callbacks.onWet?.(settings.wet);
  });

  qualitySel.addEventListener('change', () => {
    settings.quality = qualitySel.value;
    applyQuality();
    callbacks.onQuality?.(settings.quality, QUALITY_PRESETS[settings.quality]);
  });

  // control settings are live — no world rebuild, no callbacks needed
  sens?.addEventListener('input', () => {
    settings.sensitivity = Number(sens.value);
    if (sensOut) sensOut.textContent = `${settings.sensitivity.toFixed(2)}×`;
  });
  dist?.addEventListener('input', () => {
    settings.camDistance = Number(dist.value);
    if (distOut) distOut.textContent = `${settings.camDistance.toFixed(1)} m`;
  });
  invert?.addEventListener('change', () => {
    settings.invertY = invert.checked;
  });
  audio?.addEventListener('change', () => {
    settings.audio = audio.checked;
    callbacks.onAudio?.(settings.audio);
  });

  // audio volumes apply instantly and persist on their own key (mt.audio.v1)
  volMaster?.addEventListener('input', () => {
    setVolumes({ master: Number(volMaster.value) / 100 });
    syncVolumes();
  });
  volAmbience?.addEventListener('input', () => {
    setVolumes({ ambience: Number(volAmbience.value) / 100 });
    syncVolumes();
  });
  volEffects?.addEventListener('input', () => {
    setVolumes({ effects: Number(volEffects.value) / 100 });
    syncVolumes();
  });

  // accessibility options apply immediately and persist on their own key
  uiScale?.addEventListener('change', () => setA11y({ scale: Number(uiScale.value) }));
  flicker?.addEventListener('change', () => setA11y({ reduceFlicker: flicker.checked }));
  reduceFx?.addEventListener('change', () => setA11y({ reduceFx: reduceFx.checked }));
  contrast?.addEventListener('change', () => setA11y({ highContrast: contrast.checked }));

  $('set-apply').addEventListener('click', () => {
    settings.seed = seedInput.value.trim() || DEFAULTS.seed;
    settings.grid = Number(scaleSel.value);
    settings.density = Number(density.value);
    settings.fogFar = Number(fog.value);
    settings.rain = rain.checked;
    settings.shadows = shadows.checked;
    settings.wet = wet.checked;
    applyQuality();
    callbacks.onRebuild?.();
  });

  $('set-defaults').addEventListener('click', () => {
    Object.assign(settings, DEFAULTS);
    applyQuality();
    syncFromSettings();
    callbacks.onFog?.(settings.fogFar);
    callbacks.onRain?.(settings.rain);
    callbacks.onShadows?.(settings.shadows);
    callbacks.onWet?.(settings.wet);
    callbacks.onQuality?.(settings.quality, QUALITY_PRESETS[settings.quality]);
    callbacks.onRenderScale?.(settings.renderScale);
  });

  syncFromSettings();

  return { open, toggle, isOpen, syncFromSettings };
}

function randomSeed() {
  const syllables = ['eidolon', 'glass', 'flood', 'verdant', 'archive', 'echo', 'vault', 'signal', 'hollow', 'lucid'];
  const a = syllables[Math.floor(Math.random() * syllables.length)];
  const b = syllables[Math.floor(Math.random() * syllables.length)];
  return `${a}-${b}-${Math.floor(Math.random() * 900 + 100)}`;
}
