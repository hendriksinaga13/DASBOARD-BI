import { esc, compactRp, pct } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered, selectAgg } from '../core/selectors.js';
import { groupBy } from '../data/aggregator.js';
import { sortableTable } from '../ui/table.js';
import { registerView } from './registry.js';
function shell(){ return `<div class="grid kpis" id="pr-kpis"></div><div class="card" id="pr-table"></div>`; }
function update(container, state){
  const rows = selectFiltered(state);
  const a = selectAgg(state);
  patchHTML('#pr-kpis', `
    <div class="kpi"><div class="kpi-l">SKU Aktif</div><div class="kpi-v">${new Set(rows.map(r => r.pcode)).size}</div></div>
    <div class="kpi pos"><div class="kpi-l">Omset</div><div class="kpi-v">${compactRp(a.omset)}</div></div>
    <div class="kpi purple"><div class="kpi-l">Qty Karton</div><div class="kpi-v">${a.qtyCarton.toFixed(1)}</div></div>
    <div class="kpi"><div class="kpi-l">Subbrand</div><div class="kpi-v">${new Set(rows.map(r => r.subbrand)).size}</div></div>
  `);
  const list = groupBy(rows, r => r.pcode || r.product, 'omset').map(g => ({
    label: g.label, product: g.rows[0]?.product || '', subbrand: g.rows[0]?.subbrand || '',
    value: g.value, count: g.rows.length, share: a.omset ? (g.value / a.omset) * 100 : 0,
  }));
  patchHTML('#pr-table', `
    <div class="card-h"><div><div class="card-t">Kontribusi Produk</div></div></div>
    ${sortableTable({
      scope: 'product', rows: list,
      columns: [
        { key: 'product', label: 'Produk', render: r => `<span class="strong">${esc(r.product)}</span><div class="tiny">${esc(r.label)}</div>` },
        { key: 'subbrand', label: 'Subbrand' },
        { key: 'value', label: 'Omset', align: 'num', render: r => `<span class="strong">${compactRp(r.value)}</span>` },
        { key: 'share', label: 'Kontribusi', align: 'num', render: r => pct(r.share) },
        { key: 'count', label: 'Baris', align: 'num' },
      ],
    })}
  `);
}
registerView('product', { label: 'Produk', title: 'Produk / SKU', sub: 'Kontribusi & pergerakan', shell, update });