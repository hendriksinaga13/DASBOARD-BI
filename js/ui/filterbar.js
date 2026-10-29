import { esc } from '../core/utils.js';
import { store } from '../core/store.js';
import { FILTERS } from '../filters/registry.js';
import { multiselectHTML } from './multiselect.js';
import { selectFiltered } from '../core/selectors.js';
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
    for(const k in FILTERS) f[k].clear();
    store.emit();
  });
}
export function renderFilterBar(container, state){
  if(!state.rows.length){ container.classList.remove('on'); container.innerHTML = ''; return; }
  container.classList.add('on');
  const rows = selectFiltered(state);
  const dates = state.rows.map(r => r.day).sort();
  const min = dates[0] || '', max = dates[dates.length - 1] || '';
  const multiselects = Object.entries(FILTERS).map(([key, def]) => {
    const set = new Set();
    for(const r of rows) set.add(def.get(r));
    const values = Array.from(set).filter(v => v != null && v !== '').sort();
    return multiselectHTML(key, def.label, values, state.filters[key]);
  }).join('');
  const html = `
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
  if(container._html !== html){ container.innerHTML = html; container._html = html; }
}