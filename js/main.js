/* ═══════════════════════════════════════════════════════════════
   M245 Sales Intelligence — Main Entry (Super Safe Mode + AutoLoad)
   ═══════════════════════════════════════════════════════════════ */

import { store } from './core/store.js';
import { $, patchText } from './core/dom.js';
import { onClick, installEvents } from './core/events.js';
import { initFilters, FILTERS } from './filters/registry.js';
import { invalidateSelectors } from './core/selectors.js';

import { installFeedback, openModal, toast } from './ui/feedback.js';
import { installTable } from './ui/table.js';
import { installFilterBar, renderFilterBar } from './ui/filterbar.js';
import { installMultiselect } from './ui/multiselect.js';

import { installDrill } from './plugins/drill.js';
import { exportTransactions } from './plugins/export.js';
import { getView, listViews } from './views/registry.js';

import { registerServiceWorker, installPWAInstallPrompt } from './pwa/register.js';
import { renderMobileNav, installMobileNav } from './ui/mobile-nav.js';

const LOAD_ERRORS = [];

async function safeLoad(path, name){
  try {
    await import(path);
  } catch(e){
    console.error(`[LOAD FAIL] ${name}:`, e.message);
    LOAD_ERRORS.push({ name, path, error: e.message });
  }
}

async function bootstrap(){
  try {
    /* ── 1. LOAD SEMUA VIEWS ── */
    await safeLoad('./views/overview.js', 'overview');
    await safeLoad('./views/comparison.js', 'comparison');
    await safeLoad('./views/outlet.js', 'outlet');
    await safeLoad('./views/salesman.js', 'salesman');
    await safeLoad('./views/product.js', 'product');
    await safeLoad('./views/territory.js', 'territory');
    await safeLoad('./views/pivot.js', 'pivot');
    await safeLoad('./views/target.js', 'target');
    await safeLoad('./views/data.js', 'data');
    await safeLoad('./views/insight.js', 'insight');
    await safeLoad('./views/topoutlet.js', 'topoutlet');
    await safeLoad('./views/map.js', 'map');
    await safeLoad('./views/basket.js', 'basket');
    await safeLoad('./views/leaderboard.js', 'leaderboard');
    await safeLoad('./views/simulator.js', 'simulator');
    await safeLoad('./views/churn.js', 'churn');
    await safeLoad('./views/report.js', 'report');
    await safeLoad('./views/clv.js', 'clv');
    await safeLoad('./views/driver.js', 'driver');
    await safeLoad('./views/dataquality.js', 'dataquality');
    await safeLoad('./views/chatbot.js', 'chatbot');
    await safeLoad('./views/alerts.js', 'alerts');
    await safeLoad('./views/filtersetting.js', 'filtersetting');
    await safeLoad('./views/programs.js', 'programs');
    await safeLoad('./views/musthave.js', 'musthave');
    await safeLoad('./views/insentif.js', 'insentif');

    // Init khusus filter setting & overview control
    try {
      const fsetMod = await import('./views/filtersetting.js');
      if (fsetMod.initFilterPrefs) fsetMod.initFilterPrefs();
    } catch(e){}

    try {
      const ov = await import('./views/overview.js');
      if(ov.installOverviewControls) ov.installOverviewControls();
    } catch(e){}

    /* ── 2. TAMPILKAN ERROR BANNER JIKA ADA VIEW YANG GAGAL ── */
    if(LOAD_ERRORS.length > 0){
      const errHtml = `
        <div id="load-error-banner" style="position:fixed;top:0;left:0;right:0;background:#DC2626;color:#fff;padding:12px;z-index:999999;font-family:monospace;font-size:11px;max-height:50vh;overflow-y:auto;">
          <div style="font-weight:900;margin-bottom:8px;">⚠️ ${LOAD_ERRORS.length} FILE GAGAL DIMUAT:</div>
          ${LOAD_ERRORS.map(e => `
            <div style="margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.3);padding-bottom:6px;">
              <b>${e.name}</b> → ${e.path}<br>
              <span style="color:#FCA5A5;">${e.error}</span>
            </div>
          `).join('')}
          <button onclick="this.parentElement.remove()" style="margin-top:8px;background:#fff;color:#DC2626;border:none;padding:6px 12px;border-radius:4px;font-weight:800;cursor:pointer;">Tutup</button>
        </div>
      `;
      document.body.insertAdjacentHTML('afterbegin', errHtml);
    }

    /* ── 3. BOOTSTRAP STATE & PREFERENSI ── */
    initFilters(store.state.filters);

    try {
      const saved = localStorage.getItem('m245.targets');
      if(saved) store.state.targets = JSON.parse(saved);
    } catch(e){}

    try {
      const savedView = localStorage.getItem('m245.view');
      if(savedView && getView(savedView)) store.state.view = savedView;
    } catch(e){}

    if(!getView(store.state.view)) store.state.view = 'overview';

    /* ── 3.5 ⚡ AUTO-LOAD DATA DARI FOLDER data/ ── */
    try {
      const { autoLoadBundledFiles } = await import('./data/loader.js');
      const loaded = await autoLoadBundledFiles();
      if (loaded) {
        console.log('✅ Data otomatis dimuat dari folder data/');
      } else {
        console.log('ℹ️ Menggunakan data dari cache browser (tidak ada perubahan file)');
      }
    } catch(e) {
      console.warn('[AutoLoad] Gagal memuat file bundel:', e.message);
    }

    /* ── 4. INSTALLERS (Event, UI, dll) ── */
    installEvents();
    installFeedback();
    installTable();
    installFilterBar();
    installMultiselect();
    installDrill();
    installMobileNav();
    
    // ⚡ FITUR EKSPOR PDF/EXCEL/GAMBAR
    try {
      const exporterMod = await import('./core/exporter.js');
      if (exporterMod.bindQuickExport) exporterMod.bindQuickExport();
    } catch(e) {
      console.warn('⚠️ [Peringatan] Fitur Ekspor PDF/Excel belum siap.', e.message);
    }

    /* ── 5. NAVIGATION ── */
    onClick('[data-view]', (el) => {
      const id = el.dataset.view;
      if(!id || !getView(id)) return;
      store.set({ view: id });
      closeSidebar();
    });

    onClick('#hamb', () => toggleSidebar());
    onClick('#scrim', () => closeSidebar());

    function toggleSidebar(){
      const sidebar = $('#sidebar');
      const scrim = $('#scrim');
      if(!sidebar) return;
      if(sidebar.classList.contains('open')){ closeSidebar(); return; }
      sidebar.classList.add('open');
      if(scrim) scrim.classList.add('on');
    }

    function closeSidebar(){
      const s = $('#sidebar');
      const sc = $('#scrim');
      if(s) s.classList.remove('open');
      if(sc) sc.classList.remove('on');
    }

    /* ── 6. QUICK ACTIONS ── */
    onClick('#actionsBtn', () => openQuickActions());

    function openQuickActions(){
      const state = store.state;
      const hasData = state.rows.length > 0;
      openModal(`
        <div class="modal-h"><h3>Aksi Cepat</h3><button class="x">×</button></div>
        <div class="modal-b">
          <div style="display:grid;gap:10px;grid-template-columns:1fr 1fr">
            <button class="btn primary" data-qa="data">📂 Muat Data</button>
            <button class="btn" data-qa="insight" ${hasData ? '' : 'disabled'}>🧠 AI Insight</button>
            <button class="btn" data-qa="chatbot" ${hasData ? '' : 'disabled'}>💬 Ask M245</button>
            <button class="btn" data-qa="alerts" ${hasData ? '' : 'disabled'}>🚨 Alert Center</button>
            <button class="btn" data-qa="report" ${hasData ? '' : 'disabled'}>🖨️ Cetak Laporan</button>
            <button class="btn" data-qa="export-tx" ${hasData ? '' : 'disabled'}>⬇ Ekspor CSV</button>
            <button class="btn" data-qa="reset" ${hasData ? '' : 'disabled'}>↺ Reset Filter</button>
            <button class="btn" data-qa="filtersetting">⚙️ Filter Settings</button>
          </div>
        </div>
      `);
      const modal = document.getElementById('modal');
      modal.querySelectorAll('[data-qa]').forEach(btn => {
        btn.addEventListener('click', () => {
          const k = btn.dataset.qa;
          document.getElementById('modalScrim').classList.remove('on');
          modal.innerHTML = '';
          handleQuickAction(k);
        });
      });
    }

    function handleQuickAction(k){
      if(k === 'data') store.set({ view: 'data' });
      else if(k === 'insight') store.set({ view: 'insight' });
      else if(k === 'chatbot') store.set({ view: 'chatbot' });
      else if(k === 'alerts') store.set({ view: 'alerts' });
      else if(k === 'report') store.set({ view: 'report' });
      else if(k === 'filtersetting') store.set({ view: 'filtersetting' });
      else if(k === 'export-tx') exportTransactions();
      else if(k === 'reset'){
        const f = store.state.filters;
        f.from = ''; f.to = ''; f.q = ''; f.transtype = 'ALL';
        for(const key in FILTERS){
          if(f[key] && typeof f[key].clear === 'function') f[key].clear();
        }
        store.state.ui.openMs = null;
        const c = document.getElementById('filterbar');
        if(c) c._sig = null;
        invalidateSelectors();
        store.emit();
        toast('Filter di-reset');
      }
    }

    /* ── 7. RENDER LOOP ── */
    let _currentViewId = null;
    const _mountedViews = new Set();

    function render(state){
      const view = getView(state.view);
      if(!view) {
        patchText('#pageTitle', 'View Error');
        patchText('#pageSub', `View "${state.view}" tidak ditemukan`);
        return;
      }

      patchText('#pageTitle', view.title || view.label);
      patchText('#pageSub', view.sub || '—');

      const filterbar = document.getElementById('filterbar');
      if(filterbar) renderFilterBar(filterbar, state);

      const container = document.getElementById('view');
      if(!container) return;

      if(state.view !== _currentViewId){
        container.innerHTML = view.shell();
        _currentViewId = state.view;
        try { localStorage.setItem('m245.view', state.view); } catch(e){}
        if(!_mountedViews.has(state.view) && typeof view.mount === 'function'){
          try { view.mount(); } catch(e){ console.warn('[mount]', e); }
          _mountedViews.add(state.view);
        }
      }

      try { view.update(container, state); }
      catch(e){ 
        console.error('[update]', state.view, e);
        container.innerHTML = `<div style="padding:24px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;color:#991B1B;font-size:13px;">
          <b>View Error:</b> ${e.message}<br>
          <span style="font-size:11px;color:#64748B;">Cek console browser untuk detail.</span>
        </div>`;
      }

      // Sidebar nav
      const nav = document.getElementById('nav');
      if(nav){
        const views = listViews();
        nav.innerHTML = views.map(v => `
          <button class="nav-link ${v.id === state.view ? 'on' : ''}" data-view="${v.id}" type="button">
            <span class="nav-lbl">${v.label}</span>
          </button>
        `).join('');
      }

      // Mobile nav
      renderMobileNav(document.getElementById('mobileNav'), state);

      // Meta chip
      const chip = document.getElementById('chipMeta');
      if(chip){
        const hasData = state.rows.length > 0;
        const dot = chip.querySelector('.dot');
        const label = chip.querySelector('span:last-child');
        if(dot) dot.style.background = hasData ? 'var(--pos, #10B981)' : 'var(--muted, #94A3B8)';
        if(label) label.textContent = hasData ? state.rows.length.toLocaleString('id-ID') + ' baris' : 'Belum ada data';
      }
    }

    store.sub(render);
    render(store.state);

    /* ── 8. PWA ── */
    try {
      registerServiceWorker();
      installPWAInstallPrompt();
    } catch(e) {
      console.warn('PWA init failed:', e);
    }

    console.log('✅ M245 Loaded. Errors:', LOAD_ERRORS.length);

  } catch (fatalError) {
    // Jika terjadi error fatal di level atas, tampilkan di layar (tidak akan putih polos)
    console.error('FATAL ERROR:', fatalError);
    document.body.innerHTML = `
      <div style="padding:40px; font-family:sans-serif; text-align:center; background:#FEF2F2; height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center;">
        <h1 style="color:#DC2626; font-size:24px;">Aplikasi Gagal Dimuat</h1>
        <p style="color:#7F1D1D; max-width:500px; margin-bottom:20px;">Terjadi kesalahan kritis. Silakan laporkan pesan di bawah ini ke developer.</p>
        <pre style="background:#fff; padding:16px; border-radius:8px; border:1px solid #FECACA; text-align:left; overflow:auto; max-width:90%; font-size:12px;">${fatalError.message}\n\n${fatalError.stack || ''}</pre>
        <button onclick="location.reload()" style="margin-top:20px; padding:10px 20px; background:#DC2626; color:white; border:none; border-radius:8px; cursor:pointer;">Muat Ulang</button>
      </div>
    `;
  }
}

bootstrap();