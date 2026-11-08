// analytics/timeseries/benchmark.js
import { mean } from '../stats-advanced.js';

export function benchmarkAgainstGroup(entitySeries, groupSeries) {
  if (!entitySeries.length || !groupSeries.length) return null;

  const entityTotal = entitySeries.reduce((s, d) => s + d.value, 0);
  const groupTotal = groupSeries.reduce((s, d) => s + d.value, 0);
  
  const entityAvg = mean(entitySeries.map(d => d.value));
  const groupAvg = mean(groupSeries.map(d => d.value));

  return {
    entityTotal,
    groupTotal,
    entityAvg,
    groupAvg,
    gap: entityAvg - groupAvg,
    performanceRatio: groupAvg === 0 ? 0 : (entityAvg / groupAvg) * 100
  };
}