// views/overview.js
import { esc, compactRp, fmtKtn, NF1, fmtDateID, pct } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered, selectAgg, selectNotYet, matchRow } from '../core/selectors.js';
import { groupBy, agg } from '../data/aggregator.js';
import { store } from '../core/store.js';
import { comparisonBy } from '../plugins/comparison.js';
import { chartTrend, chartBars, chartDonut } from '../ui/charts.js';
import { sortableTable } from '../ui/table.js';
import { registerView } from './registry.js';
import { deltaSpan } from '../ui/kpi.js';

// ✅ IMPORT MODUL PVM, APEXCHARTS, TIMESERIES, DETAIL-VIEW
import { priceVolumeMix } from '../analytics/decomposition.js';
import { scatterChart, barChart, radarMultiChart } from '../ui/apex-charts.js';
import { trendTest, forecast, toDailySeries, detectAnomalies, calculateVelocity } from '../analytics/timeseries.js';
import { openDetail } from '../ui/detail-view.js';

/* ══════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════ */
function _todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _shiftDay(dayStr, delta){
  const d = new Date(dayStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _resolveTodayRef(rows){
  if (!rows || !rows.length) return null;
  const days = new Set();
  for (const r of rows) if (r.day) days.add(r.day);
  if (!days.size) return null;
  const sorted = Array.from(days).sort();
  const today = _todayStr();
  if (days.has(today)) return { date: today, kind: 'today' };
  return { date: sorted[sorted.length - 1], kind: 'latest' };
}

function _periodNum(r){
  const v = r.periode;
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const m = String(v).match(/\d+/);
  return m ? Number(m[0]) : null;
}

function _nonTimeFilters(filters){
  const out = { ...filters, transtype: filters.transtype || 'ALL' };
  ['from', 'to', 'periode', 'week', 'month', 'year', 'date'].forEach(k => delete out[k]);
  return out;
}

/* ══════════════════════════════════════════════════════════════
   SHELL
   ══════════════════════════════════════════════════════════════ */
function shell(){
  const chartType = store.state.ui.ovChartType || 'scatter';
  return `
    <div id="ov-warning"></div>
    <div id="ov-today"></div>
    <div class="grid kpis" id="ov-kpis"></div>
    <div class="card mt12" id="ov-pvm"></div>
    <div class="card mt12" id="ov-cmp"></div>
    <div class="grid-2 mt12"><div class="card" id="ov-trend"></div><div class="card" id="ov-channel"></div></div>
    <div class="grid-2b mt12"><div class="card" id="ov-sm"></div><div class="card" id="ov-pr"></div></div>
    <div class="grid-2 mt12">
      <div class="card" id="ov-region"></div>
      <div class="card">
        <div class="card-h">
          <div><div class="card-t">Analisis Salesman</div></div>
          <div class="right" style="display:flex; gap:6px; align-items:center;">
            <div class="seg" id="chartTypeSeg">
              <button data-ct="scatter" class="${chartType === 'scatter' ? 'on' : ''}">📍 Scatter</button>
              <button data-ct="bar" class="${chartType === 'bar' ? 'on' : ''}">📊 Bar</button>
              <button data-ct="radar" class="${chartType === 'radar' ? 'on' : ''}">🕸️ Radar</button>
            </div>
          </div>
        </div>
        <div id="chart-scatter" style="padding: 10px; min-height: 320px; width: 100%;"></div>
      </div>
    </div>
  `;
}

function warningBlock(state){
  const periods = new Set();
  for (const r of state.rows) {
    if (r.tt === 'F' && r.periode) periods.add(String(r.periode).trim());
  }
  const count = periods.size;
  if (count === 0 || count >= 3) return '';
  const monthMap = { '1':'Jan','2':'Feb','3':'Mar','4':'Apr','5':'Mei','6':'Jun','7':'Jul','8':'Agu','9':'Sep','10':'Okt','11':'Nov','12':'Des' };
  const displayPeriods = Array.from(periods)
    .map(p => { const n = parseInt(p,10); return (!isNaN(n) && monthMap[n] && String(n)===p) ? `P${n} (${monthMap[n]})` : `P${p}`; })
    .sort((a,b)=>a.localeCompare(b,'id',{numeric:true}))
    .join(', ');
  return `
    <div class="card mb12" style="background:#FFF7ED; border:1px solid #FFEDD5; border-left:4px solid #F97316; padding:12px 16px;">
      <div style="display:flex; align-items:flex-start; gap:10px;">
        <span style="font-size:20px; line-height:1;">⚠️</span>
        <div>
          <div class="strong" style="color:#9A3412; font-size:13.5px; margin-bottom:2px;">Data Belum Cukup (Minimal 3 Periode)</div>
          <div style="font-size:12px; color:#9A3412; line-height:1.5;">
            Saat ini terdeteksi hanya <b>${count} Periode</b> data (${esc(displayPeriods)}).
          </div>
        </div>
      </div>
    </div>`;
}

function kpiBlock(state){
  const a = selectAgg(state);
  const notYet = selectNotYet(state).length;
  const master = a.masterCount;
  const medTrx = compactRp(a.medianTrx || 0);
  const stdTrx = compactRp(a.stdDevTrx || 0);

  return `
    <div class="kpi pos"><div class="kpi-l">Omset (Bruto − Return)</div><div class="kpi-v">${compactRp(a.omset)}</div><div class="kpi-s">${a.lines} baris</div></div>
    <div class="kpi"><div class="kpi-l">Gross Bruto</div><div class="kpi-v">${compactRp(a.grossF)}</div><div class="kpi-s">Return: ${compactRp(a.grossR)} (${pct(a.retRate)})</div></div>
    <div class="kpi purple"><div class="kpi-l">Outlet Aktif (OA)</div><div class="kpi-v">${a.oa}</div>
      <div class="kpi-s">${master > 0 ? 'dari ' + master + ' outlet DMP (' + pct(master ? (a.oa / master) * 100 : 0) + ')' : 'single count'}</div></div>
    <div class="kpi ${notYet ? 'warn' : 'pos'}"><div class="kpi-l">Belum Transaksi</div><div class="kpi-v">${notYet}</div>
      <div class="kpi-s">${notYet ? 'outlet DMP terfilter tanpa faktur' : 'semua sudah transaksi'}</div></div>
    <div class="kpi"><div class="kpi-l">Faktur</div><div class="kpi-v">${a.invoices}</div></div>
    <div class="kpi purple"><div class="kpi-l">Qty Karton</div><div class="kpi-v">${fmtKtn(a.qtyCarton)}</div></div>
    <div class="kpi pos"><div class="kpi-l">Efektif Call (EC)</div><div class="kpi-v">${NF1.format(a.efektifCall || 0)}</div><div class="kpi-s">toko / HK</div></div>
    <div class="kpi purple"><div class="kpi-l">Item / Transaksi</div><div class="kpi-v">${NF1.format(a.avgIpt || 0)}</div><div class="kpi-s">mean per Faktur</div></div>
    <div class="kpi"><div class="kpi-l">Median Transaksi</div><div class="kpi-v">${medTrx}</div><div class="kpi-s">nilai tengah</div></div>
    <div class="kpi"><div class="kpi-l">Std Deviasi Trx</div><div class="kpi-v">${stdTrx}</div><div class="kpi-s">sebaran nilai</div></div>
    <div class="kpi ${a.retRate > 2 ? 'neg' : 'pos'}"><div class="kpi-l">Return Rate</div><div class="kpi-v">${pct(a.retRate)}</div></div>
  `;
}

function pvmBlock(state) {
  const pvmDim = state.ui.pvmDim || 'subrand';
  const allFiltered = selectFiltered(state);
  
  let activePeriode = null;
  const pFilter = state.filters.periode;
  if (pFilter) {
    if (pFilter instanceof Set && pFilter.size > 0) {
      const periods = Array.from(pFilter).map(p => Number(String(p).match(/\d+/)?.[0]) || 0).filter(Boolean);
      if (periods.length > 0) activePeriode = Math.max(...periods);
    } else if (typeof pFilter === 'string' || typeof pFilter === 'number') {
      activePeriode = Number(String(pFilter).match(/\d+/)?.[0]);
    }
  }
  if (!activePeriode && allFiltered.length > 0) {
    const pList = allFiltered.map(r => _periodNum(r)).filter(Boolean);
    if (pList.length > 0) activePeriode = Math.max(...pList);
  }

  const filteredPeriods = new Set(allFiltered.map(r => _periodNum(r)).filter(Boolean));
  const spansMultiple = filteredPeriods.size > 1;

  const header = `
    <div class="card-h">
      <div>
        <div class="card-t">🔍 Analisis PVM (Karton) per ${pvmDim === 'divisi' ? 'Divisi' : pvmDim === 'product' ? 'SKU' : 'Subrand'}</div>
        <div class="card-s">${activePeriode > 1 ? `Periode ${activePeriode} vs ${activePeriode - 1} · Satuan: KARTON · Mengikuti Filter` : 'Membutuhkan data periode sebelumnya'}</div>
      </div>
      <div class="right" style="display:flex; gap:6px; align-items:center;">
        <span style="font-size:11px; color:#64748B; font-weight:600;">Level:</span>
        <div class="seg" id="pvmDimSeg">
          <button data-pd="divisi"  class="${pvmDim === 'divisi' ? 'on' : ''}">Divisi</button>
          <button data-pd="subrand" class="${pvmDim === 'subrand' ? 'on' : ''}">Subrand</button>
          <button data-pd="product" class="${pvmDim === 'product' ? 'on' : ''}">SKU</button>
        </div>
      </div>
    </div>
  `;

  if (!activePeriode || activePeriode <= 1) {
    return header + `<div class="empty">Butuh data periode sebelumnya untuk membandingkan.</div>`;
  }

  const nonTimeFilters = _nonTimeFilters(state.filters);
  const currPeriodRows = state.rows.filter(r => _periodNum(r) === activePeriode && matchRow(r, nonTimeFilters));
  const prevPeriodRows = state.rows.filter(r => _periodNum(r) === activePeriode - 1 && matchRow(r, nonTimeFilters));

  if (prevPeriodRows.length === 0) {
    return header + `<div class="empty">Data periode ${activePeriode - 1} tidak ditemukan untuk filter yang dipilih.</div>`;
  }

  const pvm = priceVolumeMix(currPeriodRows, prevPeriodRows, pvmDim);
  if (!pvm) return header + `<div class="empty">Tidak cukup data untuk analisis PVM.</div>`;

  const fmtP = (v) => v > 0 ? `<span style="color:#059669;">+${compactRp(v)}</span>` : `<span style="color:#DC2626;">${compactRp(v)}</span>`;
  const fmtPct = (v) => v > 0 ? `<span style="color:#059669;">+${v.toFixed(1)}%</span>` : `<span style="color:#DC2626;">${v.toFixed(1)}%</span>`;
  const fmtKtnNum = (v) => NF1.format(v) + ' ktn';
  const dimLabel = pvmDim === 'divisi' ? 'Divisi' : pvmDim === 'subrand' ? 'Subrand' : 'SKU';

  const topMovers = (pvm.perProduct || []).slice(0, 5).map(p => {
    const isPos = p.delta > 0;
    const color = isPos ? '#059669' : '#DC2626';
    const icon = isPos ? '📈' : '📉';
    const priceDelta = p.priceCur - p.pricePrev;
    const priceIcon = priceDelta > 0 ? '▲' : priceDelta < 0 ? '▼' : '=';
    const priceColor = priceDelta > 0 ? '#3B82F6' : priceDelta < 0 ? '#F59E0B' : '#94A3B8';
    const qtyDelta = p.qtyCur - p.qtyPrev;
    const qtyIcon = qtyDelta > 0 ? '▲' : qtyDelta < 0 ? '▼' : '=';
    const qtyColor = qtyDelta > 0 ? '#10B981' : qtyDelta < 0 ? '#EF4444' : '#94A3B8';
    return `
      <div style="padding:10px 0; border-bottom:1px solid #F1F5F9; cursor:pointer;" 
           data-dim="${pvmDim}" data-val="${esc(p.name)}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="font-size:13px; font-weight:700; color:#334155; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${icon} ${esc(p.name)}
          </div>
          <div style="font-size:13px; font-weight:800; color:${color}; margin-left:10px; white-space:nowrap;">
            ${p.delta > 0 ? '+' : ''}${compactRp(p.delta)}
          </div>
        </div>
        <div style="display:flex; gap:16px; font-size:10.5px; color:#64748B; flex-wrap:wrap;">
          <div>
            <span style="font-weight:600;">Qty:</span>
            <span style="color:${qtyColor}; font-weight:700; margin-left:2px;">
              ${qtyIcon} ${fmtKtnNum(p.qtyPrev)} → ${fmtKtnNum(p.qtyCur)}
            </span>
          </div>
          <div>
            <span style="font-weight:600;">Harga/Ktn:</span>
            <span style="color:${priceColor}; font-weight:700; margin-left:2px;">
              ${priceIcon} ${compactRp(p.pricePrev)} → ${compactRp(p.priceCur)}
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    ${header}
    ${spansMultiple ? `
      <div style="margin-bottom:10px; padding:8px 10px; background:#FEF3C7; border-left:3px solid #F59E0B; border-radius:4px; font-size:11.5px; color:#92400E;">
        ℹ️ Filter mencakup <b>${filteredPeriods.size} periode</b>. PVM hanya membandingkan <b>P${activePeriode}</b> vs <b>P${activePeriode - 1}</b>.
      </div>
    ` : ''}
    
    <div style="background:#F8FAFC; padding:16px; border-radius:8px; border:1px solid #E2E8F0;">
      <div style="font-size:14px; font-weight:800; margin-bottom:8px;">
        Total Perubahan Omset: ${fmtP(pvm.totalChange)}
      </div>
      
      <div style="font-size:12px; color:#475569; margin-bottom:12px; padding:8px 10px; background:#fff; border-radius:6px; border:1px solid #E2E8F0;">
        📦 <b>Total Qty Karton:</b> 
        <span style="color:#DC2626; font-weight:700;">${fmtKtnNum(pvm.totalQtyPrev || 0)}</span>
        <span style="margin:0 6px;">→</span>
        <span style="color:#059669; font-weight:700;">${fmtKtnNum(pvm.totalQtyCur || 0)}</span>
        <span style="color:#94A3B8; margin-left:6px;">(P${activePeriode - 1} → P${activePeriode})</span>
      </div>
      
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px;">
        <div style="background:#fff; padding:12px; border-radius:6px; border:1px solid #E2E8F0; border-left:4px solid #3B82F6;">
          <div style="font-size:11px; font-weight:700; color:#64748B; text-transform:uppercase;">Efek Harga/Karton</div>
          <div style="font-size:16px; font-weight:800; margin:4px 0;">${fmtP(pvm.priceEffect)}</div>
          <div style="font-size:12px; color:#475569;">Berkontribusi ${fmtPct(pvm.pctPrice)}</div>
        </div>
        <div style="background:#fff; padding:12px; border-radius:6px; border:1px solid #E2E8F0; border-left:4px solid #10B981;">
          <div style="font-size:11px; font-weight:700; color:#64748B; text-transform:uppercase;">Efek Qty Karton</div>
          <div style="font-size:16px; font-weight:800; margin:4px 0;">${fmtP(pvm.volumeEffect)}</div>
          <div style="font-size:12px; color:#475569;">Berkontribusi ${fmtPct(pvm.pctVolume)}</div>
        </div>
        <div style="background:#fff; padding:12px; border-radius:6px; border:1px solid #E2E8F0; border-left:4px solid #F59E0B;">
          <div style="font-size:11px; font-weight:700; color:#64748B; text-transform:uppercase;">Efek Mix ${dimLabel}</div>
          <div style="font-size:16px; font-weight:800; margin:4px 0;">${fmtP(pvm.mixEffect)}</div>
          <div style="font-size:12px; color:#475569;">Berkontribusi ${fmtPct(pvm.pctMix)}</div>
        </div>
      </div>

      ${pvm.perProduct && pvm.perProduct.length > 0 ? `
        <div style="margin-top:16px; padding-top:12px; border-top:1px dashed #CBD5E1;">
          <div style="font-size:12px; font-weight:700; color:#475569; margin-bottom:8px;">
            🎯 Top 5 ${dimLabel} Paling Berpengaruh <span style="font-size:10px; font-weight:500; color:#94A3B8;">(klik untuk detail)</span>
          </div>
          ${topMovers}
        </div>
      ` : ''}
      
      <div style="font-size:11.5px; color:#64748B; margin-top:12px; font-style:italic; line-height:1.6;">
        <b>Cara Baca (Satuan: Karton):</b><br>
        * <b>Efek Harga/Karton</b>: Perubahan omset karena harga per karton naik/turun.<br>
        * <b>Efek Qty Karton</b>: Perubahan omset karena jumlah karton yang terjual bertambah/berkurang.<br>
        * <b>Efek Mix</b>: Perubahan omset karena bauran ${dimLabel.toLowerCase()} bergeser.
      </div>
    </div>
  `;
}

function cmpBlock(state){
  const result = comparisonBy(state, 'salesman');
  const s = result && result.summary;
  if (!s || s.currentOmset == null) {
    return `<div class="card-h"><div><div class="card-t">Perbandingan Omset</div></div></div><div class="empty">Pilih rentang tanggal</div>`;
  }
  const fmt  = v => v != null ? compactRp(v) : '—';
  const fmtW = v => v != null ? compactRp(v) + '/mgg' : '—';
  const lmLabel = s.prevPeriode ? 'Bulan Lalu (P' + s.prevPeriode + ')' : 'Bulan Lalu';
  return `
    <div class="card-h">
      <div><div class="card-t">Perbandingan Omset</div>
        <div class="card-s">${fmtDateID(state.filters.from)} – ${fmtDateID(state.filters.to)} · ${s.currentWeeks} minggu dalam filter</div>
      </div>
      <div class="right">
        <button class="btn sm" data-quick-export="#ov-cmp" data-title="Laporan Perbandingan Omset" data-filename="perbandingan_omset">📥 Ekspor</button>
        <button class="btn sm primary" data-view="comparison">Detail →</button>
      </div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px">
      <div class="cmp-card"><div class="cmp-l">Periode Ini</div><div class="cmp-v">${fmt(s.currentOmset)}</div><div class="cmp-d">${fmtW(s.currentWeekly)}</div></div>
      <div class="cmp-card"><div class="cmp-l">${esc(lmLabel)}</div><div class="cmp-v">${fmt(s.lastMonth)}</div><div class="cmp-d">${deltaSpan(s.deltaLM)} ${s.lastMonthWeeks ? s.lastMonthWeeks + ' mgg' : ''}</div></div>
      <div class="cmp-card"><div class="cmp-l">Tahun Lalu</div><div class="cmp-v">${fmt(s.lastYear)}</div><div class="cmp-d">${deltaSpan(s.deltaLY)} ${s.lastYearWeeks ? s.lastYearWeeks + ' mgg' : ''}</div></div>
      <div class="cmp-card"><div class="cmp-l">Avg 5 Week</div><div class="cmp-v">${fmt(s.avg5w)}</div><div class="cmp-d">${deltaSpan(s.delta5w)} /mgg</div></div>
      <div class="cmp-card"><div class="cmp-l">Avg 13 Week</div><div class="cmp-v">${fmt(s.avg13w)}</div><div class="cmp-d">${deltaSpan(s.delta13w)} /mgg</div></div>
    </div>`;
}

function trendBlock(state){
  const rows = selectFiltered(state);
  const mode = state.ui.trendMode;
  const metric = state.ui.trendMetric;
  const useCarton = metric === 'carton';
  const map = new Map();
  for(const r of rows){
    let k = mode === 'week' ? (r.week || null) : mode === 'month' ? (r.day ? r.day.slice(0, 7) : null) : mode === 'period' ? r.periode : r.day;
    if(!k) continue;
    const v = useCarton ? (isFinite(r.netCarton) ? r.netCarton : 0) : (r.tt === 'F' ? (Number(r.amount)||0) : -(Number(r.amount)||0));
    map.set(k, (map.get(k) || 0) + v);
  }
  const entries = Array.from(map.entries());
  entries.sort((a, b) => (mode === 'week' && isFinite(parseFloat(a[0])) && isFinite(parseFloat(b[0]))) ? parseFloat(a[0]) - parseFloat(b[0]) : a[0].localeCompare(b[0]));
  const values = entries.map(e => e[1]);
  const pts = entries.map(([k, v]) => ({ label: mode === 'day' ? k.slice(8) + '/' + k.slice(5, 7) : k, value: v }));

  let advStats = '';
  if (values.length >= 5) {
    const test = trendTest(values);
    const fc = forecast(values, 7);
    const dailyData = toDailySeries(rows);
    const anomalies = detectAnomalies(dailyData);
    const velocity = calculateVelocity(values, 7);
    const totalFc = fc ? fc.predictions.reduce((s, p) => s + p.pred, 0) : 0;
    const badgeColor = test.significance.includes('up') ? '#166534' : test.significance.includes('down') ? '#991B1B' : '#475569';
    const badgeBg = test.significance.includes('up') ? '#DCFCE7' : test.significance.includes('down') ? '#FEE2E2' : '#F1F5F9';
    const arrow = test.significance.includes('up') ? '📈' : test.significance.includes('down') ? '📉' : '➖';
    let anomalyWarning = anomalies.length > 0 ? `<div style="margin-top: 8px; padding: 8px; background: #FEF2F2; border-left: 3px solid #EF4444; border-radius: 4px; color: #991B1B; font-size: 11.5px;"><b>🚨 Anomali:</b> ${anomalies.length} hari tidak wajar.</div>` : '';
    let velocityHtml = velocity ? `<div style="margin-top: 8px; font-size: 12px; color: #475569;">${velocity.velocity > 0 ? '🚀' : '⚠️'} <b>Kecepatan:</b> <span style="color:${velocity.velocity > 0 ? '#166534' : '#991B1B'}; font-weight:bold;">${velocity.velocity > 0 ? '+' : ''}${velocity.velocity.toFixed(1)}%</span></div>` : '';
    advStats = `
      <div style="margin-top: 12px; padding: 12px; background: #F8FAFC; border-radius: 6px; font-size: 12px; border: 1px solid #E2E8F0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
          <span class="strong">Analisis Statistik</span>
          <span style="background:${badgeBg}; color:${badgeColor}; padding: 3px 8px; border-radius: 4px; font-weight: 600; font-size: 11px;">${arrow} ${test.interpretation}</span>
        </div>
        ${fc ? `<div style="color:#475569; line-height: 1.5;"><b>Proyeksi 7 Hari:</b> ${compactRp(totalFc)}</div>` : ''}
        ${velocityHtml}
        ${anomalyWarning}
      </div>`;
  }
  return `
    <div class="card-h">
      <div><div class="card-t">Tren ${useCarton ? 'Qty Karton' : 'Omset'}</div></div>
      <div class="right" style="display:flex; gap:6px; align-items:center;">
        <button class="btn sm" data-quick-export="#ov-trend" data-title="Laporan Tren Penjualan" data-filename="tren_penjualan">📥 Ekspor</button>
        <div class="seg" id="trendMetricSeg"><button data-tm2="rupiah" class="${metric === 'rupiah' ? 'on' : ''}">Rp</button><button data-tm2="carton" class="${metric === 'carton' ? 'on' : ''}">Ktn</button></div>
        <div class="seg" id="trendSeg"><button data-tm="day" class="${mode === 'day' ? 'on' : ''}">Hari</button><button data-tm="week" class="${mode === 'week' ? 'on' : ''}">Mgg</button><button data-tm="month" class="${mode === 'month' ? 'on' : ''}">Bln</button><button data-tm="period" class="${mode === 'period' ? 'on' : ''}">Periode</button></div>
      </div>
    </div>
    ${chartTrend(pts)}
    ${advStats}
  `;
}

function channelBlock(state){
  const rows = selectFiltered(state);
  const g = groupBy(rows, r => r.channel, 'omset').sort((a, b) => b.value - a.value).slice(0, 6);
  return `
    <div class="card-h">
      <div><div class="card-t">Komposisi Channel</div></div>
      <div class="right"><button class="btn sm" data-quick-export="#ov-channel" data-title="Laporan Komposisi Channel" data-filename="komposisi_channel">📥 Ekspor</button></div>
    </div>
    ${chartDonut(g.map(x => ({ label: x.label, value: x.value })))}`;
}

function smBlock(state){ 
  const g = groupBy(selectFiltered(state), r => r.salesman, 'omset').sort((a, b) => b.value - a.value).slice(0, 8);
  return `
    <div class="card-h"><div><div class="card-t">Top Salesman</div></div><div class="right" style="display:flex; gap:6px;"><button class="btn sm" data-quick-export="#ov-sm" data-title="Laporan Top Salesman" data-filename="top_salesman">📥 Ekspor</button><button class="btn sm" data-view="salesman">Detail</button></div></div>
    ${chartBars(g.map(x => ({ label: x.label, value: x.value })), { dim: 'salesman' })}
  `;
}

function prBlock(state){ 
  const g = groupBy(selectFiltered(state), r => r.product, 'omset').sort((a, b) => b.value - a.value).slice(0, 8);
  return `
    <div class="card-h"><div><div class="card-t">Top Produk</div></div><div class="right"><button class="btn sm" data-quick-export="#ov-pr" data-title="Laporan Top Produk" data-filename="top_produk">📥 Ekspor</button></div></div>
    ${chartBars(g.map(x => ({ label: x.label, value: x.value })), { dim: 'product' })}
  `;
}

function regionBlock(state){ 
  const rows = selectFiltered(state);
  const a = selectAgg(state);
  const list = groupBy(rows, r => r.kabupaten, 'omset').map(g => ({ ...g, share: a.omset ? (g.value / a.omset) * 100 : 0 })).sort((a, b) => b.value - a.value);
  return `
    <div class="card-h">
      <div><div class="card-t">Ringkasan Wilayah</div></div>
      <div class="right" style="display:flex; gap:6px;">
        <button class="btn sm" data-quick-export="#ov-region" data-title="Laporan Ringkasan Wilayah" data-filename="ringkasan_wilayah">📥 Ekspor</button>
        <button class="btn sm" data-view="territory">Detail</button>
      </div>
    </div>
    ${sortableTable({ 
      scope: 'ov-region', 
      rows: list, 
      drillDownDim: 'kabupaten', 
      columns: [
        { key: 'label', label: 'Kabupaten', render: r => `<span class="strong">${esc(r.label)}</span>` },
        { key: 'value', label: 'Omset', align: 'num', render: r => `<span class="strong">${compactRp(r.value)}</span>` },
        { key: 'share', label: 'Kontribusi', align: 'num', render: r => pct(r.share) },
      ] 
    })}
  `;
}

function todayBlock(state){
  const rows = selectFiltered(state);
  const ref  = _resolveTodayRef(rows);
  if (!ref) return '';
  const todayRows = rows.filter(r => r.day === ref.date);
  const yestRows  = rows.filter(r => r.day === _shiftDay(ref.date, -1));
  const today = agg(todayRows);
  const yest  = agg(yestRows);
  const all   = selectAgg(state); 
  const hkDays   = all.hkDays || 0;
  const avgDaily = hkDays ? (all.omset || 0) / hkDays : 0;
  const avgIPT   = all.avgIpt || 0;
  const dPrev = yest.omset  ? ((today.omset  - yest.omset)  / yest.omset)  * 100 : null;
  const dAvg  = avgDaily    ? ((today.omset  - avgDaily)    / avgDaily)    * 100 : null;
  const dIPT  = yest.avgIpt ? ((today.avgIpt - yest.avgIpt) / yest.avgIpt) * 100 : null;
  const label = ref.kind === 'today' ? 'Hari Ini' : 'Hari Terakhir dalam Filter';
  const badge = ref.kind === 'today'
    ? `<span style="display:inline-block;margin-left:8px;padding:2px 8px;background:#DCFCE7;color:#166534;border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:.3px">● LIVE</span>`
    : `<span style="display:inline-block;margin-left:8px;padding:2px 8px;background:#FEF3C7;color:#92400E;border-radius:999px;font-size:10.5px;font-weight:700;letter-spacing:.3px">◷ TERAKHIR</span>`;
  const fmtV = v => (v != null && isFinite(v)) ? compactRp(v) : '—';
  const yestHint = (v, fmt) => (v != null && isFinite(v)) ? 'kemarin: ' + (fmt ? fmt(v) : v) : '—';
  return `
    <div class="card mb12">
      <div class="card-h">
        <div>
          <div class="card-t">📅 KPI ${esc(label)} — ${esc(fmtDateID(ref.date))}${badge}</div>
          <div class="card-s">Snapshot harian · ${hkDays} hari kerja dalam filter</div>
        </div>
        <div class="right">
          <button class="btn sm" data-quick-export="#ov-today-body" data-title="Laporan KPI Harian" data-filename="kpi_harian">📥 Ekspor</button>
        </div>
      </div>
      <div class="grid" id="ov-today-body" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
        <div class="cmp-card"><div class="cmp-l">Omset</div><div class="cmp-v">${fmtV(today.omset)}</div><div class="cmp-d">${deltaSpan(dPrev)} <span style="opacity:.7">vs kemarin</span></div></div>
        <div class="cmp-card"><div class="cmp-l">Rata-rata Harian</div><div class="cmp-v">${fmtV(avgDaily)}</div><div class="cmp-d">${deltaSpan(dAvg)} <span style="opacity:.7">hari ini</span></div></div>
        <div class="cmp-card"><div class="cmp-l">Faktur</div><div class="cmp-v">${today.invoices || 0}</div><div class="cmp-d">${yestHint(yest.invoices)}</div></div>
        <div class="cmp-card"><div class="cmp-l">Outlet Aktif (OA)</div><div class="cmp-v">${today.oa || 0}</div><div class="cmp-d">${yestHint(yest.oa)}</div></div>
        <div class="cmp-card"><div class="cmp-l">Qty Karton</div><div class="cmp-v">${fmtKtn(today.qtyCarton || 0)}</div><div class="cmp-d">${yestHint(yest.qtyCarton, fmtKtn)}</div></div>
        <div class="cmp-card"><div class="cmp-l">Item / Transaksi (IPT)</div><div class="cmp-v">${NF1.format(today.avgIpt || 0)}</div><div class="cmp-d">${deltaSpan(dIPT)} <span style="opacity:.7">vs kmrn · avg ${NF1.format(avgIPT)}</span></div></div>
        <div class="cmp-card"><div class="cmp-l">Efektif Call (EC)</div><div class="cmp-v">${NF1.format(today.efektifCall || 0)}</div><div class="cmp-d">${yestHint(yest.efektifCall, NF1.format)}</div></div>
        <div class="cmp-card"><div class="cmp-l">Return Rate</div><div class="cmp-v">${pct(today.retRate || 0)}</div><div class="cmp-d">${yestHint(yest.retRate, pct)}</div></div>
      </div>
    </div>`;
}

function update(container, state){
  patchHTML('#ov-warning', warningBlock(state));
  patchHTML('#ov-today',   todayBlock(state));
  patchHTML('#ov-kpis',    kpiBlock(state));
  patchHTML('#ov-pvm',     pvmBlock(state));
  patchHTML('#ov-cmp',     cmpBlock(state));
  patchHTML('#ov-trend',   trendBlock(state));
  patchHTML('#ov-channel', channelBlock(state));
  patchHTML('#ov-sm',      smBlock(state));
  patchHTML('#ov-pr',      prBlock(state));
  patchHTML('#ov-region',  regionBlock(state));

  const rows = selectFiltered(state);
  const salesmenMap = new Map();
  for(const r of rows) {
    if(r.tt !== 'F') continue;
    if(!salesmenMap.has(r.salesman)) salesmenMap.set(r.salesman, { omset: 0, days: new Set(), outlets: new Set() });
    const s = salesmenMap.get(r.salesman);
    s.omset += (Number(r.amount) || 0);
    s.days.add(r.day);
    s.outlets.add(r.outletKey);
  }
  const scatterData = [];
  for(const [name, data] of salesmenMap.entries()) {
    const ec = data.days.size > 0 ? (data.outlets.size / data.days.size) : 0; 
    if (ec > 0 && data.omset > 0) scatterData.push({ x: ec, y: data.omset, label: name });
  }
  const chartType = store.state.ui.ovChartType || 'scatter';
  if (scatterData.length > 0) {
    if (chartType === 'bar') barChart('#chart-scatter', scatterData, 'Total Omset');
    else if (chartType === 'radar') radarMultiChart('#chart-scatter', scatterData);
    else scatterChart('#chart-scatter', scatterData, 'Efektif Call (EC)', 'Total Omset (Rp)');
  }
}

export function installOverviewControls(){
  document.addEventListener('click', (e) => {
    const tm = e.target.closest('#trendSeg button');
    if(tm){ store.set({ ui: { ...store.state.ui, trendMode: tm.dataset.tm } }); return; }
    const tm2 = e.target.closest('#trendMetricSeg button');
    if(tm2){ store.set({ ui: { ...store.state.ui, trendMetric: tm2.dataset.tm2 } }); return; }
    const ct = e.target.closest('#chartTypeSeg button');
    if(ct){ 
      store.set({ ui: { ...store.state.ui, ovChartType: ct.dataset.ct } }); 
      const state = store.state;
      const container = document.querySelector('#view');
      if(container) update(container, state);
      return; 
    }
    const pvmBtn = e.target.closest('#pvmDimSeg button');
    if(pvmBtn){ 
      store.set({ ui: { ...store.state.ui, pvmDim: pvmBtn.dataset.pd } }); 
      return; 
    }
    // ✅ BARU: Buka Detail View (Drill-Through, bypass filter)
    const drill = e.target.closest('[data-dim]');
    if (drill) {
      const dim = drill.dataset.dim;
      const val = drill.dataset.val;
      if (dim && val) {
        openDetail(dim, val);
        return;
      }
    }
  });
}

registerView('overview', { label: 'Overview', title: 'Overview', sub: 'Ringkasan performa penjualan', shell, update });