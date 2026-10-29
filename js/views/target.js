import { esc, compactRp, pct, rp } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered, selectAgg } from '../core/selectors.js';
import { groupBy } from '../data/aggregator.js';
import { store } from '../core/store.js';
import { toast } from '../ui/feedback.js';
import { registerView } from './registry.js';

function getTarget(month){
  return store.state.targets[month] || { omset: 0, oa: 0 };
}
function saveTarget(month, key, value){
  const targets = { ...store.state.targets };
  if(!targets[month]) targets[month] = { omset: 0, oa: 0 };
  targets[month] = { ...targets[month], [key]: value };
  store.set({ targets });
}
function shell(){ return `<div class="grid kpis" id="tgt-kpis"></div><div class="card" id="tgt-config"></div>`; }
function update(container, state){
  const rows = selectFiltered(state);
  const a = selectAgg(state);
  const months = Array.from(new Set(rows.map(r => r.day.slice(0, 7)))).sort();
  const activeMonth = state.targetMonth && months.includes(state.targetMonth) ? state.targetMonth : months[months.length - 1];
  if(activeMonth && activeMonth !== state.targetMonth) store.set({ targetMonth: activeMonth });
  if(!activeMonth){
    patchHTML('#tgt-kpis', '');
    patchHTML('#tgt-config', '<div class="empty">Belum ada data.</div>');
    return;
  }
  const t = getTarget(activeMonth);
  const monthRows = rows.filter(r => r.day.startsWith(activeMonth));
  const ma = selectAgg({ ...state, rows: monthRows, filters: {} });
  const pctOmset = t.omset > 0 ? (ma.omset / t.omset) * 100 : null;
  const pctOA = t.oa > 0 ? (ma.oa / t.oa) * 100 : null;

  patchHTML('#tgt-kpis', `
    <div class="kpi pos"><div class="kpi-l">Aktual Omset</div><div class="kpi-v">${compactRp(ma.omset)}</div><div class="kpi-s">${activeMonth}</div></div>
    <div class="kpi"><div class="kpi-l">Target Omset</div><div class="kpi-v">${t.omset > 0 ? compactRp(t.omset) : '—'}</div></div>
    <div class="kpi ${pctOmset == null ? '' : pctOmset >= 100 ? 'pos' : pctOmset >= 75 ? 'warn' : 'neg'}">
      <div class="kpi-l">Pencapaian Omset</div><div class="kpi-v">${pctOmset != null ? pct(pctOmset) : '—'}</div>
      ${pctOmset != null ? `<div class="kpi-s">Gap: ${compactRp(ma.omset - t.omset)}</div>` : ''}</div>
    <div class="kpi purple"><div class="kpi-l">Aktual OA</div><div class="kpi-v">${ma.oa}</div></div>
    <div class="kpi purple"><div class="kpi-l">Target OA</div><div class="kpi-v">${t.oa || '—'}</div>
      <div class="kpi-s">${pctOA != null ? pct(pctOA) : '—'}</div></div>
  `);

  patchHTML('#tgt-config', `
    <div class="card-h"><div><div class="card-t">Target Bulan</div>
      <div class="card-s">${activeMonth}</div></div>
      <div class="right"><select id="tgtMonthSel" class="btn sm" style="padding:6px 10px">
        ${months.map(m => `<option value="${m}"${m === activeMonth ? ' selected' : ''}>${m}</option>`).join('')}
      </select></div></div>
    <div class="row-flex" style="align-items:flex-end;gap:16px;flex-wrap:wrap">
      <div><div class="tiny" style="font-weight:700;margin-bottom:4px">Target Omset</div>
        <input type="number" min="0" step="100000" id="tgtOmset" value="${t.omset || ''}" placeholder="0" style="width:200px;padding:8px;border:1px solid var(--line);border-radius:7px;text-align:right;font-variant-numeric:tabular-nums"></div>
      <div><div class="tiny" style="font-weight:700;margin-bottom:4px">Target OA</div>
        <input type="number" min="0" step="1" id="tgtOA" value="${t.oa || ''}" placeholder="0" style="width:140px;padding:8px;border:1px solid var(--line);border-radius:7px;text-align:right"></div>
      <button class="btn primary" id="tgtSave">Simpan Target</button>
    </div>
  `);
}
registerView('target', {
  label: 'Target', title: 'Target', sub: 'Target vs aktual', shell, update,
  mount(){
    document.addEventListener('change', e => {
      if(e.target.id === 'tgtMonthSel') store.set({ targetMonth: e.target.value });
    });
    document.addEventListener('click', e => {
      if(e.target.id === 'tgtSave'){
        const month = store.state.targetMonth;
        const omsetEl = document.getElementById('tgtOmset');
        const oaEl = document.getElementById('tgtOA');
        if(!month) return;
        saveTarget(month, 'omset', +omsetEl.value || 0);
        saveTarget(month, 'oa', +oaEl.value || 0);
        try { localStorage.setItem('m245.targets', JSON.stringify(store.state.targets)); } catch(e2){}
        toast('Target disimpan');
      }
    });
  },
});