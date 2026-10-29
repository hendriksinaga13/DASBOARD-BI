/* Advanced statistical primitives. Semua fungsi murni, deterministic. */

export function sum(a){ return a.reduce((s,v)=>s+v, 0); }
export function mean(a){ return a.length ? sum(a)/a.length : 0; }
export function median(a){
  if(!a.length) return 0;
  const s = a.slice().sort((x,y)=>x-y);
  const m = Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
}
export function quantile(a, q){
  if(!a.length) return 0;
  const s = a.slice().sort((x,y)=>x-y);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi]-s[lo]) * (pos-lo);
}
export function stdev(a){
  if(a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2, 0)/(a.length-1));
}
export function mad(a){
  if(!a.length) return 0;
  const m = median(a);
  const devs = a.map(v=>Math.abs(v-m));
  return median(devs) * 1.4826;
}
export function cov(a, b){
  if(a.length !== b.length || a.length < 2) return 0;
  const ma = mean(a), mb = mean(b);
  return a.reduce((s,v,i)=>s+(v-ma)*(b[i]-mb), 0)/(a.length-1);
}
export function pearson(a, b){
  const sa = stdev(a), sb = stdev(b);
  return (sa && sb) ? cov(a,b)/(sa*sb) : 0;
}
export function cv(a){ const m = mean(a); return m === 0 ? 0 : stdev(a)/Math.abs(m); }
export function gini(v){
  const s = v.filter(x=>x>=0).sort((a,b)=>a-b);
  const n = s.length;
  if(!n) return 0;
  const total = sum(s);
  if(total === 0) return 0;
  let cum = 0;
  for(let i=0;i<n;i++) cum += (i+1)*s[i];
  return (2*cum)/(n*total) - (n+1)/n;
}
export function hhi(v){
  const t = sum(v);
  if(t <= 0) return 0;
  return v.reduce((s,x)=>s+(x/t*100)**2, 0);
}
export function shannonEntropy(v){
  const t = sum(v);
  if(t <= 0) return 0;
  return -v.filter(x=>x>0).reduce((s,x)=>{ const p=x/t; return s+p*Math.log2(p); }, 0);
}
export function zscore(v, arr){
  if(arr.length<3) return 0;
  const m = mean(arr), sd = stdev(arr);
  return sd === 0 ? 0 : (v-m)/sd;
}
export function robustZscore(v, arr){
  if(arr.length<3) return 0;
  const m = median(arr), md = mad(arr);
  return md === 0 ? 0 : (v-m)/md;
}
export function linReg(xs, ys){
  const n = xs.length;
  if(n < 2) return {slope:0, intercept:mean(ys), r2:0};
  const mx = mean(xs), my = mean(ys);
  let num=0, den=0, ssRes=0, ssTot=0;
  for(let i=0;i<n;i++){
    num += (xs[i]-mx)*(ys[i]-my);
    den += (xs[i]-mx)**2;
  }
  const slope = den === 0 ? 0 : num/den;
  const intercept = my - slope*mx;
  for(let i=0;i<n;i++){
    const pred = slope*xs[i] + intercept;
    ssRes += (ys[i]-pred)**2;
    ssTot += (ys[i]-my)**2;
  }
  return {slope, intercept, r2: ssTot === 0 ? 0 : 1 - ssRes/ssTot};
}
export function bootstrapCI(arr, statFn, iterations=300){
  const n = arr.length;
  if(n < 5) return {lo:statFn(arr), hi:statFn(arr), point:statFn(arr)};
  const results = new Array(iterations);
  for(let i=0;i<iterations;i++){
    const sample = new Array(n);
    for(let j=0;j<n;j++) sample[j] = arr[Math.floor(Math.random()*n)];
    results[i] = statFn(sample);
  }
  results.sort((a,b)=>a-b);
  return {
    lo: results[Math.floor(iterations*0.025)],
    hi: results[Math.floor(iterations*0.975)],
    point: statFn(arr),
  };
}
export function paretoShare(values, target=0.8){
  const s = values.filter(v=>v>0).sort((a,b)=>b-a);
  const total = sum(s);
  if(total <= 0) return {count:0, total:0, share:0};
  let cum = 0;
  for(let i=0;i<s.length;i++){
    cum += s[i];
    if(cum/total >= target) return {count:i+1, total:s.length, share:(i+1)/s.length};
  }
  return {count:s.length, total:s.length, share:1};
}
export function mannKendall(y){
  const n = y.length;
  if(n < 4) return {S:0, tau:0, z:0};
  let S = 0;
  for(let i=0;i<n-1;i++) for(let j=i+1;j<n;j++){
    const d = y[j]-y[i];
    S += d > 0 ? 1 : d < 0 ? -1 : 0;
  }
  const varS = (n*(n-1)*(2*n+5))/18;
  return {
    S,
    tau: S / (n*(n-1)/2),
    z: varS > 0 ? S/Math.sqrt(varS) : 0,
  };
}
export function autocorr(arr, lag=1){
  const n = arr.length;
  if(n <= lag) return 0;
  const m = mean(arr);
  const den = arr.reduce((s,v)=>s+(v-m)**2, 0);
  if(den === 0) return 0;
  return arr.slice(0, n-lag).reduce((s,v,i)=>s+(v-m)*(arr[i+lag]-m), 0)/den;
}
export function crossCorr(a, b, maxLag=5){
  const out = [];
  for(let lag=-maxLag; lag<=maxLag; lag++){
    const ai = lag >= 0 ? a.slice(lag) : a;
    const bi = lag >= 0 ? b : b.slice(-lag);
    const n = Math.min(ai.length, bi.length);
    if(n < 3){ out.push({lag, corr:0}); continue; }
    out.push({lag, corr:pearson(ai.slice(0,n), bi.slice(0,n))});
  }
  return out;
}
export function cusum(arr){
  const m = mean(arr), sd = stdev(arr);
  if(sd === 0) return [];
  let pos = 0, neg = 0;
  const hits = [];
  for(let i=0;i<arr.length;i++){
    const z = (arr[i]-m)/sd;
    pos = Math.max(0, pos+z-0.5);
    neg = Math.min(0, neg+z+0.5);
    if(pos > 4 || neg < -4){ hits.push(i); pos=0; neg=0; }
  }
  return hits;
}
export function cohensD(a, b){
  const ma = mean(a), mb = mean(b);
  const sa = stdev(a), sb = stdev(b);
  const pooled = Math.sqrt((sa**2 + sb**2)/2);
  return pooled > 0 ? (ma-mb)/pooled : 0;
}