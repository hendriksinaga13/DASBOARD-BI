import { esc, fmtDateID } from '../core/utils.js';
import { store } from '../core/store.js';
import { onClick, onChange, onInput } from '../core/events.js';
let installed = false;
export function installMultiselect(){
  if(installed) return;
  installed = true;
  onClick('[data-ms-toggle]', (btn) => {
    const ms = btn.closest('.ms');
    const open = ms.classList.contains('open');
    document.querySelectorAll('.ms').forEach(m => m.classList.remove('open'));
    if(!open) ms.classList.add('open');
  });
  onClick('[data-ms-close]', (btn) => btn.closest('.ms').classList.remove('open'));
  onClick('[data-ms-clear]', (btn) => {
    const key = btn.dataset.msClear;
    store.state.filters[key].clear();
    store.emit();
  });
  onClick('[data-ms-all]', (btn) => {
    const key = btn.dataset.msAll;
    const list = btn.closest('.ms').querySelectorAll('[data-ms-chk]');
    const set = store.state.filters[key];
    set.clear();
    list.forEach(c => { set.add(c.value); c.checked = true; });
    store.emit();
  });
  onChange('[data-ms-chk]', (chk) => {
    const key = chk.dataset.msChk;
    const set = store.state.filters[key];
    if(chk.checked) set.add(chk.value);
    else set.delete(chk.value);
    store.emit();
  });
  onInput('[data-ms-search]', (inp) => {
    const key = inp.dataset.msSearch;
    const q = inp.value.toLowerCase();
    inp.closest('.ms-pop').querySelectorAll('.ms-opt').forEach(opt => {
      opt.style.display = opt.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
    });
  });
  document.addEventListener('click', (e) => {
    if(!e.target.closest('.ms')) document.querySelectorAll('.ms').forEach(m => m.classList.remove('open'));
  });
}
export function multiselectHTML(key, label, values, selectedSet){
  if(!values.length) return `<div class="ms"><button class="ms-btn" disabled>${esc(label)}</button></div>`;
  const isDate = key === 'tanggal';
  const n = selectedSet.size;
  return `<div class="ms">
    <button class="ms-btn${n ? ' active' : ''}" data-ms-toggle type="button">
      ${esc(label)}<span class="cnt${n ? ' on' : ''}">${n || ''}</span><span class="car"></span>
    </button>
    <div class="ms-pop">
      <input class="ms-search" placeholder="Cari ${esc(label.toLowerCase())}..." data-ms-search="${key}">
      <div class="ms-list">
        ${values.map(v => `<label class="ms-opt">
          <input type="checkbox" data-ms-chk="${key}" value="${esc(v)}" ${selectedSet.has(v) ? 'checked' : ''}>
          <span>${esc(isDate ? fmtDateID(v) : v)}</span>
        </label>`).join('')}
      </div>
      <div class="ms-foot">
        <button type="button" data-ms-clear="${key}">Bersihkan</button>
        <button type="button" data-ms-all="${key}">Pilih Semua</button>
        <button type="button" data-ms-close="1">Tutup</button>
      </div>
    </div>
  </div>`;
}