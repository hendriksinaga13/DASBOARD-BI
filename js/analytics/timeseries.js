import { mean, stdev, linReg, mannKendall, autocorr, cusum, crossCorr } from './stats-advanced.js';

export function toDailySeries(rows){
  const m = new Map();
  for(const r of rows){
    if(r.tt !== 'F') continue;
    m.set(r.day, (m.get(r.day) || 0) + r.amount);
  }
  const days = Array.from(m.keys()).sort();
  return days.map(d => ({ day: d, value: m.get(d) }));
}

export function movingAvg(values, window=7){
  const out = [];
  for(let i=0;i<values.length;i++){
    const lo = Math.max(0, i-window+1);
    const slice = values.slice(lo, i+1);
    out.push(slice.reduce((a,b)=>a+b, 0)/slice.length);
  }
  return out;
}

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

export function trendTest(values){
  const mk = mannKendall(values);
  let significance = 'none';
  if(Math.abs(mk.z) > 2.58) significance = mk.z > 0 ? 'strong-up' : 'strong-down';
  else if(Math.abs(mk.z) > 1.96) significance = mk.z > 0 ? 'up' : 'down';
  const interp = {
    'strong-up': 'Tren naik signifikan (α<0.01)',
    'up': 'Tren naik signifikan (α<0.05)',
    'strong-down': 'Tren turun signifikan (α<0.01)',
    'down': 'Tren turun signifikan (α<0.05)',
    'none': 'Tidak ada tren signifikan',
  }[significance];
  return { ...mk, significance, interpretation: interp };
}

export function detectRegimes(values){
  return cusum(values);
}

export function persistence(values){
  return {
    lag1: autocorr(values, 1),
    lag7: autocorr(values, 7),
    lag14: autocorr(values, 14),
  };
}

export function leadLag(a, b, maxLag=7){
  return crossCorr(a, b, maxLag);
}