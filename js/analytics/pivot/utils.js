import { compactRp, NF1 } from '../../core/utils.js';
import { store } from '../../core/store.js';
import { BASE_MEASURE_OPTS, getCustomMeasures } from './config.js';

export function MOpt(k) {
  if (!k) return null;
  const base = BASE_MEASURE_OPTS.find(o => o.k === k);
  if (base) return base;
  const cm = getCustomMeasures().find(o => o.k === k);
  if (cm) return { ...cm, type: 'ratio', format: cm.format || 'dec' };
  return null;
}

export function dimFn(dim){
  const map = {
    salesman: r => r.salesman, product: r => r.product, outlet: r => r.outlet,
    divisi: r => r.divisi, subbrand: r => r.subbrand, kabupaten: r => r.kabupaten,
    kecamatan: r => r.kecamatan, rayon: r => r.rayon, channel: r => r.channel,
    tipe: r => r.tipe, periode: r => r.periode, week: r => r.week,
  };
  return map[dim] || (r => r.salesman);
}

export function formatVal(v, mKey) {
  if (v == null || isNaN(v)) v = 0;
  const m = MOpt(mKey);
  if (!m) return String(v);
  if (m.type === 'ratio') return Number(v).toFixed(2);
  return m.format === 'rp' ? compactRp(v) : NF1.format(v);
}

export function formatByPctMode(rawVal, mKey, denom, pctMode) {
  if (pctMode === 'raw' || pctMode == null) return { text: formatVal(rawVal, mKey), isPct: false };
  if (!denom || denom === 0) return { text: '—', isPct: true };
  const p = (rawVal / denom) * 100;
  return { text: p.toFixed(1) + '%', isPct: true };
}

export function computePercentile(values, p) {
  const sorted = values.filter(v => typeof v === 'number' && isFinite(v)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

export function getTargetForRow(state, rowLabel, config) {
  try {
    const activeMonth = state.filters.from ? state.filters.from.slice(0, 7) : (state.rows[0]?.day?.slice(0, 7));
    if (!activeMonth || !store.state.targets?.[activeMonth]) return 0;
    const t = store.state.targets[activeMonth];
    const topDim = config.rowLevels[0];
    if (topDim === 'salesman') return t.salesman?.[rowLabel]?.all?.ALL?.omset || 0;
    if (topDim === 'divisi') return t.global?.divisi?.[rowLabel] || 0;
    if (topDim === 'subbrand') return t.global?.subbrand?.[rowLabel] || 0;
    if (topDim === 'produk' || topDim === 'product') return t.global?.produk?.[rowLabel] || 0;
  } catch(e) {}
  return 0;
}