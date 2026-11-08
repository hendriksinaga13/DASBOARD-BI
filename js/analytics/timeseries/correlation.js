// analytics/timeseries/correlation.js
import { pearson } from '../stats-advanced.js';

export function crossCorrelation(seriesA, seriesB, maxLag = 7) {
  const results = [];
  
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let a = seriesA;
    let b = seriesB;
    
    if (lag > 0) {
      a = seriesA.slice(lag);
      b = seriesB.slice(0, -lag);
    } else if (lag < 0) {
      a = seriesA.slice(0, lag);
      b = seriesB.slice(-lag);
    }
    
    const minLength = Math.min(a.length, b.length);
    if (minLength < 3) continue;
    
    const corr = pearson(a.slice(0, minLength), b.slice(0, minLength));
    results.push({ lag, correlation: corr });
  }
  
  // Cari lag dengan korelasi tertinggi
  results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  return results[0] || { lag: 0, correlation: 0 };
}