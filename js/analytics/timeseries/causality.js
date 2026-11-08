// analytics/timeseries/causality.js
import { pearson } from '../stats-advanced.js';

/**
 * Mencari lag (jeda waktu) terbaik antara metrik A dan metrik B.
 * Contoh: A = Kunjungan (EC), B = Omset.
 */
export function findOptimalLag(seriesA, seriesB, maxLag = 7) {
  if (seriesA.length !== seriesB.length || seriesA.length < maxLag * 2) return null;

  let bestLag = 0;
  let bestCorr = -1;

  for (let lag = 0; lag <= maxLag; lag++) {
    const a = seriesA.slice(0, seriesA.length - lag);
    const b = seriesB.slice(lag);
    
    const corr = pearson(a, b);
    if (Math.abs(corr) > bestCorr) {
      bestCorr = Math.abs(corr);
      bestLag = lag;
    }
  }

  return {
    lag: bestLag,
    correlation: bestCorr,
    interpretation: bestLag === 0 
      ? "Bergerak bersamaan di hari yang sama." 
      : `Metrik A mempengaruhi Metrik B dalam ${bestLag} hari ke depan.`
  };
}