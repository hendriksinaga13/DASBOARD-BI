import { esc, fmtDateID } from '../core/utils.js';
import { store } from '../core/store.js';

let installed = false;

export function installMultiselect(){
  if(installed) return;
  installed = true;

  document.addEventListener('click', (e) => {
    // 1. Toggle buka/tutup dropdown
    const toggle = e.target.closest('[data-ms-toggle]');
    if (toggle) {
      e.preventDefault();
      e.stopPropagation();
      const ms = toggle.closest('.ms');
      if (!ms) return;
      const wasOpen = ms.classList.contains('open');
      document.querySelectorAll('.ms').forEach(m => m.classList.remove('open'));
      if (!wasOpen) {
        ms.classList.add('open');
        // ⚡ Defensive: hapus inline display:none yang mungkin tersisa dari HTML lama
        const pop = ms.querySelector('.ms-pop');
        if (pop) pop.style.removeProperty('display');
        if (store.state.ui) store.state.ui.openMs = ms.dataset.ms;
      } else {
        if (store.state.ui) store.state.ui.openMs = null;
      }
      return;
    }

    // 2. Tombol Tutup
    const closeBtn = e.target.closest('[data-ms-close]');
    if (closeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const ms = closeBtn.closest('.ms');
      if (ms) ms.classList.remove('open');
      if (store.state.ui) store.state.ui.openMs = null;
      return;
    }

    // 3. Tombol Bersihkan
    const clearBtn = e.target.closest('[data-ms-clear]');
    if (clearBtn) {
      e.preventDefault();
      e.stopPropagation();
      const key = clearBtn.dataset.msClear;
      const set = store.state.filters[key];
      if (set && typeof set.clear === 'function') {
        set.clear();
        store.emit();
      }
      return;
    }

    // 4. Tombol Pilih Semua
    const allBtn = e.target.closest('[data-ms-all]');
    if (allBtn) {
      e.preventDefault();
      e.stopPropagation();
      const key = allBtn.dataset.msAll;
      const pop = allBtn.closest('.ms-pop');
      if (!pop) return;
      const set = store.state.filters[key];
      if (!set) return;
      pop.querySelectorAll('[data-ms-chk]').forEach(c => {
        if (c.offsetParent === null) return;
        set.add(c.value);
      });
      store.emit();
      return;
    }

    // 5. Klik di luar → tutup semua
    if (!e.target.closest('.ms')) {
      document.querySelectorAll('.ms').forEach(m => m.classList.remove('open'));
      if (store.state.ui) store.state.ui.openMs = null;
    }
  });

  document.addEventListener('change', (e) => {
    const chk = e.target.closest('[data-ms-chk]');
    if (!chk) return;
    const key = chk.dataset.msChk;
    const set = store.state.filters[key];
    if (!set) return;
    if (chk.checked) set.add(chk.value);
    else set.delete(chk.value);
    store.emit();
  });

  document.addEventListener('input', (e) => {
    const inp = e.target.closest('[data-ms-search]');
    if (!inp) return;
    const q = inp.value.toLowerCase();
    const pop = inp.closest('.ms-pop');
    if (!pop) return;
    pop.querySelectorAll('.ms-opt').forEach(opt => {
      const txt = (opt.textContent || '').toLowerCase();
      opt.style.display = txt.includes(q) ? '' : 'none';
    });
  });
}

export function buildMultiselectStatic(key, label, values){
  if(!values.length){
    return `<div class="ms" data-ms="${key}"><button class="ms-btn" disabled>${esc(label)}</button></div>`;
  }
  const isDate = key === 'tanggal';

  // ⚠️ TIDAK ADA style="display:none" — display diatur CSS
  return `<div class="ms" data-ms="${key}">
    <button class="ms-btn" data-ms-toggle type="button">
      ${esc(label)}<span class="cnt" data-cnt="${key}"></span><span class="car"></span>
    </button>
    <div class="ms-pop">
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