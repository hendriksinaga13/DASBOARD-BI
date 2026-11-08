// metrics/registry.js
import { compactRp } from '../core/utils.js';
// ✅ PERBAIKAN JALUR: Mengarah ke folder analytics
import { mean, median, stdev } from '../analytics/stats-advanced.js'; 

export const getRowOmset = (r) => r.tt === 'F' ? (Number(r.amount) || 0) : -(Number(r.amount) || 0);
export const getSumOmset = (rows) => rows.reduce((s, r) => s + getRowOmset(r), 0);

export const METRICS = {
  // --- A. METRIK DASAR ---
  omset:      { label:'Omset',         fmt:'rp',  calc: getRowOmset },
  grossF:     { label:'Gross Bruto',   fmt:'rp',  calc: r => r.tt === 'F' ? (Number(r.amount) || 0) : 0 },
  grossR:     { label:'Return',        fmt:'rp',  calc: r => r.tt === 'R' ? (Number(r.amount) || 0) : 0 },
  qty:        { label:'Qty PCS',       fmt:'int', calc: r => r.netQty || 0 },
  qtyCarton:  { label:'Qty Karton',    fmt:'dec', calc: r => isFinite(r.netCarton) ? r.netCarton : 0 },
  
  // --- B. METRIK DISTINCT / COUNT ---
  oa:         { label:'Outlet Aktif',  fmt:'int', aggMode:'distinct', key: r => r.tt === 'F' ? r.outletKey : null },
  allOutlets: { label:'Total Outlet',  fmt:'int', aggMode:'distinct', key: r => r.outletKey },
  invoices:   { label:'Faktur',        fmt:'int', aggMode:'distinct', key: r => r.tt === 'F' ? r.invoice : null },
  lines:      { label:'Item (rows)',   fmt:'int', aggMode:'count' },
  hkDays:     { label:'Hari Kerja',    fmt:'int', aggMode:'distinct', key: r => r.tt === 'F' ? r.day : null },

  // --- C. METRIK KUSTOM ---
  efektifCall: {
    label: 'Efektif Call', fmt: 'dec', aggMode: 'custom',
    agg: (rows) => {
      const dailyOutlets = new Map();
      for(const r of rows){
        if(r.tt === 'F' && r.amount > 0) {
          if(!dailyOutlets.has(r.day)) dailyOutlets.set(r.day, new Set());
          dailyOutlets.get(r.day).add(r.outletKey);
        }
      }
      let totalCalls = 0;
      for(const set of dailyOutlets.values()) totalCalls += set.size;
      return dailyOutlets.size > 0 ? totalCalls / dailyOutlets.size : 0;
    }
  },
  avgPerOutlet: {
    label: 'Avg Omset/Outlet', fmt: 'rp', aggMode: 'custom',
    agg: (rows) => {
      const omset = getSumOmset(rows);
      const oa = new Set(rows.filter(r => r.tt === 'F').map(r => r.outletKey)).size;
      return oa > 0 ? omset / oa : 0;
    }
  },
  retRate: {
    label: 'Return Rate (%)', fmt: 'pct', aggMode: 'custom',
    agg: (rows) => {
      const f = rows.reduce((s, r) => s + (r.tt === 'F' ? (Number(r.amount)||0) : 0), 0);
      const ret = rows.reduce((s, r) => s + (r.tt === 'R' ? (Number(r.amount)||0) : 0), 0);
      return f > 0 ? (ret / f) * 100 : 0;
    }
  },

  // --- D. METRIK STATISTIK BARU ---
  avgIpt: {
    label: 'Item/Trx (Avg)', fmt: 'dec', aggMode: 'custom',
    agg: (rows) => {
      const fRows = rows.filter(r => r.tt === 'F');
      const invoices = new Set(fRows.map(r => r.invoice));
      return invoices.size > 0 ? fRows.length / invoices.size : 0;
    }
  },
  medianTrx: {
    label: 'Median Nilai Trx', fmt: 'rp', aggMode: 'custom',
    agg: (rows) => {
      const amounts = rows.filter(r => r.tt === 'F').map(r => Number(r.amount) || 0);
      return median(amounts);
    }
  },
  stdDevTrx: {
    label: 'Standar Deviasi Trx', fmt: 'rp', aggMode: 'custom',
    agg: (rows) => {
      const amounts = rows.filter(r => r.tt === 'F').map(r => Number(r.amount) || 0);
      return stdev(amounts); 
    }
  }
};

export function formatMetric(value, metric){
  const m = METRICS[metric];
  if(!m) return String(value);
  
  if (m.fmt === 'pct') return Number(value).toFixed(1) + '%';
  if (m.fmt === 'rp') return compactRp(value);
  if (m.fmt === 'dec') return Number(value).toFixed(1);
  
  return Number(value).toLocaleString('id-ID');
}