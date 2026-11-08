/* ================================================================== */
/* PIVOT VIEW — Thin Orchestrator & Event Delegation                  */
/* ================================================================== */
import { esc } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered } from '../core/selectors.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';
import { downloadCSV } from '../plugins/export.js';
import { openModal, toast } from '../ui/feedback.js';

import {
  DIM_OPTS, MOpt, getCustomMeasures, saveCustomMeasures,
  getPivotList, defaultConfig, dimFn, scheduleSave,
  PRESET_KEY, processData,
  shell, builderBlock, renderPivotCardSafe
} from '../analytics/pivot/index.js';

/* ── UPDATE ── */
function update(container, state) {
  try {
    const list = getPivotList();
    const rows = selectFiltered(state) || [];
    
    // Render Form Builder
    patchHTML('#pivot-builder', builderBlock());
    
    // Render Cards (dibungkus data-card-id untuk event delegation modular)
    const html = list.map(cfg => `
      <div data-card-id="${esc(cfg.id)}">
        ${renderPivotCardSafe(cfg, rows, state)}
      </div>
    `).join('');
    
    patchHTML('#pivot-dashboard', html || `<div class="empty">Belum ada tabel.</div>`);
  } catch (err) {
    console.error('[Pivot] Update failed:', err);
    patchHTML('#pivot-dashboard', `
      <div style="border-left:4px solid #EF4444; background:#fff; border-radius:8px; padding:16px; border:1px solid #FECACA;">
        <div style="font-weight:800; color:#991B1B; margin-bottom:8px;">❌ Pivot gagal load</div>
        <div style="font-size:12px; color:#475569; margin-bottom:12px;">${esc(String(err.message || err))}</div>
        <button class="btn neg" onclick="localStorage.removeItem('m245.pivots'); location.reload();" style="padding:8px 16px;">🗑️ Reset Semua & Reload</button>
      </div>
    `);
  }
}

/* ── CUSTOM MEASURE MODAL ── */
function openCustomMeasureModal() {
  const custom = getCustomMeasures();
  const baseOpts = [
    { k: 'omset', l: 'Omset' }, { k: 'qty', l: 'Qty' }, { k: 'carton', l: 'Karton' },
    { k: 'invoice', l: 'Faktur' }, { k: 'outlet', l: 'Outlet' },
    { k: 'sku', l: 'SKU' }, { k: 'avg', l: 'Avg/Faktur' },
  ].map(o => `<option value="${o.k}">${o.l}</option>`).join('');

  const listHtml = custom.map(cm => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#F0FDF4; border:1px solid #BBF7D0; border-radius:6px; margin-bottom:6px;">
      <div>
        <div style="font-weight:800; font-size:12px; color:#166534;">${esc(cm.l)}</div>
        <div style="font-size:10px; color:#64748B;">${esc(MOpt(cm.num)?.l || cm.num)} ÷ ${esc(MOpt(cm.den)?.l || cm.den)} · ${cm.format || 'dec'}</div>
      </div>
      <button class="btn sm neg" onclick="window.__pivotDeleteCustom('${esc(cm.k)}')" style="padding:4px 8px;">✕</button>
    </div>
  `).join('') || '<div style="text-align:center; padding:16px; color:#94A3B8; font-size:12px;">Belum ada custom measure.</div>';

  openModal(`
    <div class="modal-h"><h3>⚖️ Custom Ratio Measure</h3><button class="x" onclick="window.__pivotCloseModal()">×</button></div>
    <div class="modal-b">
      <div style="margin-bottom:16px;">
        <div style="font-size:11px; font-weight:800; color:#475569; margin-bottom:8px;">DAFTAR</div>
        ${listHtml}
      </div>
      <div style="border-top:1px solid #E2E8F0; padding-top:16px;">
        <div style="font-size:11px; font-weight:800; color:#475569; margin-bottom:8px;">TAMBAH BARU</div>
        <label style="display:block; font-size:11px; color:#64748B; margin-bottom:4px;">Label</label>
        <input type="text" id="cmLabel" placeholder="Cth: Omset per Outlet" style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:6px; font-size:12px; margin-bottom:10px;">
        <div style="display:grid; grid-template-columns:1fr auto 1fr; gap:8px; align-items:center; margin-bottom:10px;">
          <select id="cmNum" style="padding:8px; border:1px solid #CBD5E1; border-radius:6px; font-size:12px;">${baseOpts}</select>
          <span style="font-size:16px; font-weight:800; color:#475569;">÷</span>
          <select id="cmDen" style="padding:8px; border:1px solid #CBD5E1; border-radius:6px; font-size:12px;">${baseOpts}</select>
        </div>
        <label style="display:block; font-size:11px; color:#64748B; margin-bottom:4px;">Format</label>
        <select id="cmFmt" style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:6px; font-size:12px; margin-bottom:12px;">
          <option value="dec">Desimal (0.00)</option>
          <option value="num">Angka</option>
          <option value="rp">Rupiah</option>
        </select>
        <button id="btnAddCustom" class="btn primary" style="width:100%; padding:10px;">+ Tambah</button>
      </div>
    </div>
  `);

  document.getElementById('btnAddCustom').onclick = () => {
    const label = document.getElementById('cmLabel').value.trim();
    const num = document.getElementById('cmNum').value;
    const den = document.getElementById('cmDen').value;
    const fmt = document.getElementById('cmFmt').value;
    if (!label) { alert('Label wajib diisi'); return; }
    if (num === den) { alert('Numerator dan denominator tidak boleh sama'); return; }
    const key = 'custom_ratio_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const custom = getCustomMeasures();
    custom.push({ k: key, l: label, num, den, format: fmt });
    store.state.ui.pivotCustomMeasures = custom;
    saveCustomMeasures();
    window.__pivotCloseModal();
    toast('✅ Custom measure "' + label + '" ditambahkan');
    store.emit();
  };
}

/* ── GLOBAL HANDLERS (Diakses via onclick di dalam render HTML) ── */
window.__pivotDeleteCustom = function(k) {
  const custom = getCustomMeasures().filter(c => c.k !== k);
  store.state.ui.pivotCustomMeasures = custom;
  saveCustomMeasures();
  getPivotList().forEach(cfg => {
    cfg.measures = cfg.measures.filter(m => m !== k);
    if (cfg.measures.length === 0) cfg.measures = ['omset'];
  });
  scheduleSave();
  window.__pivotCloseModal();
  toast('Custom measure dihapus');
  store.emit();
};

window.__pivotShowFilter = function(configId) {
  const cfg = getPivotList().find(c => c.id === configId);
  if (!cfg) return;
  const rows = selectFiltered(store.state) || [];
  const rFn = dimFn(cfg.rowLevels[0]);
  const allValues = Array.from(new Set(rows.map(r => rFn(r) || '—'))).sort();
  const currentFilter = cfg.activeRowFilter.length > 0 ? cfg.activeRowFilter : allValues;

  const checkboxHtml = allValues.map(v => {
    const isChecked = currentFilter.includes(v);
    return `<label style="display:flex; align-items:center; gap:8px; padding:6px 8px; border-bottom:1px solid #E2E8F0; cursor:pointer; font-size:12px;">
      <input type="checkbox" class="drill-filter-chk" value="${esc(v)}" ${isChecked ? 'checked' : ''}>
      <span>${esc(v)}</span>
    </label>`;
  }).join('');

  openModal(`
    <div class="modal-h"><h3>Filter ${esc(DIM_OPTS.find(o => o.k === cfg.rowLevels[0])?.l)}</h3><button class="x" onclick="window.__pivotCloseModal()">×</button></div>
    <div class="modal-b">
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <button class="btn sm" id="btnSelectAllFilter" style="flex:1;">Pilih Semua</button>
        <button class="btn sm" id="btnUnselectAllFilter" style="flex:1;">Kosongkan</button>
      </div>
      <div style="max-height:300px; overflow-y:auto; border:1px solid #E2E8F0; border-radius:6px;">${checkboxHtml}</div>
    </div>
    <div class="modal-f" style="padding:12px; border-top:1px solid #E2E8F0; text-align:right;">
      <button class="btn primary" id="btnApplyFilter">Terapkan</button>
    </div>
  `);

  document.getElementById('btnSelectAllFilter').onclick = () => document.querySelectorAll('.drill-filter-chk').forEach(chk => chk.checked = true);
  document.getElementById('btnUnselectAllFilter').onclick = () => document.querySelectorAll('.drill-filter-chk').forEach(chk => chk.checked = false);
  document.getElementById('btnApplyFilter').onclick = () => {
    const selected = Array.from(document.querySelectorAll('.drill-filter-chk:checked')).map(chk => chk.value);
    cfg.activeRowFilter = (selected.length === allValues.length) ? [] : selected;
    window.__pivotCloseModal();
    scheduleSave();
    store.emit();
  };
};

window.__pivotDrill = function(drillId, title) {
  const rows = (window.__pvDrillMemory && window.__pvDrillMemory[drillId]) || [];
  const totalRows = rows.length;
  const displayRows = rows.slice(0, 100);
  const tbody = displayRows.map(r => `
    <tr>
      <td style="padding:6px; border-bottom:1px solid #eee;">${esc(r.day)}</td>
      <td style="padding:6px; border-bottom:1px solid #eee;">${esc(r.invoice)}</td>
      <td style="padding:6px; border-bottom:1px solid #eee;">${esc(r.outlet)}</td>
      <td style="padding:6px; border-bottom:1px solid #eee;">${esc(r.product)}</td>
      <td class="num" style="padding:6px; border-bottom:1px solid #eee;">${Number(r.amount).toLocaleString('id-ID')}</td>
    </tr>
  `).join('');

  openModal(`
    <div class="modal-h"><h3>Detail: ${esc(title)}</h3><button class="x" onclick="window.__pivotCloseModal()">×</button></div>
    <div class="modal-b">
      <div class="mb12" style="font-size:12px; color:#64748B;">Menampilkan ${Math.min(totalRows, 100)} dari ${totalRows} baris.</div>
      <div class="tablewrap" style="max-height:400px; border:1px solid #E2E8F0; border-radius:6px;">
        <table style="width:100%; font-size:11px;">
          <thead style="background:#F8FAFC; position:sticky; top:0;"><tr><th>Tanggal</th><th>Faktur</th><th>Toko</th><th>Produk</th><th class="num">Amount</th></tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
    </div>
  `);
};

window.__pivotCloseModal = function() {
  const modal = document.getElementById('modal');
  const scrim = document.getElementById('modalScrim');
  if (modal && scrim) { scrim.classList.remove('on'); modal.innerHTML = ''; }
};

/* ================================================================== */
/* REGISTER VIEW                                                      */
/* ================================================================== */
registerView('pivot', {
  label: 'Pivot Table', title: 'Pivot Table', sub: 'Ultimate Dashboard Builder', shell, update,
  mount() {
    
    /* ── CLICK HANDLERS ── */
    document.addEventListener('click', e => {
      // 1. Shift+Click Cell untuk Copy Value
      const copyCell = e.target.closest('td[data-pv-copy]');
      if (copyCell && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        try {
          navigator.clipboard.writeText(copyCell.getAttribute('data-pv-copy')).then(() => {
            const prev = copyCell.style.boxShadow;
            copyCell.style.boxShadow = 'inset 0 0 0 2px #F59E0B';
            setTimeout(() => { copyCell.style.boxShadow = prev; }, 400);
          });
        } catch {}
        return;
      }

      // 2. Form Builder Toggle
      if (e.target.id === 'btnToggleBuilder') {
        store.state.ui.pivotBuilderOpen = !store.state.ui.pivotBuilderOpen;
        store.emit();
        return;
      }

      // 3. Card Collapse (Lipat)
      const toggleCardBtn = e.target.closest('[data-toggle-card]');
      if (toggleCardBtn) {
        const cfg = getPivotList().find(c => c.id === toggleCardBtn.getAttribute('data-toggle-card'));
        if (cfg) { cfg.isCollapsed = !cfg.isCollapsed; scheduleSave(); store.emit(); }
        return;
      }

      // 4. Toolbar Opsi Toggle
      const toggleTbBtn = e.target.closest('[data-toggle-toolbar]');
      if (toggleTbBtn) {
        const cfg = getPivotList().find(c => c.id === toggleTbBtn.getAttribute('data-toggle-toolbar'));
        if (cfg) { cfg.isToolbarOpen = !cfg.isToolbarOpen; scheduleSave(); store.emit(); }
        return;
      }

      // 5. Copy Tabel ke Excel (TSV)
      if (e.target.hasAttribute('data-copy-tsv')) {
        const cfg = getPivotList().find(c => c.id === e.target.getAttribute('data-copy-tsv'));
        if (!cfg) return;
        
        try {
          const { rowData, colKeys } = processData(selectFiltered(store.state), cfg, store.state);
          const showTotals = cfg.showTotals !== false;
          
          let tsv = cfg.rowLevels.join('/') + '\t';
          if (colKeys.length > 0) {
            colKeys.forEach(ck => {
               cfg.measures.forEach(m => tsv += `${ck} - ${MOpt(m).l}\t`);
            });
            if (showTotals) cfg.measures.forEach(m => tsv += `TOTAL - ${MOpt(m).l}\t`);
          } else {
            cfg.measures.forEach(m => tsv += `${MOpt(m).l}\t`);
          }
          tsv += '\n';

          rowData.forEach(r => {
            tsv += (r._type === 'child' ? '  - ' : (r._type === 'parent' ? '> ' : '')) + r.label + '\t';
            if (colKeys.length > 0) {
              colKeys.forEach(ck => {
                const cell = r.cells.find(c => c.label === ck);
                cfg.measures.forEach(m => tsv += (cell ? cell.measures[m] : 0) + '\t');
              });
              if (showTotals) cfg.measures.forEach(m => tsv += r.measures[m] + '\t');
            } else {
              cfg.measures.forEach(m => tsv += r.measures[m] + '\t');
            }
            tsv += '\n';
          });

          navigator.clipboard.writeText(tsv).then(() => {
            toast('✅ Tabel di-copy ke Clipboard (siap paste ke Excel)');
          }).catch(() => alert('Gagal copy ke clipboard'));
        } catch (err) {
          alert('Gagal copy: ' + err.message);
        }
        return;
      }

      // 6. Tambah Pivot Baru
      if (e.target.id === 'btnAddPivot') {
        const titleEl = document.getElementById('pvNewTitle');
        if (!titleEl) return;

        const title = titleEl.value.trim() || 'Tabel Analisis';
        const selectedCols = Array.from(document.querySelectorAll('.pv-col-chk:checked')).map(chk => chk.value);
        const selectedMeasures = Array.from(document.querySelectorAll('.pv-measure-chk:checked')).map(chk => chk.value);
        if (selectedMeasures.length === 0) { alert('Pilih minimal 1 Ukuran.'); return; }

        const row0El = document.getElementById('pvNewRow0');
        const row1El = document.getElementById('pvNewRow1');
        const row0 = row0El ? row0El.value : 'salesman';
        const row1 = row1El ? row1El.value : '';
        const rowLevels = row1 && row1 !== row0 ? [row0, row1] : [row0];

        const sortEl = document.getElementById('pvNewSort');
        const targetEl = document.getElementById('pvNewShowTarget');
        const sparkEl = document.getElementById('pvNewSparkline');
        const cumEl = document.getElementById('pvNewCumulative');

        getPivotList().push({
          ...defaultConfig(),
          id: 'pv-' + Date.now() + '-' + Math.floor(Math.random()*1000),
          title, rowLevels, rows: row0, cols: selectedCols,
          measures: selectedMeasures, 
          sort: sortEl ? sortEl.value : 'omset_desc',
          showTarget: targetEl ? targetEl.checked : false,
          showSparkline: sparkEl ? sparkEl.checked : false,
          cumulative: cumEl ? cumEl.checked : false,
        });

        if (titleEl) titleEl.value = '';
        if (targetEl) targetEl.checked = false;
        if (sparkEl) sparkEl.checked = false;
        if (cumEl) cumEl.checked = false;
        
        document.querySelectorAll('.pv-col-chk, .pv-measure-chk').forEach(chk => chk.checked = false);
        const omsetChk = document.querySelector('.pv-measure-chk[value="omset"]');
        if (omsetChk) omsetChk.checked = true;
        
        store.state.ui.pivotBuilderOpen = false;
        scheduleSave();
        store.emit();
        return;
      }

      // 7. Hapus Pivot
      if (e.target.hasAttribute('data-del-pivot')) {
        store.state.ui.pivotList = getPivotList().filter(c => c.id !== e.target.getAttribute('data-del-pivot'));
        scheduleSave();
        store.emit();
        return;
      }

      // 8. Reset Presets
      if (e.target.id === 'btnResetPresets') {
        if (confirm('Reset semua pivot ke default?')) {
          localStorage.removeItem(PRESET_KEY);
          store.state.ui.pivotList = null;
          store.emit();
        }
        return;
      }

      // 9. Manage Custom Measure Modal
      if (e.target.id === 'btnManageCustom') {
        openCustomMeasureModal();
        return;
      }

      // 10. Toggle Visual (Tabel / Grafik)
      if (e.target.hasAttribute('data-toggle-visual')) {
        const cfg = getPivotList().find(c => c.id === e.target.getAttribute('data-toggle-visual'));
        if (cfg) { cfg.visualMode = e.target.getAttribute('data-mode'); scheduleSave(); store.emit(); }
        return;
      }

      // 11. Toggle Density (S / M / L)
      if (e.target.hasAttribute('data-density')) {
        const cfg = getPivotList().find(c => c.id === e.target.getAttribute('data-density'));
        if (cfg) { cfg.density = e.target.getAttribute('data-val'); scheduleSave(); store.emit(); }
        return;
      }

      // 12. Toggle Border
      if (e.target.hasAttribute('data-border')) {
        const cfg = getPivotList().find(c => c.id === e.target.getAttribute('data-border'));
        if (cfg) { cfg.border = e.target.getAttribute('data-val'); scheduleSave(); store.emit(); }
        return;
      }

      // 13. Show Filter Row Modal
      if (e.target.hasAttribute('data-show-filter')) {
        window.__pivotShowFilter(e.target.getAttribute('data-show-filter'));
        return;
      }

      // 14. Zoom In / Out
      if (e.target.hasAttribute('data-zoom-in')) {
        const cfg = getPivotList().find(c => c.id === e.target.getAttribute('data-zoom-in'));
        if (cfg) { cfg.zoom = Math.min((cfg.zoom || 100) + 10, 200); scheduleSave(); store.emit(); }
        return;
      }
      if (e.target.hasAttribute('data-zoom-out')) {
        const cfg = getPivotList().find(c => c.id === e.target.getAttribute('data-zoom-out'));
        if (cfg) { cfg.zoom = Math.max((cfg.zoom || 100) - 10, 50); scheduleSave(); store.emit(); }
        return;
      }

      // 15. Sort by Header Click
      const sortTh = e.target.closest('[data-sort-measure]');
      if (sortTh) {
        const cfg = getPivotList().find(c => c.id === sortTh.getAttribute('data-cfg-id'));
        if (cfg) {
          const mKey = sortTh.getAttribute('data-sort-measure');
          if (cfg.sortBy === mKey) cfg.sortDir = cfg.sortDir === 'desc' ? 'asc' : 'desc';
          else { cfg.sortBy = mKey; cfg.sortDir = 'desc'; }
          scheduleSave();
          store.emit();
        }
        return;
      }

      // 16. Clear Sort
      if (e.target.hasAttribute('data-clear-sort')) {
        const cfg = getPivotList().find(c => c.id === e.target.getAttribute('data-clear-sort'));
        if (cfg) { cfg.sortBy = null; scheduleSave(); store.emit(); }
        return;
      }

      // 17. Export CSV
      if (e.target.hasAttribute('data-export-csv')) {
        const cfg = getPivotList().find(c => c.id === e.target.getAttribute('data-export-csv'));
        if (!cfg) return;
        try {
          const { rowData, colKeys } = processData(selectFiltered(store.state), cfg, store.state);
          const showTgt = cfg.showTarget && cfg.measures.includes('omset');
          const showTotals = cfg.showTotals !== false;
          
          const csvData = rowData.map(r => {
            const obj = { [cfg.rowLevels.join('/')]: (r._type === 'child' ? '  └ ' : (r._type === 'parent' ? '▶ ' : '')) + r.label };
            if (colKeys.length > 0) {
              colKeys.forEach(ck => {
                const cell = r.cells.find(c => c.label === ck);
                cfg.measures.forEach(mKey => {
                  const mLabel = MOpt(mKey)?.l || mKey;
                  obj[`${ck} - ${mLabel}`] = cell ? +(cell.measures[mKey]).toFixed(2) : 0;
                });
              });
              if (showTotals) {
                cfg.measures.forEach(mKey => {
                  const mLabel = MOpt(mKey)?.l || mKey;
                  obj[`TOTAL - ${mLabel}`] = +(r.measures[mKey]).toFixed(2);
                });
              }
            } else {
              cfg.measures.forEach(mKey => {
                const mLabel = MOpt(mKey)?.l || mKey;
                obj[mLabel] = +(r.measures[mKey]).toFixed(2);
              });
            }
            if (showTgt) {
              obj['Target'] = r.target;
              obj['Pencapaian %'] = r.pctCapai ? +r.pctCapai.toFixed(2) : 0;
              obj['GAP'] = r.gap;
            }
            return obj;
          });
          downloadCSV(csvData, cfg.title.replace(/[^a-z0-9]/gi, '_') + '.csv');
        } catch (err) {
          alert('Export gagal: ' + err.message);
        }
        return;
      }
    });

    /* ── CHANGE HANDLERS (MODULAR) ── */
    document.addEventListener('change', e => {
      // A. Tangkap perubahan dari Modul (data-module & data-key)
      const moduleId = e.target.getAttribute('data-module');
      const configKey = e.target.getAttribute('data-key');
      
      if (moduleId && configKey) {
        const cardEl = e.target.closest('[data-card-id]');
        if (cardEl) {
          const cfg = getPivotList().find(c => c.id === cardEl.getAttribute('data-card-id'));
          if (cfg) {
            let val = e.target.value;
            if (e.target.type === 'checkbox') val = e.target.checked;
            else if (e.target.type === 'number') val = parseFloat(val) || 0;
            
            cfg[configKey] = val;
            scheduleSave();
            store.emit();
            return;
          }
        }
      }
      
      // B. Fallback (jika ada elemen lama yang masih pakai data-pv-*)
      const fallbacks = [
        ['data-pv-pct', 'pctMode', v => v],
        ['data-pv-compare', 'compareMode', v => v],
        ['data-pv-cond', 'condFmt', v => v],
        ['data-pv-sparkmeasure', 'sparklineMeasure', v => v],
        ['data-pv-topn', 'topN', v => Math.max(0, parseInt(v, 10) || 0)],
        ['data-pv-threshold', 'thresholdValue', v => parseFloat(v) || 0],
        ['data-pv-cumulative', 'cumulative', (_, el) => el.checked],
        ['data-pv-sparkline', 'showSparkline', (_, el) => el.checked],
        ['data-pv-totals', 'showTotals', (_, el) => el.checked],
        ['data-pv-databars', 'showDataBars', (_, el) => el.checked],
      ];
      for (const [attr, key, conv] of fallbacks) {
        if (e.target.hasAttribute(attr)) {
          const cfg = getPivotList().find(c => c.id === e.target.getAttribute(attr));
          if (cfg) { cfg[key] = conv(e.target.value, e.target); scheduleSave(); store.emit(); }
          return;
        }
      }
    });

    /* ── INPUT HANDLERS (SEARCH & NOTES) ── */
    let _searchTimer = null;
    document.addEventListener('input', e => {
      // 1. HANDLER UNTUK ROW NOTES (Ketikan pengguna)
      if (e.target.classList.contains('pv-note-input')) {
        const label = e.target.getAttribute('data-row-label');
        const val = e.target.value;
        const NOTES_KEY = 'm245.pivotNotes';
        
        try {
          const notes = JSON.parse(localStorage.getItem(NOTES_KEY)) || {};
          if (val.trim()) notes[label] = val.trim();
          else delete notes[label];
          localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
          
          // Efek visual saat diketik: berubah kuning
          e.target.style.background = val.trim() ? '#FEF9C3' : 'transparent';
        } catch {}
        return; // Jangan trigger render ulang tabel agar kursor tidak hilang
      }

      // 2. HANDLER UNTUK SEARCH BAR
      if (e.target.hasAttribute('data-pv-search')) {
        const id = e.target.getAttribute('data-pv-search');
        const cfg = getPivotList().find(c => c.id === id);
        if (!cfg) return;
        
        cfg.searchText = e.target.value;
        scheduleSave();
        
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => {
          const wasFocused = document.activeElement?.hasAttribute?.('data-pv-search');
          const selStart = wasFocused ? document.activeElement.selectionStart : 0;
          store.emit();
          
          if (wasFocused) {
            const newInput = document.querySelector(`[data-pv-search="${id}"]`);
            if (newInput) {
              newInput.focus();
              try { newInput.setSelectionRange(selStart, selStart); } catch {}
            }
          }
        }, 280);
      }
    });
  },
});