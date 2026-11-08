import { store } from './store.js';
import { FILTERS } from '../filters/registry.js';
import { agg } from '../data/aggregator.js';

function hashFilterSets(f){
  let s = '';
  for(const k in f){
    if(f[k] instanceof Set) s += k + ':' + Array.from(f[k]).sort().join(',') + '|';
    else s += k + ':' + (f[k] || '') + '|';
  }
  return s;
}

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

export function matchOutlet(o, f){
  for(const key in FILTERS){
    const def = FILTERS[key];
    if(def.time || def.product) continue;
    const set = f[key];
    if(!set || !set.size) continue;
    if(!set.has(def.get(o))) return false;
  }
  if(f.q){
    const q = f.q.toLowerCase();
    const hay = (o.outlet + ' ' + o.outletNo + ' ' + (o.salesman || '') + ' ' +
      (o.kabupaten || '') + ' ' + (o.rayon || '') + ' ' + (o.kecamatan || '')).toLowerCase();
    if(hay.indexOf(q) < 0) return false;
  }
  return true;
}

let _filtered = { sig: null, value: null };
export function selectFiltered(state = store.state){
  const sig = state.rows.length + '|' + hashFilterSets(state.filters);
  if(_filtered.sig === sig) return _filtered.value;
  const value = state.rows.filter(r => matchRow(r, state.filters));
  _filtered = { sig, value };
  return value;
}

/* ⚠ MASTER COUNT: hanya outlet DMP yang salesman-nya ADA di LBP */
let _masterCount = { master: null, rows: null, sig: null, value: null };
export function selectMasterCount(state = store.state){
  const sig = hashFilterSets(state.filters);
  if(_masterCount.master === state.outletMaster && _masterCount.rows === state.rows && _masterCount.sig === sig){
    return _masterCount.value;
  }

  /* Set salesmen yang ADA di LBP */
  const allowedSalesmen = new Set();
  for(const r of state.rows){
    if(r.salesman && r.salesman !== '—') allowedSalesmen.add(r.salesman);
  }

  let count = 0;
  const seen = new Set();
  for(const o of state.outletMaster.values()){
    const key = String(o.outletNo || o.outlet || '').trim();
    if(!key || seen.has(key)) continue;
    seen.add(key);

    /* Fix #1: skip outlet yang salesman-nya tidak ada di LBP */
    if(o.salesman && o.salesman !== '—' && !allowedSalesmen.has(o.salesman)) continue;

    if(!matchOutlet(o, state.filters)) continue;
    count++;
  }
  _masterCount = { master: state.outletMaster, rows: state.rows, sig, value: count };
  return count;
}

let _agg = { rows: null, master: null, value: null };
export function selectAgg(state = store.state){
  const rows = selectFiltered(state);
  if(_agg.rows === rows && _agg.master === state.outletMaster) return _agg.value;
  const value = agg(rows);
  value.masterCount = selectMasterCount(state);
  _agg = { rows, master: state.outletMaster, value };
  return value;
}

/* ⚠ BELUM TRANSAKSI: matching LBP↔DMP via outletNo + nama + key */
let _notYet = { rows: null, master: null, sig: null, value: null };
export function selectNotYet(state = store.state){
  const rows = selectFiltered(state);
  const sig = hashFilterSets(state.filters);
  if(_notYet.rows === rows && _notYet.master === state.outletMaster && _notYet.sig === sig){
    return _notYet.value;
  }

  /* Set salesmen yang ADA di LBP */
  const allowedSalesmen = new Set();
  for(const r of state.rows){
    if(r.salesman && r.salesman !== '—') allowedSalesmen.add(r.salesman);
  }

  /* Kumpulkan identifier dari LBP rows (baris F yang lolos filter) */
  const txNo = new Set();
  const txName = new Set();
  const txKey = new Set();
  for(const r of rows){
    if(r.tt !== 'F') continue;
    const no = String(r.outletNo || '').trim();
    const nm = String(r.outlet || '').trim();
    if(no) txNo.add(no);
    if(nm) txName.add(nm.toUpperCase());
    if(no && nm) txKey.add(no + '|' + nm);
    if(r.outletKey) txKey.add(r.outletKey);
  }

  const notYet = [];
  const seen = new Set();
  for(const o of state.outletMaster.values()){
    const no = String(o.outletNo || '').trim();
    const nm = String(o.outlet || '').trim();
    const id = no || nm;
    if(!id || seen.has(id)) continue;
    seen.add(id);

    /* Fix #1: skip outlet yang salesman-nya tidak ada di LBP */
    if(o.salesman && o.salesman !== '—' && !allowedSalesmen.has(o.salesman)) continue;

    if(!matchOutlet(o, state.filters)) continue;

    /* Cek apakah sudah transaksi via salah satu identifier */
    const matchNo = no && txNo.has(no);
    const matchNm = nm && txName.has(nm.toUpperCase());
    const matchKey = (no && nm && txKey.has(no + '|' + nm)) || (no && txKey.has(no)) || (nm && txKey.has(nm));
    if(matchNo || matchNm || matchKey) continue;

    notYet.push(o);
  }

  _notYet = { rows, master: state.outletMaster, sig, value: notYet };
  return notYet;
}

export function invalidateSelectors(){
  _filtered = { sig: null, value: null };
  _masterCount = { master: null, rows: null, sig: null, value: null };
  _agg = { rows: null, master: null, value: null };
  _notYet = { rows: null, master: null, sig: null, value: null };
}