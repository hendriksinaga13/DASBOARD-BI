import { esc, fmtDateID } from '../core/utils.js';
import { store } from '../core/store.js';
import { onClick, onChange, onInput } from '../core/events.js';

let installed = false;

export function installMultiselect(){
  if(installed) return;
  installed = true;

  // Buka / Tutup Dropdown
  onClick('[data-ms-toggle]', (btn, e) => {
    if(e) e.stopPropagation();
    
    const ms = btn.closest('.ms');
    if(!ms) return;
    
    const wasOpen = ms.classList.contains('open');
    
    // Tutup semua dropdown lain
    document.querySelectorAll('.ms').forEach(m => m.classList.remove('open'));
    
    if(!wasOpen){
      ms.classList.add('open');
      store.state.ui.openMs = ms.dataset.ms;
    } else {
      store.state.ui.openMs = null;
    }
  });

  // Tombol Tutup di dalam Dropdown
  onClick('[data-ms-close]', (btn) => {
    const ms = btn.closest('.ms');
    if(ms) ms.classList.remove('open');
    store.state.ui.openMs = null;
  });

  // Tombol Bersihkan
  onClick('[data-ms-clear]', (btn) => {
    const key = btn.dataset.msClear;
    store.state.filters[key].clear();
    store.emit();
  });

  // Tombol Pilih Semua
  onClick('[data-ms-all]', (btn) => {
    const key = btn.dataset.msAll;
    const pop = btn.closest('.ms-pop');
    if(!pop) return;
    const list = pop.querySelectorAll('[data-ms-chk]');
    const set = store.state.filters[key];
    list.forEach(c => {
      if(c.style.display === 'none') return;
      set.add(c.value);
    });
    store.emit();
  });

  // Centang Checkbox
  onChange('[data-ms-chk]', (chk) => {
    const key = chk.dataset.msChk;
    const set = store.state.filters[key];
    if(chk.checked) set.add(chk.value);
    else set.delete(chk.value);
    store.emit();
  });

  // Fitur Pencarian
  onInput('[data-ms-search]', (inp) => {
    const q = inp.value.toLowerCase();
    const pop = inp.closest('.ms-pop');
    if(!pop) return;
    pop.querySelectorAll('.ms-opt').forEach(opt => {
      opt.style.display = opt.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
    });
  });

  // Klik di luar area (layar gelap) untuk menutup
  document.addEventListener('click', (e) => {
    if(!e.target.closest('.ms')){
      document.querySelectorAll('.ms').forEach(m => m.classList.remove('open'));
      store.state.ui.openMs = null;
    }
  });
}

export function buildMultiselectStatic(key, label, values){
  if(!values.length){
    return `<div class="ms" data-ms="${key}"><button class="ms-btn" disabled>${esc(label)}</button></div>`;
  }
  const isDate = key === 'tanggal';
  return `<div class="ms" data-ms="${key}">
    <button class="ms-btn" data-ms-toggle type="button">
      ${esc(label)}<span class="cnt" data-cnt="${key}"></span><span class="car"></span>
    </button>
    <div class="ms-pop" style="display:none">
      <div style="text-align:center; margin-bottom:8px; font-weight:bold; color:#64748B; font-size:12px;">Filter ${esc(label)}</div>
      <input class="ms-search" placeholder="Cari..." data-ms-search="${key}">
      <div class="ms-list">
        ${values.map(v => `<label class="ms-opt">
          <input type="checkbox" data-ms-chk="${key}" value="${esc(v)}">
          <span>${esc(isDate ? fmtDateID(v) : v)}</span>
        </label>`).join('')}
      </div>
      <div class="ms-foot">
        <button type="button" data-ms-clear="${key}">Bersihkan</button>
        <button type="button" data-ms-all="${key}">Pilih Semua</button>
        <button type="button" data-ms-close="1" style="background:#1D4ED8; color:#fff; border-radius:4px; padding:4px 12px;">Tutup</button>
      </div>
    </div>
  </div>`;
}