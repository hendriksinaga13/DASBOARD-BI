// js/views/settings/target.js
import { esc } from '../../core/utils.js';
import { store } from '../../core/store.js';
import { setTarget as syncSetTarget } from '../../sync/crud.js';
import { selectFiltered } from '../../core/selectors.js';
import { renderTargetForms } from '../../ui/settings/target.js';

function getTargets(month) {
  if (!store.state.targets[month]) {
    store.state.targets[month] = { global: { mode: 'manual', level: 'all', all: 0, divisi: {}, subbrand: {}, produk: {} }, salesman: {}, salesmanLevel: 'all', manualKpis: ['HHT', 'VIR'] };
  }
  const t = store.state.targets[month];
  if (!t.salesmanLevel) t.salesmanLevel = 'all';
  if (!t.global.mode) t.global.mode = 'manual';
  for (const sm in t.salesman) {
    if (t.salesman[sm].omset !== undefined || t.salesman[sm].ec !== undefined) {
      const oldData = { ...t.salesman[sm] }; t.salesman[sm] = { all: { ALL: oldData } };
    }
  }
  return t;
}

export function renderTargetSettingsView(state) {
  const activeMonth = state.targetMonth;
  
  if (!activeMonth) {
    return `<div style="text-align: center; padding: 40px; color: #800000; font-weight: 800;">Pilih bulan di menu Laporan Target terlebih dahulu.</div>`;
  }

  const t = getTargets(activeMonth);
  const smLevel = t.salesmanLevel || 'all';
  const globalLevel = t.global.level || 'all';
  const filteredRows = selectFiltered(state);
  const allSalesman = new Set(filteredRows.map(r => r.salesman).filter(s => s && s !== '—'));

  const prodKpis = [
    { id: 'ec', label: 'Target EC (Call/Hari)' },
    { id: 'ipt', label: 'Target IPT (Item/Trx)' }, 
    ...t.manualKpis.map(k => ({ id: k, label: `Target ${k}` }))
  ];

  const salesmanData = Array.from(allSalesman).sort().map(sm => {
    const rayon = filteredRows.find(r => r.salesman === sm)?.rayon || '—';
    const rows = [];

    if (smLevel === 'all') {
       const tOmset = t.salesman?.[sm]?.all?.['ALL']?.omset || 0;
       rows.push({ label: 'Target Omset (Rp)', target: tOmset, kpiId: 'omset', levelKey: null });
    } else {
       let items = new Set();
       for (const r of filteredRows) if (r.salesman === sm && r[smLevel] && r[smLevel] !== '—') items.add(r[smLevel]);
       if (t.salesman?.[sm]?.[smLevel]) for (const k in t.salesman[sm][smLevel]) items.add(k);
       if (items.size > 0) {
          Array.from(items).sort().forEach(item => {
             const rowTarget = t.salesman?.[sm]?.[smLevel]?.[item]?.omset || 0;
             rows.push({ label: `Omset - ${item}`, target: rowTarget, kpiId: 'omset', levelKey: item });
          });
       }
    }
    
    prodKpis.forEach(kpi => {
       let tVal = t.salesman?.[sm]?.all?.['ALL']?.[kpi.id] || (kpi.id === 'ipt' ? 1 : 0);
       rows.push({ label: kpi.label, target: tVal, kpiId: kpi.id, levelKey: null });
    });

    return { name: sm, rayon, rows };
  });

  let globalRowsHtml = '';
  const allDivisi = new Set(); const allSubbrand = new Set(); const allProduk = new Set();
  for (const r of state.rows) {
    if(r.divisi && r.divisi !== '—') allDivisi.add(r.divisi);
    if(r.subbrand && r.subbrand !== '—') allSubbrand.add(r.subbrand);
    if(r.product && r.product !== '—') allProduk.add(r.product);
  }

  const buildGlobalRow = (label, key, val) => `
    <div class="form-row">
      <div class="form-label">${esc(label)}</div>
      <input type="number" class="set-global-inp form-input" data-level="${globalLevel}" data-key="${esc(key)}" value="${val || ''}" placeholder="0">
    </div>
  `;

  if (globalLevel === 'all') globalRowsHtml = buildGlobalRow('TOTAL OMSET', 'ALL', t.global.all);
  else if (globalLevel === 'divisi') globalRowsHtml = Array.from(allDivisi).sort().map(div => buildGlobalRow(div, div, t.global.divisi[div])).join('');
  else if (globalLevel === 'subbrand') globalRowsHtml = Array.from(allSubbrand).sort().map(sub => buildGlobalRow(sub, sub, t.global.subbrand[sub])).join('');
  else if (globalLevel === 'produk') globalRowsHtml = Array.from(allProduk).sort().map(prod => buildGlobalRow(prod, prod, t.global.produk[prod])).join('');

  const manualHtml = t.manualKpis.map((kpi, idx) => `
    <div class="form-row">
      <div class="form-label">${esc(kpi)}</div>
      <button class="btn sm" data-del-kpi="${idx}" style="color:#B71C1C; border-color:#FFCDD2; padding:8px 12px; border-radius:8px; font-weight:bold;">Hapus</button>
    </div>
  `).join('');

  // Mount listener setelah render
  setTimeout(() => mountTargetListeners(), 0);

  return renderTargetForms({
    activeMonth, salesmanData, globalData: globalRowsHtml, 
    manualKpis: manualHtml, smLevel, globalLevel
  });
}

function mountTargetListeners() {
  if (document._targetSettingsBound) return;
  document._targetSettingsBound = true;

  document.addEventListener('click', e => {
    if(e.target.id === 'btnAddKpi') {
      const name = prompt("Nama KPI baru (Cth: HHT, VIR):");
      if(name && name.trim()) {
        const t = getTargets(store.state.targetMonth);
        const kpiName = name.trim().toUpperCase();
        if(!t.manualKpis.includes(kpiName)) {
          t.manualKpis.push(kpiName); syncSetTarget(store.state.targetMonth, t); store.emit();
        }
      }
    }

    if(e.target.hasAttribute('data-del-kpi')) {
      const t = getTargets(store.state.targetMonth);
      const idx = +e.target.dataset.delKpi;
      const deleted = t.manualKpis.splice(idx, 1);
      for(const sm in t.salesman) {
         for(const lvl in t.salesman[sm]) {
            for(const key in t.salesman[sm][lvl]) {
               delete t.salesman[sm][lvl][key][deleted[0]];
               delete t.salesman[sm][lvl][key][deleted[0] + '_actual'];
            }
         }
      }
      syncSetTarget(store.state.targetMonth, t); store.emit();
    }
  });

  document.addEventListener('input', e => {
    const currentMonth = store.state.targetMonth;
    if (!currentMonth) return;
    const t = getTargets(currentMonth);

    if (e.target.matches('.set-global-inp')) {
      const lvl = t.global.level; const key = e.target.dataset.key; const val = +e.target.value || 0;
      if (lvl === 'all') t.global.all = val;
      else {
        t.global[lvl][key] = val;
        let totalAll = 0;
        for (const v of Object.values(t.global[lvl])) totalAll += v;
        t.global.all = totalAll;
      }
      syncSetTarget(currentMonth, t, { silent: true }); 
    }

    if (e.target.matches('.set-tgt-inp')) {
      const inp = e.target; const sm = inp.dataset.sm; const l = inp.dataset.lvl; const key = inp.dataset.key || 'ALL'; const kpi = inp.dataset.kpi; const val = +inp.value || 0;
      if (!t.salesman[sm]) t.salesman[sm] = {};
      if (!t.salesman[sm][l]) t.salesman[sm][l] = {};
      if (!t.salesman[sm][l][key]) t.salesman[sm][l][key] = {};
      t.salesman[sm][l][key][kpi] = val;
      
      if (kpi === 'omset' && l !== 'all') {
        let totalOmset = 0;
        for (const k in t.salesman[sm][l]) totalOmset += (t.salesman[sm][l][k]['omset'] || 0);
        if (!t.salesman[sm].all) t.salesman[sm].all = {};
        if (!t.salesman[sm].all.ALL) t.salesman[sm].all.ALL = {};
        t.salesman[sm].all.ALL.omset = totalOmset;
      }
      syncSetTarget(currentMonth, t, { silent: true }); 
    }
  });

  document.addEventListener('change', e => {
    const currentMonth = store.state.targetMonth;
    if (!currentMonth) return;
    if(e.target.id === 'setSmLevelSel') {
      const t = getTargets(currentMonth); t.salesmanLevel = e.target.value; syncSetTarget(currentMonth, t); store.emit();
    }
    if(e.target.id === 'setGlobalLevelSel') {
      const t = getTargets(currentMonth); t.global.level = e.target.value; syncSetTarget(currentMonth, t); store.emit();
    }
  });
}