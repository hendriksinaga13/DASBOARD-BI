// js/ui/settings/target.js
import { esc } from '../../core/utils.js';

export function renderTargetForms({ activeMonth, salesmanData, globalData, manualKpis, smLevel, globalLevel }) {
  if (!activeMonth) {
    return `<div style="text-align: center; padding: 40px; color: #800000; font-weight: 800;">Pilih bulan di menu Laporan Target terlebih dahulu.</div>`;
  }

  let html = `
    <style>
      .form-card { background: #fff; border-radius: 16px; margin: 0 4px 16px 4px; border: 1px solid #FFCDD2; box-shadow: 0 4px 12px rgba(0,0,0,0.03); overflow: hidden; }
      .form-header { background: #FFF8F8; padding: 16px; border-bottom: 1px solid #FFCDD2; display: flex; justify-content: space-between; align-items: center; }
      .form-title { font-weight: 900; color: #800000; font-size: 15px; }
      .form-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid #F5F5F5; }
      .form-row:last-child { border-bottom: none; }
      .form-label { font-weight: 700; color: #424242; font-size: 13px; flex: 1; }
      .form-input { width: 140px; padding: 12px; text-align: right; border: 1px solid #E0E0E0; background: #FAFAFA; font-family: 'Roboto Mono', monospace; font-weight: 800; color: #800000; border-radius: 8px; font-size: 15px; outline: none; box-sizing: border-box; }
      .form-input:focus { border-color: #B71C1C; background: #fff; box-shadow: 0 0 0 3px rgba(183,28,28,0.15); }
      .form-input::-webkit-outer-spin-button, .form-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .form-select { padding: 8px 12px; font-weight: 800; border-radius: 8px; border: 1px solid #FFCDD2; background: #FFF8F8; color: #800000; outline: none; }
    </style>

    <div class="form-card" style="padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; background: #FFF8F8;">
      <span style="font-size:12px; font-weight:700; color:#757575;">Bulan: ${activeMonth}</span>
    </div>
  `;

  // 1. TARGET SALESMAN
  html += `<div style="margin: 16px 4px 8px 4px; font-weight:900; color:#800000; font-size:15px;">Target Salesman</div>`;
  html += `
    <div class="form-card" style="padding: 12px 16px; display: flex; justify-content: flex-end; background: #FFF8F8;">
      <select id="setSmLevelSel" class="form-select">
        <option value="all" ${smLevel === 'all' ? 'selected' : ''}>Total Omset</option>
        <option value="divisi" ${smLevel === 'divisi' ? 'selected' : ''}>By Divisi</option>
        <option value="subbrand" ${smLevel === 'subbrand' ? 'selected' : ''}>By Subbrand</option>
        <option value="produk" ${smLevel === 'produk' ? 'selected' : ''}>By Produk</option>
      </select>
    </div>
  `;

  if (salesmanData.length === 0) {
    html += `<div style="text-align: center; padding: 20px; color: #757575;">Belum ada data salesman.</div>`;
  } else {
    salesmanData.forEach(sm => {
      html += `
        <div class="form-card">
          <div class="form-header"><div class="form-title">${esc(sm.name)} (${esc(sm.rayon)})</div></div>
          <div>
            ${sm.rows.map(r => `
              <div class="form-row">
                <div class="form-label">${esc(r.label)}</div>
                <input type="number" class="set-tgt-inp form-input" data-sm="${esc(sm.name)}" data-lvl="${r.levelKey ? smLevel : 'all'}" data-key="${esc(r.levelKey || 'ALL')}" data-kpi="${esc(r.kpiId)}" value="${r.target || ''}" placeholder="0">
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });
  }

  // 2. TARGET GLOBAL
  html += `<div style="margin: 16px 4px 8px 4px; font-weight:900; color:#800000; font-size:15px;">Target Global</div>`;
  html += `
    <div class="form-card">
      <div class="form-header">
        <div class="form-title">Target Omset Global</div>
        <select id="setGlobalLevelSel" class="form-select">
          <option value="all" ${globalLevel === 'all' ? 'selected' : ''}>By All</option>
          <option value="divisi" ${globalLevel === 'divisi' ? 'selected' : ''}>By Divisi</option>
          <option value="subbrand" ${globalLevel === 'subbrand' ? 'selected' : ''}>By Subbrand</option>
          <option value="produk" ${globalLevel === 'produk' ? 'selected' : ''}>By Produk</option>
        </select>
      </div>
      <div>${globalData}</div>
    </div>
  `;

  // 3. KPI MANUAL
  html += `<div style="margin: 16px 4px 8px 4px; font-weight:900; color:#800000; font-size:15px;">KPI Manual</div>`;
  html += `
    <div class="form-card">
      <div class="form-header">
        <div class="form-title">Daftar KPI Manual</div>
        <button class="btn sm primary" id="btnAddKpi" style="background: #800000; border: none; border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: bold; color: white;">+ KPI Baru</button>
      </div>
      <div>${manualKpis}</div>
    </div>
  `;

  return html;
}