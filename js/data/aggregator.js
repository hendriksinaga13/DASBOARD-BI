import { METRICS } from '../metrics/registry.js';
export function agg(rows){
  const result = { lines: rows.length };
  for(const key in METRICS){
    const m = METRICS[key];
    if(m.aggMode === 'distinct'){
      const set = new Set();
      for(const r of rows){ const k = m.key(r); if(k != null) set.add(k); }
      result[key] = set.size;
    } else if(m.aggMode === 'count'){
      result[key] = rows.length;
    } else if(m.aggMode === 'custom'){
      result[key] = m.agg(rows);
    } else {
      result[key] = rows.reduce((s, r) => s + (m.calc(r) || 0), 0);
    }
  }
  const outlets = new Set(rows.map(r => r.outletKey));
  const activeOutlets = new Set(rows.filter(r => r.tt === 'F').map(r => r.outletKey));
  result.oa = activeOutlets.size;
  result.allOutlets = outlets.size;
  result.avgPerOutlet = result.oa > 0 ? result.omset / result.oa : 0;
  result.retRate = result.grossF > 0 ? (result.grossR / result.grossF) * 100 : 0;
  return result;
}
export function groupBy(rows, keyFn, metric){
  const map = new Map();
  for(const r of rows){
    const k = keyFn(r);
    if(k == null || k === '') continue;
    if(!map.has(k)) map.set(k, { key: k, label: k, rows: [] });
    map.get(k).rows.push(r);
  }
  const m = METRICS[metric];
  for(const g of map.values()){
    if(m.aggMode === 'distinct'){
      const set = new Set();
      for(const r of g.rows){ const k = m.key(r); if(k != null) set.add(k); }
      g.value = set.size;
    } else if(m.aggMode === 'count'){
      g.value = g.rows.length;
    } else if(m.aggMode === 'custom'){
      g.value = m.agg(g.rows);
    } else {
      g.value = g.rows.reduce((s, r) => s + (m.calc(r) || 0), 0);
    }
    g.count = g.rows.length;
  }
  return Array.from(map.values());
}