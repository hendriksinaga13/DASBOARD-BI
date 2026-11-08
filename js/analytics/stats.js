/* Statistical primitives. Pure functions. */

export function sum(arr){ return arr.reduce((s, v) => s + v, 0); }
export function mean(arr){ return arr.length ? sum(arr) / arr.length : 0; }
export function median(arr){
  if(!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function stddev(arr){
  if(arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(sum(arr.map(v => Math.pow(v - m, 2))) / (arr.length - 1));
}
export function cv(arr){
  const m = mean(arr);
  return m === 0 ? 0 : stddev(arr) / Math.abs(m);
}
export function gini(values){
  const s = values.filter(v => v >= 0).sort((a, b) => a - b);
  const n = s.length;
  if(!n) return 0;
  const total = sum(s);
  if(total === 0) return 0;
  let cum = 0;
  for(let i = 0; i < n; i++) cum += (i + 1) * s[i];
  return (2 * cum) / (n * total) - (n + 1) / n;
}
export function hhi(values){
  const total = sum(values);
  if(total <= 0) return 0;
  return sum(values.map(v => Math.pow(v / total * 100, 2)));
}
export function zscore(value, arr){
  if(arr.length < 3) return 0;
  const m = mean(arr);
  const sd = stddev(arr);
  return sd === 0 ? 0 : (value - m) / sd;
}
export function linReg(xs, ys){
  const n = xs.length;
  if(n < 2) return { slope: 0, intercept: mean(ys) };
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for(let i = 0; i < n; i++){
    num += (xs[i] - mx) * (ys[i] - my);
    den += Math.pow(xs[i] - mx, 2);
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: my - slope * mx };
}
export function paretoShare(values, target = 0.8){
  const s = values.filter(v => v > 0).sort((a, b) => b - a);
  const total = sum(s);
  if(total <= 0) return { count: 0, total: 0, share: 0 };
  let cum = 0;
  for(let i = 0; i < s.length; i++){
    cum += s[i];
    if(cum / total >= target) return { count: i + 1, total: s.length, share: (i + 1) / s.length };
  }
  return { count: s.length, total: s.length, share: 1 };
}