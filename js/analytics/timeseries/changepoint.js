// analytics/timeseries/changepoint.js
import { mean, stdev } from '../stats-advanced.js';

/**
 * Mendeteksi tanggal spesifik di mana terjadi pergeseran rata-rata (Regime Shift).
 */
export function detectChangePoint(dailySeries) {
  const values = dailySeries.map(d => d.value);
  if (values.length < 14) return null;

  const m = mean(values);
  const sd = stdev(values);
  if (sd === 0) return null;

  let cusumPos = 0, cusumNeg = 0;
  let changePoints = [];
  
  // Threshold standar untuk mendeteksi perubahan signifikan
  const threshold = 4 * sd; 

  for (let i = 0; i < values.length; i++) {
    const z = (values[i] - m) / sd;
    cusumPos = Math.max(0, cusumPos + z - 0.5);
    cusumNeg = Math.min(0, cusumNeg + z + 0.5);

    if (cusumPos > threshold || cusumNeg < -threshold) {
      changePoints.push({
        day: dailySeries[i].day,
        value: values[i],
        type: cusumPos > threshold ? 'SHIFT_UP' : 'SHIFT_DOWN',
        severity: Math.abs(z).toFixed(2)
      });
      // Reset setelah terdeteksi
      cusumPos = 0;
      cusumNeg = 0;
    }
  }

  return changePoints.length > 0 ? changePoints[changePoints.length - 1] : null;
}