import { esc, compactRp, fmtKtn, NF1, fmtDateID, pct } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered, selectAgg, selectNotYet } from '../core/selectors.js';
import { groupBy } from '../data/aggregator.js';
import { store } from '../core/store.js';
// ★ SATU-SATUNYA SUMBER DATA PERBANDINGAN
import { overallComparison } from '../plugins/comparison.js';
import { chartTrend, chartBars, chartDonut } from '../ui/charts.js';
import { sortableTable } from '../ui/table.js';
import { registerView } from './registry.js';
import { deltaSpan } from '../ui/kpi.js';

function shell(){
  return `
    <div id="ov-warning"></div>
    <div class="grid kpis" id="ov-kpis"></div>
    <div class="card mt12" id="ov-cmp"></div>
    <div class="grid-2 mt12"><div class="card" id="ov-trend"></div><div class="card" id="ov-channel"></div></div>
    <div class="grid-2b mt12"><div class="card" id="ov-sm"></div><div class="card" id="ov-pr"></div></div>
    <div class="card mt12" id="ov-region"></div>
  `;
}

function warningBlock(state){
  const periods = new Set();
  for (const r of state.rows) {
    if (r.tt === 'F' && r.periode) periods.add(String(r.periode).trim());
  }
  const count = periods.size;
  if (count === 0 || count >= 3) return ''; 

  const monthMap = { '1':'Jan', '2':'Feb', '3':'Mar', '4':'Apr', '5':'Mei', '6':'Jun', '7':'Jul', '8':'Agu', '9':'Sep', '10':'Okt', '11':'Nov', '12':'Des' };
  const displayPeriods = Array.from(periods)
    .map(p => {
      const num = parseInt(p, 10);
      if (!isNaN(num) && monthMap[num] && String(num) === p) return `P${num} (${monthMap[num]})`;
      return `P${p}`;
    })
    .sort((a, b) => a.localeCompare(b, 'id', { numeric: true }))
    .join(', ');

  return `
    <div class="card mb12" style="background:#FFF7ED; border:1px solid #FFEDD5; border-left:4px solid #F97316; padding:12px 16px;">
      <div style="display:flex; align-items:flex-start; gap:10px;">
        <span style="font-size:20px; line-height:1;">⚠️</span>
        <div>
          <div class="strong" style="color:#9A3412; font-size:13.5px; margin-bottom:2px;">Data Belum Cukup (Minimal 3 Periode)</div>
          <div style="font-size:12px; color:#9A3412; line-height:1.5;">
            Saat ini terdeteksi hanya <b>${count} Periode</b> data (${esc(displayPeriods)}). 
            Sistem membutuhkan minimal 3 Periode untuk melihat hasil analisis tren dan insight yang lengkap.
          </div>
        </div>
      </div>
    </div>
  `;
}

function kpiBlock(state){
  const a = selectAgg(state);
  const notYet = selectNotYet(state).length;
  const master = a.masterCount;
  return `
    <div class="kpi pos"><div class="kpi-l">Omset (Bruto − Return)</div><div class="kpi-v">${compactRp(a.omset)}</div><div class="kpi-s">${a.lines} baris</div></div>
    <div class="kpi"><div class="kpi-l">Gross Bruto</div><div class="kpi-v">${compactRp(a.grossF)}</div><div class="kpi-s">Return: ${compactRp(a.grossR)} (${pct(a.retRate)})</div></div>
    <div class="kpi purple"><div class="kpi-l">Outlet Aktif (OA)</div><div class="kpi-v">${a.oa}</div>
      <div class="kpi-s">${master > 0 ? 'dari ' + master + ' outlet DMP (' + pct(master ? (a.oa / master) * 100 : 0) + ')' : 'single count'}</div></div>
    <div class="kpi ${notYet ? 'warn' : 'pos'}"><div class="kpi-l">Belum Transaksi</div><div class="kpi-v">${notYet}</div>
      <div class="kpi-s">${notYet ? 'outlet DMP terfilter tanpa faktur' : 'semua sudah transaksi'}</div></div>
    <div class="kpi pos"><div class="kpi-l">Efektif Call (EC)</div><div class="kpi-v">${NF1.format(a.efektifCall || 0)}</div><div class="kpi-s">toko / HK</div></div>
    <div class="kpi purple"><div class="kpi-l">Qty Karton</div><div class="kpi-v">${fmtKtn(a.qtyCarton)}</div></div>
    <div class="kpi purple"><div class="kpi-l">Item / Transaksi</div><div class="kpi-v">${NF1.format(a.avgIpt || 0)}</div><div class="kpi-s">mean per HK</div></div>
    <div class="kpi"><div class="kpi-l">Faktur</div><div class="kpi-v">${a.invoices}</div></div>
    <div class="kpi ${a.retRate > 2 ? 'neg' : 'pos'}"><div class="kpi-l">Return Rate</div><div class="kpi-v">${pct(a.retRate)}</div></div>
  `;
}

/* =========================================================
   PURE RENDERER: Tidak ada perhitungan di sini.
   Semua angka berasal dari plugins/comparison.js
   ========================================================= */
function cmpBlock(state){
  const cmp = overallComparison(state); // ★ Sumber tunggal

  if (!cmp || cmp.currentOmset == null) {
    return `<div class="card-h"><div><div class="card-t">Perbandingan Omset</div></div></div><div class="empty">Pilih rentang tanggal</div>`;
  }

  const fmt = (v) => (v != null) ? compactRp(v) : '—';
  const fmtWeekly = (v) => (v != null) ? compactRp(v) + '/mgg' : '—';
  const lmLabel = cmp.prevPeriode ? `Bulan Lalu (P${cmp.prevPeriode})` : 'Bulan Lalu';

  return `
    <div class="card-h"><div><div class="card-t">Perbandingan Omset</div>
      <div class="card-s">${fmtDateID(state.filters.from)} – ${fmtDateID(state.filters.to)} · ${cmp.currentWeeks} minggu dalam filter</div></div>
      <div class="right"><button class="btn sm primary" data-view="comparison">Detail →</button></div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px">
      <div class="cmp-card">
        <div class="cmp-l">Periode Ini</div>
        <div class="cmp-v">${fmt(cmp.currentOmset)}</div>
        <div class="cmp-d">${fmtWeekly(cmp.currentWeekly)}</div>
      </div>
      <div class="cmp-card">
        <div class="cmp-l">${esc(lmLabel)}</div>
        <div class="cmp-v">${fmt(cmp.lastMonth)}</div>
        <div class="cmp-d">${deltaSpan(cmp.deltaLM)} ${cmp.lastMonthWeeks ? cmp.lastMonthWeeks + ' mgg' : ''}</div>
      </div>
      <div class="cmp-card">
        <div class="cmp-l">Tahun Lalu</div>
        <div class="cmp-v">${fmt(cmp.lastYear)}</div>
        <div class="cmp-d">${deltaSpan(cmp.deltaLY)} ${cmp.lastYearWeeks ? cmp.lastYearWeeks + ' mgg' : ''}</div>
      </div>
      <div class="cmp-card">
        <div class="cmp-l">Avg 5 Week</div>
        <div class="cmp-v">${fmt(cmp.avg5w)}</div>
        <div class="cmp-d">${deltaSpan(cmp.delta5w)} /mgg</div>
      </div>
      <div class="cmp-card">
        <div class="cmp-l">Avg 13 Week</div>
        <div class="cmp-v">${fmt(cmp.avg13w)}</div>
        <div class="cmp-d">${deltaSpan(cmp.delta13w)} /mgg</div>
      </div>
    </div>`;
}

function trendBlock(state){
  const rows = selectFiltered(state);
  const mode = state.ui.trendMode;
  const metric = state.ui.trendMetric;
  const useCarton = metric === 'carton';
  const map = new Map();
  for(const r of rows){
    let k;
    if(mode === 'week') k = r.week || null;
    else if(mode === 'month') k = r.day ? r.day.slice(0, 7) : null;
    else if(mode === 'period') k = r.periode;
    else k = r.day;
    if(!k) continue;
    const v = useCarton ? (isFinite(r.netCarton) ? r.netCarton : 0) : (r.tt === 'F' ? (Number(r.amount)||0) : -(Number(r.amount)||0));
    map.set(k, (map.get(k) || 0) + v);
  }

  const entries = Array.from(map.entries());
  entries.sort((a, b) => {
    if(mode === 'week'){
      const na = parseFloat(a[0]), nb = parseFloat(b[0]);
      if(isFinite(na) && isFinite(nb)) return na - nb;
    }
    return a[0].localeCompare(b[0]);
  });

  const pts = entries.map(([k, v]) => ({
    label: mode === 'day' ? k.slice(8) + '/' + k.slice(5, 7) : k,
    value: v,
  }));

  return `
    <div class="card-h"><div><div class="card-t">Tren ${useCarton ? 'Qty Karton' : 'Omset'}</div></div>
      <div class="right">
        <div class="seg" id="trendMetricSeg">
          <button data-tm2="rupiah" class="${metric === 'rupiah' ? 'on' : ''}">Rp</button>
          <button data-tm2="carton" class="${metric === 'carton' ? 'on' : ''}">Ktn</button>
        </div>
        <div class="seg" id="trendSeg">
          <button data-tm="day"    class="${mode === 'day' ? 'on' : ''}">Hari</button>
          <button data-tm="week"   class="${mode === 'week' ? 'on' : ''}">Mgg</button>
          <button data-tm="month"  class="${mode === 'month' ? 'on' : ''}">Bln</button>
          <button data-tm="period" class="${mode === 'period' ? 'on' : ''}">Periode</button>
        </div>
      </div></div>
    ${chartTrend(pts)}`;
}

function channelBlock(state){
  const rows = selectFiltered(state);
  const g = groupBy(rows, r => r.channel, 'omset').sort((a, b) => b.value - a.value).slice(0, 6);
  return `<div class="card-h"><div><div class="card-t">Komposisi Channel</div></div></div>${chartDonut(g.map(x => ({ label: x.label, value: x.value })))}`;
}

function smBlock(state){
  const g = groupBy(selectFiltered(state), r => r.salesman, 'omset').sort((a, b) => b.value - a.value).slice(0, 8);
  return `<div class="card-h"><div><div class="card-t">Top Salesman</div></div>
    <div class="right"><button class="btn sm" data-view="salesman">Detail</button></div></div>
    ${chartBars(g.map(x => ({ label: x.label, value: x.value })))}`;
}

function prBlock(state){
  const g = groupBy(selectFiltered(state), r => r.product, 'omset').sort((a, b) => b.value - a.value).slice(0, 8);
  return `<div class="card-h"><div><div class="card-t">Top Produk</div></div></div>
    ${chartBars(g.map(x => ({ label: x.label, value: x.value })))}`;
}

function regionBlock(state){
  const rows = selectFiltered(state);
  const a = selectAgg(state);
  const list = groupBy(rows, r => r.kabupaten, 'omset')
    .map(g => ({ ...g, share: a.omset ? (g.value / a.omset) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
  return `<div class="card-h"><div><div class="card-t">Ringkasan Wilayah</div></div>
    <div class="right"><button class="btn sm" data-view="territory">Detail</button></div></div>
    ${sortableTable({
      scope: 'ov-region', rows: list,
      columns: [
        { key: 'label', label: 'Kabupaten', render: r => `<span class="strong">${esc(r.label)}</span>` },
        { key: 'value', label: 'Omset', align: 'num', render: r => `<span class="strong">${compactRp(r.value)}</span>` },
        { key: 'share', label: 'Kontribusi', align: 'num', render: r => pct(r.share) },
      ],
    })}`;
}

function update(container, state){
  patchHTML('#ov-warning', warningBlock(state));
  patchHTML('#ov-kpis', kpiBlock(state));
  patchHTML('#ov-cmp', cmpBlock(state));
  patchHTML('#ov-trend', trendBlock(state));
  patchHTML('#ov-channel', channelBlock(state));
  patchHTML('#ov-sm', smBlock(state));
  patchHTML('#ov-pr', prBlock(state));
  patchHTML('#ov-region', regionBlock(state));
}

export function installOverviewControls(){
  document.addEventListener('click', (e) => {
    const tm = e.target.closest('#trendSeg button');
    if(tm){ store.set({ ui: { ...store.state.ui, trendMode: tm.dataset.tm } }); return; }
    const tm2 = e.target.closest('#trendMetricSeg button');
    if(tm2){ store.set({ ui: { ...store.state.ui, trendMetric: tm2.dataset.tm2 } }); return; }
  });
}

registerView('overview', { label: 'Overview', title: 'Overview', sub: 'Ringkasan performa penjualan', shell, update });