// analytics/timeseries/simulation.js
import { mean, stdev } from '../stats-advanced.js';

/**
 * Simulasi Monte Carlo untuk melihat probabilitas pencapaian target.
 * Menggunakan metode Box-Muller untuk menghasilkan angka acak distribusi normal.
 */
export function monteCarloSimulation(values, targetValue, iterations = 1000) {
  if (values.length < 5) return null;
  
  const mu = mean(values);
  const sigma = stdev(values);
  
  let successCount = 0;
  const simulatedTotals = [];

  for (let i = 0; i < iterations; i++) {
    let simulatedTotal = 0;
    // Simulasi untuk 7 hari ke depan (atau sesuai panjang data)
    for (let d = 0; d < 7; d++) {
      // Box-Muller transform untuk random normal distribution
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      
      // Nilai harian yang disimulasikan (tidak boleh minus)
      const dailyVal = Math.max(0, mu + z * sigma);
      simulatedTotal += dailyVal;
    }
    
    simulatedTotals.push(simulatedTotal);
    if (simulatedTotal >= targetValue) {
      successCount++;
    }
  }

  return {
    probabilityOfSuccess: (successCount / iterations) * 100,
    bestCase: Math.max(...simulatedTotals),
    worstCase: Math.min(...simulatedTotals),
    expectedAverage: mean(simulatedTotals)
  };
}