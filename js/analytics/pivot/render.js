/* ================================================================== */
/* PIVOT RENDER — HTML Generator (Modular)                            */
/* ================================================================== */
import { esc, pct, compactRp } from '../../core/utils.js';
import { store } from '../../core/store.js';
import { DIM_OPTS, BASE_MEASURE_OPTS, getAllMeasureOpts, getCustomMeasures } from './config.js';
import { MOpt, formatVal } from './utils.js';
import { processData, computeSparklineData } from './compute.js';
import { loadPresetsOnce } from './storage.js';
import { PIVOT_MODULES } from './modules/index.js';
import { chartBars } from '../../ui/charts.js';

export function shell() {
  loadPresetsOnce();
  return `
    <div class="mb12" id="pivot-builder"></div>
    <div id="pivot-dashboard" style="display:flex; flex-direction:column; gap:12px;"></div>
  `;
}

/* ── BUILDER (FLOATING / HIDDEN) ── */
export function builderBlock() {
  const allMeasures = getAllMeasureOpts();
  const customCount = getCustomMeasures().length;
  const isOpen = !!store.state.ui.pivotBuilderOpen;

  if (!isOpen) {
    return `
      <div style="background:#fff; border:1px solid #E2E8F0; border-radius:8px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:13px; font-weight:700; color:#475569;">Dashboard Pivot</div>
        <div style="display:flex; gap:6px;">
          <button class="btn sm" id="btnManageCustom" style="background:#EFF6FF; color:#1E40AF; border:1px solid #BFDBFE; font-weight:700; padding:4px 8px;">⚖️ Custom${customCount > 0 ? ` (${customCount})` : ''}</button>
          <button class="btn sm" id="btnResetPresets" style="background:#FEE2E2; color:#991B1B; border:1px solid #FECACA; font-weight:700; padding:4px 8px;">⚠️ Reset</button>
          <button class="btn sm" id="btnToggleBuilder" style="background:#1D4ED8; color:#fff; border:none; font-weight:800; padding:4px 12px; border-radius:6px; cursor:pointer;">➕ Buat Pivot Baru</button>
        </div>
      </div>
    `;
  }

  return `
    <div style="background:#fff; border:2px solid #3B82F6; border-radius:8px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 16px; background:#EFF6FF; border-bottom:1px solid #BFDBFE;">
        <div style="font-size:13px; font-weight:800; color:#1E40AF;">Buat Pivot Baru</div>
        <button class="btn sm" id="btnToggleBuilder" style="background:#FEE2E2; color:#991B1B; border:1px solid #FECACA; font-weight:700; padding:4px 10px; cursor:pointer;">✕ Tutup</button>
      </div>
      
      <div style="padding:16px;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px;">
          <div style="display:flex; flex-direction:column; gap:10px;">
            <div>
              <label style="display:block; font-size:10px; font-weight:800; color:#475569; margin-bottom:4px; text-transform:uppercase;">Judul Laporan</label>
              <input type="text" id="pvNewTitle" placeholder="Cth: Analisis Pencapaian" style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:6px; font-size:12px; box-sizing:border-box;">
            </div>
            <div style="background:#F8FAFC; padding:10px; border:1px solid #E2E8F0; border-radius:6px;">
              <label style="display:block; font-size:10px; font-weight:800; color:#475569; margin-bottom:6px; text-transform:uppercase;">Baris (Y) — Maks 2 Level</label>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                <select id="pvNewRow0" style="width:100%; padding:6px; border:1px solid #CBD5E1; border-radius:4px; font-size:11px;">
                  ${DIM_OPTS.map(o => `<option value="${o.k}">${o.l}</option>`).join('')}
                </select>
                <select id="pvNewRow1" style="width:100%; padding:6px; border:1px solid #CBD5E1; border-radius:4px; font-size:11px;">
                  <option value="">— Tidak ada —</option>
                  ${DIM_OPTS.map(o => `<option value="${o.k}">${o.l}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:10px;">
            <div>
              <label style="display:block; font-size:10px; font-weight:800; color:#475569; margin-bottom:4px; text-transform:uppercase;">Ukuran (Pilih 1+)</label>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; background:#F8FAFC; padding:8px; border:1px solid #E2E8F0; border-radius:6px; max-height:100px; overflow-y:auto;">
                ${allMeasures.map(o => {
                  const isRatio = MOpt(o.k)?.type === 'ratio';
                  return `<label style="display:flex; align-items:center; gap:4px; font-size:11px; cursor:pointer;"><input type="checkbox" class="pv-measure-chk" value="${o.k}" ${o.k === 'omset' ? 'checked' : ''}> ${o.l}${isRatio ? ' ⚖️' : ''}</label>`;
                }).join('')}
              </div>
            </div>
            <div>
              <label style="display:block; font-size:10px; font-weight:800; color:#475569; margin-bottom:4px; text-transform:uppercase;">Kolom (X) Opsional</label>
              <div style="display:flex; flex-wrap:wrap; gap:4px; background:#F8FAFC; padding:8px; border:1px solid #E2E8F0; border-radius:6px; max-height:80px; overflow-y:auto;">
                ${DIM_OPTS.map(o => `<label style="display:flex; align-items:center; gap:4px; font-size:11px; cursor:pointer;"><input type="checkbox" class="pv-col-chk" value="${o.k}"> ${o.l}</label>`).join('')}
              </div>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:10px;">
            <div style="background:#F8FAFC; padding:10px; border:1px solid #E2E8F0; border-radius:6px; display:flex; flex-direction:column; gap:6px;">
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:11px; font-weight:700; color:#1E3A8A;">
                <input type="checkbox" id="pvNewShowTarget" style="width:14px; height:14px;"> Tampilkan Target & GAP
              </label>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:11px; font-weight:700; color:#166534;">
                <input type="checkbox" id="pvNewSparkline" style="width:14px; height:14px;"> 📈 Sparkline (Tren)
              </label>
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:11px; font-weight:700; color:#166534;">
                <input type="checkbox" id="pvNewCumulative" style="width:14px; height:14px;"> ∑ Running Total
              </label>
            </div>
            <button class="btn primary" id="btnAddPivot" style="width:100%; padding:10px; font-size:13px; font-weight:800; border-radius:6px; background:#1D4ED8; cursor:pointer;">+ Tambahkan ke Dashboard</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ── CARD RENDERER ── */
export function renderPivotCardSafe(config, rows, state) {
  try { return renderPivotCard(config, rows, state); }
  catch (err) {
    console.error('[Pivot] Card render failed:', config.id, err);
    return `
      <div style="border-left:4px solid #EF4444; background:#fff; border-radius:8px; padding:16px; border:1px solid #FECACA;">
        <div style="font-weight:800; color:#991B1B; margin-bottom:6px;">⚠️ Card "${esc(config.title || '?')}" gagal render</div>
        <div style="font-size:11px; color:#64748B; font-family:monospace; background:#FEF2F2; padding:8px; border-radius:4px; margin-bottom:10px;">${esc(String(err?.message || err))}</div>
        <button class="btn sm neg" data-del-pivot="${esc(config.id)}" style="padding:6px 12px;">🗑️ Hapus Card</button>
      </div>`;
  }
}

function renderPivotCard(config, rows, state) {
  const data = processData(rows, config, state);
  
  // MODUL TRANSFORM (Cumulative, Ranking, ABC)
  let finalRowData = data.rowData;
  PIVOT_MODULES.forEach(m => {
    if (m.transformRows) finalRowData = m.transformRows(finalRowData, config);
  });

  const { rowCountBeforeFilter, colKeys, grandMeasures, minMax, colTotals, compareMap, isHierarchical } = data;
  const rowLabel = isHierarchical
    ? config.rowLevels.map(k => DIM_OPTS.find(o => o.k === k)?.l || k).join(' → ')
    : (DIM_OPTS.find(o => o.k === config.rowLevels[0])?.l || config.rowLevels[0]);

  const cardId = `pivot-card-${config.id}`;
  const isChart = config.visualMode === 'chart';
  const zoom = config.zoom || 100;
  const isCollapsed = !!config.isCollapsed;
  const isToolbarOpen = !!config.isToolbarOpen;
  const showTgt = config.showTarget && config.measures.includes('omset') && !isHierarchical;
  const showTotals = config.showTotals !== false;
  const pctMode = config.pctMode || 'raw';

  const pad = config.density === 'compact' ? '2px 6px' : config.density === 'loose' ? '8px 12px' : '4px 8px';
  const fontSize = config.density === 'compact' ? '11px' : config.density === 'loose' ? '13px' : '12px';
  const borderStyle = '1px solid #E2E8F0';

  // --- HELPER: GABUNGAN STYLE DARI MODUL ---
  const getCellStyle = (rawVal, mKey, row) => {
    let style = '';
    PIVOT_MODULES.forEach(m => {
      if (m.cellStyle) style += ' ' + m.cellStyle(rawVal, mKey, config, minMax, row, grandMeasures);
    });
    return style;
  };

  // --- HELPER: GABUNGAN TEKS DARI MODUL (Misal % Row) ---
  const getCellText = (rawVal, mKey, denom, row) => {
    let text = null;
    PIVOT_MODULES.forEach(m => {
      if (m.formatValue && text === null) text = m.formatValue(rawVal, mKey, denom, config, row, grandMeasures);
    });
    return text !== null ? text : formatVal(rawVal, mKey);
  };

  // --- HELPER: GABUNGAN BADGE DARI MODUL (Compare, Icons, Alerts) ---
  const getCellBadges = (rawVal, mKey, compareDelta, row) => {
    let badges = '';
    PIVOT_MODULES.forEach(m => {
      if (m.cellBadge) badges += m.cellBadge(rawVal, mKey, config, compareDelta, minMax, row, grandMeasures);
    });
    return badges;
  };

  const sortIndicator = (mKey) => config.sortBy !== mKey ? '' : (config.sortDir === 'asc' ? ' ▲' : ' ▼');

  /* --- HEAD --- */
  let head = `<tr>
    <th class="pr-row" style="min-width:100px; max-width:160px; position:sticky; left:0; z-index:20; background:#F8FAFC; border-right:${borderStyle}; border-bottom:${borderStyle}; padding:${pad}; font-size:${fontSize}; text-align:left; vertical-align:middle;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:4px;">
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(rowLabel)}</span>
        <button class="btn sm" data-show-filter="${esc(config.id)}" style="padding:2px 4px; font-size:10px; background:#E2E8F0; border:none; border-radius:4px;" title="Filter">🔽</button>
      </div>
    </th>`;

  if (colKeys.length > 0) {
    colKeys.forEach(ck => {
      config.measures.forEach(mKey => {
        const mLabel = MOpt(mKey)?.l || mKey;
        head += `<th class="pc-header" style="text-align:right; background:#F8FAFC; border-left:${borderStyle}; border-bottom:${borderStyle}; padding:${pad}; font-size:${fontSize}; cursor:pointer;" data-sort-measure="${mKey}" data-cfg-id="${esc(config.id)}">
          <div style="font-size:10px; color:#64748B;">${esc(ck)}</div>
          <div style="font-size:11px; color:#1D4ED8; font-weight:bold;">${esc(mLabel)}${sortIndicator(mKey)}</div>
        </th>`;
      });
    });
    if (showTotals) {
      config.measures.forEach(mKey => {
        const mLabel = MOpt(mKey)?.l || mKey;
        head += `<th class="pc-header" style="text-align:right; background:#1D4ED8; color:#fff; border-left:2px solid #1E3A8A; border-bottom:${borderStyle}; padding:${pad}; font-size:${fontSize}; cursor:pointer;" data-sort-measure="${mKey}" data-cfg-id="${esc(config.id)}">
          <div style="font-size:10px; opacity:0.8;">TOTAL</div>
          <div>${esc(mLabel)}${sortIndicator(mKey)}</div>
        </th>`;
      });
    }
  } else {
    config.measures.forEach(mKey => {
      const mLabel = MOpt(mKey)?.l || mKey;
      head += `<th class="pc-header" style="text-align:right; background:#F8FAFC; border-bottom:${borderStyle}; padding:${pad}; font-size:${fontSize}; cursor:pointer;" data-sort-measure="${mKey}" data-cfg-id="${esc(config.id)}">${esc(mLabel)}${sortIndicator(mKey)}</th>`;
    });
  }

  if (showTgt) {
    head += `<th class="pc-header" style="background:#F1F5F9; text-align:right; min-width:100px; border-left:${borderStyle}; border-bottom:${borderStyle}; padding:${pad}; font-size:${fontSize};">Target & Capai</th>`;
    head += `<th class="pc-header" style="background:#F1F5F9; text-align:right; border-bottom:${borderStyle}; padding:${pad}; font-size:${fontSize};">GAP</th>`;
  }

  // MODUL EXTRA HEADER (Sparkline)
  PIVOT_MODULES.forEach(m => {
    if (m.renderExtraHeader) head += m.renderExtraHeader(config);
  });

  head += '</tr>';

  /* --- BODY --- */
  let body = finalRowData.map((r, i) => {
    const drillId = `drill_${config.id}_${i}`;
    try { (window.__pvDrillMemory = window.__pvDrillMemory || {})[drillId] = r.rawRows; } catch {}

    let compareDelta = null;
    if (compareMap) compareDelta = compareMap.get(r.label);
    else if (config.compareMode === 'target' && r.target > 0 && r.pctCapai != null) compareDelta = r.pctCapai - 100;

    const isParent = r._type === 'parent';
    const isChild = r._type === 'child';
    const indent = isChild ? '16px' : '0';
    const rowBg = isParent ? '#F8FAFC' : '#fff';
    const rowWeight = isParent ? '800' : 'normal';

    // MODUL ROW LABEL (Notes, Rank, ABC)
    let rowLabelHtml = PIVOT_MODULES.map(m => m.renderRowLabel ? m.renderRowLabel(r, config) : '').join('');

    let rowHtml = `<tr style="background:${rowBg};">
      <td class="pr-row strong" style="position:sticky; left:0; background:${rowBg}; z-index:10; border-right:${borderStyle}; border-bottom:${borderStyle}; cursor:pointer; padding:${pad}; padding-left:calc(${(pad.split(' ')[1] || '8px')} + ${indent}); font-size:${fontSize}; font-weight:${rowWeight};" onclick="window.__pivotDrill('${drillId}', '${esc(r.label)}')">
        <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${isParent ? '▾ ' : ''}${esc(r.label)} ${isParent ? `<span style="font-size:10px;color:#64748B;font-weight:normal;">(${r.childCount || 0})</span>` : '<span style="font-size:10px;color:#94A3B8;">🔍</span>'}
          ${rowLabelHtml}
        </div>
      </td>`;

    if (colKeys.length > 0) {
      colKeys.forEach(ck => {
        const cell = r.cells.find(c => c.label === ck);
        config.measures.forEach(mKey => {
          const rawVal = cell ? cell.measures[mKey] : 0;
          let denom = pctMode === 'row' ? r.measures[mKey] : pctMode === 'col' ? colTotals[mKey][ck] : grandMeasures[mKey];
          const style = getCellStyle(rawVal, mKey, r);
          const txt = rawVal ? esc(getCellText(rawVal, mKey, denom, r)) : (pctMode === 'raw' ? '0' : '—');
          rowHtml += `<td class="num" data-pv-copy="${esc(String(rawVal))}" style="border-left:${borderStyle}; border-bottom:${borderStyle}; ${style} padding:${pad}; font-size:${fontSize}; cursor:pointer;" title="Shift+klik copy">${txt}</td>`;
        });
      });

      if (showTotals) {
        config.measures.forEach(mKey => {
          const rawVal = r.measures[mKey];
          const denom = (pctMode === 'col' || pctMode === 'grand') ? grandMeasures[mKey] : null;
          const txt = pctMode === 'row' ? '100.0%' : esc(getCellText(rawVal, mKey, denom, r));
          const badges = getCellBadges(rawVal, mKey, compareDelta, r);
          rowHtml += `<td class="num strong" data-pv-copy="${esc(String(rawVal))}" style="color:#1D4ED8; border-left:2px solid #1E3A8A; border-bottom:${borderStyle}; background:${isParent ? '#E0E7FF' : '#F8FAFC'}; padding:${pad}; font-size:${fontSize}; cursor:pointer;">
            <div>${txt}</div>${badges}
          </td>`;
        });
      }
    } else {
      config.measures.forEach(mKey => {
        const rawVal = r.measures[mKey];
        const denom = (pctMode === 'grand' || pctMode === 'col') ? grandMeasures[mKey] : null;
        const style = getCellStyle(rawVal, mKey, r);
        const txt = esc(getCellText(rawVal, mKey, denom, r));
        
        if (isChild) {
          rowHtml += `<td class="num" data-pv-copy="${esc(String(rawVal))}" style="border-bottom:${borderStyle}; ${style} padding:${pad}; font-size:${fontSize}; cursor:pointer;"><div>${txt}</div></td>`;
        } else {
          const badges = getCellBadges(rawVal, mKey, compareDelta, r);
          rowHtml += `<td class="num strong" data-pv-copy="${esc(String(rawVal))}" style="border-bottom:${borderStyle}; background:${isParent ? '#E0E7FF' : '#fff'}; ${style} padding:${pad}; font-size:${fontSize}; cursor:pointer;">
            <div>${txt}</div>${badges}
          </td>`;
        }
      });
    }

    if (showTgt) {
      const pBar = r.target > 0 ? `<div style="background:#E2E8F0; border-radius:4px; height:4px; width:100%; margin-top:2px; overflow:hidden;"><div style="background:${r.pctCapai >= 100 ? 'var(--pos)' : r.pctCapai >= 75 ? 'var(--warn)' : 'var(--neg)'}; height:100%; width:${Math.min(r.pctCapai, 100)}%;"></div></div>` : '';
      rowHtml += `<td class="num" style="border-left:${borderStyle}; border-bottom:${borderStyle}; padding:${pad}; font-size:${fontSize};">
        <div>${r.target > 0 ? compactRp(r.target) : '—'}</div>
        <div style="font-weight:bold; color:${r.pctCapai >= 100 ? 'var(--pos)' : 'var(--neg)'};">${r.pctCapai !== null ? pct(r.pctCapai) : ''}</div>
        ${pBar}
      </td>`;
      rowHtml += `<td class="num strong" style="border-bottom:${borderStyle}; color:${r.gap < 0 ? 'var(--neg)' : 'var(--pos)'}; padding:${pad}; font-size:${fontSize};">${r.target > 0 ? compactRp(r.gap) : '—'}</td>`;
    }

    // MODUL EXTRA CELL (Sparkline)
    PIVOT_MODULES.forEach(m => {
      if (m.renderExtraCell) rowHtml += m.renderExtraCell(r.measures, null, config, r, computeSparklineData);
    });

    rowHtml += '</tr>';
    return rowHtml;
  }).join('');

  if (!finalRowData.length) {
    const colCount = (colKeys.length * config.measures.length) + (showTotals ? config.measures.length : 0) + (showTgt ? 2 : 0) + 1;
    body = `<tr><td colspan="${colCount}" style="text-align:center;padding:24px;color:#94A3B8;font-size:12px;">Tidak ada data.</td></tr>`;
  }

  let chartHtml = '';
  if (isChart) {
    const chartMeasure = config.measures.includes('omset') ? 'omset' : config.measures[0];
    const chartData = finalRowData.filter(r => r._type !== 'child').slice(0, 15).map(r => ({ label: r.label, value: r.measures[chartMeasure] || 0 }));
    chartHtml = chartData.length > 0 ? `<div style="padding:20px;">${chartBars(chartData)}</div>` : `<div style="padding:40px; text-align:center; color:#94A3B8;">Tidak ada data.</div>`;
  }

  const grandTotalStr = config.measures.map(mKey => `${MOpt(mKey)?.l || mKey}: <b>${formatVal(grandMeasures[mKey], mKey)}</b>`).join(' | ');
  const filteredInfo = rowCountBeforeFilter !== finalRowData.length ? `<span style="color:#F59E0B;"> · filtered</span>` : '';

  // RENDER MODUL TOOLBAR
  let toolbarModules = '';
  PIVOT_MODULES.forEach(m => {
    if (m.renderToolbar) toolbarModules += m.renderToolbar(config);
  });

  return `
    <div style="background:#fff; border:1px solid #E2E8F0; border-radius:8px; overflow:hidden; margin-bottom:8px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
      
      <!-- HEADER CARD -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; padding:8px 12px; background:#F8FAFC; border-bottom:${isCollapsed ? 'none' : '1px solid #E2E8F0'};">
        <div style="flex:1; min-width:180px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:14px; font-weight:800; color:#0F172A; cursor:pointer;" data-toggle-card="${esc(config.id)}">${esc(config.title)}</span>
            <button class="btn sm" data-toggle-card="${esc(config.id)}" style="padding:0px 6px; font-size:11px; background:#fff; border:1px solid #CBD5E1; color:#475569; cursor:pointer; border-radius:4px; height:22px;">${isCollapsed ? '▼ Buka' : '▲ Lipat'}</button>
          </div>
          <div style="font-size:10px; color:#64748B; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:300px;">
            ${finalRowData.length} baris${colKeys.length > 0 ? ' × ' + (colKeys.length * config.measures.length) + ' kolom' : ''}${filteredInfo}
            <span style="color:#1D4ED8; font-weight:700; margin-left:6px;">${grandTotalStr}</span>
          </div>
        </div>
        <div style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;">
          <div style="display:flex; background:#E2E8F0; border-radius:4px; padding:2px;">
            <button class="btn sm ${config.density === 'compact' ? 'primary' : ''}" data-density="${esc(config.id)}" data-val="compact" style="padding:0px 4px; font-size:9px; border:none; background:transparent;">S</button>
            <button class="btn sm ${config.density === 'normal' ? 'primary' : ''}" data-density="${esc(config.id)}" data-val="normal" style="padding:0px 4px; font-size:9px; border:none; background:transparent;">M</button>
            <button class="btn sm ${config.density === 'loose' ? 'primary' : ''}" data-density="${esc(config.id)}" data-val="loose" style="padding:0px 4px; font-size:9px; border:none; background:transparent;">L</button>
          </div>
          
          <button class="btn sm" data-copy-tsv="${esc(config.id)}" style="padding:0px 6px; font-size:11px; height:22px; background:#E0E7FF; color:#3730A3; border:1px solid #C7D2FE;" title="Copy ke Excel">📋 Copy</button>
          
          <button class="btn sm ${!isChart ? 'primary' : ''}" data-toggle-visual="${esc(config.id)}" data-mode="table" style="padding:0px 6px; font-size:11px; height:22px;" title="Tabel">📋 Tabel</button>
          <button class="btn sm ${isChart ? 'primary' : ''}" data-toggle-visual="${esc(config.id)}" data-mode="chart" style="padding:0px 6px; font-size:11px; height:22px;" title="Grafik">📊 Grafik</button>
          
          <button class="btn sm" data-quick-export="#pivot-card-${esc(config.id)}" data-title="${esc(config.title)}" data-filename="${esc(config.title.replace(/[^a-z0-9]/gi, '_').toLowerCase())}" style="padding:0px 6px; font-size:11px; height:22px;">📥</button>
          <button class="btn sm neg" data-del-pivot="${esc(config.id)}" style="padding:0px 6px; font-size:11px; height:22px;">✕</button>
        </div>
      </div>

      <!-- BODY (HANYA TAMPIL JIKA TIDAK COLLAPSED) -->
      <div style="display:${isCollapsed ? 'none' : 'block'};">
        <!-- TOOLBAR RINGKAS -->
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; padding:6px 12px; background:#fff; border-bottom:1px solid #E2E8F0;">
          <input type="text" placeholder="🔍 Cari..." data-pv-search="${esc(config.id)}" value="${esc(config.searchText || '')}"
            style="flex:1; min-width:120px; padding:4px 8px; border:1px solid #CBD5E1; border-radius:4px; font-size:11px;">
          
          <button class="btn sm" data-toggle-toolbar="${esc(config.id)}" style="background:${isToolbarOpen ? '#E0E7FF' : '#F1F5F9'}; border:1px solid ${isToolbarOpen ? '#C7D2FE' : '#E2E8F0'}; color:${isToolbarOpen ? '#3730A3' : '#475569'}; font-weight:700; padding:4px 8px; height:24px; font-size:11px;">
            ⚙️ Opsi ${isToolbarOpen ? '▲' : '▼'}
          </button>
          
          ${config.sortBy ? `<button class="btn sm" data-clear-sort="${esc(config.id)}" style="padding:0px 8px; font-size:10px; background:#FEF3C7; color:#92400E; height:24px;">Clear Sort</button>` : ''}
        </div>

        <!-- TOOLBAR MODUL (LANJUTAN) -->
        <div style="display:${isToolbarOpen ? 'flex' : 'none'}; gap:6px; flex-wrap:wrap; align-items:center; padding:6px 12px; background:#F8FAFC; border-bottom:1px solid #E2E8F0;">
          ${toolbarModules}
        </div>

        <!-- ISI TABEL / GRAFIK -->
        ${isChart ? chartHtml : `
        <div class="tablewrap" style="max-height:400px; overflow:auto;">
          <div style="zoom: ${zoom / 100};">
            <table class="pivot-table" style="width:100%; border-collapse:collapse; white-space:nowrap;">
              <thead style="position:sticky; top:0; background:#F8FAFC; z-index:15;">${head}</thead>
              <tbody>${body}</tbody>
            </table>
          </div>
        </div>`}
      </div>
    </div>
  `;
}