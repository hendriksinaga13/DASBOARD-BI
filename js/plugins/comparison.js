import { iso } from '../core/utils.js';
import { FILTERS } from '../filters/registry.js';
import { store } from '../core/store.js';
const DAY_MS = 86400000;
function nonTimeMatch(r, f){
  if(f.transtype !== 'ALL' && r.tt !== f.transtype) return false;
  for(const key in FILTERS){
    const def = FILTERS[key];
    if(def.time) continue;
    const set = f[key];
    if(!set || !set.size) continue;
    if(!set.has(def.get(r))) return false;
  }
  if(f.q){
    const q = f.q.toLowerCase();
    const hay = (r.outlet + ' ' + r.product + ' ' + r.invoice + ' ' + r.salesman).toLowerCase();
    if(hay.indexOf(q) < 0) return false;
  }
  return true;
}
function ranges(state){
  const f = state.filters;
  if(!f.from || !f.to) return null;
  const from = new Date(f.from + 'T00:00:00Z');
  const to = new Date(f.to + 'T00:00:00Z');
  const periodDays = Math.round((to - from) / DAY_MS) + 1;
  if(periodDays <= 0) return null;
  const w5End = new Date(from.getTime() - DAY_MS);
  const w5Start = new Date(w5End.getTime() - 34 * DAY_MS);
  const w13End = new Date(from.getTime() - DAY_MS);
  const w13Start = new Date(w13End.getTime() - 90 * DAY_MS);
  const lmFrom = new Date(from); lmFrom.setUTCMonth(lmFrom.getUTCMonth() - 1);
  const lmTo = new Date(to); lmTo.setUTCMonth(lmTo.getUTCMonth() - 1);
  const lyFrom = new Date(from); lyFrom.setUTCFullYear(lyFrom.getUTCFullYear() - 1);
  const lyTo = new Date(to); lyTo.setUTCFullYear(lyTo.getUTCFullYear() - 1);
  return {
    periodDays,
    cur:  [f.from, f.to],
    w5:   [iso(w5Start), iso(w5End)],
    w13:  [iso(w13Start), iso(w13End)],
    lm:   [iso(lmFrom), iso(lmTo)],
    ly:   [iso(lyFrom), iso(lyTo)],
  };
}
export function overallComparison(state = store.state){
  const R = ranges(state);
  if(!R) return null;
  let cur = 0, lm = 0, ly = 0, w5 = 0, w13 = 0;
  for(const r of state.rows){
    if(!nonTimeMatch(r, state.filters)) continue;
    const v = r.tt === 'F' ? r.amount : -r.amount;
    if(r.day >= R.cur[0] && r.day <= R.cur[1]) cur += v;
    if(r.day >= R.lm[0]  && r.day <= R.lm[1])  lm  += v;
    if(r.day >= R.ly[0]  && r.day <= R.ly[1])  ly  += v;
    if(r.day >= R.w5[0]  && r.day <= R.w5[1])  w5  += v;
    if(r.day >= R.w13[0] && r.day <= R.w13[1]) w13 += v;
  }
  const avg5w = w5 !== 0 ? (w5 / 35) * R.periodDays : null;
  const avg13w = w13 !== 0 ? (w13 / 91) * R.periodDays : null;
  return { current: cur, lastMonth: lm, lastYear: ly, avg5w, avg13w, periodDays: R.periodDays };
}
export function comparisonBy(state = store.state, dim = 'salesman'){
  const R = ranges(state);
  if(!R) return { rows: [], periodDays: 0 };
  const dimFn = {
    salesman: r => r.salesman, product: r => r.product, outlet: r => r.outlet,
    divisi: r => r.divisi, subbrand: r => r.subbrand, kabupaten: r => r.kabupaten,
    rayon: r => r.rayon, channel: r => r.channel,
  }[dim] || (r => r.salesman);
  const groups = new Map();
  for(const r of state.rows){
    if(!nonTimeMatch(r, state.filters)) continue;
    const k = dimFn(r);
    if(!k || k === '') continue;
    if(!groups.has(k)) groups.set(k, { label: k, current: 0, lastMonth: 0, lastYear: 0, w5: 0, w13: 0 });
    const g = groups.get(k);
    const v = r.tt === 'F' ? r.amount : -r.amount;
    if(r.day >= R.cur[0] && r.day <= R.cur[1]) g.current += v;
    if(r.day >= R.lm[0]  && r.day <= R.lm[1])  g.lastMonth += v;
    if(r.day >= R.ly[0]  && r.day <= R.ly[1])  g.lastYear += v;
    if(r.day >= R.w5[0]  && r.day <= R.w5[1])  g.w5  += v;
    if(r.day >= R.w13[0] && r.day <= R.w13[1]) g.w13 += v;
  }
  const rows = [];
  for(const g of groups.values()){
    const avg5w  = g.w5  !== 0 ? (g.w5  / 35) * R.periodDays : 0;
    const avg13w = g.w13 !== 0 ? (g.w13 / 91) * R.periodDays : 0;
    rows.push({
      label: g.label, current: g.current, lastMonth: g.lastMonth, lastYear: g.lastYear, avg5w, avg13w,
      deltaLM:  g.lastMonth !== 0 ? ((g.current - g.lastMonth) / Math.abs(g.lastMonth)) * 100 : null,
      deltaLY:  g.lastYear  !== 0 ? ((g.current - g.lastYear)  / Math.abs(g.lastYear))  * 100 : null,
      delta5w:  avg5w       !== 0 ? ((g.current - avg5w      ) / Math.abs(avg5w))       * 100 : null,
      delta13w: avg13w      !== 0 ? ((g.current - avg13w     ) / Math.abs(avg13w))      * 100 : null,
    });
  }
  return { rows, periodDays: R.periodDays };
}