import { esc } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered } from '../core/selectors.js';
import { groupBy } from '../data/aggregator.js';
import { store } from '../core/store.js';
import { METRICS, formatMetric } from '../metrics/registry.js';
import { registerView } from './registry.js';
import { downloadCSV } from '../plugins/export.js';
const DIM_OPTS = [
  { k: 'salesman', l: 'Salesman' }, { k: 'product', l: 'Produk' }, { k: 'outlet', l: 'Outlet' },
  { k: 'divisi', l: 'Divisi' }, { k: 'subbrand', l: 'Subbrand' }, { k: 'kabupaten', l: 'Kabupaten' },
  { k: 'kecamatan', l: 'Kecamatan' }, { k: 'rayon', l: 'Rayon' }, { k: 'channel', l: 'Channel' },
  { k: 'tipe', l: 'Tipe Outlet' }, { k: 'periode', l: 'Periode' }, { k: 'week', l: 'Week' },
];
function dimFn(dim){
  return {
    salesman: r => r.salesman, product: r => r.product, outlet: r => r.outlet,
    divisi: r => r.divisi, subbrand: r => r.subbrand, kabupaten: r => r.kabupaten,
    kecamatan: r => r.kecamatan, rayon: r => r.rayon, channel: r => r.channel,
    tipe: r => r.tipe, periode: r => r.periode, week: r => r.week,
  }[dim] || (r => r.salesman);
}
function shell(){ return `<div class="card" id="pivot-cfg"></div><div class="card mt12" id="pivot-result"></div>`; }
function cfgBlock(state){
  const p = state.ui.pivot;
  return `
    <div class="card-h"><div><div class="card-t">Konfigurasi Pivot</div></div></div>
    <div class="pivot-config">
      <div class="pivot-field"><label>Baris</label><select id="pvRow">${DIM_OPTS.map(o => `<option value="${o.k}"${p.rows === o.k ? ' selected' : ''}>${o.l}</option>`).join('')}</select></div>
      <div class="pivot-field"><label>Kolom</label><select id="pvCol"><option value="">—</option>${DIM_OPTS.map(o => `<option value="${o.k}"${p.cols === o.k ? ' selected' : ''}>${o.l}</option>`).join('')}</select></div>
      <div class="pivot-field"><label>Ukuran</label><select id="pvMeasure">${Object.entries(METRICS).map(([k, m]) => `<option value="${k}"${p.measure === k ? ' selected' : ''}>${m.label}</option>`).join('')}</select></div>
      <div class="pivot-field"><label>Urutkan</label><select id="pvSort">
        <option value="value_desc"${p.sort === 'value_desc' ? ' selected' : ''}>Nilai ↓</option>
        <option value="value_asc"${p.sort === 'value_asc' ? ' selected' : ''}>Nilai ↑</option>
        <option value="label_asc"${p.sort === 'label_asc' ? ' selected' : ''}>Label A→Z</option>
      </select></div>
    </div>
    <div class="row-flex"><button class="btn primary" id="pvApply">Terapkan</button>
      <button class="btn" id="pvExport">Ekspor CSV</button></div>
  `;
}
function resultBlock(state){
  const p = state.ui.pivot;
  const rows = selectFiltered(state);
  const rowLabel = DIM_OPTS.find(o => o.k === p.rows)?.l || p.rows;
  const colLabel = p.cols ? DIM_OPTS.find(o => o.k === p.cols)?.l : null;
  const measureLabel = METRICS[p.measure]?.label || p.measure;
  const rFn = dimFn(p.rows);
  const cFn = p.cols ? dimFn(p.cols) : null;
  const rowData = groupBy(rows, rFn, p.measure).map(g => {
    const cells = cFn ? groupBy(g.rows, cFn, p.measure) : null;
    return { label: g.label, value: g.value, cells };
  });
  if(p.sort === 'label_asc') rowData.sort((a, b) => a.label.localeCompare(b.label));
  else if(p.sort === 'value_asc') rowData.sort((a, b) => a.value - b.value);
  else rowData.sort((a, b) => b.value - a.value);
  const colKeys = cFn ? Array.from(new Set(rowData.flatMap(r => r.cells ? r.cells.map(c => c.label) : []))).sort() : null;
  const grand = groupBy(rows, () => '__all__', p.measure)[0];
  let head = `<tr><th class="pr-row">${esc(rowLabel)}${colLabel ? ' \\ ' + esc(colLabel) : ''}</th>`;
  if(colKeys){ colKeys.forEach(ck => head += `<th class="pc-header">${esc(ck)}</th>`); head += `<th class="pc-header" style="background:var(--brand);color:#fff">TOTAL</th>`; }
  else head += `<th class="pc-header">${esc(measureLabel)}</th>`;
  head += '</tr>';
  let body = rowData.map(r => {
    let row = `<tr><td class="pr-row">${esc(r.label)}</td>`;
    if(colKeys){
      colKeys.forEach(ck => {
        const cell = r.cells?.find(c => c.label === ck);
        row += `<td class="num">${cell ? esc(formatMetric(cell.value, p.measure)) : '—'}</td>`;
      });
      row += `<td class="num total-cell">${esc(formatMetric(r.value, p.measure))}</td>`;
    } else row += `<td class="num strong">${esc(formatMetric(r.value, p.measure))}</td>`;
    row += '</tr>'; return row;
  }).join('');
  if(!rowData.length) body = `<tr><td colspan="${colKeys ? colKeys.length + 2 : 2}" style="text-align:center;padding:24px;color:var(--muted)">Tidak ada data.</td></tr>`;
  return `
    <div class="card-h"><div><div class="card-t">Pivot: ${esc(rowLabel)}${colLabel ? ' × ' + esc(colLabel) : ''} → ${esc(measureLabel)}</div>
      <div class="card-s">${rowData.length} baris${colKeys ? ' × ' + colKeys.length + ' kolom' : ''} · Grand total ${esc(formatMetric(grand?.value || 0, p.measure))}</div></div></div>
    <div class="tablewrap" style="max-height:640px"><table class="pivot-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>
  `;
}
function update(container, state){
  patchHTML('#pivot-cfg', cfgBlock(state));
  patchHTML('#pivot-result', resultBlock(state));
}
registerView('pivot', {
  label: 'Pivot Table', title: 'Pivot Table', sub: 'Analisis multi-dimensi', shell, update,
  mount(){
    document.addEventListener('change', e => {
      const ui = store.state.ui.pivot;
      if(e.target.id === 'pvRow') store.set({ ui: { ...store.state.ui, pivot: { ...ui, rows: e.target.value } } });
      if(e.target.id === 'pvCol') store.set({ ui: { ...store.state.ui, pivot: { ...ui, cols: e.target.value } } });
      if(e.target.id === 'pvMeasure') store.set({ ui: { ...store.state.ui, pivot: { ...ui, measure: e.target.value } } });
      if(e.target.id === 'pvSort') store.set({ ui: { ...store.state.ui, pivot: { ...ui, sort: e.target.value } } });
    });
    document.addEventListener('click', e => {
      if(e.target.id === 'pvApply') store.emit();
      if(e.target.id === 'pvExport'){
        const p = store.state.ui.pivot;
        const rows = selectFiltered(store.state);
        const data = groupBy(rows, dimFn(p.rows), p.measure).map(g => ({
          [p.rows]: g.label, [p.measure]: +g.value.toFixed(2), baris: g.rows.length,
        }));
        downloadCSV(data, 'pivot_' + p.rows + '_' + p.measure + '.csv');
      }
    });
  },
});