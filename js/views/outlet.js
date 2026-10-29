import { esc, compactRp, fmtKtn, pct } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered, selectAgg, selectNotYet } from '../core/selectors.js';
import { groupBy } from '../data/aggregator.js';
import { sortableTable } from '../ui/table.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';
function shell(){ return `<div class="grid kpis" id="out-kpis"></div><div class="card" id="out-content"></div>`; }
function update(container, state){
  const a = selectAgg(state);
  const notYet = selectNotYet(state);
  const master = state.outletMaster.size;
  patchHTML('#out-kpis', `
    <div class="kpi purple"><div class="kpi-l">Master Outlet (DMP)</div><div class="kpi-v">${master}</div></div>
    <div class="kpi purple"><div class="kpi-l">Outlet Aktif (OA)</div><div class="kpi-v">${a.oa}</div><div class="kpi-s">${master ? 'Coverage ' + pct((a.oa / master) * 100) : '—'}</div></div>
    <div class="kpi ${notYet.length ? 'neg' : 'pos'}"><div class="kpi-l">Belum Transaksi</div><div class="kpi-v">${notYet.length}</div></div>
    <div class="kpi"><div class="kpi-l">Avg Omset / OA</div><div class="kpi-v">${compactRp(a.oa ? a.omset / a.oa : 0)}</div></div>
  `);
  const tab = state.ui.outletTab || 'aktif';
  const rows = selectFiltered(state);
  const tabs = `<div class="card-h"><div><div class="card-t">Outlet</div></div>
    <div class="right"><div class="seg" id="outletTabSeg">
      <button data-ot="aktif" class="${tab === 'aktif' ? 'on' : ''}">Aktif (OA)</button>
      <button data-ot="belum" class="${tab === 'belum' ? 'on' : ''}">Belum (${notYet.length})</button>
      <button data-ot="semua" class="${tab === 'semua' ? 'on' : ''}">Semua</button>
    </div></div></div>`;
  let content;
  if(tab === 'belum'){
    if(!notYet.length){ content = `<div class="empty">Semua outlet sudah transaksi</div>`; }
    else {
      content = `<div class="tablewrap" style="max-height:560px"><table><thead><tr>
        <th>No</th><th>Nama Outlet</th><th>Rayon</th><th>Salesman</th>
        <th>Kabupaten</th><th>Kecamatan</th><th>Tipe</th>
      </tr></thead><tbody>${notYet.slice(0, 500).map(o => `<tr>
        <td class="mono">${esc(o.outletNo || '—')}</td>
        <td class="strong">${esc(o.outlet || '—')}</td>
        <td>${esc(o.rayon || '—')}</td>
        <td>${esc(o.salesman || '—')}</td>
        <td>${esc(o.kabupaten || '—')}</td>
        <td>${esc(o.kecamatan || '—')}</td>
        <td><span class="pill n">${esc(o.tipe || '—')}</span></td>
      </tr>`).join('')}</tbody></table></div>`;
    }
  } else {
    const list = groupBy(rows, r => r.outletKey, 'omset')
      .filter(g => tab === 'semua' || g.rows.some(r => r.tt === 'F'))
      .map(g => ({
        label: g.label, outlet: g.rows[0]?.outlet || '',
        rayon: g.rows[0]?.rayon || '', salesman: g.rows[0]?.salesman || '',
        kabupaten: g.rows[0]?.kabupaten || '', value: g.value, count: g.rows.length,
      }));
    content = sortableTable({
      scope: 'outlet', rows: list,
      columns: [
        { key: 'outlet', label: 'Outlet', render: r => `<span class="strong">${esc(r.outlet)}</span>` },
        { key: 'rayon', label: 'Rayon' },
        { key: 'salesman', label: 'Salesman' },
        { key: 'kabupaten', label: 'Kabupaten' },
        { key: 'value', label: 'Omset', align: 'num', render: r => compactRp(r.value) },
        { key: 'count', label: 'Baris', align: 'num' },
      ],
    });
  }
  patchHTML('#out-content', tabs + content);
}
registerView('outlet', {
  label: 'Outlet', title: 'Outlet', sub: 'Aktif, belum transaksi, semua master', shell, update,
  mount(){
    document.addEventListener('click', e => {
      const t = e.target.closest('#outletTabSeg button');
      if(t) store.set({ ui: { ...store.state.ui, outletTab: t.dataset.ot } });
    });
  },
});