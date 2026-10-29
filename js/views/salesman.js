import { esc, rp, pct, compactRp, fmtKtn, NF1 } from '../core/utils.js';
import { patchHTML, patchText } from '../core/dom.js';
import { selectFiltered, selectAgg } from '../core/selectors.js';
import { groupBy } from '../data/aggregator.js';
import { sortableTable } from '../ui/table.js';
import { registerView } from './registry.js';
function shell(){
  return `<div class="grid kpis" id="sm-kpis"></div><div class="card" id="sm-table"></div>`;
}
function update(container, state){
  const rows = selectFiltered(state);
  const a = selectAgg(state);
  patchHTML('#sm-kpis', `
    <div class="kpi"><div class="kpi-l">Salesman Aktif</div><div class="kpi-v">${new Set(rows.map(r => r.salesman)).size}</div></div>
    <div class="kpi pos"><div class="kpi-l">Total Omset</div><div class="kpi-v">${compactRp(a.omset)}</div></div>
    <div class="kpi purple"><div class="kpi-l">Qty Karton</div><div class="kpi-v">${fmtKtn(a.qtyCarton)}</div></div>
    <div class="kpi purple"><div class="kpi-l">Item/Trx</div><div class="kpi-v">${NF1.format(a.avgIpt || 0)}</div></div>
  `);
  const list = groupBy(rows, r => r.salesman, 'omset').map(g => ({
    label: g.label, value: g.value, count: g.rows.length,
    share: a.omset ? (g.value / a.omset) * 100 : 0,
  }));
  patchHTML('#sm-table', `
    <div class="card-h"><div><div class="card-t">Performa Salesman</div></div></div>
    ${sortableTable({
      scope: 'salesman', rows: list,
      columns: [
        { key: 'label', label: 'Salesman', render: r => `<span class="strong">${esc(r.label)}</span>` },
        { key: 'value', label: 'Omset', align: 'num', render: r => `<span class="strong">${rp(r.value)}</span>` },
        { key: 'share', label: 'Kontribusi', align: 'num', render: r => pct(r.share) },
        { key: 'count', label: 'Baris', align: 'num' },
      ],
    })}
  `);
}
registerView('salesman', { label: 'Salesman', title: 'Performa Salesman', sub: 'Produktivitas per salesman', shell, update });