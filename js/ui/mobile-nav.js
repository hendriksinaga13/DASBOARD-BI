import { listViews } from '../views/registry.js';
import { store } from '../core/store.js';

const MOBILE_TABS = ['overview', 'outlet', 'insight', 'target'];

const ICONS = {
  overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
  outlet:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  insight:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  target:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  more:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/></svg>',
};

export function renderMobileNav(container, state){
  if(!container) return;
  const views = listViews();
  const tabs = MOBILE_TABS.filter(id => views.find(v => v.id === id));
  const active = state.view;
  const inRest = views.find(v => v.id === active && !MOBILE_TABS.includes(v.id));

  container.innerHTML =
    tabs.map(id => {
      const v = views.find(x => x.id === id);
      const on = id === active;
      return `<button class="mnav-btn ${on ? 'on' : ''}" data-view="${id}" type="button">
        <span class="mnav-ico">${ICONS[id] || ''}</span>
        <span class="mnav-lbl">${v.label}</span>
      </button>`;
    }).join('') +
    `<button class="mnav-btn ${inRest ? 'on' : ''}" id="btnMoreNav" type="button">
      <span class="mnav-ico">${ICONS.more}</span>
      <span class="mnav-lbl">Lainnya</span>
    </button>`;
}

export function installMobileNav(){
  // Listener navigasi tab biasa
  document.addEventListener('click', (e) => {
    const navBtn = e.target.closest('.mnav-btn[data-view]');
    if(navBtn) {
      store.set({ view: navBtn.dataset.view });
      closeSheet();
      return;
    }

    // Listener Tombol "Lainnya"
    if (e.target.closest('#btnMoreNav')) {
      e.preventDefault();
      openMoreSheet();
      return;
    }

    // Listener klik area gelap untuk menutup
    if (e.target.id === 'sheetScrim') {
      closeSheet();
    }
  });
}

function openMoreSheet(){
  const sheet = document.getElementById('sheet');
  const scrim = document.getElementById('sheetScrim');
  
  if(!sheet || !scrim) {
    alert('Error: Elemen <div id="sheet"></div> tidak ditemukan di index.html');
    return;
  }

  const views = listViews();
  const rest  = views.filter(v => !MOBILE_TABS.includes(v.id));

  sheet.innerHTML = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Menu Lainnya</div>
    <div class="sheet-grid">
      ${rest.map(v => `<button class="sheet-item" data-sheet-nav="${v.id}" type="button">${v.label}</button>`).join('')}
    </div>
    <div class="sheet-foot">
      <button class="btn sm" id="btnCloseSheet" type="button">Tutup</button>
    </div>
  `;

  // Event untuk tombol di dalam sheet
  sheet.querySelectorAll('[data-sheet-nav]').forEach(btn => {
    btn.onclick = () => {
      store.set({ view: btn.dataset.sheetNav });
      closeSheet();
    };
  });

  const btnClose = sheet.querySelector('#btnCloseSheet');
  if(btnClose) btnClose.onclick = closeSheet;

  // Paksa tampil
  scrim.style.display = 'block';
  sheet.style.display = 'block';
  
  // Trigger animasi CSS
  setTimeout(() => {
    scrim.classList.add('on');
    sheet.classList.add('on');
  }, 10);
}

function closeSheet(){
  const sheet = document.getElementById('sheet');
  const scrim = document.getElementById('sheetScrim');
  if(!sheet || !scrim) return;

  sheet.classList.remove('on');
  scrim.classList.remove('on');

  // Sembunyikan setelah animasi selesai
  setTimeout(() => {
    sheet.style.display = 'none';
    scrim.style.display = 'none';
  }, 300);
}