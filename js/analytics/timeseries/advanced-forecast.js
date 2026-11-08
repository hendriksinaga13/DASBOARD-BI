// analytics/timeseries/advanced-forecast.js
export function holtWinters(values, seasonLength = 7, alpha = 0.3, beta = 0.1, gamma = 0.1, horizon = 7) {
  const n = values.length;
  if (n < seasonLength * 2) return null;

  let level = values[0];
  let trend = values[seasonLength] - values[0];
  let seasonals = [];
  
  // Inisialisasi musiman awal
  for (let i = 0; i < seasonLength; i++) {
    seasonals.push(values[i] - level);
  }

  for (let i = 0; i < n; i++) {
    const val = values[i];
    const lastLevel = level;
    const lastTrend = trend;
    const sIndex = i % seasonLength;
    const lastSeason = seasonals[sIndex];

    level = alpha * (val - lastSeason) + (1 - alpha) * (lastLevel + lastTrend);
    trend = beta * (level - lastLevel) + (1 - beta) * lastTrend;
    seasonals[sIndex] = gamma * (val - level) + (1 - gamma) * lastSeason;
  }

  const predictions = [];
  for (let i = 1; i <= horizon; i++) {
    const sIndex = (n + i - 1) % seasonLength;
    predictions.push({
      h: i,
      pred: Math.max(0, level + i * trend + seasonals[sIndex])
    });
  }

  return { predictions };
}