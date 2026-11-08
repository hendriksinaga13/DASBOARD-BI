// analytics/decomposition.js
import { mean, sum } from './stats-advanced.js';

/* Price-Volume-Mix (PVM) decomposition — KONSERVATIF
 * ΔRevenue = Price effect + Volume effect + Mix effect  (exact)
 * ✅ UPDATE: Menggunakan SUBRAND + KARTON (bukan PCS)
 * Harga per Karton = Revenue / Total Qty Karton
 */
export function priceVolumeMix(currRows, prevRows, dim = 'subrand'){
  
  const getKey = (r) => {
    if (dim === 'divisi')  return r.divisi || null;
    if (dim === 'product') return r.pcode || r.product || null;
    return r.subbrand || null;
  };

  const getLabel = (r) => {
    if (dim === 'divisi')  return r.divisi || '—';
    if (dim === 'product') return r.product || '—';
    return r.subbrand || '—';
  };

  // ✅ Helper: konversi netCarton ke number secara aman
  const toCarton = (r) => {
    const v = Number(r.netCarton);
    return isFinite(v) && v > 0 ? v : 0;
  };

  const aggregate = (rows) => {
    const m = new Map();
    for(const r of rows){
      if(r.tt !== 'F') continue;
      const k = getKey(r);
      if(!k) continue;
      if(!m.has(k)) m.set(k, { qty: 0, rev: 0, name: getLabel(r) });
      const g = m.get(k);
      g.qty += toCarton(r);          // ✅ Pakai KARTON (aman dari string/NaN)
      g.rev += Number(r.amount) || 0;
    }
    return m;
  };

  const cur = aggregate(currRows);
  const prev = aggregate(prevRows);
  const totalCur = sum(Array.from(cur.values()).map(g => g.rev));
  const totalPrev = sum(Array.from(prev.values()).map(g => g.rev));
  if(totalPrev === 0) return null;

  let priceEffect = 0, volumeEffect = 0, mixEffect = 0;
  const allKeys = new Set([...cur.keys(), ...prev.keys()]);
  const perProduct = [];

  for(const k of allKeys){
    const c = cur.get(k)  || { qty: 0, rev: 0, name: k };
    const p = prev.get(k) || { qty: 0, rev: 0, name: k };
    
    // ✅ Harga per KARTON (bukan per PCS)
    const curPrice  = c.qty > 0 ? c.rev / c.qty : 0;
    const prevPrice = p.qty > 0 ? p.rev / p.qty : 0;

    const priceEff  = (curPrice - prevPrice) * c.qty;
    const volumeEff = (c.qty - p.qty) * prevPrice;
    const delta     = c.rev - p.rev;
    const mixEff    = delta - priceEff - volumeEff;

    priceEffect  += priceEff;
    volumeEffect += volumeEff;
    mixEffect    += mixEff;

    if(Math.abs(delta) > 0){
      perProduct.push({
        name: c.name || p.name || k,
        delta,
        qtyCur: c.qty, qtyPrev: p.qty,
        priceCur: curPrice, pricePrev: prevPrice,
        priceEffect: priceEff,
        volumeEffect: volumeEff,
        mixEffect: mixEff,
      });
    }
  }
  perProduct.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // ✅ Total qty karton (untuk verifikasi di UI)
  const totalQtyCur = sum(Array.from(cur.values()).map(g => g.qty));
  const totalQtyPrev = sum(Array.from(prev.values()).map(g => g.qty));

  return {
    totalChange: totalCur - totalPrev,
    priceEffect, volumeEffect, mixEffect,
    pctPrice:  (priceEffect  / totalPrev) * 100,
    pctVolume: (volumeEffect / totalPrev) * 100,
    pctMix:    (mixEffect    / totalPrev) * 100,
    perProduct: perProduct.slice(0, 10),
    dim,
    qtyUnit: 'Karton',
    totalQtyCur, totalQtyPrev, // ✅ Untuk verifikasi
  };
}

/* YTD run-rate dengan proyeksi */
export function ytdRunrate(dailyValues, daysElapsed, daysRemaining){
  if(daysElapsed <= 0) return null;
  const ytd = sum(dailyValues);
  const dailyAvg = ytd / daysElapsed;
  return { ytd, dailyAvg, projection: ytd + dailyAvg * daysRemaining, daysElapsed, daysRemaining };
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
      contributionPct: totalChange !== 0 ? ((c - p) / totalChange) * 100 : 0,
    };
  }).sort((a, b) => b.delta - a.delta);

  return { totalChange, contributions };
}