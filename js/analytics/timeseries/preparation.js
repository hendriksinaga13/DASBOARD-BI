// analytics/timeseries/preparation.js
import { mean } from '../stats-advanced.js';

/**
 * Mengubah data baris menjadi deret waktu harian.
 * Dilengkapi "Gap Filling" (mengisi tanggal kosong dengan 0).
 */
export function toDailySeries(rows){
  const m = new Map();
  let minDay = null, maxDay = null;

  for(const r of rows){
    if(r.tt !== 'F' || !r.day) continue;
    m.set(r.day, (m.get(r.day) || 0) + r.amount);
    if (!minDay || r.day < minDay) minDay = r.day;
    if (!maxDay || r.day > maxDay) maxDay = r.day;
  }

  if (!minDay) return [];

  const result = [];
  let current = new Date(minDay + 'T00:00:00');
  const end = new Date(maxDay + 'T00:00:00');

  while (current <= end) {
    const dStr = current.toISOString().slice(0, 10);
    result.push({ day: dStr, value: m.get(dStr) || 0 });
    current.setDate(current.getDate() + 1);
  }

  return result;
}

/**
 * Menghitung Moving Average (Rata-rata bergerak)
 */
export function movingAvg(values, window=7){
  const out = [];
  for(let i=0;i<values.length;i++){
    const lo = Math.max(0, i-window+1);
    const slice = values.slice(lo, i+1);
    out.push(slice.reduce((a,b)=>a+b, 0)/slice.length);
  }
  return out;
}