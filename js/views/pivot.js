import { esc, pct, compactRp, NF1 } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered } from '../core/selectors.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';
import { downloadCSV } from '../plugins/export.js';
import { openModal } from '../ui/feedback.js';
import { chartBars } from '../ui/charts.js';

const DIM_OPTS = [
  { k: 'salesman', l: 'Salesman' }, { k: 'product', l: 'Produk' }, { k: 'outlet', l: 'Outlet' },
  { k: 'divisi', l: 'Divisi' }, { k: 'subbrand', l: 'Subbrand' }, { k: 'kabupaten', l: 'Kabupaten' },
  { k: 'kecamatan', l: 'Kecamatan' }, { k: 'rayon', l: 'Rayon' }, { k: 'channel', l: 'Channel' },
  { k: 'tipe', l: 'Tipe Outlet' }, { k: 'periode', l: 'Periode' }, { k: 'week', l: 'Week' },
];

const MEASURE_OPTS = [
  { k: 'omset', l: 'Omset', type: 'sum', field: 'amount', isReturn: true, format: 'rp' },
  { k: 'qty', l: 'Qty', type: 'sum', field: 'netQty', format: 'num' },
  { k: 'carton', l: 'Karton', type: 'sum', field: 'netCarton', format: 'num' },
  { k: 'invoice', l: 'Faktur', type: 'count', field: 'invoice', format: 'num' },
  { k: 'outlet', l: 'Outlet', type: 'distinct', field: 'outletKey', format: 'num' },
  { k: 'sku', l: 'SKU', type: 'distinct', field: 'pcode', format: 'num' },
  { k: 'avg', l: 'Avg/Faktur', type: 'avg', num: 'amount', den: 'invoice', format: 'rp' }
];

const drillMemory = {};

function dimFn(dim){
  return {
    salesman: r => r.salesman, product: r => r.product, outlet: r => r.outlet,
    divisi: r => r.divisi, subbrand: r => r.subbrand, kabupaten: r => r.kabupaten,
    kecamatan: r => r.kecamatan, rayon: r => r.rayon, channel: r => r.channel,
    tipe: r => r.tipe, periode: r => r.periode, week: r => r.week,
  }[dim] || (r => r.salesman);
}

// ── MESIN KALKULASI ANTI-ERROR (Mengembalikan 0 jika data kosong) ──
function calcMeasure(rows, mKey) {
  if (!rows || !rows.length) return 0;
  const m = MEASURE_OPTS.find(o => o.k === mKey);
  if (!m) return 0;

  try {
    if (m.type === 'sum') {
      return rows.reduce((s, r) => {
        const val = Number(r[m.field]) || 0;
        return s + ((r.tt === 'R' && m.isReturn) ? -val : val);
      }, 0);
    }
    if (m.type === 'count') {
      const set = new Set();
      rows.forEach(r => { 
        const v = r[m.field];
        if (v != null && v !== '' && v !== '-') set.add(v); 
      });
      return set.size || rows.length; 
    }
    if (m.type === 'distinct') {
      const set = new Set();
      rows.forEach(r => { 
        const v = r[m.field];
        if (v != null && v !== '' && v !== '—' && v !== '-') set.add(v); 
      });
      return set.size;
    }
    if (m.type === 'avg') {
      const num = rows.reduce((s, r) => s + (r.tt === 'R' ? -(Number(r[m.num])||0) : (Number(r[m.num])||0)), 0);
      const den = new Set(rows.filter(r => r.tt === 'F').map(r => r[m.den]).filter(Boolean)).size;
      return den > 0 ? num / den : 0;
    }
  } catch(e) {
    return 0;
  }
  return 0;
}

function formatVal(v, mKey) {
  if (v == null || isNaN(v)) v = 0;
  const m = MEASURE_OPTS.find(o => o.k === mKey);
  if (!m) return String(v);
  return m.format === 'rp' ? compactRp(v) : NF1.format(v);
}

function getHeatmapStyle(val, min, max) {
  if (!val || val === 0 || min === max || max === -Infinity || min === Infinity) return '';
  let ratio = (val - min) / (max - min);
  if (ratio < 0) ratio = 0;
  if (ratio > 1) ratio = 1;
  const opacity = 0.05 + (ratio * 0.4); 
  const textColor = ratio > 0.6 ? '#fff' : '#1E293B';
  return `background: rgba(29, 78, 216, ${opacity.toFixed(2)}); color: ${textColor};`;
}

function getPivotList() {
  if (!store.state.ui.pivotList) {
    store.state.ui.pivotList = [{ 
      id: 'default-1', title: 'Omset per Salesman', rows: 'salesman', cols: [], 
      measures: ['omset', 'invoice'], sort: 'omset_desc', showTarget: true, 
      visualMode: 'table', zoom: 100, density: 'normal', border: 'thin', activeRowFilter: [] 
    }];
  }
  store.state.ui.pivotList.forEach(cfg => {
    if (typeof cfg.cols === 'string') cfg.cols = cfg.cols ? [cfg.cols] : [];
    if (cfg.measure && !cfg.measures) cfg.measures = [cfg.measure];
    if (!Array.isArray(cfg.measures) || cfg.measures.length === 0) cfg.measures = ['omset'];
    if (!cfg.visualMode) cfg.visualMode = 'table';
    if (!cfg.zoom) cfg.zoom = 100;
    if (!cfg.density) cfg.density = 'normal';
    if (!cfg.border) cfg.border = 'thin';
    if (!cfg.activeRowFilter) cfg.activeRowFilter = []; 
  });
  return store.state.ui.pivotList;
}

function getTargetForRow(state, rowLabel, config) {
  try {
    let activeMonth = state.filters.from ? state.filters.from.slice(0, 7) : (state.rows[0]?.day?.slice(0, 7));
    if (!activeMonth || !store.state.targets?.[activeMonth]) return 0;
    const t = store.state.targets[activeMonth];
    if (config.rows === 'salesman') return t.salesman?.[rowLabel]?.all?.ALL?.omset || 0;
    if (config.rows === 'divisi') return t.global?.divisi?.[rowLabel] || 0;
    if (config.rows === 'subbrand') return t.global?.subbrand?.[rowLabel] || 0;
    if (config.rows === 'produk' || config.rows === 'product') return t.global?.produk?.[rowLabel] || 0;
  } catch(e) {}
  return 0;
}

function shell(){ 
  return `
    <div class="card mb12" id="pivot-builder"></div>
    <div id="pivot-dashboard" style="display:flex; flex-direction:column; gap:16px;"></div>
  `; 
}

function builderBlock() {
  return `
    <div class="card-h">
      <div><div class="card-t">Pivot Builder</div>
      <div class="card-s">Buat analisis multi-dimensi layaknya Excel Pivot / Tableau.</div></div>
    </div>
    <div style="padding:16px; background:#F8FAFC; border-radius:8px; display:grid; gap:12px;">
      <div>
        <label style="display:block; font-size:11px; font-weight:700; color:#64748B; margin-bottom:4px;">Judul Laporan</label>
        <input type="text" id="pvNewTitle" placeholder="Cth: Analisis Pencapaian Salesman" style="width:100%; padding:10px; border:1px solid #CBD5E1; border-radius:6px; font-size:13px;">
      </div>
      <div style="display:grid; grid-template-columns:1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:11px; font-weight:700; color:#64748B; margin-bottom:4px;">Baris (Y)</label>
          <select id="pvNewRow" style="width:100%; padding:10px; border:1px solid #CBD5E1; border-radius:6px; font-size:13px;">
            ${DIM_OPTS.map(o => `<option value="${o.k}">${o.l}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="display:block; font-size:11px; font-weight:700; color:#64748B; margin-bottom:4px;">Kolom (X) - Opsional (Bisa lebih dari 1)</label>
          <div style="display:flex; flex-wrap:wrap; gap:8px; background:#fff; padding:10px; border:1px solid #CBD5E1; border-radius:6px;">
            ${DIM_OPTS.map(o => `<label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; background:#F8FAFC; padding:4px 8px; border-radius:4px; border:1px solid #E2E8F0;"><input type="checkbox" class="pv-col-chk" value="${o.k}"> ${o.l}</label>`).join('')}
          </div>
        </div>
      </div>
      <div>
        <label style="display:block; font-size:11px; font-weight:700; color:#64748B; margin-bottom:4px;">Ukuran / Nilai (Bisa pilih lebih dari 1)</label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; background:#fff; padding:10px; border:1px solid #CBD5E1; border-radius:6px;">
          ${MEASURE_OPTS.map(o => `<label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; background:#F8FAFC; padding:6px 8px; border-radius:4px; border:1px solid #E2E8F0;"><input type="checkbox" class="pv-measure-chk" value="${o.k}" ${o.k === 'omset' ? 'checked' : ''}> ${o.l}</label>`).join('')}
        </div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:11px; font-weight:700; color:#64748B; margin-bottom:4px;">Urutkan</label>
          <select id="pvNewSort" style="width:100%; padding:10px; border:1px solid #CBD5E1; border-radius:6px; font-size:13px;">
            <option value="omset_desc">Nilai ↓ (Tertinggi)</option>
            <option value="omset_asc">Nilai ↑ (Terendah)</option>
            <option value="label_asc">Nama A→Z</option>
          </select>
        </div>
        <div style="display:flex; align-items:center; gap:8px; margin-top:18px; padding:10px; background:#EFF6FF; border:1px solid #BFDBFE; border-radius:6px;">
          <input type="checkbox" id="pvNewShowTarget" style="width:16px; height:16px; cursor:pointer;">
          <label for="pvNewShowTarget" style="font-size:12px; font-weight:700; color:#1E3A8A; cursor:pointer;">Tampilkan Target & GAP</label>
        </div>
      </div>
      <button class="btn primary" id="btnAddPivot" style="width:100%; padding:12px; margin-top:4px;">+ Tambahkan ke Dashboard</button>
    </div>
  `;
}

function processData(rows, config, state) {
  const rFn = dimFn(config.rows);
  let filteredRows = rows || [];
  
  if (config.activeRowFilter && config.activeRowFilter.length > 0) {
    filteredRows = filteredRows.filter(r => config.activeRowFilter.includes(rFn(r) || '—'));
  }

  const rowMap = new Map();
  filteredRows.forEach(r => {
    const rKey = rFn(r) || '—';
    if (!rowMap.has(rKey)) rowMap.set(rKey, { label: rKey, rows: [] });
    rowMap.get(rKey).rows.push(r);
  });

  const rowData = [];
  const colSet = new Set();

  rowMap.forEach((g, rLabel) => {
    const rowMeasures = {};
    config.measures.forEach(mKey => rowMeasures[mKey] = calcMeasure(g.rows, mKey));

    let cells = [];
    if (config.cols.length > 0) {
      const colMap = new Map();
      g.rows.forEach(r => {
        const cKey = config.cols.map(c => dimFn(c)(r) || '—').join(' / ');
        if (!colMap.has(cKey)) colMap.set(cKey, { label: cKey, rows: [] });
        colMap.get(cKey).rows.push(r);
        colSet.add(cKey);
      });

      colMap.forEach((cg, cLabel) => {
        const cMeasures = {};
        config.measures.forEach(mKey => cMeasures[mKey] = calcMeasure(cg.rows, mKey));
        cells.push({ label: cLabel, measures: cMeasures, rows: cg.rows });
      });
    }

    let target = 0, gap = 0, pctCapai = null;
    if (config.showTarget && config.measures.includes('omset')) {
      target = getTargetForRow(state, rLabel, config);
      const act = rowMeasures['omset'] || 0;
      if (target > 0) {
        pctCapai = (act / target) * 100;
        gap = act - target;
      }
    }

    rowData.push({ label: rLabel, measures: rowMeasures, cells, target, gap, pctCapai, rawRows: g.rows });
  });

  if (config.sort === 'label_asc') rowData.sort((a, b) => a.label.localeCompare(b.label));
  else if (config.sort === 'omset_asc') rowData.sort((a, b) => (a.measures['omset'] || 0) - (b.measures['omset'] || 0));
  else rowData.sort((a, b) => (b.measures['omset'] || 0) - (a.measures['omset'] || 0));

  const colKeys = Array.from(colSet).sort();
  const grandMeasures = {};
  config.measures.forEach(mKey => grandMeasures[mKey] = calcMeasure(filteredRows, mKey));

  const minMax = {};
  config.measures.forEach(mKey => minMax[mKey] = { min: Infinity, max: -Infinity });
  rowData.forEach(r => {
    config.measures.forEach(mKey => {
      const v = r.measures[mKey];
      if (v < minMax[mKey].min) minMax[mKey].min = v;
      if (v > minMax[mKey].max) minMax[mKey].max = v;
    });
  });

  return { rowData, colKeys, grandMeasures, minMax };
}

function renderPivotCard(config, rows, state) {
  const { rowData, colKeys, grandMeasures, minMax } = processData(rows, config, state);
  const rowLabel = DIM_OPTS.find(o => o.k === config.rows)?.l || config.rows;
  const cardId = `pivot-card-${config.id}`;
  const showTgt = config.showTarget && config.measures.includes('omset');
  const isChart = config.visualMode === 'chart';
  const zoom = config.zoom || 100;

  const pad = config.density === 'compact' ? '4px 8px' : config.density === 'loose' ? '16px 12px' : '10px 12px';
  const fontSize = config.density === 'compact' ? '11px' : config.density === 'loose' ? '14px' : '12px';
  const borderStyle = config.border === 'none' ? 'none' : config.border === 'thick' ? '2px solid #CBD5E1' : '1px solid #E2E8F0';

  let head = `<tr>
    <th class="pr-row" style="min-width:160px; position:sticky; left:0; z-index:20; background:#F8FAFC; border-right:${borderStyle}; padding:${pad}; font-size:${fontSize};">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        ${esc(rowLabel)}
        <button class="btn sm" data-show-filter="${esc(config.id)}" style="padding:2px 6px; font-size:10px; background:#E2E8F0; border:none; border-radius:4px;" title="Filter Data">🔽</button>
      </div>
    </th>`;
    
  if (colKeys.length > 0) {
    colKeys.forEach(ck => {
      config.measures.forEach(mKey => {
        const mLabel = MEASURE_OPTS.find(o => o.k === mKey)?.l || mKey;
        head += `<th class="pc-header" style="text-align:right; background:#F8FAFC; border-left:${borderStyle}; padding:${pad}; font-size:${fontSize};">
          <div style="font-size:10px; color:#64748B;">${esc(ck)}</div>
          <div style="font-size:11px; color:#1D4ED8; font-weight:bold;">${esc(mLabel)}</div>
        </th>`;
      });
    });
    config.measures.forEach(mKey => {
      const mLabel = MEASURE_OPTS.find(o => o.k === mKey)?.l || mKey;
      head += `<th class="pc-header" style="text-align:right; background:#1D4ED8; color:#fff; border-left:2px solid #1E3A8A; padding:${pad}; font-size:${fontSize};"><div style="font-size:10px; opacity:0.8;">TOTAL</div><div>${esc(mLabel)}</div></th>`;
    });
  } else {
    config.measures.forEach(mKey => {
      const mLabel = MEASURE_OPTS.find(o => o.k === mKey)?.l || mKey;
      head += `<th class="pc-header" style="text-align:right; background:#F8FAFC; padding:${pad}; font-size:${fontSize};">${esc(mLabel)}</th>`;
    });
  }
  
  if (showTgt) {
    head += `<th class="pc-header" style="background:#F1F5F9; text-align:right; min-width:130px; border-left:${borderStyle}; padding:${pad}; font-size:${fontSize};">Target & Capai</th>`;
    head += `<th class="pc-header" style="background:#F1F5F9; text-align:right; padding:${pad}; font-size:${fontSize};">GAP</th>`;
  }
  head += '</tr>';

  let body = rowData.map((r, i) => {
    const drillId = `drill_${config.id}_${i}`;
    drillMemory[drillId] = r.rawRows;
    
    let rowHtml = `<tr>
      <td class="pr-row strong" style="position:sticky; left:0; background:#fff; z-index:10; border-right:${borderStyle}; cursor:pointer; padding:${pad}; font-size:${fontSize};" 
          onclick="window.__pivotDrill('${drillId}', '${esc(r.label)}')">
        ${esc(r.label)} <span style="font-size:10px;color:#94A3B8;">🔍</span>
      </td>`;
    
    if (colKeys.length > 0) {
      colKeys.forEach(ck => {
        const cell = r.cells.find(c => c.label === ck);
        config.measures.forEach(mKey => {
          const val = cell ? cell.measures[mKey] : 0;
          const style = getHeatmapStyle(val, minMax[mKey].min, minMax[mKey].max);
          rowHtml += `<td class="num" style="border-left:${borderStyle}; ${style} padding:${pad}; font-size:${fontSize};">${val ? esc(formatVal(val, mKey)) : '0'}</td>`;
        });
      });
      config.measures.forEach(mKey => {
        const val = r.measures[mKey];
        rowHtml += `<td class="num strong" style="color:#1D4ED8; border-left:2px solid #1E3A8A; background:#F8FAFC; padding:${pad}; font-size:${fontSize};">${esc(formatVal(val, mKey))}</td>`;
      });
    } else {
      config.measures.forEach(mKey => {
        const val = r.measures[mKey];
        const style = getHeatmapStyle(val, minMax[mKey].min, minMax[mKey].max);
        rowHtml += `<td class="num strong" style="${style} padding:${pad}; font-size:${fontSize};">${esc(formatVal(val, mKey))}</td>`;
      });
    }

    if (showTgt) {
      const pBar = r.target > 0 ? `
        <div style="background:#E2E8F0; border-radius:4px; height:6px; width:100%; margin-top:4px; overflow:hidden;">
          <div style="background:${r.pctCapai >= 100 ? 'var(--pos)' : r.pctCapai >= 75 ? 'var(--warn)' : 'var(--neg)'}; height:100%; width:${Math.min(r.pctCapai, 100)}%;"></div>
        </div>` : '';
      rowHtml += `<td class="num" style="border-left:${borderStyle}; padding:${pad}; font-size:${fontSize};">
        <div>${r.target > 0 ? compactRp(r.target) : '—'}</div>
        <div style="font-weight:bold; color:${r.pctCapai >= 100 ? 'var(--pos)' : 'var(--neg)'};">${r.pctCapai !== null ? pct(r.pctCapai) : ''}</div>
        ${pBar}
      </td>`;
      rowHtml += `<td class="num strong" style="color:${r.gap < 0 ? 'var(--neg)' : 'var(--pos)'}; padding:${pad}; font-size:${fontSize};">${r.target > 0 ? compactRp(r.gap) : '—'}</td>`;
    }
    rowHtml += '</tr>'; 
    return rowHtml;
  }).join('');

  if (!rowData.length) {
    const colCount = (colKeys.length * config.measures.length) + config.measures.length + (showTgt ? 2 : 0) + 1;
    body = `<tr><td colspan="${colCount}" style="text-align:center;padding:24px;color:var(--muted)">Tidak ada data pada filter ini.</td></tr>`;
  }

  let chartHtml = '';
  if (isChart) {
    const chartMeasure = config.measures.includes('omset') ? 'omset' : config.measures[0];
    const chartData = rowData.slice(0, 15).map(r => ({ label: r.label, value: r.measures[chartMeasure] || 0 }));
    chartHtml = chartData.length > 0 ? `<div style="padding:20px;">${chartBars(chartData)}</div>` : `<div class="empty" style="padding:40px;">Tidak ada data.</div>`;
  }

  const grandTotalStr = config.measures.map(mKey => `${MEASURE_OPTS.find(o=>o.k===mKey)?.l}: <b>${formatVal(grandMeasures[mKey], mKey)}</b>`).join(' | ');

  return `
    <div class="card" id="${cardId}" style="position:relative;">
      <div class="card-h" style="align-items:flex-start;">
        <div>
          <div class="card-t">${esc(config.title)}</div>
          <div class="card-s" style="margin-top:4px; font-size:11px;">
            ${rowData.length} baris${colKeys.length > 0 ? ' × ' + (colKeys.length * config.measures.length) + ' kolom' : ''} <br>
            <span style="color:#1D4ED8;">${grandTotalStr}</span>
          </div>
        </div>
        <div class="right" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
          
          <div style="display:flex; background:#E2E8F0; border-radius:6px; padding:2px;">
            <button class="btn sm ${config.density === 'compact' ? 'primary' : ''}" data-density="${esc(config.id)}" data-val="compact" style="padding:2px 6px; font-size:10px; border:none; background:transparent;">Kecil</button>
            <button class="btn sm ${config.density === 'normal' ? 'primary' : ''}" data-density="${esc(config.id)}" data-val="normal" style="padding:2px 6px; font-size:10px; border:none; background:transparent;">Normal</button>
            <button class="btn sm ${config.density === 'loose' ? 'primary' : ''}" data-density="${esc(config.id)}" data-val="loose" style="padding:2px 6px; font-size:10px; border:none; background:transparent;">Besar</button>
          </div>

          <div style="display:flex; background:#E2E8F0; border-radius:6px; padding:2px;">
            <button class="btn sm ${config.border === 'none' ? 'primary' : ''}" data-border="${esc(config.id)}" data-val="none" style="padding:2px 6px; font-size:10px; border:none; background:transparent;">Tanpa Garis</button>
            <button class="btn sm ${config.border === 'thin' ? 'primary' : ''}" data-border="${esc(config.id)}" data-val="thin" style="padding:2px 6px; font-size:10px; border:none; background:transparent;">Tipis</button>
            <button class="btn sm ${config.border === 'thick' ? 'primary' : ''}" data-border="${esc(config.id)}" data-val="thick" style="padding:2px 6px; font-size:10px; border:none; background:transparent;">Tebal</button>
          </div>

          <div style="display:flex; background:#E2E8F0; border-radius:6px; padding:2px; align-items:center;">
            <button class="btn sm" data-zoom-out="${esc(config.id)}" style="padding:2px 8px; border:none; background:transparent; font-size:14px; font-weight:bold;">-</button>
            <span style="font-size:10px; font-weight:bold; width:35px; text-align:center; color:#475569;">${zoom}%</span>
            <button class="btn sm" data-zoom-in="${esc(config.id)}" style="padding:2px 8px; border:none; background:transparent; font-size:14px; font-weight:bold;">+</button>
          </div>

          <button class="btn sm ${!isChart ? 'primary' : ''}" data-toggle-visual="${esc(config.id)}" data-mode="table">📋 Tabel</button>
          <button class="btn sm ${isChart ? 'primary' : ''}" data-toggle-visual="${esc(config.id)}" data-mode="chart">📊 Chart</button>
          <button class="btn sm" data-quick-export="#${cardId}" data-title="${esc(config.title)}" data-filename="${esc(config.title.replace(/[^a-z0-9]/gi, '_').toLowerCase())}">📥 Ekspor</button>
          <button class="btn sm" data-export-csv="${esc(config.id)}" style="background:#F1F5F9;">CSV</button>
          <button class="btn sm neg" data-del-pivot="${esc(config.id)}" style="padding:4px 8px;">✕</button>
        </div>
      </div>
      
      ${isChart ? chartHtml : `
      <div class="tablewrap" style="max-height:500px; overflow:auto; padding:4px;">
        <div style="zoom: ${zoom / 100};">
          <table class="pivot-table" style="width:100%; border-collapse:collapse; white-space:nowrap;">
            <thead style="position:sticky; top:0; background:#F8FAFC; z-index:15;">${head}</thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>`}
    </div>
  `;
}

function update(container, state){
  const list = getPivotList();
  const rows = selectFiltered(state) || [];
  patchHTML('#pivot-builder', builderBlock());
  const dashboardHtml = list.map(cfg => renderPivotCard(cfg, rows, state)).join('');
  patchHTML('#pivot-dashboard', dashboardHtml || `<div class="empty">Belum ada tabel. Tambahkan dari Pivot Builder di atas.</div>`);
}

// ── HEADER FILTER MODAL ──
window.__pivotShowFilter = function(configId) {
  const cfg = getPivotList().find(c => c.id === configId);
  if (!cfg) return;
  const rows = selectFiltered(store.state) || [];
  const rFn = dimFn(cfg.rows);
  
  const allValues = Array.from(new Set(rows.map(r => rFn(r) || '—'))).sort();
  const currentFilter = cfg.activeRowFilter.length > 0 ? cfg.activeRowFilter : allValues;

  const checkboxHtml = allValues.map(v => {
    const isChecked = currentFilter.includes(v);
    return `<label style="display:flex; align-items:center; gap:8px; padding:6px 8px; border-bottom:1px solid #E2E8F0; cursor:pointer; font-size:12px;">
      <input type="checkbox" class="drill-filter-chk" value="${esc(v)}" ${isChecked ? 'checked' : ''}>
      <span>${esc(v)}</span>
    </label>`;
  }).join('');

  openModal(`
    <div class="modal-h"><h3>Filter ${esc(DIM_OPTS.find(o => o.k === cfg.rows)?.l)}</h3><button class="x" onclick="window.__pivotCloseModal()">×</button></div>
    <div class="modal-b">
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <button class="btn sm" id="btnSelectAllFilter" style="flex:1;">Pilih Semua</button>
        <button class="btn sm" id="btnUnselectAllFilter" style="flex:1;">Kosongkan</button>
      </div>
      <div style="max-height:300px; overflow-y:auto; border:1px solid #E2E8F0; border-radius:6px;">
        ${checkboxHtml}
      </div>
    </div>
    <div class="modal-f" style="padding:12px; border-top:1px solid #E2E8F0; text-align:right;">
      <button class="btn primary" id="btnApplyFilter" data-cfgid="${configId}">Terapkan Filter</button>
    </div>
  `);

  document.getElementById('btnSelectAllFilter').onclick = () => {
    document.querySelectorAll('.drill-filter-chk').forEach(chk => chk.checked = true);
  };
  document.getElementById('btnUnselectAllFilter').onclick = () => {
    document.querySelectorAll('.drill-filter-chk').forEach(chk => chk.checked = false);
  };

  document.getElementById('btnApplyFilter').onclick = () => {
    const selected = Array.from(document.querySelectorAll('.drill-filter-chk:checked')).map(chk => chk.value);
    cfg.activeRowFilter = (selected.length === allValues.length) ? [] : selected;
    window.__pivotCloseModal();
    store.emit();
  };
};

window.__pivotDrill = function(drillId, title) {
  const rows = drillMemory[drillId] || [];
  const totalRows = rows.length;
  const displayRows = rows.slice(0, 100);

  let tbody = displayRows.map(r => `
    <tr>
      <td style="padding:6px; border-bottom:1px solid #eee;">${esc(r.day)}</td>
      <td style="padding:6px; border-bottom:1px solid #eee;">${esc(r.invoice)}</td>
      <td style="padding:6px; border-bottom:1px solid #eee;">${esc(r.outlet)}</td>
      <td style="padding:6px; border-bottom:1px solid #eee;">${esc(r.product)}</td>
      <td class="num" style="padding:6px; border-bottom:1px solid #eee;">${compactRp(r.amount)}</td>
    </tr>
  `).join('');

  openModal(`
    <div class="modal-h"><h3>Detail Transaksi: ${esc(title)}</h3><button class="x" onclick="window.__pivotCloseModal()">×</button></div>
    <div class="modal-b">
      <div class="mb12" style="font-size:12px; color:#64748B;">Menampilkan ${Math.min(totalRows, 100)} dari total ${totalRows} baris.</div>
      <div class="tablewrap" style="max-height:400px; border:1px solid #E2E8F0; border-radius:6px;">
        <table style="width:100%; font-size:11px;">
          <thead style="background:#F8FAFC; position:sticky; top:0;"><tr><th>Tanggal</th><th>Faktur</th><th>Toko</th><th>Produk</th><th class="num">Amount</th></tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
    </div>
  `);
};

window.__pivotCloseModal = function() {
  const modal = document.getElementById('modal');
  const scrim = document.getElementById('modalScrim');
  if (modal && scrim) {
    scrim.classList.remove('on');
    modal.innerHTML = '';
  }
};

registerView('pivot', {
  label: 'Pivot Table', title: 'Pivot Table', sub: 'Ultimate Dashboard Builder', shell, update,
  mount(){
    document.addEventListener('click', e => {
      if(e.target.id === 'btnAddPivot') {
        const title = document.getElementById('pvNewTitle').value.trim() || 'Tabel Analisis';
        const selectedCols = Array.from(document.querySelectorAll('.pv-col-chk:checked')).map(chk => chk.value);
        const selectedMeasures = Array.from(document.querySelectorAll('.pv-measure-chk:checked')).map(chk => chk.value);
        if (selectedMeasures.length === 0) { alert('Pilih minimal 1 Ukuran (Nilai).'); return; }
        
        getPivotList().push({
          id: 'pv-' + Date.now() + '-' + Math.floor(Math.random()*1000),
          title, rows: document.getElementById('pvNewRow').value, cols: selectedCols,
          measures: selectedMeasures, sort: document.getElementById('pvNewSort').value,
          showTarget: document.getElementById('pvNewShowTarget').checked, visualMode: 'table',
          zoom: 100, density: 'normal', border: 'thin', activeRowFilter: []
        });
        
        document.getElementById('pvNewTitle').value = '';
        document.getElementById('pvNewShowTarget').checked = false;
        document.querySelectorAll('.pv-col-chk, .pv-measure-chk').forEach(chk => chk.checked = false);
        document.querySelector('.pv-measure-chk[value="omset"]').checked = true;
        store.emit();
      }

      if(e.target.hasAttribute('data-del-pivot')) {
        const id = e.target.getAttribute('data-del-pivot');
        store.state.ui.pivotList = getPivotList().filter(c => c.id !== id);
        store.emit();
      }

      if(e.target.hasAttribute('data-toggle-visual')) {
        const id = e.target.getAttribute('data-toggle-visual');
        const mode = e.target.getAttribute('data-mode');
        const cfg = getPivotList().find(c => c.id === id);
        if(cfg) { cfg.visualMode = mode; store.emit(); }
      }

      if(e.target.hasAttribute('data-density')) {
        const id = e.target.getAttribute('data-density');
        const val = e.target.getAttribute('data-val');
        const cfg = getPivotList().find(c => c.id === id);
        if(cfg) { cfg.density = val; store.emit(); }
      }

      if(e.target.hasAttribute('data-border')) {
        const id = e.target.getAttribute('data-border');
        const val = e.target.getAttribute('data-val');
        const cfg = getPivotList().find(c => c.id === id);
        if(cfg) { cfg.border = val; store.emit(); }
      }

      if(e.target.hasAttribute('data-show-filter')) {
        const id = e.target.getAttribute('data-show-filter');
        window.__pivotShowFilter(id);
      }

      if(e.target.hasAttribute('data-zoom-in')) {
        const id = e.target.getAttribute('data-zoom-in');
        const cfg = getPivotList().find(c => c.id === id);
        if(cfg) { cfg.zoom = Math.min((cfg.zoom || 100) + 10, 200); store.emit(); }
      }
      if(e.target.hasAttribute('data-zoom-out')) {
        const id = e.target.getAttribute('data-zoom-out');
        const cfg = getPivotList().find(c => c.id === id);
        if(cfg) { cfg.zoom = Math.max((cfg.zoom || 100) - 10, 50); store.emit(); }
      }

      if(e.target.hasAttribute('data-export-csv')) {
        const id = e.target.getAttribute('data-export-csv');
        const cfg = getPivotList().find(c => c.id === id);
        if(!cfg) return;
        
        const { rowData, colKeys } = processData(selectFiltered(store.state), cfg, store.state);
        const showTgt = cfg.showTarget && cfg.measures.includes('omset');
        
        const csvData = rowData.map(r => {
           const obj = { [cfg.rows]: r.label };
           if (colKeys.length > 0) {
             colKeys.forEach(ck => {
               const cell = r.cells.find(c => c.label === ck);
               cfg.measures.forEach(mKey => {
                 const mLabel = MEASURE_OPTS.find(o=>o.k===mKey)?.l || mKey;
                 obj[`${ck} - ${mLabel}`] = cell ? +(cell.measures[mKey]).toFixed(2) : 0;
               });
             });
             cfg.measures.forEach(mKey => {
               const mLabel = MEASURE_OPTS.find(o=>o.k===mKey)?.l || mKey;
               obj[`TOTAL - ${mLabel}`] = +(r.measures[mKey]).toFixed(2);
             });
           } else {
             cfg.measures.forEach(mKey => {
               const mLabel = MEASURE_OPTS.find(o=>o.k===mKey)?.l || mKey;
               obj[mLabel] = +(r.measures[mKey]).toFixed(2);
             });
           }
           if (showTgt) {
             obj['Target Omset'] = r.target;
             obj['Pencapaian %'] = r.pctCapai ? +r.pctCapai.toFixed(2) : 0;
             obj['GAP'] = r.gap;
           }
           return obj;
        });
        downloadCSV(csvData, cfg.title.replace(/[^a-z0-9]/gi, '_') + '.csv');
      }
    });
  },
});