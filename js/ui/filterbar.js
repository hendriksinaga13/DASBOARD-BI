import { esc } from '../core/utils.js';
import { store } from '../core/store.js';
import { FILTERS, initFilters } from '../filters/registry.js';
import { buildMultiselectStatic } from './multiselect.js';
import { onClick, onChange, onInput } from '../core/events.js';

let installed = false;

export function installFilterBar(){
  if(installed) return;
  installed = true;

  onChange('#fFrom', (el) => { store.state.filters.from = el.value; store.emit(); });
  onChange('#fTo', (el) => { store.state.filters.to = el.value; store.emit(); });

  onInput('#fQ', (() => {
    let t = null;
    return (el) => {
      clearTimeout(t);
      t = setTimeout(() => { store.state.filters.q = el.value.trim(); store.emit(); }, 220);
    };
  })());

  onClick('[data-tt] button', (btn) => {
    store.state.filters.transtype = btn.dataset.tt;
    store.emit();
  });

  onClick('#fReset', () => {
    const f = store.state.filters;
    f.from = ''; f.to = ''; f.q = ''; f.transtype = 'ALL';

    /* ⚠ FIX: guard jika filter Set belum diinisialisasi */
    for(const k in FILTERS){
      if(f[k] && typeof f[k].clear === 'function') f[k].clear();
    }

    store.state.ui.openMs = null;
    const container = document.getElementById('filterbar');
    if(container) container._sig = null; /* force rebuild */
    store.emit();
  });
}

function buildStaticHTML(state){
  initFilters(state.filters);

  const allRows = state.rows;
  const dates = allRows.map(r => r.day).sort();
  const min = dates[0] || '', max = dates[dates.length - 1] || '';
  const prefs = state.filterPrefs || {};

  const multiselects = Object.entries(FILTERS).map(([key, def]) => {
    // ⚡ SKIP jika filter dinonaktifkan
    if (prefs[key] === false) return '';

    const set = new Set();
    for(const r of allRows){
      const v = def.get(r);
      if(v != null && v !== '') set.add(v);
    }
    for(const v of state.filters[key]) set.add(v);
    const values = Array.from(set).sort();
    return buildMultiselectStatic(key, def.label, values);
  }).join('');

  return `
    <div class="filter-row">
      <div class="fld"><label>Dari</label><input type="date" id="fFrom" value="${esc(state.filters.from)}" min="${esc(min)}" max="${esc(max)}"></div>
      <div class="fld"><label>s/d</label><input type="date" id="fTo" value="${esc(state.filters.to)}" min="${esc(min)}" max="${esc(max)}"></div>
      <div class="fld"><input type="search" id="fQ" placeholder="Cari outlet / produk / faktur..." value="${esc(state.filters.q)}"></div>
      <div class="f-spacer"></div>
      <div class="seg" data-tt>
        <button data-tt="ALL" class="${state.filters.transtype === 'ALL' ? 'on' : ''}">Semua</button>
        <button data-tt="F" class="${state.filters.transtype === 'F' ? 'on' : ''}">Faktur</button>
        <button data-tt="R" class="${state.filters.transtype === 'R' ? 'on' : ''}">Retur</button>
      </div>
      <button class="btn sm" id="fReset">Reset</button>
    </div>
    <div class="filter-row">${multiselects}</div>
  `;
}

function capturePreserve(container){
  const out = {};
  container.querySelectorAll('.ms').forEach(ms => {
    const key = ms.dataset.ms;
    if(!key) return;
    const search = ms.querySelector('.ms-search');
    const list = ms.querySelector('.ms-list');
    out[key] = {
      search: search ? search.value : '',
      scrollTop: list ? list.scrollTop : 0,
    };
  });
  return out;
}
function restorePreserve(container, preserve){
  for(const key in preserve){
    const ms = container.querySelector(`.ms[data-ms="${key}"]`);
    if(!ms) continue;
    const s = preserve[key].search;
    if(s){
      const search = ms.querySelector('.ms-search');
      if(search){
        search.value = s;
        const q = s.toLowerCase();
        ms.querySelectorAll('.ms-opt').forEach(opt => {
          opt.style.display = opt.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
        });
      }
    }
    const st = preserve[key].scrollTop;
    if(st){
      const list = ms.querySelector('.ms-list');
      if(list) list.scrollTop = st;
    }
  }
}

export function renderFilterBar(container, state){
  if(!state.rows.length){
    container.classList.remove('on');
    container.innerHTML = '';
    container._sig = null;
    return;
  }
  container.classList.add('on');

  // ⚡ Signature sekarang include filterPrefs agar rebuild saat user toggle
  const prefsHash = JSON.stringify(state.filterPrefs || {});
  const sig = state.files.length + ':' + state.rows.length + ':' + state.outletMaster.size + ':' + prefsHash;

  if(container._sig !== sig){
    const preserve = capturePreserve(container);
    container.innerHTML = buildStaticHTML(state);
    container._sig = sig;
    restorePreserve(container, preserve);
  }

  for(const key in FILTERS){
    const ms = container.querySelector(`.ms[data-ms="${key}"]`);
    if(!ms) continue;
    const n = state.filters[key].size;
    const cnt = ms.querySelector(`[data-cnt="${key}"]`);
    const btn = ms.querySelector('.ms-btn');
    if(cnt){
      cnt.textContent = n || '';
      cnt.classList.toggle('on', n > 0);
    }
    if(btn) btn.classList.toggle('active', n > 0);
    ms.classList.toggle('open', state.ui.openMs === key);
  }

  container.querySelectorAll('[data-ms-chk]').forEach(chk => {
    const key = chk.dataset.msChk;
    chk.checked = state.filters[key].has(chk.value);
  });

  container.querySelectorAll('[data-tt] button').forEach(b => {
    b.classList.toggle('on', b.dataset.tt === state.filters.transtype);
  });
}