import { compactRp } from '../core/utils.js';
export const METRICS = {
  omset:      { label:'Omset',         fmt:'rp',  calc: r => r.tt === 'F' ? r.amount : -r.amount },
  grossF:     { label:'Gross Bruto',   fmt:'rp',  calc: r => r.tt === 'F' ? r.amount : 0 },
  grossR:     { label:'Return',        fmt:'rp',  calc: r => r.tt === 'R' ? r.amount : 0 },
  qty:        { label:'Qty PCS',       fmt:'int', calc: r => r.netQty || 0 },
  qtyCarton:  { label:'Qty Karton',    fmt:'dec', calc: r => isFinite(r.netCarton) ? r.netCarton : 0 },
  oa:         { label:'Outlet Aktif',  fmt:'int', aggMode:'distinct', key: r => r.tt === 'F' ? r.outletKey : null },
  invoices:   { label:'Faktur',        fmt:'int', aggMode:'distinct', key: r => r.tt === 'F' ? r.invoice : null },
  lines:      { label:'Item (rows)',   fmt:'int', aggMode:'count' },
  avgIpt: {
    label: 'Item/Trx (avg)', fmt: 'dec', aggMode: 'custom',
    agg: rows => {
      const days = new Map();
      for(const r of rows){
        if(r.tt !== 'F') continue;
        let d = days.get(r.day);
        if(!d){ d = { lines: 0, invoices: new Set() }; days.set(r.day, d); }
        d.lines++; d.invoices.add(r.invoice);
      }
      let sumIpt = 0, hk = 0;
      for(const d of days.values()){ if(d.invoices.size > 0){ sumIpt += d.lines / d.invoices.size; hk++; } }
      return hk > 0 ? sumIpt / hk : 0;
    },
  },
};
export function formatMetric(value, metric){
  const m = METRICS[metric];
  if(!m) return String(value);
  if(m.fmt === 'rp') return compactRp(value);
  if(m.fmt === 'dec') return Number(value).toFixed(1);
  return Number(value).toLocaleString('id-ID');
}