// analytics/timeseries/velocity.js
import { mean } from '../stats-advanced.js';

export function calculateVelocity(values, window = 7) {
  if (values.length < window * 2) return null;

  const recent = values.slice(-window);
  const previous = values.slice(-window * 2, -window);

  const avgRecent = mean(recent);
  const avgPrevious = mean(previous);

  // Velocity: Persentase perubahan rata-rata periode ini vs periode sebelumnya
  const velocity = avgPrevious === 0 ? 0 : ((avgRecent - avgPrevious) / avgPrevious) * 100;

  return {
    avgRecent,
    avgPrevious,
    velocity,
    status: velocity > 5 ? 'Akselerasi Cepat' : velocity < -5 ? 'Deselerasi Tajam' : 'Stabil'
  };
}