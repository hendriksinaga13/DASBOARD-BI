// data/aggregator.js
import { METRICS } from '../metrics/registry.js';

// ✅ HELPER: Satu fungsi untuk menghitung metrik apa pun
function computeMetric(m, rows) {
  if (!m) return 0;
  
  if (m.aggMode === 'distinct') {
    const set = new Set();
    for (const r of rows) { 
      const k = m.key(r); 
      if (k != null) set.add(k); 
    }
    return set.size;
  }
  
  if (m.aggMode === 'count') return rows.length;
  if (m.aggMode === 'custom') return m.agg(rows);
  
  // Default: Sum (menggunakan calc per baris)
  return rows.reduce((s, r) => s + (m.calc(r) || 0), 0);
}

export function agg(rows){
  const result = { lines: rows.length };
  
  // Hitung semua metrik dari registry secara otomatis
  for(const key in METRICS){
    result[key] = computeMetric(METRICS[key], rows);
  }
  
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
    g.value = computeMetric(m, g.rows);
    g.count = g.rows.length;
  }
  
  return Array.from(map.values());
}