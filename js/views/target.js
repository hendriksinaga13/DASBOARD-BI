// js/views/target.js
import { esc } from '../core/utils.js';
import { store } from '../core/store.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered, matchOutlet } from '../core/selectors.js';
import { openModal } from '../ui/feedback.js'; 
import { registerView } from './registry.js';
import { sendTargetToCloud, deleteTargetFromCloud } from '../sync/crud.js'; 
import { 
  renderHeaderAndKPI, 
  renderSalesmanTable, 
  renderGlobalTable, 
  renderManualTable 
} from '../ui/target.js'; 

function getTargets(month) {
  if (!store.state.targets[month]) {
    store.state.targets[month] = { global: { mode: 'manual', level: 'all', all: 0, divisi: {}, subbrand: {}, produk: {} }, salesman: {}, salesmanLevel: 'all', manualKpis: [] };
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

function getHK(state) { return state.settings?.hk?.value || 25; }

function computeAccumulatedTargets(t) {
  const acc = { all: 0, divisi: {}, subbrand: {}, produk: {} };
  for (const sm in (t.salesman || {})) {
    const smData = t.salesman[sm]; let smTotal = 0;
    for (const lvl of ['divisi', 'subbrand', 'produk']) {
      if (smData[lvl]) {
        for (const key in smData[lvl]) {
          const val = smData[lvl][key]?.omset || 0; smTotal += val;
          if (!acc[lvl][key]) acc[lvl][key] = 0; acc[lvl][key] += val; 
        }
      }
    }
    if (smData?.all?.ALL?.omset) smTotal = smData.all.ALL.omset;
    acc.all += smTotal;
  }
  return acc;
}

function getDmpCountPerSalesman(state) {
  const counts = {}; const allowedSalesmen = new Set();
  for(const r of state.rows){ if(r.salesman && r.salesman !== '—') allowedSalesmen.add(r.salesman); }
  const seen = new Set();
  for(const o of state.outletMaster.values()){
    const key = String(o.outletNo || o.outlet || '').trim();
    if(!key || seen.has(key)) continue; seen.add(key);
    const sm = o.salesman;
    if (!sm || sm === '—' || !allowedSalesmen.has(sm)) continue;
    if (!matchOutlet(o, state.filters)) continue;
    if (!counts[sm]) counts[sm] = 0; counts[sm]++;
  }
  return counts;
}

function computeEffectiveGlobalTarget(t) {
  if (t.global.mode === 'accumulate') return computeAccumulatedTargets(t).all;
  return t.global.all || 0;
}

function computeActualOmset(state) {
  let total = 0; const filtered = selectFiltered(state);
  for (const r of filtered) { if (r.tt === 'F') total += r.amount; else if (r.tt === 'R') total -= r.amount; }
  return total;
}

function shell(){ return `<div id="tgt-content"></div>`; }

function update(container, state){
  const allRows = state.rows;
  const filteredRows = selectFiltered(state); 
  const rowMonths = allRows.map(r => r.day.slice(0, 7));
  const targetMonths = Object.keys(state.targets || {});
  const months = Array.from(new Set([...rowMonths, ...targetMonths])).sort(); 
  let activeMonth = state.targetMonth; 
  const hk = getHK(state);

  if(!activeMonth){
    patchHTML('#tgt-content', `
      ${renderHeaderAndKPI({ activeMonth: '', months, uniqueSalesmanCount: 0, globalTarget: 0, actualOmset: 0, pctNum: 0, activeTab: state.ui.targetTab || 'salesman', hk, hkReal: 0, estPerDay: 0 })}
      <div class="and-app" style="margin: 0 4px;">
        <div style="text-align: center; padding: 60px 20px; background: #fff; border-radius: 20px; border: 1px solid #E0E0E0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="font-size: 48px; margin-bottom: 16px;">📅</div>
          <div style="font-weight: 900; color: #800000; font-size: 18px; margin-bottom: 8px;">Pilih Periode Target</div>
          <div style="color: #757575; font-size: 14px;">Silakan pilih bulan pada menu di atas untuk melihat laporan.</div>
        </div>
      </div>
    `);
    return;
  }

  const t = getTargets(activeMonth);
  const activeTab = state.ui.targetTab || 'salesman'; 
  const smLevel = t.salesmanLevel || 'all';

  let actualOmset = 0; const uniqueSalesman = new Set();
  for (const r of filteredRows) {
    if (r.salesman) uniqueSalesman.add(r.salesman);
    if (r.tt === 'F') actualOmset += r.amount; else if (r.tt === 'R') actualOmset -= r.amount;
  }
  const globalTarget = computeEffectiveGlobalTarget(t);
  const pctNum = globalTarget > 0 ? (actualOmset / globalTarget) * 100 : 0;
  const globalHkReal = new Set(filteredRows.filter(r=>r.tt==='F').map(r => r.day)).size;
  const globalSisaHk = Math.max(hk - globalHkReal, 1);
  const globalSisaTarget = Math.max(globalTarget - actualOmset, 0);
  const estPerDay = globalSisaTarget > 0 ? globalSisaTarget / globalSisaHk : 0;

  const headerHtml = renderHeaderAndKPI({
    activeMonth, months, uniqueSalesmanCount: uniqueSalesman.size, globalTarget, actualOmset, pctNum, activeTab, hk, hkReal: globalHkReal, estPerDay
  });

  let tabContent = '';
  const dmpCounts = getDmpCountPerSalesman(state);
  const allSalesman = new Set(filteredRows.map(r => r.salesman).filter(s => s && s !== '—'));
  const smActuals = {};
  
  for (const r of filteredRows) {
    if (r.tt !== 'F') continue;
    const sm = r.salesman; const key = smLevel === 'all' ? 'ALL' : (r[smLevel] || '—');
    if(!smActuals[sm]) smActuals[sm] = { all: { omset: 0, ec: new Set(), oa: new Set(), hk: new Set(), inv: new Set(), lines: 0 }, items: {} };
    
    const aAll = smActuals[sm].all;
    aAll.omset += r.amount; aAll.ec.add(r.day + '|' + r.outletKey); aAll.oa.add(r.outletKey); 
    aAll.hk.add(r.day); aAll.inv.add(r.invoice); aAll.lines++;
    
    if (smLevel !== 'all') {
      if(!smActuals[sm].items[key]) smActuals[sm].items[key] = { omset: 0 };
      smActuals[sm].items[key].omset += r.amount;
    }
  }

  if (activeTab === 'salesman') {
    const prodKpis = [
      { id: 'ec', label: 'EC', format: 'num' }, 
      { id: 'oa', label: 'OA', format: 'num' }, 
      { id: 'ipt', label: 'IPT', format: 'num', defaultTarget: 1 }, 
      ...t.manualKpis.map(k => ({ id: k, label: k, format: 'num', isManual: true }))
    ];

    const uiSalesmanData = Array.from(allSalesman).sort().map(sm => {
      const smData = smActuals[sm] || { all: { omset: 0, ec: new Set(), oa: new Set(), hk: new Set(), inv: new Set(), lines: 0 }, items: {} };
      const aAll = smData.all; const smHkReal = aAll.hk.size;
      const rows = [];
      
      const buildRowData = (label, target, capai, format, isManual, levelKey, kpiId) => {
         const pctVal = target > 0 ? (capai / target) * 100 : 0; 
         const gapVal = capai - target;
         const isDaily = (kpiId === 'ec' || kpiId === 'ipt');
         const totalTarget = isDaily ? target * hk : target; 
         const totalActual = isDaily ? capai * smHkReal : capai;
         const sisaTarget = Math.max(totalTarget - totalActual, 0); 
         const sisaHk = Math.max(hk - smHkReal, 1);
         const estPerDay = sisaTarget / sisaHk; 
         const targetHarian = isDaily ? target : (target / hk); 
         const pace = targetHarian * smHkReal;

         let pctColor = pctVal >= 100 ? '#22c55e' : pctVal >= 85 ? '#f59e0b' : '#ef4444';
         let gapColor = gapVal < 0 ? '#ef4444' : '#22c55e';
         let gapIcon = gapVal < 0 ? '▼' : '▲';

         return { label, target, capai, format, isManual, levelKey, kpiId, pctVal, gapVal, pctColor, gapColor, gapIcon, targetHarian, pace, estPerDay };
      };

      if (smLevel !== 'all') {
         let items = new Set();
         for (const r of filteredRows) if (r.salesman === sm && r[smLevel] && r[smLevel] !== '—') items.add(r[smLevel]);
         if (t.salesman?.[sm]?.[smLevel]) for (const k in t.salesman[sm][smLevel]) items.add(k);
         
         if (items.size > 0) {
            Array.from(items).sort((a,b) => String(a).localeCompare(String(b), undefined, {numeric: true})).forEach(item => {
               const rowTarget = t.salesman?.[sm]?.[smLevel]?.[item]?.omset || 0;
               const rowCapai = smData.items[item]?.omset || 0;
               rows.push(buildRowData(item, rowTarget, rowCapai, 'rp', false, item, 'omset'));
            });
         }
      }
      
      const tOmset = t.salesman?.[sm]?.all?.['ALL']?.omset || 0;
      rows.push(buildRowData('TOTAL', tOmset, aAll.omset, 'rp', false, null, 'omset'));

      prodKpis.forEach(kpi => {
         let tVal = t.salesman?.[sm]?.all?.['ALL']?.[kpi.id];
         if (kpi.id === 'oa' && tVal === undefined) tVal = dmpCounts[sm] || 0; 
         if (tVal === undefined && kpi.defaultTarget !== undefined) tVal = kpi.defaultTarget; 
         if (tVal === undefined) tVal = 0;

         let cVal = 0;
         if (kpi.isManual) cVal = t.salesman?.[sm]?.all?.['ALL']?.[kpi.id + '_actual'] || 0;
         else if (kpi.id === 'ec') cVal = aAll.hk.size > 0 ? aAll.ec.size/aAll.hk.size : 0;
         else if (kpi.id === 'oa') cVal = aAll.oa.size; 
         else if (kpi.id === 'ipt') cVal = aAll.inv.size > 0 ? aAll.lines/aAll.inv.size : 0; 
         
         rows.push(buildRowData(kpi.label, tVal, cVal, kpi.format, kpi.isManual, null, kpi.id));
      });
      return { name: sm, rayon: filteredRows.find(r => r.salesman === sm)?.rayon || '—', rows };
    });

    tabContent = renderSalesmanTable(uiSalesmanData, smLevel);
  }

  else if (activeTab === 'global') {
    const lvl = t.global.level; const mode = t.global.mode; 
    let targetData = {};
    if (mode === 'accumulate') {
      const acc = computeAccumulatedTargets(t);
      if (lvl === 'all') targetData = { ALL: acc.all }; else targetData = acc[lvl] || {};
    } else {
      if (lvl === 'all') targetData = { ALL: t.global.all || 0 }; else targetData = t.global[lvl] || {};
    }
    
    const actualMap = { ALL: 0 };
    for (const r of filteredRows) {
      if (r.tt !== 'F') continue;
      actualMap.ALL += r.amount;
      if (lvl !== 'all') {
        const key = r[lvl] || '—';
        if (!actualMap[key]) actualMap[key] = 0;
        actualMap[key] += r.amount;
      }
    }

    const keys = new Set([...Object.keys(targetData), ...Object.keys(actualMap)]);
    let uiGlobalData = [];

    if (lvl !== 'all' && mode === 'accumulate') {
      const totalTarget = Object.values(targetData).reduce((a,b)=>a+b, 0); const totalActual = actualMap.ALL;
      const pctVal = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0; const gapVal = totalActual - totalTarget;
      let pctColor = pctVal >= 100 ? '#22c55e' : pctVal >= 85 ? '#f59e0b' : '#ef4444';
      let gapColor = gapVal < 0 ? '#ef4444' : '#22c55e';
      uiGlobalData.push({ key: 'ALL', label: 'TOTAL', targetVal: totalTarget, actualVal: totalActual, pctVal, gapVal, pctColor, gapColor, gapIcon: gapVal < 0 ? '▼' : '▲', format: 'rp' });
      keys.delete('ALL'); 
    }

    Array.from(keys).sort((a,b) => String(a).localeCompare(String(b), undefined, {numeric: true})).forEach(key => {
      const label = key === 'ALL' ? 'TOTAL' : key; const targetVal = targetData[key] || 0; const actualVal = actualMap[key] || 0;
      const pctVal = targetVal > 0 ? (actualVal / targetVal) * 100 : 0; const gapVal = actualVal - targetVal;
      let pctColor = pctVal >= 100 ? '#22c55e' : pctVal >= 85 ? '#f59e0b' : '#ef4444';
      let gapColor = gapVal < 0 ? '#ef4444' : '#22c55e';
      uiGlobalData.push({ key, label, targetVal, actualVal, pctVal, gapVal, pctColor, gapColor, gapIcon: gapVal < 0 ? '▼' : '▲', format: 'rp' });
    });

    let totalTargetOA = 0, totalTargetEC = 0, totalTargetIPT = 0; let totalActualOA = 0, totalActualEC = 0, totalActualIPT = 0; let totalManualTarget = {}; let totalManualActual = {};
    for (const sm of allSalesman) {
      totalTargetOA += dmpCounts[sm] || 0; totalTargetEC += t.salesman?.[sm]?.all?.['ALL']?.['ec'] || 0; totalTargetIPT += t.salesman?.[sm]?.all?.['ALL']?.['ipt'] || 0;
      const aAll = smActuals[sm]?.all;
      if (aAll) { totalActualOA += aAll.oa.size; totalActualEC += aAll.hk.size > 0 ? (aAll.ec.size / aAll.hk.size) : 0; totalActualIPT += aAll.inv.size > 0 ? (aAll.lines / aAll.inv.size) : 0; }
      t.manualKpis.forEach(k => {
        if (!totalManualTarget[k]) totalManualTarget[k] = 0; totalManualTarget[k] += t.salesman?.[sm]?.all?.['ALL']?.[k] || 0;
        if (!totalManualActual[k]) totalManualActual[k] = 0; totalManualActual[k] += t.salesman?.[sm]?.all?.['ALL']?.[k + '_actual'] || 0;
      });
    }
    
    const kpiMap = [ { key: 'ec', label: 'EC', target: totalTargetEC, actual: totalActualEC }, { key: 'oa', label: 'OA', target: totalTargetOA, actual: totalActualOA }, { key: 'ipt', label: 'IPT', target: totalTargetIPT, actual: totalActualIPT }, ...t.manualKpis.map(k => ({ key: k, label: k, target: totalManualTarget[k] || 0, actual: totalManualActual[k] || 0 })) ];
    
    kpiMap.forEach(kpi => {
      const pctVal = kpi.target > 0 ? (kpi.actual / kpi.target) * 100 : 0; const gapVal = kpi.actual - kpi.target;
      let pctColor = pctVal >= 100 ? '#22c55e' : pctVal >= 85 ? '#f59e0b' : '#ef4444';
      let gapColor = gapVal < 0 ? '#ef4444' : '#22c55e';
      uiGlobalData.push({ key: kpi.key, label: kpi.label, targetVal: kpi.target, actualVal: kpi.actual, pctVal, gapVal, isKpi: true, pctColor, gapColor, gapIcon: gapVal < 0 ? '▼' : '▲', format: 'num' });
    });

    tabContent = renderGlobalTable(uiGlobalData, lvl, mode);
  }

  else if (activeTab === 'manual') {
    const manualHtml = t.manualKpis.map((kpi, idx) => `
      <div style="display:flex; align-items:center; gap:10px; border-bottom:1px solid #f1f5f9; padding-bottom:12px; margin-bottom:12px;">
        <div style="flex:1; font-weight:900; color:#0f172a; font-size:15px;">${esc(kpi)}</div>
      </div>
    `).join('');
    tabContent = renderManualTable(manualHtml);
  }

  patchHTML('#tgt-content', `${headerHtml}${tabContent}`);
}

registerView('target', {
  label: 'Laporan Target', title: 'Laporan Target', sub: 'Pencapaian & Pace', shell, update,
  mount(){
    document.addEventListener('change', e => {
      if(e.target.id === 'tgtMonthSel') store.set({ targetMonth: e.target.value });
      if(e.target.id === 'tgtLevelSel') { store.set({ ui: { ...store.state.ui, targetTab: 'global' } }); }
      if(e.target.id === 'tgtSmLevelSel') { store.set({ ui: { ...store.state.ui, targetTab: 'salesman' } }); }
    });
    document.addEventListener('click', async e => {
      const tabBtn = e.target.closest('[data-ttab]');
      if(tabBtn) store.set({ ui: { ...store.state.ui, targetTab: tabBtn.dataset.ttab } });

      if (e.target.id === 'btnSendTarget') {
        const btn = e.target; const month = store.state.targetMonth;
        if (!month) return alert('Pilih bulan terlebih dahulu');
        btn.disabled = true; btn.textContent = 'Menyimpan...';
        try { await sendTargetToCloud(month); alert(`Target bulan ${month} berhasil disimpan ke Cloud!`); } 
        catch (err) { alert('Gagal kirim: ' + err.message); } 
        finally { btn.disabled = false; btn.innerHTML = '☁️ Kirim'; }
      }

      if (e.target.id === 'btnSyncTarget') {
        const btn = e.target; btn.disabled = true; btn.textContent = 'Menarik...';
        try { const { pullAll } = await import('../sync/pull.js'); await pullAll(); alert('Data target berhasil ditarik dari Cloud!'); store.emit(); } 
        catch (err) { alert('Gagal sync: ' + err.message); } 
        finally { btn.disabled = false; btn.innerHTML = '🔄 Sync'; }
      }

      if (e.target.id === 'btnDelTarget') {
        const month = store.state.targetMonth;
        if (!month) return;
        if (!confirm(`Hapus target bulan ${month} dari Cloud?`)) return;
        const btn = e.target; btn.disabled = true; btn.textContent = 'Menghapus...';
        try { await deleteTargetFromCloud(month); alert(`Target bulan ${month} dihapus.`); store.emit(); } 
        catch (err) { alert('Gagal hapus: ' + err.message); } 
        finally { btn.disabled = false; btn.innerHTML = '🗑️ Hapus'; }
      }
    });
  }
});