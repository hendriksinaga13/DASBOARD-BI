/* ================================================================== */
/* PIVOT CONFIG — Constants, default config, normalization            */
/* ================================================================== */
import { store } from '../../core/store.js';
import { applyModuleDefaults } from './modules/index.js';

export const DIM_OPTS = [
  { k: 'salesman', l: 'Salesman' }, { k: 'product', l: 'Produk' }, { k: 'outlet', l: 'Outlet' },
  { k: 'divisi', l: 'Divisi' }, { k: 'subbrand', l: 'Subbrand' }, { k: 'kabupaten', l: 'Kabupaten' },
  { k: 'kecamatan', l: 'Kecamatan' }, { k: 'rayon', l: 'Rayon' }, { k: 'channel', l: 'Channel' },
  { k: 'tipe', l: 'Tipe Outlet' }, { k: 'periode', l: 'Periode' }, { k: 'week', l: 'Week' },
];

export const BASE_MEASURE_OPTS = [
  { k: 'omset', l: 'Omset', type: 'sum', field: 'amount', isReturn: true, format: 'rp' },
  { k: 'qty', l: 'Qty', type: 'sum', field: 'netQty', format: 'num' },
  { k: 'carton', l: 'Karton', type: 'sum', field: 'netCarton', format: 'num' },
  { k: 'invoice', l: 'Faktur', type: 'count', field: 'invoice', format: 'num' },
  { k: 'outlet', l: 'Outlet', type: 'distinct', field: 'outletKey', format: 'num' },
  { k: 'sku', l: 'SKU', type: 'distinct', field: 'pcode', format: 'num' },
  { k: 'avg', l: 'Avg/Faktur', type: 'avg', num: 'amount', den: 'invoice', format: 'rp' }
];

export const PRESET_KEY = 'm245.pivots';
export const CUSTOM_MEASURE_KEY = 'm245.pivotCustomMeasures';
export const drillMemory = {};

export function getCustomMeasures() {
  if (!store.state.ui.pivotCustomMeasures) {
    try {
      const raw = localStorage.getItem(CUSTOM_MEASURE_KEY);
      store.state.ui.pivotCustomMeasures = raw ? JSON.parse(raw) : [];
    } catch { store.state.ui.pivotCustomMeasures = []; }
  }
  return store.state.ui.pivotCustomMeasures || [];
}

export function getAllMeasureOpts() {
  return [...BASE_MEASURE_OPTS, ...getCustomMeasures().map(cm => ({ ...cm, type: 'ratio', format: cm.format || 'dec' }))];
}

export function defaultConfig() {
  const base = {
    id: 'pv-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    title: 'Tabel Analisis',
    rows: 'salesman', rowLevels: ['salesman'], cols: [],
    measures: ['omset', 'invoice'], sort: 'omset_desc', showTarget: true,
    visualMode: 'table', zoom: 100, density: 'compact', border: 'thin',
    activeRowFilter: [], searchText: '', topN: 0,
    sortBy: null, sortDir: 'desc',
    isCollapsed: false, isToolbarOpen: false,
  };
  return applyModuleDefaults(base);
}

export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Config bukan object');
  const c = { ...raw };

  if (typeof c.rows === 'string' && !c.rowLevels) c.rowLevels = [c.rows];
  if (!Array.isArray(c.rowLevels) || c.rowLevels.length === 0) c.rowLevels = ['salesman'];
  c.rowLevels = c.rowLevels.filter(k => DIM_OPTS.some(o => o.k === k)).slice(0, 2);
  if (c.rowLevels.length === 0) c.rowLevels = ['salesman'];
  c.rows = c.rowLevels[0];

  if (typeof c.cols === 'string') c.cols = c.cols ? [c.cols] : [];
  if (!Array.isArray(c.cols)) c.cols = [];
  c.cols = c.cols.filter(k => DIM_OPTS.some(o => o.k === k));

  if (c.measure && !c.measures) c.measures = [c.measure];
  if (!Array.isArray(c.measures) || c.measures.length === 0) c.measures = ['omset'];
  
  const validKeys = getAllMeasureOpts().map(o => o.k);
  c.measures = c.measures.filter(k => validKeys.includes(k));
  if (c.measures.length === 0) c.measures = ['omset'];

  if (!c.visualMode) c.visualMode = 'table';
  if (!c.zoom || c.zoom < 50 || c.zoom > 200) c.zoom = 100;
  if (!c.density) c.density = 'compact';
  if (!c.border) c.border = 'thin';
  if (!Array.isArray(c.activeRowFilter)) c.activeRowFilter = [];

  if (typeof c.searchText !== 'string') c.searchText = '';
  if (typeof c.topN !== 'number' || c.topN < 0) c.topN = 0;
  if (c.sortBy == null) c.sortBy = null;
  if (!c.sortDir) c.sortDir = 'desc';
  
  if (c.isCollapsed == null) c.isCollapsed = false;
  if (c.isToolbarOpen == null) c.isToolbarOpen = false;

  if (!c.id) c.id = 'pv-recovered-' + Date.now();
  if (!c.title) c.title = 'Tabel Analisis';

  return applyModuleDefaults(c);
}

export function getPivotList() {
  if (!store.state.ui.pivotList || !Array.isArray(store.state.ui.pivotList)) {
    store.state.ui.pivotList = [defaultConfig()];
  }
  const valid = [];
  for (const raw of store.state.ui.pivotList) {
    try { valid.push(normalizeConfig(raw)); }
    catch (err) { console.warn('[Pivot] Skip invalid:', err); }
  }
  if (valid.length === 0) valid.push(defaultConfig());
  store.state.ui.pivotList = valid;
  return valid;
}