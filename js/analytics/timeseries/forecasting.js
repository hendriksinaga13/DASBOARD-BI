// analytics/timeseries/forecasting.js
import { mean, stdev, linReg } from '../stats-advanced.js';

/**
 * Classical Decomposition (Trend, Seasonal, Residual)
 */
export function decompose(values, period=7){
  const n = values.length;
  if(n < period*2) return null;
  const half = Math.floor(period/2);
  const trend = values.map((v,i)=>{
    if(i < half || i >= n-half) return null;
    return mean(values.slice(i-half, i+half+1));
  });
  const detrended = values.map((v,i)=> trend[i] == null ? null : v - trend[i]);
  const seasonSlots = Array(period).fill(0).map(()=>[]);
  detrended.forEach((v,i)=>{
    if(v != null) seasonSlots[i%period].push(v);
  });
  const seasonalRaw = seasonSlots.map(s => s.length ? mean(s) : 0);
  const seasMean = mean(seasonalRaw);
  const seasonal = seasonalRaw.map(s => s - seasMean);
  const residual = values.map((v,i)=>{
    if(trend[i] == null) return null;
    return v - trend[i] - seasonal[i%period];
  });
  return { trend, seasonal, residual };
}

/**
 * Simple Exponential Smoothing (SES) - Lebih halus dari Linear Regression
 */
export function forecastSES(values, horizon=7, alpha=0.3) {
  if (values.length === 0) return null;
  
  let level = values[0];
  const sesValues = [level];
  
  for (let i = 1; i < values.length; i++) {
    level = alpha * values[i] + (1 - alpha) * level;
    sesValues.push(level);
  }
  
  const predictions = [];
  for (let i = 1; i <= horizon; i++) {
    predictions.push({ h: i, pred: Math.max(level, 0) }); // Pastikan tidak minus
  }
  
  return { sesValues, predictions };
}

/**
 * Forecast dengan Linear Regression
 */
export function forecast(values, horizon=7){
  if(values.length < 5) return null;
  const xs = values.map((_,i)=>i);
  const reg = linReg(xs, values);
  const residuals = values.map((v,i)=>v - (reg.slope*xs[i] + reg.intercept));
  const residSd = stdev(residuals);
  const predictions = [];
  for(let i=1;i<=horizon;i++){
    const pred = reg.slope*(values.length-1+i) + reg.intercept;
    const se = residSd * Math.sqrt(1 + 1/values.length + (i**2)/values.length);
    predictions.push({
      h: i,
      pred: Math.max(pred, 0),
      lo: Math.max(pred-1.96*se, 0),
      hi: Math.max(pred+1.96*se, 0),
    });
  }
  return { trend: reg, residualSd: residSd, predictions };
}