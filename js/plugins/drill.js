import { onClick } from '../core/events.js';
import { openModal } from '../ui/feedback.js';
import { selectFiltered, selectAgg } from '../core/selectors.js';
import { store } from '../core/store.js';
import { esc, rp, fmtDateID, fmtKtn, compactRp, NF1 } from '../core/utils.js';
export function installDrill(){
  onClick('[data-drill]', (el) => {
    openDrill(el.dataset.drill, el.dataset.val);
  });
}
export function openDrill(key, val){
  const all = selectFiltered(store.state);
  let rows = [], title = '';
  if(key === 'salesman'){ rows = all.filter(r => r.salesman === val); title = 'Salesman: ' + val; }
  else if(key === 'product'){ rows = all.filter(r => r.product === val); title = 'Produk: ' + val; }
  else if(key === 'outlet'){ rows = all.filter(r => r.outlet === val); title = 'Outlet: ' + val; }
  if(!rows.length) return;
  const agg = selectAgg({ ...store.state, filters: store.state.filters });
  const sorted = rows.slice().sort((a, b) => a.day === b.day ? a.invoice.localeCompare(b.invoice) : a.day.localeCompare(b.day));
  const html = `<div class="modal-h"><h3>${esc(title)}</h3><button class="x">×</button></div>
  <div class="modal-b">
    <div class="grid kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div class="kpi pos"><div class="kpi-l">Omset</div><div class="kpi-v">${compactRp(agg.omset)}</div></div>
      <div class="kpi purple"><div class="kpi-l">OA</div><div class="kpi-v">${agg.oa}</div></div>
      <div class="kpi purple"><div class="kpi-l">Qty Karton</div><div class="kpi-v">${fmtKtn(agg.qtyCarton)}</div></div>
      <div class="kpi purple"><div class="kpi-l">Item/Trx</div><div class="kpi-v">${NF1.format(agg.avgIpt || 0)}</div></div>
    </div>
    <div class="tablewrap mt12" style="max-height:46vh"><table>
      <thead><tr><th>Tanggal</th><th>Faktur</th><th>Type</th><th>Outlet</th><th>Produk</th>
        <th class="num">Qty</th><th class="num">Ktn</th><th class="num">Harga</th><th class="num">Total</th>
      </tr></thead>
      <tbody>${sorted.slice(0, 800).map(r => `<tr>
        <td>${esc(fmtDateID(r.day))}</td>
        <td class="mono">${esc(r.invoice)}</td>
        <td><span class="pill ${r.tt === 'R' ? 'r' : 'n'}">${r.tt}</span></td>
        <td>${esc(r.outlet)}</td>
        <td>${esc(r.product.slice(0, 40))}</td>
        <td class="num">${r.netQty}</td>
        <td class="num">${isFinite(r.netCarton) ? fmtKtn(r.netCarton) : '—'}</td>
        <td class="num">${rp(r.amount)}</td>
        <td class="num strong" style="color:${r.total < 0 ? 'var(--neg)' : 'inherit'}">${rp(r.total)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
  openModal(html);
}