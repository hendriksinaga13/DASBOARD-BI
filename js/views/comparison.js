import { esc, compactRp, fmtDateID } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { comparisonBy, overallComparison } from '../plugins/comparison.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';
import { deltaSpan } from '../ui/kpi.js';
const DIM_OPTS = [
  { k: 'salesman', l: 'Salesman' }, { k: 'product', l: 'Produk' }, { k: 'outlet', l: 'Outlet' },
  { k: 'divisi', l: 'Divisi' }, { k: 'subbrand', l: 'Subbrand' }, { k: 'kabupaten', l: 'Kabupaten' },
  { k: 'rayon', l: 'Rayon' }, { k: 'channel', l: 'Channel' },
];
function shell(){ return `<div class="grid kpis" id="cmp-kpis"></div><div class="card" id="cmp-table"></div>`; }
function kpiBlock(state){
  const cmp = overallComparison(state);
  if(!cmp) return '';
  const d = (a, b) => b > 0 ? ((a - b) / Math.abs(b)) * 100 : null;
  return `
    <div class="kpi pos"><div class="kpi-l">Periode Ini</div><div class="kpi-v">${compactRp(cmp.current)}</div>
      <div class="kpi-s">${fmtDateID(state.filters.from)} – ${fmtDateID(state.filters.to)}</div></div>
    <div class="kpi"><div class="kpi-l">vs Bulan Lalu</div><div class="kpi-v">${compactRp(cmp.lastMonth)}</div>
      <div class="kpi-s">${deltaSpan(d(cmp.current, cmp.lastMonth))} ${compactRp(cmp.current - cmp.lastMonth)}</div></div>
    <div class="kpi"><div class="kpi-l">vs Tahun Lalu</div><div class="kpi-v">${compactRp(cmp.lastYear)}</div>
      <div class="kpi-s">${deltaSpan(d(cmp.current, cmp.lastYear))} ${compactRp(cmp.current - cmp.lastYear)}</div></div>
    <div class="kpi purple"><div class="kpi-l">vs Avg 5W</div><div class="kpi-v">${cmp.avg5w != null ? compactRp(cmp.avg5w) : '—'}</div>
      <div class="kpi-s">${deltaSpan(d(cmp.current, cmp.avg5w))}</div></div>
    <div class="kpi purple"><div class="kpi-l">vs Avg 13W</div><div class="kpi-v">${cmp.avg13w != null ? compactRp(cmp.avg13w) : '—'}</div>
      <div class="kpi-s">${deltaSpan(d(cmp.current, cmp.avg13w))}</div></div>
  `;
}
function tableBlock(state){
  const dim = state.ui.comparisonDim || 'salesman';
  const dimLabel = DIM_OPTS.find(x => x.k === dim)?.l || 'Salesman';
  const result = comparisonBy(state, dim);
  const rows = result.rows.slice().sort((a, b) => b.current - a.current);
  let head = `<tr><th>${esc(dimLabel)}</th><th class="num">Current</th>
    <th class="num">Δ LM</th><th class="num">LM</th>
    <th class="num">Δ LY</th><th class="num">LY</th>
    <th class="num">Δ 5W</th><th class="num">5W</th>
    <th class="num">Δ 13W</th><th class="num">13W</th></tr>`;
  let body = rows.map(r => `<tr>
    <td class="strong">${esc(r.label)}</td>
    <td class="num strong">${compactRp(r.current)}</td>
    <td class="num">${deltaSpan(r.deltaLM)}</td><td class="num">${r.lastMonth ? compactRp(r.lastMonth) : '—'}</td>
    <td class="num">${deltaSpan(r.deltaLY)}</td><td class="num">${r.lastYear ? compactRp(r.lastYear) : '—'}</td>
    <td class="num">${deltaSpan(r.delta5w)}</td><td class="num">${r.avg5w ? compactRp(r.avg5w) : '—'}</td>
    <td class="num">${deltaSpan(r.delta13w)}</td><td class="num">${r.avg13w ? compactRp(r.avg13w) : '—'}</td>
  </tr>`).join('');
  if(!rows.length) body = `<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--muted)">Tidak ada data.</td></tr>`;
  return `
    <div class="card-h"><div><div class="card-t">Detail Perbandingan</div>
      <div class="card-s">${esc(dimLabel)} · ${result.periodDays} hari</div></div>
      <div class="right"><select id="cmpDimSel" class="btn sm" style="padding:6px 10px">
        ${DIM_OPTS.map(o => `<option value="${o.k}"${dim === o.k ? ' selected' : ''}>${o.l}</option>`).join('')}
      </select></div></div>
    <div class="tablewrap" style="max-height:640px"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>
  `;
}
function update(container, state){
  patchHTML('#cmp-kpis', kpiBlock(state));
  patchHTML('#cmp-table', tableBlock(state));
}
registerView('comparison', {
  label: 'Perbandingan', title: 'Perbandingan Omset', sub: 'LM / LY / Avg 5W / Avg 13W', shell, update,
  mount(){
    document.addEventListener('change', e => {
      if(e.target.id === 'cmpDimSel') store.set({ ui: { ...store.state.ui, comparisonDim: e.target.value } });
    });
  },
});