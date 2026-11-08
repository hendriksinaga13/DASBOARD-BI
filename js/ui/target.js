// js/ui/target.js
import { esc, compactRp, NF1 } from '../core/utils.js';

export function renderHeaderAndKPI({ activeMonth, months, uniqueSalesmanCount, globalTarget, actualOmset, pctNum, activeTab, hk, hkReal, estPerDay }) {
  return `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap');
      @keyframes slideUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
      .and-app { font-family: 'Roboto', sans-serif; }
      
      /* ⚡ TEMA MAROON ANDROID ⚡ */
      .and-appbar { background: linear-gradient(135deg, #800000, #B71C1C); color: #fff; padding: 20px 16px 16px 16px; border-radius: 0 0 24px 24px; box-shadow: 0 6px 16px rgba(128,0,0,0.3); margin-bottom: 16px; position: sticky; top: 0; z-index: 100; animation: slideUp 0.3s ease-out; }
      .and-appbar-title { font-size: 22px; font-weight: 900; letter-spacing: 0.5px; }
      .and-appbar-sub { font-size: 13px; color: #FFCDD2; margin-top: 2px; }
      .and-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
      .and-month-picker { background: rgba(255,255,255,0.15); padding: 8px 12px; border-radius: 20px; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
      .and-month-picker select { background: transparent; border: none; color: #fff; font-weight: 700; outline: none; font-size: 14px; }
      .and-btn { background: #fff; border: none; color: #800000; padding: 12px 16px; border-radius: 20px; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; box-shadow: 0 3px 6px rgba(0,0,0,0.1); transition: 0.2s; flex: 1; }
      .and-btn:active { transform: scale(0.95); background: #FFEBEE; }
      .and-btn.danger { background: #FFEBEE; color: #B71C1C; border: 1px solid #FFCDD2; }
      
      .and-kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; padding: 0 4px; animation: slideUp 0.4s ease-out; }
      .and-card { background: #fff; border-radius: 20px; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 8px; position: relative; overflow: hidden; border: 1px solid #FFCDD2; }
      .and-card-icon { width: 40px; height: 40px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
      .and-card-lbl { font-size: 11px; color: #757575; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
      .and-card-val { font-size: 20px; font-weight: 900; color: #212121; }
      
      .and-tabs { display: flex; background: #F5F5F5; border-radius: 28px; padding: 4px; margin-bottom: 16px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05); border: 1px solid #FFCDD2; }
      .and-tab { flex: 1; padding: 12px 0; border-radius: 24px; font-weight: 800; font-size: 13px; cursor: pointer; border: none; background: transparent; color: #757575; transition: 0.3s; text-align: center; }
      .and-tab.on { background: #800000; color: #fff; box-shadow: 0 3px 6px rgba(128,0,0,0.2); }

      /* ⚡ STYLE TABEL PERSIS GAMBAR ⚡ */
      .table-block { margin: 0 4px 20px 4px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #E0E0E0; }
      .table-block-header { background: #800000; color: #fff; padding: 10px; text-align: center; font-weight: 900; font-size: 14px; letter-spacing: 0.5px; border-bottom: 2px solid #5D0000; }
      
      .target-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .target-table th { background: #F5F5F5; color: #000; padding: 10px 4px; font-size: 11px; font-weight: 800; text-align: center; border: 1px solid #D1D5DB; text-transform: uppercase; }
      .target-table td { padding: 8px 4px; font-size: 12px; border: 1px solid #D1D5DB; color: #333; vertical-align: middle; }
      
      /* Lebar Kolom */
      .target-table th:nth-child(1), .target-table td:nth-child(1) { width: 25%; text-align: left; padding-left: 8px; font-weight: 700; color: #000; }
      .target-table th:nth-child(2), .target-table td:nth-child(2) { width: 20%; text-align: right; padding-right: 6px; }
      .target-table th:nth-child(3), .target-table td:nth-child(3) { width: 20%; text-align: right; padding-right: 6px; }
      .target-table th:nth-child(4), .target-table td:nth-child(4) { width: 18%; text-align: right; padding-right: 6px; }
      .target-table th:nth-child(5), .target-table td:nth-child(5) { width: 17%; text-align: right; padding-right: 6px; }

      /* Baris TOTAL */
      .target-table tr.row-total td { background: #FFF0F0; font-weight: 900; color: #800000; }
      
      /* Teks Kecil (Pace, Gap, Sisa) */
      .sub-text { font-size: 9px; color: #757575; display: block; margin-top: 2px; font-weight: 600; }
    </style>

    <div class="and-app">
      <div class="and-appbar">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div class="and-appbar-title">Laporan Target</div>
            <div class="and-appbar-sub">M245 Sales Performance</div>
          </div>
          <div style="text-align: right; background: rgba(255,255,255,0.2); padding: 8px 16px; border-radius: 16px;">
            <div style="font-size: 10px; color: #FFCDD2; font-weight: 800;">TOTAL C.</div>
            <div style="font-size: 20px; font-weight: 900;">${NF1.format(pctNum)}%</div>
          </div>
        </div>
        
        <div class="and-toolbar">
          <div class="and-month-picker">
            <span>📅</span>
            <select id="tgtMonthSel">
              <option value="" disabled ${!activeMonth ? 'selected' : ''} style="color:#000;">-- Pilih Bulan --</option>
              ${months.map(m => `<option value="${m}" style="color:#000;" ${m === activeMonth ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:6px; background: rgba(255,255,255,0.15); padding: 8px 12px; border-radius: 20px;">
            <span style="font-size:12px; font-weight:700; color:#FFCDD2;">HK:</span>
            <span style="font-size:14px; font-weight:900; color:#fff;">${hk} Hari</span>
          </div>
        </div>
        
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button class="and-btn" id="btnSendTarget">☁️ Kirim</button>
          <button class="and-btn" id="btnSyncTarget">🔄 Sync</button>
          <button class="and-btn" id="btnShareTarget" style="background:#FFF8F8;">📤 Share</button>
          <button class="and-btn danger" id="btnDelTarget">🗑️ Hapus</button>
        </div>
      </div>

      <div class="and-kpis">
        <div class="and-card">
          <div class="and-card-icon" style="background: #FFF0F0; color: #800000;">🎯</div>
          <div class="and-card-lbl">Total Target</div>
          <div class="and-card-val">${compactRp(globalTarget)}</div>
        </div>
        <div class="and-card">
          <div class="and-card-icon" style="background: #E8F5E9; color: #2E7D32;">📈</div>
          <div class="and-card-lbl">Aktual</div>
          <div class="and-card-val">${compactRp(actualOmset)}</div>
        </div>
        <div class="and-card">
          <div class="and-card-icon" style="background: #FFF0F0; color: #B71C1C;">🏆</div>
          <div class="and-card-lbl">GAP</div>
          <div class="and-card-val" style="color: ${actualOmset - globalTarget < 0 ? '#D32F2F' : '#2E7D32'};">
            ${actualOmset - globalTarget > 0 ? '+' : ''}${compactRp(actualOmset - globalTarget)}
          </div>
        </div>
        <div class="and-card" style="border: 2px solid #800000; background: #FFF8F8;">
          <div class="and-card-icon" style="background: #800000; color: #fff;">⏳</div>
          <div class="and-card-lbl" style="color:#800000;">Harus Dikejar / Hari</div>
          <div class="and-card-val" style="color: #800000;">${compactRp(estPerDay)}</div>
          <div style="font-size:10px; color:#B71C1C; margin-top:-4px; font-weight: 700;">Sisa: ${hk - hkReal} HK lagi</div>
        </div>
      </div>

      <div class="and-tabs">
        <button class="and-tab ${activeTab === 'salesman' ? 'on' : ''}" data-ttab="salesman">Matriks</button>
        <button class="and-tab ${activeTab === 'global' ? 'on' : ''}" data-ttab="global">Global</button>
        <button class="and-tab ${activeTab === 'manual' ? 'on' : ''}" data-ttab="manual">Manual</button>
      </div>
    </div>
  `;
}

export function renderSalesmanTable(uiSalesmanData, smLevel) {
  if (uiSalesmanData.length === 0) {
    return `<div class="empty" style="text-align:center; padding:40px; color:#800000; font-weight:bold;">Tidak ada data salesman.</div>`;
  }

  let html = `
    <div style="margin: 0 4px 12px 4px; display:flex; justify-content:flex-end;">
      <select id="tgtSmLevelSel" style="padding:8px 12px; font-weight:800; border-radius:8px; border:1px solid #FFCDD2; color:#800000; background:#FFF8F8; outline:none;">
        <option value="all" ${smLevel === 'all' ? 'selected' : ''}>Total Omset</option>
        <option value="divisi" ${smLevel === 'divisi' ? 'selected' : ''}>By Divisi</option>
        <option value="subbrand" ${smLevel === 'subbrand' ? 'selected' : ''}>By Subbrand</option>
        <option value="produk" ${smLevel === 'produk' ? 'selected' : ''}>By Produk</option>
      </select>
    </div>
  `;

  uiSalesmanData.forEach(sm => {
    html += `
      <div class="table-block">
        <div class="table-block-header">${esc(sm.name)}</div>
        <table class="target-table">
          <thead>
            <tr>
              <th>KPI</th>
              <th>TARGET</th>
              <th>ACHV</th>
              <th>%VS TGT</th>
              <th>TGT/HARI</th>
            </tr>
          </thead>
          <tbody>
            ${sm.rows.map(r => `
              <tr class="${r.label === 'TOTAL' ? 'row-total' : ''}">
                <td>${esc(r.label)}</td>
                <td>
                  ${r.format === 'rp' ? compactRp(r.target) : NF1.format(r.target)}
                </td>
                <td>
                  ${r.format === 'rp' ? compactRp(r.capai) : NF1.format(r.capai)}
                  ${r.format === 'rp' ? `<span class="sub-text">Pace: ${compactRp(r.pace)}</span>` : ''}
                </td>
                <td style="color: ${r.pctColor};">
                  ${r.target > 0 ? NF1.format(r.pctVal) + '%' : '—'}
                  ${r.target > 0 ? `<span class="sub-text" style="color:${r.gapColor};">${r.gapIcon} ${r.format === 'rp' ? compactRp(r.gapVal) : NF1.format(r.gapVal)}</span>` : ''}
                </td>
                <td style="color: #B71C1C;">
                  ${r.format === 'rp' ? compactRp(r.targetHarian) : NF1.format(r.targetHarian)}
                  ${r.format === 'rp' ? `<span class="sub-text" style="color:#B71C1C;">Sisa: ${compactRp(r.estPerDay)}</span>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  });

  return html;
}

export function renderGlobalTable(uiGlobalData, lvl, mode) {
  let html = `
    <div style="margin: 0 4px 12px 4px; display:flex; justify-content:space-between; align-items:center;">
      <select id="tgtGlobalModeSel" style="padding:8px 12px; font-weight:800; border-radius:8px; border:1px solid #FFCDD2; color:#800000; background:#FFF8F8; outline:none;">
        <option value="manual" ${mode === 'manual' ? 'selected' : ''}>✍️ Manual</option>
        <option value="accumulate" ${mode === 'accumulate' ? 'selected' : ''}>📊 Akum. Salesman</option>
      </select>
      <select id="tgtLevelSel" style="padding:8px 12px; font-weight:800; border-radius:8px; border:1px solid #FFCDD2; color:#800000; background:#FFF8F8; outline:none;">
        <option value="all" ${lvl === 'all' ? 'selected' : ''}>Total Omset</option>
        <option value="divisi" ${lvl === 'divisi' ? 'selected' : ''}>By Divisi</option>
        <option value="subbrand" ${lvl === 'subbrand' ? 'selected' : ''}>By Subbrand</option>
        <option value="produk" ${lvl === 'produk' ? 'selected' : ''}>By Produk</option>
      </select>
    </div>
  `;

  html += `
    <div class="table-block">
      <div class="table-block-header">GLOBAL</div>
      <table class="target-table">
        <thead>
          <tr>
            <th>KPI</th>
            <th>TARGET</th>
            <th>ACHV</th>
            <th>%VS TGT</th>
            <th>TGT/HARI</th>
          </tr>
        </thead>
        <tbody>
          ${uiGlobalData.map(r => `
            <tr class="${r.label === 'TOTAL' ? 'row-total' : ''}">
              <td>${esc(r.label)}</td>
              <td>${r.format === 'rp' ? compactRp(r.targetVal) : NF1.format(r.targetVal)}</td>
              <td>${r.format === 'rp' ? compactRp(r.actualVal) : NF1.format(r.actualVal)}</td>
              <td style="color: ${r.pctColor};">
                ${r.targetVal > 0 ? NF1.format(r.pctVal) + '%' : '—'}
                ${r.targetVal > 0 ? `<span class="sub-text" style="color:${r.gapColor};">${r.gapIcon} ${r.format === 'rp' ? compactRp(r.gapVal) : NF1.format(r.gapVal)}</span>` : ''}
              </td>
              <td style="color: #B71C1C;">
                ${r.format === 'rp' ? compactRp(r.targetVal > 0 ? r.targetVal / 25 : 0) : '—'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  return html;
}

// ⚡ FUNGSI INI YANG SEBELUMNYA HILANG (DIPERBAIKI)
export function renderManualTable(manualKpisHtml) {
  return `
    <div class="table-block">
      <div class="table-block-header">DAFTAR KPI MANUAL</div>
      <div style="padding:16px;">
        ${manualKpisHtml || '<div style="text-align:center; color:#757575; padding:20px;">Belum ada KPI manual.</div>'}
      </div>
    </div>
  `;
}