// js/views/settings/insentif.js
import { esc } from '../../core/utils.js';
import { store } from '../../core/store.js';
import { setGlobalSetting } from '../../sync/crud.js';
import { renderInsentifForms } from '../../ui/settings/insentif.js';
import { selectFiltered } from '../../core/selectors.js';
import { DS } from '../../core/datasource.js';
import { openModal } from '../../ui/feedback.js';

export function renderInsentifSettingsView(state) {
  // ⚡ 1. Pastikan wadah state selalu ada
  if (!state.settings) state.settings = {};
  if (!state.settings.insentif) state.settings.insentif = { _default: { kpis: [], tiers: {} } };
  
  const insData = state.settings.insentif;
  const allSalesman = Array.from(new Set(selectFiltered(state).filter(r => r.tt === 'F').map(r => r.salesman))).sort();
  
  let targetOptions = [
    { value: '_default', label: '🌐 Default (Semua Salesman)' },
    ...allSalesman.map(sm => ({ value: sm, label: `👤 ${sm}` }))
  ];

  let currentTarget = window._insCurrentTarget || '_default';
  
  // ⚡ 2. Pastikan data target selalu ada
  if (!insData[currentTarget]) {
    insData[currentTarget] = { kpis: [], tiers: {} };
  }
  let scheme = insData[currentTarget];

  const buildKpiList = () => {
    if (!scheme.kpis || scheme.kpis.length === 0) {
      return `<div style="text-align:center; color:#757575; padding:10px;">Belum ada KPI. Klik Tambah.</div>`;
    }
    
    return scheme.kpis.map((k, idx) => {
      const tiers = scheme.tiers[k.id] || [];
      const tierRows = tiers.map((t, ti) => `
        <div class="tier-row">
          <input type="number" class="tier-input tier-min" data-kpi="${k.id}" data-idx="${ti}" value="${t.min}" placeholder="Min">
          <span>-</span>
          <input type="number" class="tier-input tier-max" data-kpi="${k.id}" data-idx="${ti}" value="${t.max}" placeholder="Max">
          <span>${k.hasTarget ? '%' : 'Nilai'}</span>
          <span>Rp</span>
          <input type="number" class="tier-input tier-amount" data-kpi="${k.id}" data-idx="${ti}" value="${t.amount}" placeholder="Nominal">
          <button class="btn sm neg btn-del-tier" data-kpi="${k.id}" data-idx="${ti}">✕</button>
        </div>
      `).join('');

      return `
        <div class="tier-box" data-kpi="${k.id}">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <div style="font-weight:800; color:#1D4ED8;">${esc(k.label)}</div>
            <button class="btn sm neg btn-del-kpi" data-idx="${idx}">Hapus KPI</button>
          </div>
          <div style="font-size:11px; color:#757575; margin-bottom:8px;">Tipe: ${k.mode === 'auto' ? 'Otomatis (Data)' : 'Manual Input'}</div>
          <div class="tier-container">${tierRows}</div>
          <button class="btn sm mt12 btn-add-tier" data-kpi="${k.id}" style="width:100%; background:#E2E8F0;">+ Tambah Tier</button>
        </div>
      `;
    }).join('');
  };

  setTimeout(() => mountInsentifListeners(), 0);

  return renderInsentifForms({
    targetOptions,
    currentTarget,
    kpiList: buildKpiList()
  });
}

// ⚡ Variabel global penanda listener sudah terpasang
let _insListenerReady = false;

function mountInsentifListeners() {
  // Hapus guard karena kita pakai getCurrentScheme() yang selalu ambil data terbaru
  if (_insListenerReady) return;
  _insListenerReady = true;

  // ⚡ FUNGSI SAKTI: Selalu ambil data paling segar dari store.state
  function getCurrentScheme() {
    const state = store.state;
    if (!state.settings) state.settings = {};
    if (!state.settings.insentif) state.settings.insentif = { _default: { kpis: [], tiers: {} } };
    const currentTarget = window._insCurrentTarget || '_default';
    if (!state.settings.insentif[currentTarget]) {
      state.settings.insentif[currentTarget] = { kpis: [], tiers: {} };
    }
    return { scheme: state.settings.insentif[currentTarget], currentTarget };
  }

  // Ganti Target
  document.addEventListener('change', e => {
    if (e.target.id === 'insTargetSel') {
      window._insCurrentTarget = e.target.value;
      store.emit();
    }
  });

  // Tambah KPI - Buka Modal
  document.addEventListener('click', e => {
    if (e.target.id === 'btnAddKpiRow') {
      const { scheme, currentTarget } = getCurrentScheme();
      openKpiSelectorModal(scheme, currentTarget);
    }
  });

  // Hapus KPI
  document.addEventListener('click', e => {
    const delBtn = e.target.closest('.btn-del-kpi');
    if (delBtn) {
      const { scheme } = getCurrentScheme();
      const idx = +delBtn.dataset.idx;
      scheme.kpis.splice(idx, 1);
      store.emit();
    }
  });

  // Tambah Tier
  document.addEventListener('click', e => {
    const addTierBtn = e.target.closest('.btn-add-tier');
    if (addTierBtn) {
      const { scheme } = getCurrentScheme();
      const kpiId = addTierBtn.dataset.kpi;
      if (!scheme.tiers[kpiId]) scheme.tiers[kpiId] = [];
      scheme.tiers[kpiId].push({ min: 0, max: 9999, amount: 100000 });
      store.emit();
    }
  });

  // Hapus Tier
  document.addEventListener('click', e => {
    const delTierBtn = e.target.closest('.btn-del-tier');
    if (delTierBtn) {
      const { scheme } = getCurrentScheme();
      const kpiId = delTierBtn.dataset.kpi;
      const idx = +delTierBtn.dataset.idx;
      if (scheme.tiers[kpiId]) scheme.tiers[kpiId].splice(idx, 1);
      store.emit();
    }
  });

  // Input Tier
  document.addEventListener('input', e => {
    if (e.target.classList.contains('tier-input')) {
      const { scheme } = getCurrentScheme();
      const kpiId = e.target.dataset.kpi;
      const idx = +e.target.dataset.idx;
      if (!scheme.tiers[kpiId] || !scheme.tiers[kpiId][idx]) return;
      
      if (e.target.classList.contains('tier-min')) scheme.tiers[kpiId][idx].min = +e.target.value;
      if (e.target.classList.contains('tier-max')) scheme.tiers[kpiId][idx].max = +e.target.value;
      if (e.target.classList.contains('tier-amount')) scheme.tiers[kpiId][idx].amount = +e.target.value;
    }
  });

  // Save
  document.addEventListener('click', async e => {
    if (e.target.id === 'btnSaveInsentif') {
      const { scheme, currentTarget } = getCurrentScheme();
      const allData = store.state.settings.insentif;
      allData[currentTarget] = scheme;
      
      store.set({ settings: { ...store.state.settings, insentif: { ...allData } } });
      
      try {
        await setGlobalSetting('insentif', allData);
        alert('Skema Insentif berhasil disimpan ke Cloud!');
      } catch (err) {
        alert('Gagal simpan ke Cloud: ' + err.message);
      }
    }
  });
}

function openKpiSelectorModal(scheme, currentTarget) {
  if (!scheme.kpis) scheme.kpis = [];
  if (!scheme.tiers) scheme.tiers = {};

  const allKpis = DS.getAllKpis(store.state) || [];
  
  if (allKpis.length === 0) {
    alert('Tidak ada KPI tersedia. Pastikan file LBP/DMP sudah di-upload.');
    return;
  }

  const selectedIds = scheme.kpis.map(k => k.id);

  const baseKpis = allKpis.filter(k => (k.type === 'auto' || k.type === 'manual') && k.id);
  const divisiKpis = allKpis.filter(k => k.type === 'divisi' && k.id);
  const subrandKpis = allKpis.filter(k => k.type === 'subrand' && k.id);

  const buildLabel = (k) => `
    <label style="display:flex; align-items:center; gap:8px; padding:8px; border-bottom:1px solid #F1F5F9; font-size:13px; cursor:pointer;">
      <input type="checkbox" class="kpi-chk" value="${esc(k.id)}" ${selectedIds.includes(k.id) ? 'checked' : ''} style="width:16px; height:16px;">
      <span style="font-weight:700; flex:1;">${esc(k.label || k.id)}</span>
      <span class="tiny" style="background:${k.type === 'auto' ? '#DCFCE7' : '#FEF3C7'}; color:${k.type === 'auto' ? '#166534' : '#92400E'}; padding:2px 6px; border-radius:4px;">${k.type === 'auto' ? 'OTOMATIS' : 'MANUAL'}</span>
    </label>
  `;

  openModal(`
    <div class="modal-h"><h3>Pilih KPI Insentif</h3><button class="x">×</button></div>
    <div class="modal-b">
      <div style="border:1px solid #E2E8F0; border-radius:6px; max-height:400px; overflow-y:auto;">
        ${baseKpis.map(buildLabel).join('')}
        ${divisiKpis.length ? `<div style="padding:8px; background:#F0FDF4; font-weight:800; font-size:11px; color:#166534;">🏢 KPI DIVISI</div>${divisiKpis.map(buildLabel).join('')}` : ''}
        ${subrandKpis.length ? `<div style="padding:8px; background:#EFF6FF; font-weight:800; font-size:11px; color:#1E40AF;">📦 KPI SUBRAND</div>${subrandKpis.map(buildLabel).join('')}` : ''}
      </div>
    </div>
    <div class="modal-f" style="padding:16px; border-top:1px solid #E2E8F0; text-align:right;">
      <button class="btn primary" id="btnSaveKpiSel" style="background: #800000; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; color: white;">Terapkan</button>
    </div>
  `);

  document.getElementById('btnSaveKpiSel').onclick = () => {
    const checkedIds = Array.from(document.querySelectorAll('.kpi-chk:checked'))
      .map(chk => chk.value)
      .filter(v => v);
    
    if (checkedIds.length === 0) {
      alert('Pilih minimal 1 KPI.');
      return;
    }

    const newKpis = checkedIds.map(id => {
      const existing = scheme.kpis.find(x => x.id === id);
      if (existing) return existing;
      
      const master = allKpis.find(x => x.id === id);
      if (!master) return null;
      
      return { 
        id: master.id, 
        label: master.label, 
        mode: master.type === 'auto' ? 'auto' : 'manual', 
        hasTarget: master.hasTarget !== false 
      };
    }).filter(Boolean);

    // Mutate scheme langsung (karena scheme = state.settings.insentif[currentTarget])
    scheme.kpis = newKpis;

    // Bersihkan tier orphan
    const validIds = scheme.kpis.map(k => k.id);
    for (const kpiId in scheme.tiers) {
      if (!validIds.includes(kpiId)) delete scheme.tiers[kpiId];
    }

    // Pastikan reference state terhubung
    if (!store.state.settings) store.state.settings = {};
    if (!store.state.settings.insentif) store.state.settings.insentif = {};
    store.state.settings.insentif[currentTarget] = scheme;

    document.getElementById('modalScrim').classList.remove('on');
    
    // ⚡ FORCE re-render
    store.emit();
  };
}