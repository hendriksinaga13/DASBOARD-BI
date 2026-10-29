import { mean, sum } from './stats-advanced.js';

/* Price-Volume-Mix (PVM) decomposition
 * Total change = Price effect + Volume effect + Mix effect
 * Standard marketing analytics methodology (Sullivan 2016)
 */
export function priceVolumeMix(currRows, prevRows){
  const aggregate = (rows) => {
    const m = new Map();
    for(const r of rows){
      if(r.tt !== 'F') continue;
      const k = r.pcode || r.product;
      if(!m.has(k)) m.set(k, { qty: 0, rev: 0, name: r.product });
      const g = m.get(k);
      g.qty += r.netQty;
      g.rev += r.amount;
    }
    return m;
  };
  const cur = aggregate(currRows);
  const prev = aggregate(prevRows);
  const totalCur = sum(Array.from(cur.values()).map(g=>g.rev));
  const totalPrev = sum(Array.from(prev.values()).map(g=>g.rev));
  if(totalPrev === 0) return null;

  let priceEffect = 0, volumeEffect = 0, mixEffect = 0;
  const allKeys = new Set([...cur.keys(), ...prev.keys()]);
  const perProduct = [];

  for(const k of allKeys){
    const c = cur.get(k) || { qty: 0, rev: 0 };
    const p = prev.get(k) || { qty: 0, rev: 0 };
    const curPrice = c.qty > 0 ? c.rev / c.qty : 0;
    const prevPrice = p.qty > 0 ? p.rev / p.qty : 0;
    const curShare = totalCur > 0 ? c.rev/totalCur : 0;
    const prevShare = totalPrev > 0 ? p.rev/totalPrev : 0;

    const priceComponent = (curPrice - prevPrice) * c.qty;
    const volumeComponent = (c.qty - p.qty) * prevPrice * prevShare;
    const mixComponent = (curShare - prevShare) * totalPrev;

    priceEffect += priceComponent;
    volumeEffect += volumeComponent;
    mixEffect += mixComponent;

    if(Math.abs(c.rev - p.rev) > 0){
      perProduct.push({
        name: (cur.get(k) || prev.get(k)).name,
        delta: c.rev - p.rev,
        priceEffect: priceComponent,
        volumeEffect: volumeComponent,
        mixEffect: mixComponent,
      });
    }
  }
  perProduct.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));

  return {
    totalChange: totalCur - totalPrev,
    priceEffect, volumeEffect, mixEffect,
    pctPrice: (priceEffect / totalPrev) * 100,
    pctVolume: (volumeEffect / totalPrev) * 100,
    pctMix: (mixEffect / totalPrev) * 100,
    perProduct: perProduct.slice(0, 10),
  };
}

/* YTD run-rate dengan proyeksi */
export function ytdRunrate(dailyValues, daysElapsed, daysRemaining){
  if(daysElapsed <= 0) return null;
  const ytd = sum(dailyValues);
  const dailyAvg = ytd / daysElapsed;
  return {
    ytd, dailyAvg,
    projection: ytd + dailyAvg * daysRemaining,
    daysElapsed, daysRemaining,
  };
}

/* Kontribusi per dimensi terhadap perubahan */
export function contributionAnalysis(currRows, prevRows, dimFn){
  const aggregate = (rows) => {
    const m = new Map();
    for(const r of rows){
      if(r.tt !== 'F') continue;
      const k = dimFn(r);
      m.set(k, (m.get(k) || 0) + r.amount);
    }
    return m;
  };
  const cur = aggregate(currRows);
  const prev = aggregate(prevRows);
  const allKeys = new Set([...cur.keys(), ...prev.keys()]);
  const totalCur = sum(Array.from(cur.values()));
  const totalPrev = sum(Array.from(prev.values()));
  const totalChange = totalCur - totalPrev;

  const contributions = Array.from(allKeys).map(k => {
    const c = cur.get(k) || 0, p = prev.get(k) || 0;
    return {
      key: k,
      current: c, previous: p, delta: c - p,
      contributionPct: totalChange !== 0 ? ((c-p)/totalChange)*100 : 0,
    };
  }).sort((a,b)=>b.delta-a.delta);

  return { totalChange, contributions };
}