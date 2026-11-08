/* ================================================================== */
/* PIVOT STORAGE — LocalStorage handlers                              */
/* ================================================================== */
import { store } from '../../core/store.js';
import { PRESET_KEY, CUSTOM_MEASURE_KEY } from './config.js';

let _saveTimer = null;

export function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      if (Array.isArray(store.state.ui?.pivotList)) {
        localStorage.setItem(PRESET_KEY, JSON.stringify(store.state.ui.pivotList));
      }
    } catch (e) { console.warn('[Pivot] Save failed:', e); }
  }, 400);
}

export function loadPresetsOnce() {
  if (store.state.ui._pivotLoaded) return;
  store.state.ui._pivotLoaded = true;
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      store.state.ui.pivotList = parsed;
      console.info('[Pivot] Loaded', parsed.length, 'presets');
    }
  } catch (e) { console.warn('[Pivot] Load failed:', e); }
}

export function saveCustomMeasures() {
  try { localStorage.setItem(CUSTOM_MEASURE_KEY, JSON.stringify(store.state.ui.pivotCustomMeasures || [])); } catch {}
}