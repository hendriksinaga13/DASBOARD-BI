// analytics/timeseries/anomaly.js
import { mean, stdev, median, quantile } from '../stats-advanced.js';

export function detectAnomalies(dailySeries) {
  const values = dailySeries.map(d => d.value);
  if (values.length < 7) return [];

  const m = mean(values);
  const sd = stdev(values);
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const iqr = q3 - q1;
  
  const anomalies = [];
  
  dailySeries.forEach((d, i) => {
    const z = sd === 0 ? 0 : (d.value - m) / sd;
    
    // Deteksi: Nilai di luar 2 Standar Deviasi ATAU di luar pagar IQR
    const isSpike = z > 2.5;
    const isDrop  = z < -2.5 || (d.value < (q1 - 1.5 * iqr) && d.value > 0);
    
    if (isSpike || isDrop) {
      anomalies.push({
        day: d.day,
        value: d.value,
        type: isSpike ? 'SPIKE (Lonjakan)' : 'DROP (Anjlok)',
        zScore: z.toFixed(2),
        severity: Math.abs(z) > 3 ? 'Critical' : 'High'
      });
    }
  });
  
  return anomalies;
}