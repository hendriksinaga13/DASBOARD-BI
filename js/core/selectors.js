import { store } from './store.js';
import { hashKey } from './utils.js';
import { FILTERS } from '../filters/registry.js';
import { agg } from '../data/aggregator.js';
export function matchRow(r, filters){
  if(filters.from && r.day < filters.from) return false;
  if(filters.to && r.day > filters.to) return false;
  if(filters.transtype !== 'ALL' && r.tt !== filters.transtype) return false;
  if(filters.q){
    const q = filters.q.toLowerCase();
    const hay = (r.outlet + ' ' + r.product + ' ' + r.invoice + ' ' + r.salesman).toLowerCase();
    if(hay.indexOf(q) < 0) return false;
  }
  for(const key in FILTERS){
    const set = filters[key];
    if(!set || !set.size) continue;
    if(!set.has(FILTERS[key].get(r))) return false;
  }
  return true;
}
function hashFilterSets(f){
  let s = '';
  for(const k in f){
    if(f[k] instanceof Set) s += k + ':' + Array.from(f[k]).sort().join(',') + '|';
    else s += k + ':' + (f[k] || '') + '|';
  }
  return s;
}
let _filtered = { sig: null, value: null };
export function selectFiltered(state = store.state){
  const sig = state.rows.length + '|' + hashFilterSets(state.filters);
  if(_filtered.sig === sig) return _filtered.value;
  const value = state.rows.filter(r => matchRow(r, state.filters));
  _filtered = { sig, value };
  return value;
}
let _agg = { rows: null, value: null };
export function selectAgg(state = store.state){
  const rows = selectFiltered(state);
  if(_agg.rows === rows) return _agg.value;
  _agg = { rows, value: agg(rows) };
  return _agg.value;
}
function matchOutlet(o, f){
  for(const key in FILTERS){
    const def = FILTERS[key];
    if(def.time || def.product) continue;
    const set = f[key];
    if(!set || !set.size) continue;
    if(!set.has(def.get(o))) return false;
  }
  return true;
}
let _notYet = { rows: null, master: null, value: null };
export function selectNotYet(state = store.state){
  const rows = selectFiltered(state);
  if(_notYet.rows === rows && _notYet.master === state.outletMaster) return _notYet.value;
  const transactedF = new Set();
  for(const r of rows) if(r.tt === 'F') transactedF.add(r.outletKey);
  const notYet = [];
  const seen = new Set();
  for(const o of state.outletMaster.values()){
    const key = o.outletNo || o.outlet;
    if(!key || seen.has(key)) continue;
    seen.add(key);
    if(!matchOutlet(o, state.filters)) continue;
    if(!transactedF.has(key) && !transactedF.has(o.outletNo) && !transactedF.has(o.outlet)) notYet.push(o);
  }
  _notYet = { rows, master: state.outletMaster, value: notYet };
  return notYet;
}
export function invalidateSelectors(){
  _filtered = { sig: null, value: null };
  _agg = { rows: null, value: null };
  _notYet = { rows: null, master: null, value: null };
}