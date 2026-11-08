import { esc, compactRp, fmtDateID, NF1, pct } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered, selectAgg } from '../core/selectors.js';
import { groupBy } from '../data/aggregator.js';
import { generateAIReport } from '../analytics/engine.js';
import { overallComparison } from '../plugins/comparison.js';
import { linReg } from '../analytics/stats-advanced.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';

function shell(){
  return `
    <style>
      /* ═══ V11 CLEAN REPORT — Anti-Berantakan ═══ */
      .rpt-container {
        background: #F1F5F9;
        padding: 16px 8px;
        min-height: 100vh;
      }

      .rpt-page {
        background: #FFFFFF;
        width: 100%;
        max-width: 820px;
        margin: 0 auto 20px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.08);
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #0F172A;
        padding: 0;
        overflow: hidden;
      }

      /* ── COVER ── */
      .rpt-cover {
        background: #0F172A;
        color: #fff;
        padding: 40px 24px;
        min-height: 480px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        box-sizing: border-box;
      }
      .rpt-cover-logo {
        font-size: 36px;
        font-weight: 900;
        letter-spacing: -2px;
        line-height: 1;
      }
      .rpt-cover-logo span { color: #3B82F6; }
      .rpt-cover-sub {
        font-size: 10px;
        font-weight: 700;
        color: #94A3B8;
        letter-spacing: 3px;
        text-transform: uppercase;
        margin-top: 8px;
      }
      .rpt-cover-title {
        font-size: 32px;
        font-weight: 900;
        line-height: 1.1;
        letter-spacing: -1px;
        margin: 40px 0 16px;
      }
      .rpt-cover-title span { color: #3B82F6; }
      .rpt-cover-desc {
        font-size: 13px;
        line-height: 1.6;
        color: #CBD5E1;
        max-width: 90%;
      }
      .rpt-cover-hero {
        margin: 32px 0 24px;
      }
      .rpt-cover-hero-num {
        font-size: 56px;
        font-weight: 900;
        letter-spacing: -3px;
        line-height: 1;
        color: #3B82F6;
      }
      .rpt-cover-hero-label {
        font-size: 11px;
        font-weight: 700;
        color: #94A3B8;
        letter-spacing: 2px;
        text-transform: uppercase;
        margin-top: 8px;
      }
      .rpt-cover-meta {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: flex-end;
        gap: 16px;
        padding-top: 16px;
        border-top: 1px solid #334155;
      }
      .rpt-cover-meta-item {
        font-size: 10px;
        color: #94A3B8;
        letter-spacing: 1px;
        text-transform: uppercase;
      }
      .rpt-cover-meta-item b {
        display: block;
        font-size: 12px;
        color: #fff;
        margin-top: 4px;
        letter-spacing: 0;
        text-transform: none;
      }
      .rpt-conf-badge {
        font-size: 9px;
        font-weight: 900;
        color: #FCA5A5;
        border: 1px solid #FCA5A5;
        padding: 3px 8px;
        border-radius: 4px;
        letter-spacing: 1px;
      }

      /* ── PAGE HEADER ── */
      .rpt-page-header {
        background: #0F172A;
        color: #fff;
        padding: 14px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-sizing: border-box;
      }
      .rpt-ph-brand {
        font-size: 18px;
        font-weight: 900;
        letter-spacing: -1px;
      }
      .rpt-ph-brand span { color: #3B82F6; }
      .rpt-ph-section {
        font-size: 9px;
        color: #94A3B8;
        letter-spacing: 2px;
        text-transform: uppercase;
      }

      .rpt-page-body {
        padding: 20px;
        box-sizing: border-box;
      }

      /* ── SECTION TITLE ── */
      .rpt-sec-title {
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        color: #0F172A;
        border-bottom: 2px solid #1D4ED8;
        padding-bottom: 8px;
        margin-bottom: 14px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .rpt-sec-title span {
        background: #1D4ED8;
        color: #fff;
        font-size: 9px;
        padding: 2px 6px;
        border-radius: 3px;
      }

      /* ── KPI GRID (AUTO-FIT, SANGAT AMAN) ── */
      .rpt-kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 8px;
        margin-bottom: 20px;
      }
      .rpt-kpi {
        padding: 10px 12px;
        border: 1px solid #E2E8F0;
        border-radius: 6px;
        background: #FFFFFF;
        box-sizing: border-box;
      }
      .rpt-kpi-l {
        font-size: 9px;
        font-weight: 800;
        color: #64748B;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
        line-height: 1.2;
      }
      .rpt-kpi-v {
        font-size: 15px;
        font-weight: 900;
        line-height: 1.15;
        color: #0F172A;
      }
      .rpt-kpi-s {
        font-size: 9px;
        color: #94A3B8;
        margin-top: 3px;
        line-height: 1.2;
      }

      /* Warna border KPI */
      .rpt-kpi.blue { border-top: 3px solid #1D4ED8; }
      .rpt-kpi.green { border-top: 3px solid #10B981; }
      .rpt-kpi.orange { border-top: 3px solid #F59E0B; }
      .rpt-kpi.red { border-top: 3px solid #EF4444; }
      .rpt-kpi.purple { border-top: 3px solid #8B5CF6; }
      .rpt-kpi.gray { border-top: 3px solid #64748B; }

      /* ── BOX CARD ── */
      .rpt-box {
        border: 1px solid #E2E8F0;
        border-radius: 8px;
        padding: 14px;
        background: #FFFFFF;
        margin-bottom: 14px;
        box-sizing: border-box;
      }
      .rpt-box-title {
        font-size: 10px;
        font-weight: 800;
        color: #64748B;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 10px;
      }

      /* ── SUMMARY ── */
      .rpt-summary {
        background: #F8FAFC;
        border-left: 4px solid #8B5CF6;
        padding: 14px;
        border-radius: 6px;
        font-size: 11.5px;
        line-height: 1.7;
        color: #334155;
        text-align: justify;
        margin-bottom: 16px;
      }
      .rpt-summary strong { color: #6D28D9; font-weight: 800; }

      /* ── CHART PANELS ── */
      .rpt-chart-box {
        border: 1px solid #E2E8F0;
        border-radius: 8px;
        padding: 12px;
        background: #fff;
        margin-bottom: 14px;
        box-sizing: border-box;
      }

      /* ── LIST ITEM ── */
      .rpt-list-item {
        margin-bottom: 10px;
      }
      .rpt-list-item:last-child { margin-bottom: 0; }
      .rpt-list-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        margin-bottom: 4px;
      }
      .rpt-list-name {
        font-weight: 700;
        color: #0F172A;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .rpt-list-val {
        font-weight: 800;
        flex-shrink: 0;
        font-size: 10.5px;
      }
      .rpt-bar {
        height: 4px;
        background: #F1F5F9;
        border-radius: 2px;
        overflow: hidden;
      }
      .rpt-bar-fill {
        height: 100%;
        border-radius: 2px;
      }

      /* ── PLAYBOOK ── */
      .rpt-playbook {
        display: flex;
        gap: 10px;
        padding: 12px;
        border: 1px solid #E2E8F0;
        border-radius: 6px;
        margin-bottom: 10px;
        background: #fff;
        box-sizing: border-box;
      }
      .rpt-playbook-num {
        font-size: 20px;
        font-weight: 900;
        color: #DC2626;
        line-height: 1;
        flex-shrink: 0;
      }
      .rpt-playbook-content { flex: 1; min-width: 0; }
      .rpt-playbook-title {
        font-size: 11px;
        font-weight: 800;
        color: #0F172A;
        margin-bottom: 6px;
        line-height: 1.3;
      }
      .rpt-playbook-action {
        font-size: 10px;
        line-height: 1.5;
        color: #475569;
        margin-bottom: 3px;
      }
      .rpt-playbook-action b {
        color: #0F172A;
        font-weight: 800;
      }

      /* ── SIGNATURE ── */
      .rpt-sig {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-top: 32px;
        padding-top: 20px;
        border-top: 1px solid #E2E8F0;
      }
      .rpt-sig-item {
        text-align: center;
        font-size: 10px;
      }
      .rpt-sig-label {
        color: #64748B;
        margin-bottom: 44px;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-size: 9px;
      }
      .rpt-sig-line {
        border-top: 1px solid #0F172A;
        padding-top: 6px;
        font-weight: 800;
        color: #0F172A;
        font-size: 10.5px;
      }
      .rpt-sig-role {
        color: #94A3B8;
        font-size: 9px;
        margin-top: 2px;
      }

      /* ── FOOTER ── */
      .rpt-footer {
        padding: 10px 20px;
        background: #F8FAFC;
        border-top: 1px solid #E2E8F0;
        display: flex;
        justify-content: space-between;
        font-size: 8.5px;
        color: #94A3B8;
        font-family: monospace;
        box-sizing: border-box;
      }

      /* ── PRINT ── */
      @media print {
        @page { size: A4; margin: 10mm; }
        body { background: #fff !important; }
        .rpt-container { padding: 0 !important; background: #fff !important; }
        .rpt-page {
          box-shadow: none !important;
          margin: 0 !important;
          max-width: 100% !important;
          page-break-after: always;
          border: none !important;
        }
        .rpt-page:last-child { page-break-after: auto; }
        .no-print { display: none !important; }
        .rpt-cover, .rpt-page-header {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .rpt-kpi-grid {
          grid-template-columns: repeat(4, 1fr) !important;
        }
      }
    </style>
    <div id="report-content"></div>
  `;
}

// ─── SVG GENERATORS ───
function genTrendSvg(rows) {
  const dailyMap = new Map();
  for(const r of rows) if(r.tt === 'F') dailyMap.set(r.day, (dailyMap.get(r.day) || 0) + r.amount);
  const vals = Array.from(dailyMap.keys()).sort().map(d => dailyMap.get(d));
  if(vals.length < 4) return '<div style="text-align:center; color:#94A3B8; font-size:10px; padding:20px;">Data historis tidak cukup</div>';

  const xs = vals.map((_, i) => i);
  const reg = linReg(xs, vals);
  const fc = [];
  for(let i = 1; i <= 5; i++) fc.push(Math.max(0, reg.slope * (vals.length - 1 + i) + reg.intercept));

  const allVals = [...vals, ...fc];
  const W = 400, H = 100, PAD = 10;
  const maxV = Math.max(...allVals) || 1;
  const n = allVals.length;
  const x = i => PAD + (i / (n - 1)) * (W - PAD * 2);
  const y = v => H - PAD - (v / maxV) * (H - PAD * 2);

  let p1 = '', p2 = '', area = '';
  vals.forEach((v, i) => {
    const px = x(i).toFixed(1), py = y(v).toFixed(1);
    if(i === 0) { p1 += `M${px} ${py} `; area += `M${px} ${H-PAD} L${px} ${py} `; }
    else { p1 += `L${px} ${py} `; area += `L${px} ${py} `; }
  });
  area += `L${x(vals.length-1).toFixed(1)} ${H-PAD} Z`;

  p2 = `M${x(vals.length-1).toFixed(1)} ${y(vals[vals.length-1]).toFixed(1)} `;
  fc.forEach((v, i) => p2 += `L${x(vals.length + i).toFixed(1)} ${y(v).toFixed(1)} `);

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; display:block;">
      <defs><linearGradient id="gV11" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1D4ED8" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="#1D4ED8" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#gV11)"/>
      <path d="${p1}" fill="none" stroke="#1D4ED8" stroke-width="2"/>
      <path d="${p2}" fill="none" stroke="#F59E0B" stroke-width="2" stroke-dasharray="4,3"/>
      <line x1="${PAD}" y1="${H-PAD}" x2="${W-PAD}" y2="${H-PAD}" stroke="#E2E8F0" stroke-width="1"/>
    </svg>`;
}

function genDonutSvg(items) {
  if(!items.length) return '<div style="text-align:center; color:#94A3B8; font-size:10px; padding:20px;">Tidak ada data</div>';
  const total = items.reduce((s, i) => s + i.value, 0);
  const colors = ['#1D4ED8', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
  const C = 50, R = 40, r = 26;
  let arcs = '', a = -Math.PI/2;
  items.forEach((it, i) => {
    const ang = (it.value / total) * Math.PI * 2;
    const a0 = a, a1 = a + ang; a = a1;
    const large = ang > Math.PI ? 1 : 0;
    const x0 = C + R*Math.cos(a0), y0 = C + R*Math.sin(a0);
    const x1 = C + R*Math.cos(a1), y1 = C + R*Math.sin(a1);
    const x2 = C + r*Math.cos(a1), y2 = C + r*Math.sin(a1);
    const x3 = C + r*Math.cos(a0), y3 = C + r*Math.sin(a0);
    arcs += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} A${r} ${r} 0 ${large} 0 ${x3.toFixed(1)} ${y3.toFixed(1)} Z" fill="${colors[i % colors.length]}" stroke="#fff" stroke-width="1"/>`;
  });
  return `
    <div style="display:grid; grid-template-columns:100px 1fr; gap:14px; align-items:center;">
      <svg viewBox="0 0 100 100" style="width:100px; height:100px;">${arcs}</svg>
      <div>
        ${items.map((it, i) => `
          <div style="display:flex; justify-content:space-between; font-size:10px; margin-bottom:5px;">
            <div style="display:flex; align-items:center; gap:5px;">
              <span style="width:8px; height:8px; border-radius:2px; background:${colors[i%colors.length]}"></span>
              <span style="font-weight:700; color:#334155;">${esc(it.label)}</span>
            </div>
            <span style="font-weight:800; color:#0F172A;">${pct((it.value/total)*100)}</span>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function update(container, state){
  const rows = selectFiltered(state);
  const agg = selectAgg(state);
  const cmp = overallComparison(state);

  if (!agg.omset) {
    patchHTML('#report-content', '<div class="empty" style="padding:40px; text-align:center;">Belum ada data untuk dibuat laporan.</div>');
    return;
  }

  const ai = generateAIReport(state);
  const topSales = groupBy(rows, r => r.salesman, 'omset').sort((a,b)=>b.value-a.value).slice(0,5);
  const topProducts = groupBy(rows, r => r.product, 'omset').sort((a,b)=>b.value-a.value).slice(0,5);
  const topOutlets = groupBy(rows, r => r.outlet, 'omset').sort((a,b)=>b.value-a.value).slice(0,5);
  const divisiData = groupBy(rows, r => r.divisi, 'omset').filter(g => g.label !== '—').sort((a,b)=>b.value-a.value).slice(0,5);

  const maxSales = topSales[0]?.value || 1;
  const maxProd = topProducts[0]?.value || 1;
  const maxOut = topOutlets[0]?.value || 1;

  const periodLabel = (state.filters.from && state.filters.to)
    ? `${fmtDateID(state.filters.from)} - ${fmtDateID(state.filters.to)}`
    : 'Semua Periode';
  const printDate = new Date().toLocaleString('id-ID', { dateStyle: 'long' });
  const docHash = 'M245-' + Math.abs(new Date().getTime() ^ (agg.omset * 1000)).toString(16).toUpperCase().slice(0, 8);

  const masterCount = agg.masterCount || 0;
  const coverageVal = masterCount > 0 ? (agg.oa / masterCount) * 100 : 0;
  const avgPerOutlet = agg.oa > 0 ? (agg.omset / agg.oa) : 0;

  const activeFilters = [];
  for(const k in state.filters) {
    const v = state.filters[k];
    if(v instanceof Set && v.size > 0) activeFilters.push(`${k.toUpperCase()}: ${Array.from(v).slice(0,3).join(', ')}${v.size > 3 ? '...' : ''}`);
    else if(typeof v === 'string' && v && k !== 'transtype' && k !== 'q') activeFilters.push(`${k.toUpperCase()}: ${v}`);
  }
  const contextStr = activeFilters.length > 0 ? activeFilters.join(' • ') : 'Tanpa Filter (Semua Data)';

  const formattedSummary = ai.summary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

  const renderDelta = (val) => {
    if(val == null) return '<span style="color:#94A3B8; font-size:9px;">n/a</span>';
    const up = val > 0, col = up ? '#10B981' : (val < 0 ? '#EF4444' : '#94A3B8');
    const arrow = up ? '▲' : (val < 0 ? '▼' : '■');
    return `<span style="color:${col}; font-size:9px; font-weight:800;">${arrow} ${NF1.format(Math.abs(val))}%</span>`;
  };

  const renderList = (items, max, color) => items.map((it, i) => `
    <div class="rpt-list-item">
      <div class="rpt-list-row">
        <span class="rpt-list-name">${i+1}. ${esc(it.label)}</span>
        <span class="rpt-list-val" style="color:${color}">${compactRp(it.value)}</span>
      </div>
      <div class="rpt-bar"><div class="rpt-bar-fill" style="width:${(it.value/max)*100}%;background:${color}"></div></div>
    </div>
  `).join('');

  const getColor = (val, limit, rev=false) => rev ? (val > limit ? '#EF4444' : '#10B981') : (val >= limit ? '#10B981' : (val >= limit*0.8 ? '#F59E0B' : '#EF4444'));

  patchHTML('#report-content', `
    <div class="no-print" style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px; max-width:820px; margin:0 auto 12px;">
      <div>
        <div style="font-size:16px; font-weight:900; color:#0F172A;">V11 Clean Report</div>
        <div class="tiny" style="color:#64748B;">14 KPI Lengkap · Siap Cetak PDF</div>
      </div>
      <button class="btn primary" onclick="window.print()" style="padding:10px 16px; font-weight:800; border-radius:8px; background:#0F172A; color:#fff; border:none;">
        🖨️ Cetak / PDF
      </button>
    </div>

    <div class="rpt-container">

      <!-- ══════ PAGE 1: COVER ══════ -->
      <div class="rpt-page">
        <div class="rpt-cover">
          <div>
            <div class="rpt-cover-logo">M245<span>.</span></div>
            <div class="rpt-cover-sub">Business Intelligence System</div>
          </div>

          <div>
            <div class="rpt-cover-title">
              Quarterly<br><span>Performance</span><br>Report.
            </div>
            <div class="rpt-cover-desc">
              Laporan analisis kinerja penjualan komprehensif yang disusun oleh sistem kecerdasan buatan M245 untuk keputusan strategis tingkat direksi.
            </div>
          </div>

          <div class="rpt-cover-hero">
            <div class="rpt-cover-hero-num">${compactRp(agg.omset)}</div>
            <div class="rpt-cover-hero-label">Total Revenue This Period</div>
          </div>

          <div class="rpt-cover-meta">
            <div class="rpt-cover-meta-item">
              Periode<b>${periodLabel}</b>
            </div>
            <div class="rpt-cover-meta-item">
              Generated<b>${printDate}</b>
            </div>
            <div class="rpt-cover-meta-item">
              Doc ID<b>${docHash}</b>
            </div>
            <div class="rpt-conf-badge">STRICTLY CONFIDENTIAL</div>
          </div>
        </div>
      </div>

      <!-- ══════ PAGE 2: FULL KPI SNAPSHOT ══════ -->
      <div class="rpt-page">
        <div class="rpt-page-header">
          <div class="rpt-ph-brand">M245<span>.</span></div>
          <div class="rpt-ph-section">Executive KPI Dashboard</div>
        </div>

        <div class="rpt-page-body">
          <div class="rpt-sec-title"><span>01</span> Revenue Metrics</div>
          <div class="rpt-kpi-grid">
            <div class="rpt-kpi blue">
              <div class="rpt-kpi-l">Omset</div>
              <div class="rpt-kpi-v">${compactRp(agg.omset)}</div>
              <div class="rpt-kpi-s">${renderDelta(cmp?.deltaLM)} vs LM</div>
            </div>
            <div class="rpt-kpi blue">
              <div class="rpt-kpi-l">Gross Bruto</div>
              <div class="rpt-kpi-v">${compactRp(agg.grossF)}</div>
              <div class="rpt-kpi-s">Sebelum retur</div>
            </div>
            <div class="rpt-kpi red">
              <div class="rpt-kpi-l">Nilai Return</div>
              <div class="rpt-kpi-v">${compactRp(agg.grossR)}</div>
              <div class="rpt-kpi-s">Total retur</div>
            </div>
            <div class="rpt-kpi ${agg.retRate > 2 ? 'red' : 'green'}">
              <div class="rpt-kpi-l">Return Rate</div>
              <div class="rpt-kpi-v" style="color:${agg.retRate > 2 ? '#EF4444' : '#10B981'}">${pct(agg.retRate)}</div>
              <div class="rpt-kpi-s">Target &lt; 2%</div>
            </div>
          </div>

          <div class="rpt-sec-title"><span>02</span> Coverage & Distribution</div>
          <div class="rpt-kpi-grid">
            <div class="rpt-kpi green">
              <div class="rpt-kpi-l">Outlet Aktif</div>
              <div class="rpt-kpi-v" style="color:${getColor(coverageVal, 80)}">${agg.oa}</div>
              <div class="rpt-kpi-s">Dari ${masterCount} master</div>
            </div>
            <div class="rpt-kpi ${coverageVal >= 80 ? 'green' : (coverageVal >= 50 ? 'orange' : 'red')}">
              <div class="rpt-kpi-l">Coverage</div>
              <div class="rpt-kpi-v" style="color:${getColor(coverageVal, 80)}">${pct(coverageVal)}</div>
              <div class="rpt-kpi-s">Target 80%</div>
            </div>
            <div class="rpt-kpi purple">
              <div class="rpt-kpi-l">Efektif Call</div>
              <div class="rpt-kpi-v" style="color:${getColor(agg.efektifCall, 20)}">${NF1.format(agg.efektifCall || 0)}</div>
              <div class="rpt-kpi-s">Toko / HK</div>
            </div>
            <div class="rpt-kpi gray">
              <div class="rpt-kpi-l">Hari Kerja</div>
              <div class="rpt-kpi-v">${agg.hkDays || 0}</div>
              <div class="rpt-kpi-s">Hari aktif</div>
            </div>
          </div>

          <div class="rpt-sec-title"><span>03</span> Productivity Metrics</div>
          <div class="rpt-kpi-grid">
            <div class="rpt-kpi orange">
              <div class="rpt-kpi-l">Item / Trx (IPT)</div>
              <div class="rpt-kpi-v" style="color:${getColor(agg.avgIpt, 4)}">${NF1.format(agg.avgIpt || 0)}</div>
              <div class="rpt-kpi-s">Target 4+</div>
            </div>
            <div class="rpt-kpi blue">
              <div class="rpt-kpi-l">Total Faktur</div>
              <div class="rpt-kpi-v">${NF1.format(agg.invoices)}</div>
              <div class="rpt-kpi-s">Nota transaksi</div>
            </div>
            <div class="rpt-kpi gray">
              <div class="rpt-kpi-l">Total Baris</div>
              <div class="rpt-kpi-v">${NF1.format(agg.lines)}</div>
              <div class="rpt-kpi-s">Line item</div>
            </div>
            <div class="rpt-kpi purple">
              <div class="rpt-kpi-l">Qty Karton</div>
              <div class="rpt-kpi-v">${NF1.format(agg.qtyCarton || 0)}</div>
              <div class="rpt-kpi-s">Karton terjual</div>
            </div>
            <div class="rpt-kpi blue">
              <div class="rpt-kpi-l">Avg / Outlet</div>
              <div class="rpt-kpi-v">${compactRp(avgPerOutlet)}</div>
              <div class="rpt-kpi-s">Omset per OA</div>
            </div>
            <div class="rpt-kpi ${ai.healthScore >= 80 ? 'green' : (ai.healthScore >= 50 ? 'orange' : 'red')}">
              <div class="rpt-kpi-l">Health Score</div>
              <div class="rpt-kpi-v" style="color:${getColor(ai.healthScore, 80)}">${ai.healthScore}/100</div>
              <div class="rpt-kpi-s">Status AI</div>
            </div>
          </div>
        </div>

        <div class="rpt-footer">
          <div>Filter: ${esc(contextStr)}</div>
          <div>Page 02</div>
        </div>
      </div>

      <!-- ══════ PAGE 3: AI & CHARTS ══════ -->
      <div class="rpt-page">
        <div class="rpt-page-header">
          <div class="rpt-ph-brand">M245<span>.</span></div>
          <div class="rpt-ph-section">Analytics & AI Insight</div>
        </div>

        <div class="rpt-page-body">
          <div class="rpt-sec-title"><span>04</span> Executive Summary</div>
          <div class="rpt-summary">${formattedSummary}</div>

          <div class="rpt-sec-title"><span>05</span> Tren Omset & Proyeksi 5 Hari</div>
          <div class="rpt-chart-box">
            ${genTrendSvg(rows)}
            <div style="display:flex; gap:16px; justify-content:center; margin-top:8px; font-size:9px; color:#64748B;">
              <span><span style="display:inline-block; width:16px; height:2px; background:#1D4ED8; vertical-align:middle;"></span> Historis</span>
              <span><span style="display:inline-block; width:16px; height:2px; background:#F59E0B; border-top:1px dashed; vertical-align:middle;"></span> Proyeksi AI</span>
            </div>
          </div>

          <div class="rpt-sec-title"><span>06</span> Komposisi Divisi</div>
          <div class="rpt-chart-box">
            ${genDonutSvg(divisiData)}
          </div>
        </div>

        <div class="rpt-footer">
          <div>M245 · ${docHash}</div>
          <div>Page 03</div>
        </div>
      </div>

      <!-- ══════ PAGE 4: TOP PERFORMERS & PLAYBOOK ══════ -->
      <div class="rpt-page">
        <div class="rpt-page-header">
          <div class="rpt-ph-brand">M245<span>.</span></div>
          <div class="rpt-ph-section">Top Performers & Playbook</div>
        </div>

        <div class="rpt-page-body">
          <div class="rpt-sec-title"><span>07</span> Top Salesman</div>
          <div class="rpt-box">${renderList(topSales, maxSales, '#1D4ED8')}</div>

          <div class="rpt-sec-title"><span>08</span> Top Outlets</div>
          <div class="rpt-box">${renderList(topOutlets, maxOut, '#10B981')}</div>

          <div class="rpt-sec-title"><span>09</span> Top Produk</div>
          <div class="rpt-box">${renderList(topProducts, maxProd, '#F59E0B')}</div>

          <div class="rpt-sec-title"><span>10</span> Strategic Playbook (AI)</div>
          ${ai.insights.slice(0, 3).map((f, i) => `
            <div class="rpt-playbook">
              <div class="rpt-playbook-num">${String(i+1).padStart(2,'0')}</div>
              <div class="rpt-playbook-content">
                <div class="rpt-playbook-title">${esc(f.title)}</div>
                <div class="rpt-playbook-action"><b>Bisnis:</b> ${esc((f.nonTechnicalActions && f.nonTechnicalActions[0]) || '-')}</div>
                <div class="rpt-playbook-action"><b>Sistem:</b> ${esc((f.techActions && f.techActions[0]) || '-')}</div>
              </div>
            </div>
          `).join('')}

          <div class="rpt-sig">
            <div class="rpt-sig-item">
              <div class="rpt-sig-label">Prepared By</div>
              <div class="rpt-sig-line">System Administrator</div>
              <div class="rpt-sig-role">M245 Intelligence Engine</div>
            </div>
            <div class="rpt-sig-item">
              <div class="rpt-sig-label">Approved By</div>
              <div class="rpt-sig-line">_____________________</div>
              <div class="rpt-sig-role">Board of Directors</div>
            </div>
          </div>
        </div>

        <div class="rpt-footer">
          <div>M245 · ${docHash}</div>
          <div>Page 04</div>
        </div>
      </div>

    </div>
  `);
}

registerView('report', {
  label: 'Cetak Laporan',
  title: 'Executive Report',
  sub: 'Laporan Siap Cetak / PDF',
  shell,
  update
});