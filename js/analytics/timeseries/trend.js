// analytics/timeseries/trend.js
import { mannKendall, autocorr, cusum, crossCorr } from '../stats-advanced.js';

/**
 * Uji signifikansi tren (Mann-Kendall)
 */
export function trendTest(values){
  const mk = mannKendall(values);
  let significance = 'none';
  if(Math.abs(mk.z) > 2.58) significance = mk.z > 0 ? 'strong-up' : 'strong-down';
  else if(Math.abs(mk.z) > 1.96) significance = mk.z > 0 ? 'up' : 'down';
  const interp = {
    'strong-up': 'Tren naik signifikan (α<0.01)',
    'up': 'Tren naik signifikan (α<0.05)',
    'strong-down': 'Tren turun signifikan (α<0.01)',
    'down': 'Tren turun signifikan (α<0.05)',
    'none': 'Tidak ada tren signifikan',
  }[significance];
  return { ...mk, significance, interpretation: interp };
}

/**
 * Deteksi perubahan pola drastis (Regime Shift)
 */
export function detectRegimes(values){
  return cusum(values);
}

/**
 * Deteksi memori data (Autocorrelation)
 */
export function persistence(values){
  return {
    lag1: autocorr(values, 1),
    lag7: autocorr(values, 7),
    lag14: autocorr(values, 14),
  };
}

/**
 * Deteksi lag antara 2 deret waktu
 */
export function leadLag(a, b, maxLag=7){
  return crossCorr(a, b, maxLag);
}