// analytics/timeseries/target-optimizer.js
import { mean, stdev } from '../stats-advanced.js';

/**
 * Menghitung target harian yang dibutuhkan untuk mencapai goal akhir.
 */
export function calculateRequiredDailyTarget(historicalDailyValues, targetMonthly, daysElapsed, totalDaysInMonth) {
  if (historicalDailyValues.length === 0) return null;

  const currentTotal = historicalDailyValues.reduce((a, b) => a + b, 0);
  const remainingDays = Math.max(0, totalDaysInMonth - daysElapsed);
  const remainingTarget = targetMonthly - currentTotal;

  if (remainingTarget <= 0) {
    return { status: 'ACHIEVED', requiredDaily: 0, message: 'Target bulan ini sudah tercapai!' };
  }

  if (remainingDays === 0) {
    return { status: 'FAILED', requiredDaily: 0, message: 'Waktu habis, target tidak tercapai.' };
  }

  const requiredDaily = remainingTarget / remainingDays;
  const avgHistorical = mean(historicalDailyValues);
  const sdHistorical = stdev(historicalDailyValues);

  // Hitung Z-score untuk melihat seberapa "sulit" target ini secara statistik
  const zScore = sdHistorical === 0 ? 0 : (requiredDaily - avgHistorical) / sdHistorical;
  
  let difficulty = 'Sangat Sulit';
  if (zScore < 1) difficulty = 'Sangat Mudah';
  else if (zScore < 2) difficulty = 'Menengah';
  else if (zScore < 3) difficulty = 'Sulit';

  return {
    status: 'ON_TRACK',
    currentTotal,
    remainingTarget,
    remainingDays,
    requiredDaily,
    avgHistorical,
    difficulty,
    message: `Butuh ${Math.ceil(requiredDaily).toLocaleString('id-ID')}/hari. (Kesulitan: ${difficulty})`
  };
}