/* ═══════════════════════════════════════════════════════════════
   M245 Sales Intelligence — Main Entry (Anti-Crash Network)
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
import { installDetailView } from './ui/detail-view.js';

import { installDrill } from './plugins/drill.js';
import { exportTransactions } from './plugins/export.js';
import { getView, listViews } from './views/registry.js';

import { registerServiceWorker, installPWAInstallPrompt } from './pwa/register.js';
import { renderMobileNav, installMobileNav } from './ui/mobile-nav.js';

import { getSession, showLogin } from './sync/auth.js';
import { initSync, onSyncChange, syncNow } from './sync/engine.js';
import { pullAll } from './sync/pull.js';
import { activateMonth, activateRange, getAllMonths } from './data/lazy.js';

const LOAD_ERRORS = [];
let isAppStarted = false;

function startSync() {
  initSync();
  mountBadge();
}

function mountBadge() {
  if (document.getElementById('sync-badge')) return;
  const badge = document.createElement('div');
  badge.id = 'sync-badge';
  badge.style.cssText = `position:fixed;right:12px;bottom:80px;z-index:9999;background:#111;color:#fff;font:12px/1.4 system-ui;padding:6px 10px;border-radius:6px;opacity:.85;cursor:pointer;user-select:none;box-shadow:0 4px 12px rgba(0,0,0,0.15);`;
  document.body.appendChild(badge);

  const render = (s) => {
    const dot = !s.online ? '🔴' : s.syncing ? '🟡' : s.pending ? '🟠' : '🟢';
    const txt = !s.online ? 'offline' : s.syncing ? 'syncing…' : s.pending ? `${s.pending} antre` : 'tersinkron';
    badge.textContent = `${dot} ${txt}`;
    badge.title = s.lastError || (s.lastSync ? new Date(s.lastSync).toLocaleString() : '');
  };
  onSyncChange(render);
  render({ online: navigator.onLine, syncing: false, pending: 0 });
  badge.onclick = () => syncNow();
}

async function safeLoad(path, name) {
  try {
    await import(path);
  } catch (e) {
    console.error(`[LOAD FAIL] ${name}:`, e.message);
    LOAD_ERRORS.push({ name, path, error: e.message });
  }
}

async function bootstrap() {
  if (isAppStarted) return;
  isAppStarted = true;

  try {
    await safeLoad('./views/overview.js', 'overview');
    await safeLoad('./views/comparison.js', 'comparison');
    await safeLoad('./views/outlet.js', 'outlet');
    await safeLoad('./views/salesman.js', 'salesman');
    await safeLoad('./views/product.js', 'product');
    await safeLoad('./views/territory.js', 'territory');
    await safeLoad('./views/pivot.js', 'pivot');
    await safeLoad('./views/target.js', 'target');
    await safeLoad('./views/settings/index.js', 'settings');
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
    await safeLoad('./views/programs.js', 'programs');          // ← RESTORE
    await safeLoad('./views/musthave.js', 'musthave');
    await safeLoad('./views/insentif.js', 'insentif');

    try {
      const fsetMod = await import('./views/filtersetting.js');
      if (fsetMod.initFilterPrefs) fsetMod.initFilterPrefs();
    } catch (e) {}
    try {
      const ov = await import('./views/overview.js');
      if (ov.installOverviewControls) ov.installOverviewControls();
    } catch (e) {}

    if (LOAD_ERRORS.length > 0) {
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

    initFilters(store.state.filters);

    try {
      const saved = localStorage.getItem('m245.targets');
      if (saved) store.state.targets = JSON.parse(saved);
    } catch (e) {}

    try {
      const savedView = localStorage.getItem('m245.view');
      if (savedView && getView(savedView)) store.state.view = savedView;
    } catch (e) {}

    if (!getView(store.state.view)) store.state.view = 'overview';

    try {
      const { autoLoadBundledFiles, recoverFilesFromCache } = await import('./data/loader.js');
      await autoLoadBundledFiles().catch(() => {});
      if (store.state.files.length === 0) {
        await recoverFilesFromCache().catch(() => {});
      }
    } catch (e) {
      console.warn('[AutoLoad] Skip:', e.message);
    }

    installEvents();
    installFeedback();
    installTable();
    installFilterBar();
    installMultiselect();
    installDrill();
    installMobileNav();
    installDetailView();

    try {
      const exporterMod = await import('./core/exporter.js');
      if (exporterMod.bindQuickExport) exporterMod.bindQuickExport();
    } catch (e) {}

    onClick('[data-view]', (el) => {
      const id = el.dataset.view;
      if (!id || !getView(id)) return;
      store.set({ view: id });
      closeSidebar();
    });
    onClick('#hamb', () => toggleSidebar());
    onClick('#scrim', () => closeSidebar());

    function toggleSidebar() {
      const sidebar = $('#sidebar');
      const scrim = $('#scrim');
      if (!sidebar) return;
      if (sidebar.classList.contains('open')) { closeSidebar(); return; }
      sidebar.classList.add('open');
      if (scrim) scrim.classList.add('on');
    }
    function closeSidebar() {
      const s = $('#sidebar');
      const sc = $('#scrim');
      if (s) s.classList.remove('open');
      if (sc) sc.classList.remove('on');
    }

    onClick('#actionsBtn', () => openQuickActions());

    function openQuickActions() {
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
            <button class="btn" data-qa="reset-cache" style="grid-column: span 2; background:#FEF2F2; color:#DC2626; border:1px solid #FECACA; font-weight:bold; margin-top:8px;">
              🗑️ Bersihkan Tumpukan Cache (Reset Aplikasi)
            </button>
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

    function handleQuickAction(k) {
      if (k === 'data') store.set({ view: 'data' });
      else if (k === 'insight') store.set({ view: 'insight' });
      else if (k === 'chatbot') store.set({ view: 'chatbot' });
      else if (k === 'alerts') store.set({ view: 'alerts' });
      else if (k === 'report') store.set({ view: 'report' });
      else if (k === 'filtersetting') store.set({ view: 'filtersetting' });
      else if (k === 'export-tx') exportTransactions();
      else if (k === 'reset') {
        const f = store.state.filters;
        f.from = ''; f.to = ''; f.q = ''; f.transtype = 'ALL';
        for (const key in FILTERS) {
          if (f[key] && typeof f[key].clear === 'function') f[key].clear();
        }
        store.state.ui.openMs = null;
        const c = document.getElementById('filterbar');
        if (c) c._sig = null;
        invalidateSelectors();
        store.emit();
        toast('Filter di-reset');
      }
      else if (k === 'reset-cache') {
        if (confirm('Hapus semua data file lokal di HP ini?\n\n(Catatan: Data di Supabase/Cloud TIDAK akan terhapus). Aplikasi akan dimuat ulang.')) {
          indexedDB.deleteDatabase('m245');
          indexedDB.deleteDatabase('m245-outbox');
          localStorage.clear();
          location.reload();
        }
      }
    }

    function openMonthPicker() {
      const state = store.state;
      const allMonths = getAllMonths().slice().reverse();
      const selected = new Set(
        state.activeMode === 'range'
          ? (state.activeRange?.months || [])
          : (state.activeMonth ? [state.activeMonth] : [])
      );

      const checkboxes = allMonths.map(m => `
        <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;border:1px solid #e2e8f0;margin-bottom:6px;background:${selected.has(m) ? '#EFF6FF' : '#fff'};transition:background .15s">
          <input type="checkbox" value="${m}" ${selected.has(m) ? 'checked' : ''} style="width:18px;height:18px;accent-color:#3b82f6;cursor:pointer">
          <span style="font-weight:600;color:#0f172a;font-size:14px">📅 ${m}</span>
        </label>
      `).join('');

      openModal(`
        <div class="modal-h"><h3>Pilih Bulan</h3><button class="x">×</button></div>
        <div class="modal-b">
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
            <button class="btn" data-preset="1" type="button">1 Bln</button>
            <button class="btn" data-preset="3" type="button">3 Bln</button>
            <button class="btn" data-preset="6" type="button">6 Bln</button>
            <button class="btn" data-preset="12" type="button">12 Bln</button>
            <button class="btn" data-preset="all" type="button">Semua</button>
            <button class="btn" data-preset="clear" type="button">Kosongkan</button>
          </div>
          <div id="months-checklist" style="max-height:50vh;overflow-y:auto;padding:4px">
            ${checkboxes || '<div style="text-align:center;color:#94a3b8;padding:24px">Belum ada data bulan</div>'}
          </div>
          <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:8px">
            <span id="month-count" style="color:#64748b;font-size:13px;font-weight:600">${selected.size} bulan dipilih</span>
            <button class="btn primary" id="apply-months" type="button">Terapkan</button>
          </div>
        </div>
      `);

      const modal = document.getElementById('modal');
      const checklist = modal.querySelector('#months-checklist');
      const countEl = modal.querySelector('#month-count');

      function updateCount() {
        const n = checklist.querySelectorAll('input:checked').length;
        countEl.textContent = `${n} bulan dipilih`;
        checklist.querySelectorAll('label').forEach(lb => {
          const cb = lb.querySelector('input');
          lb.style.background = cb.checked ? '#EFF6FF' : '#fff';
        });
      }

      checklist.addEventListener('change', updateCount);

      modal.querySelectorAll('[data-preset]').forEach(btn => {
        btn.onclick = () => {
          const p = btn.dataset.preset;
          const boxes = checklist.querySelectorAll('input');
          if (p === 'clear') boxes.forEach(b => b.checked = false);
          else if (p === 'all') boxes.forEach(b => b.checked = true);
          else {
            const n = parseInt(p, 10);
            boxes.forEach((b, i) => b.checked = i < n);
          }
          updateCount();
        };
      });

      modal.querySelector('#apply-months').onclick = async () => {
        const months = [...checklist.querySelectorAll('input:checked')].map(b => b.value);
        if (!months.length) { toast('Pilih minimal 1 bulan'); return; }

        document.getElementById('modalScrim').classList.remove('on');
        modal.innerHTML = '';

        if (months.length === 1) {
          await activateMonth(months[0]);
        } else {
          const sorted = [...months].sort();
          const label = months.length <= 3
            ? months.slice().sort().reverse().join(', ')
            : `${sorted[0]} – ${sorted[sorted.length - 1]}`;
          await activateRange(months, label);
        }
      };
    }

    let _currentViewId = null;
    const _mountedViews = new Set();

    function render(state) {
      const view = getView(state.view);
      if (!view) {
        patchText('#pageTitle', 'View Error');
        patchText('#pageSub', `View "${state.view}" tidak ditemukan`);
        return;
      }

      patchText('#pageTitle', view.title || view.label);
      patchText('#pageSub', view.sub || '—');

      const monthBtn = document.getElementById('monthSelector');
      if (monthBtn) {
        const allMonths = getAllMonths();

        if (allMonths.length > 0) {
          monthBtn.style.display = 'inline-block';

          let label = '📅 Pilih Bulan';
          if (state.activeMode === 'month' && state.activeMonth) {
            label = `📅 ${state.activeMonth}`;
          } else if (state.activeMode === 'range' && state.activeRange) {
            const months = state.activeRange.months || [];
            if (months.length === 1) {
              label = `📅 ${months[0]}`;
            } else if (months.length <= 3) {
              label = `📅 ${months.slice().sort().reverse().join(', ')}`;
            } else {
              const sorted = [...months].sort();
              label = `📅 ${sorted[0]} – ${sorted[sorted.length - 1]} (${months.length})`;
            }
          }
          monthBtn.textContent = label;

          if (!monthBtn._bound) {
            monthBtn._bound = true;
            monthBtn.onclick = () => openMonthPicker();
          }
        } else {
          monthBtn.style.display = 'none';
        }
      }

      const filterbar = document.getElementById('filterbar');
      if (filterbar) renderFilterBar(filterbar, state);

      const container = document.getElementById('view');
      if (!container) return;

      if (state.view !== _currentViewId) {
        container.innerHTML = view.shell();
        _currentViewId = state.view;
        try { localStorage.setItem('m245.view', state.view); } catch (e) {}
        if (!_mountedViews.has(state.view) && typeof view.mount === 'function') {
          try { view.mount(); } catch (e) { console.warn('[mount]', e); }
          _mountedViews.add(state.view);
        }
      }

      try { view.update(container, state); }
      catch (e) {
        console.error('[update]', state.view, e);
        container.innerHTML = `<div style="padding:24px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;color:#991B1B;font-size:13px;">
          <b>View Error:</b> ${e.message}<br>
          <span style="font-size:11px;color:#64748B;">Cek console browser untuk detail.</span>
        </div>`;
      }

      const nav = document.getElementById('nav');
      if (nav) {
        const views = listViews();
        nav.innerHTML = views.map(v => `
          <button class="nav-link ${v.id === state.view ? 'on' : ''}" data-view="${v.id}" type="button">
            <span class="nav-lbl">${v.label}</span>
          </button>
        `).join('');
      }

      renderMobileNav(document.getElementById('mobileNav'), state);

      const chip = document.getElementById('chipMeta');
      if (chip) {
        const hasData = state.rows.length > 0;
        const dot = chip.querySelector('.dot');
        const label = chip.querySelector('span:last-child');
        if (dot) dot.style.background = hasData ? 'var(--pos, #10B981)' : 'var(--muted, #94A3B8)';
        if (label) label.textContent = hasData ? state.rows.length.toLocaleString('id-ID') + ' baris' : 'Belum ada data';
      }
    }

    store.sub(render);
    render(store.state);

    try {
      registerServiceWorker();
      installPWAInstallPrompt();
    } catch (e) {
      console.warn('PWA init failed:', e);
    }

    console.log('✅ M245 Loaded. Errors:', LOAD_ERRORS.length);

  } catch (fatalError) {
    console.error('FATAL ERROR:', fatalError);
    document.body.innerHTML = `
      <div style="padding:40px; font-family:sans-serif; text-align:center; background:#FEF2F2; height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center;">
        <h1 style="color:#DC2626; font-size:24px;">Aplikasi Gagal Dimuat</h1>
        <p style="color:#7F1D1D; max-width:500px; margin-bottom:20px;">Terjadi kesalahan kritis.</p>
        <pre style="background:#fff; padding:16px; border-radius:8px; border:1px solid #FECACA; text-align:left; overflow:auto; max-width:90%; font-size:12px;">${fatalError.message}\n\n${fatalError.stack || ''}</pre>
        <button onclick="location.reload()" style="margin-top:20px; padding:10px 20px; background:#DC2626; color:white; border:none; border-radius:8px; cursor:pointer;">Muat Ulang</button>
      </div>
    `;
  }
}

async function initApp() {
  try {
    const session = await getSession().catch(() => null);

    if (session) {
      startSync();
      pullAll().catch(e => console.warn('Pull offline:', e.message));
      bootstrap();
    } else {
      showLogin(async () => {
        startSync();
        await pullAll().catch(e => console.warn('Pull offline:', e.message));
        bootstrap();
      });
    }
  } catch (err) {
    console.error("Gagal cek sesi:", err);
    showLogin(async () => {
      startSync();
      await pullAll().catch(e => console.warn('Pull offline:', e.message));
      bootstrap();
    });
  }
}

initApp();