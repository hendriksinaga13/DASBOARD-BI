/* ═══════════════════════════════════════════════════════════════
   M245 DATASOURCE — Single Source of Truth
   ═══════════════════════════════════════════════════════════════ */

import { store } from './store.js';
import { selectFiltered } from './selectors.js';

/* ── 1. DEFINISI KPI STANDAR (Semua punya type: 'auto' / 'manual') ─── */
export const KPI_DEFS = [
  { id: 'omset', label: 'Total Omset', type: 'auto', format: 'rp', hasTarget: true,
    calc: (rows) => rows.reduce((s, r) => s + (r.tt === 'F' ? (Number(r.amount)||0) : -(Number(r.amount)||0)), 0) },

  { id: 'gross', label: 'Gross Bruto', type: 'auto', format: 'rp', hasTarget: false,
    calc: (rows) => rows.filter(r => r.tt === 'F').reduce((s, r) => s + (Number(r.amount)||0), 0) },

  { id: 'ec', label: 'Efektif Call (EC)', type: 'auto', format: 'num', hasTarget: true,
    calc: (rows) => {
      const daily = new Map();
      rows.filter(r => r.tt === 'F').forEach(r => {
        if (!daily.has(r.day)) daily.set(r.day, new Set());
        daily.get(r.day).add(r.outletKey);
      });
      let total = 0; daily.forEach(s => total += s.size);
      return daily.size > 0 ? total / daily.size : 0;
    }
  },

  { id: 'ipt', label: 'Item per Transaksi (IPT)', type: 'auto', format: 'num', hasTarget: true,
    calc: (rows) => {
      const fRows = rows.filter(r => r.tt === 'F');
      const inv = new Set(fRows.map(r => r.invoice)).size;
      return inv > 0 ? fRows.length / inv : 0;
    }
  },

  { id: 'oa', label: 'Outlet Aktif (OA)', type: 'auto', format: 'num', hasTarget: false,
    calc: (rows) => new Set(rows.filter(r => r.tt === 'F').map(r => r.outletKey)).size },

  { id: 'faktur', label: 'Jumlah Faktur', type: 'auto', format: 'num', hasTarget: false,
    calc: (rows) => new Set(rows.filter(r => r.tt === 'F').map(r => r.invoice)).size },

  { id: 'sku', label: 'SKU Terjual', type: 'auto', format: 'num', hasTarget: false,
    calc: (rows) => new Set(rows.filter(r => r.tt === 'F').map(r => r.pcode)).size },

  { id: 'qty', label: 'Qty Pcs', type: 'auto', format: 'num', hasTarget: false,
    calc: (rows) => rows.filter(r => r.tt === 'F').reduce((s, r) => s + (Number(r.netQty)||0), 0) },

  { id: 'carton', label: 'Qty Karton', type: 'auto', format: 'num', hasTarget: false,
    calc: (rows) => rows.filter(r => r.tt === 'F').reduce((s, r) => s + (Number(r.netCarton)||0), 0) },

  { id: 'retRate', label: 'Return Rate', type: 'auto', format: 'pct', hasTarget: false, lowerBetter: true,
    calc: (rows) => {
      const gross = rows.filter(r => r.tt === 'F').reduce((s, r) => s + (Number(r.amount)||0), 0);
      const ret = rows.filter(r => r.tt === 'R').reduce((s, r) => s + (Number(r.amount)||0), 0);
      return gross > 0 ? (ret / gross) * 100 : 0;
    }
  },

  { id: 'mustsku', label: 'Must SKU Coverage (%)', type: 'auto', format: 'pct', hasTarget: false,
    calc: (rows) => {
      try {
        const cfgStr = localStorage.getItem('m245.musthave');
        if (!cfgStr) return 0;
        const cfg = JSON.parse(cfgStr);
        const allPcodes = new Set();
        for (const t in cfg.rulesByType) cfg.rulesByType[t].forEach(r => { if (r.type === 'sku') allPcodes.add(r.pcode); });
        if (allPcodes.size === 0) return 0;
        const soldPcodes = new Set(rows.filter(r => r.tt === 'F').map(r => r.pcode));
        let count = 0; allPcodes.forEach(pc => { if (soldPcodes.has(pc)) count++; });
        return (count / allPcodes.size) * 100;
      } catch(e) { return 0; }
    }
  },

  { id: 'hht', label: 'HHT (Manual)', type: 'manual', format: 'num', hasTarget: false },
  { id: 'vir', label: 'VIR (Manual)', type: 'manual', format: 'num', hasTarget: false },
];

/* ── 2. DATA ACCESS ───────────────────────────────────────── */
export const Data = {
  rows: (state = store.state) => selectFiltered(state) || [],
  rawRows: (state = store.state) => state.rows || [],
  outlets: (state = store.state) => state.outletMaster || new Map(),

  month: (state = store.state) => {
    if (state.targetMonth) return state.targetMonth;
    if (state.filters?.from) return state.filters.from.slice(0, 7);
    return state.rows?.[0]?.day?.slice(0, 7) || null;
  },

  targets: (state = store.state) => {
    const m = Data.month(state);
    return (m && state.targets?.[m]) || {};
  },

  manualKpi: (salesman, kpiId, state = store.state) => {
    const m = Data.month(state);
    if (!m) return 0;
    return parseFloat(localStorage.getItem(`m245.manKpi_${m}_${salesman}_${kpiId}`)) || 0;
  },

  setManualKpi: (salesman, kpiId, val, state = store.state) => {
    const m = Data.month(state);
    if (!m) return;
    localStorage.setItem(`m245.manKpi_${m}_${salesman}_${kpiId}`, parseFloat(val) || 0);
  }
};

/* ── 3. DYNAMIC KPI (Subrand = 2x 'b', Divisi) ──────────── */
export function buildDynamicKpis(state = store.state) {
  const rows = state.rows || [];
  const setSubbrand = new Set();
  const setDivisi = new Set();
  
  rows.forEach(r => {
    if (r.subbrand && r.subbrand !== '—') setSubbrand.add(r.subbrand);
    if (r.divisi && r.divisi !== '—') setDivisi.add(r.divisi);
  });

  const kpis = [];

  Array.from(setSubbrand).sort().forEach(subName => {
    kpis.push({
      id: `subrand_omset_${subName}`,
      label: `Omset ${subName}`,
      type: 'subrand',
      subbrandName: subName,
      format: 'rp',
      hasTarget: true,
      calc: (rws) => rws.reduce((s, r) =>
        r.subbrand === subName ? s + (r.tt === 'F' ? (Number(r.amount)||0) : -(Number(r.amount)||0)) : s, 0)
    });
  });

  Array.from(setDivisi).sort().forEach(divName => {
    kpis.push({
      id: `divisi_omset_${divName}`,
      label: `Omset Divisi ${divName}`,
      type: 'divisi',
      divisiName: divName,
      format: 'rp',
      hasTarget: true,
      calc: (rws) => rws.reduce((s, r) =>
        r.divisi === divName ? s + (r.tt === 'F' ? (Number(r.amount)||0) : -(Number(r.amount)||0)) : s, 0)
    });
  });

  return kpis;
}

export function getAllKpis(state = store.state) {
  return [...KPI_DEFS, ...buildDynamicKpis(state)];
}

export function calcKpi(rows, kpiId, state = store.state) {
  const kpi = getAllKpis(state).find(k => k.id === kpiId);
  if (!kpi || !kpi.calc) return 0;
  return kpi.calc(rows);
}

/* ── 4. TARGET LOOKUP (perbaiki b's) ──────────────────────── */
function findKey(obj, key) {
  if (!obj) return 0;
  if (obj[key] !== undefined) return obj[key];
  const k = Object.keys(obj).find(x => x.toLowerCase() === key.toLowerCase());
  return k ? obj[k] : 0;
}

export function getTarget(kpiId, salesman, state = store.state) {
  const targets = Data.targets(state);
  if (!targets) return 0;

  if (kpiId.startsWith('subrand_omset_')) {
    const subName = kpiId.replace('subrand_omset_', '');
    // Note: subbrand (dua b) sesuai struktur target.js
    return targets.salesman?.[salesman]?.subbrand?.[subName]?.omset
      || targets.global?.subbrand?.[subName] || 0;
  }

  if (kpiId.startsWith('divisi_omset_')) {
    const divName = kpiId.replace('divisi_omset_', '');
    return targets.salesman?.[salesman]?.divisi?.[divName]?.omset
      || targets.global?.divisi?.[divName] || 0;
  }

  const sm = targets.salesman?.[salesman];
  if (sm) {
    const val = findKey(sm.all?.ALL, kpiId);
    if (val > 0) return val;

    if (kpiId === 'omset') {
      let sum = 0;
      ['divisi', 'subbrand', 'produk'].forEach(lvl => {
        if (sm[lvl]) Object.values(sm[lvl]).forEach(item => sum += (item?.omset || 0));
      });
      if (sum > 0) return sum;
    }
  }

  if (kpiId === 'omset') return targets.global?.all || 0;
  return 0;
}

/* ── 5. NAMESPACE DS ──────────────────────────────────────── */
export const DS = {
  Data, KPI_DEFS, getAllKpis, calcKpi, getTarget, buildDynamicKpis
};