// analytics/timeseries/pattern.js
import { mean } from '../stats-advanced.js';

/**
 * Analisis Pola Hari Kerja (Senin - Minggu)
 */
export function getDayOfWeekPattern(dailySeries) {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const buckets = [[], [], [], [], [], [], []];

  for (const item of dailySeries) {
    const d = new Date(item.day + 'T00:00:00');
    buckets[d.getDay()].push(item.value);
  }

  return buckets.map((vals, index) => ({
    dayName: days[index],
    avgValue: mean(vals),
    totalValue: vals.reduce((a,b)=>a+b, 0),
    count: vals.length
  })).sort((a,b) => b.avgValue - a.avgValue); // Urutkan dari hari paling laku
}