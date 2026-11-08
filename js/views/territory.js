import { esc, compactRp, fmtKtn } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered, selectAgg } from '../core/selectors.js';
import { groupBy } from '../data/aggregator.js';
import { sortableTable } from '../ui/table.js';
import { registerView } from './registry.js';
function shell(){
  return `<div class="grid kpis" id="tr-kpis"></div>
    <div class="card mt12" id="tr-rayon"></div>
    <div class="card mt12" id="tr-kab"></div>
    <div class="card mt12" id="tr-kec"></div>`;
}
function update(container, state){
  const rows = selectFiltered(state);
  const a = selectAgg(state);
  patchHTML('#tr-kpis', `
    <div class="kpi"><div class="kpi-l">Rayon</div><div class="kpi-v">${new Set(rows.map(r => r.rayon)).size}</div></div>
    <div class="kpi"><div class="kpi-l">Kabupaten</div><div class="kpi-v">${new Set(rows.map(r => r.kabupaten)).size}</div></div>
    <div class="kpi pos"><div class="kpi-l">Omset</div><div class="kpi-v">${compactRp(a.omset)}</div></div>
    <div class="kpi purple"><div class="kpi-l">OA</div><div class="kpi-v">${a.oa}</div></div>
  `);
  const byRayon = groupBy(rows, r => r.rayon, 'omset');
  if(byRayon.length > 1){
    patchHTML('#tr-rayon', `<div class="card-h"><div><div class="card-t">Performa per Rayon</div></div></div>
      ${sortableTable({
        scope: 'tr-rayon', rows: byRayon,
        columns: [
          { key: 'label', label: 'Rayon', render: r => `<span class="strong">${esc(r.label)}</span>` },
          { key: 'value', label: 'Omset', align: 'num', render: r => compactRp(r.value) },
          { key: 'count', label: 'Baris', align: 'num' },
        ],
      })}`);
  } else patchHTML('#tr-rayon', '');

  const byKab = groupBy(rows, r => r.kabupaten, 'omset');
  patchHTML('#tr-kab', `<div class="card-h"><div><div class="card-t">Performa per Kabupaten</div></div></div>
    ${sortableTable({
      scope: 'tr-kab', rows: byKab,
      columns: [
        { key: 'label', label: 'Kabupaten', render: r => `<span class="strong">${esc(r.label)}</span>` },
        { key: 'value', label: 'Omset', align: 'num', render: r => compactRp(r.value) },
        { key: 'count', label: 'Baris', align: 'num' },
      ],
    })}`);

  const byKec = groupBy(rows, r => r.kabupaten + ' › ' + r.kecamatan, 'omset');
  patchHTML('#tr-kec', `<div class="card-h"><div><div class="card-t">Performa per Kecamatan</div></div></div>
    ${sortableTable({
      scope: 'tr-kec', rows: byKec,
      columns: [
        { key: 'label', label: 'Kecamatan', render: r => `<span class="strong">${esc(r.label)}</span>` },
        { key: 'value', label: 'Omset', align: 'num', render: r => compactRp(r.value) },
        { key: 'count', label: 'Baris', align: 'num' },
      ],
    })}`);
}
registerView('territory', { label: 'Territory', title: 'Territory', sub: 'Performa per wilayah', shell, update });