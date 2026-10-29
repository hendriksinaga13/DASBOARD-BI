import { mean, quantile, sum } from './stats-advanced.js';

export function rfmSegmentation(rows, refDay){
  const now = refDay ? new Date(refDay+'T00:00:00Z') : new Date();
  const byOutlet = new Map();
  for(const r of rows){
    if(r.tt !== 'F') continue;
    if(!byOutlet.has(r.outletKey)){
      byOutlet.set(r.outletKey, {
        outletKey: r.outletKey, outlet: r.outlet,
        lastDay: r.day, days: new Set(), total: 0, count: 0,
      });
    }
    const g = byOutlet.get(r.outletKey);
    if(r.day > g.lastDay) g.lastDay = r.day;
    g.days.add(r.day);
    g.total += r.amount;
    g.count++;
  }
  const rows2 = Array.from(byOutlet.values()).map(g => ({
    ...g,
    recency: Math.round((now - new Date(g.lastDay+'T00:00:00Z'))/86400000),
    frequency: g.days.size,
    monetary: g.total,
  }));
  if(rows2.length < 5) return { segments: [], outlets: rows2 };

  const q = (arr) => [quantile(arr,0.2), quantile(arr,0.4), quantile(arr,0.6), quantile(arr,0.8)];
  const qR = q(rows2.map(g=>g.recency));
  const qF = q(rows2.map(g=>g.frequency));
  const qM = q(rows2.map(g=>g.monetary));
  const score = (v, qs) => {
    const idx = qs.findIndex(th => v <= th);
    return idx === -1 ? 5 : 5 - idx;
  };

  const segments = rows2.map(g => {
    const r = 5 - score(g.recency, qR);
    const f = score(g.frequency, qF);
    const m = score(g.monetary, qM);
    return { ...g, r, f, m, rfm: `${r}${f}${m}` };
  });

  const classify = (g) => {
    if(g.r >= 4 && g.f >= 4 && g.m >= 4) return 'Champion';
    if(g.r >= 3 && g.f >= 3 && g.m >= 3) return 'Loyal';
    if(g.r >= 4 && g.f >= 2 && g.m >= 3) return 'Potential Loyalist';
    if(g.r >= 4 && g.f <= 2) return 'New Customer';
    if(g.r >= 3 && g.f >= 2) return 'Promising';
    if(g.r <= 2 && g.f >= 3) return 'At Risk';
    if(g.r <= 2 && g.f <= 2) return 'Lost';
    return 'Need Attention';
  };
  const bySegment = {};
  for(const g of segments){
    const cls = classify(g);
    if(!bySegment[cls]) bySegment[cls] = { name: cls, count: 0, monetary: 0, outlets: [] };
    bySegment[cls].count++;
    bySegment[cls].monetary += g.monetary;
    if(bySegment[cls].outlets.length < 3) bySegment[cls].outlets.push(g.outlet);
  }
  return { segments: Object.values(bySegment), outlets: segments };
}

export function cohortAnalysis(rows){
  const firstPurchase = new Map();
  for(const r of rows){
    if(r.tt !== 'F') continue;
    if(!firstPurchase.has(r.outletKey) || r.day < firstPurchase.get(r.outletKey))
      firstPurchase.set(r.outletKey, r.day);
  }
  const purchased = new Map();
  for(const r of rows){
    if(r.tt !== 'F') continue;
    if(!purchased.has(r.outletKey)) purchased.set(r.outletKey, new Set());
    purchased.get(r.outletKey).add(r.day.slice(0, 7));
  }
  const cohorts = new Map();
  for(const [k, day] of firstPurchase){
    const cohort = day.slice(0, 7);
    if(!cohorts.has(cohort)) cohorts.set(cohort, { month: cohort, outlets: new Set(), purchases: new Map() });
    const c = cohorts.get(cohort);
    c.outlets.add(k);
    for(const m of purchased.get(k) || [])
      c.purchases.set(m, (c.purchases.get(m) || 0) + 1);
  }
  return Array.from(cohorts.values()).map(c => {
    const months = Array.from(c.purchases.keys()).sort();
    return {
      month: c.month,
      totalOutlets: c.outlets.size,
      retention: months.map(m => ({
        month: m,
        active: c.purchases.get(m) || 0,
        pct: ((c.purchases.get(m) || 0) / c.outlets.size) * 100,
      })),
    };
  });
}