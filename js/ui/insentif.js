// js/ui/insentif.js
import { esc, compactRp, NF1 } from '../core/utils.js';

export function renderInsentifTables(uiSalesmanData) {
  if (uiSalesmanData.length === 0) {
    return `<div class="empty" style="text-align:center; padding:40px; color:#800000; font-weight:bold;">Tidak ada data salesman.</div>`;
  }

  return `
    <style>
      .ins-wrapper { margin-bottom: 24px; }
      .ins-header-top { background: linear-gradient(135deg, #800000, #B71C1C); padding: 16px 12px; text-align: center; border-radius: 8px 8px 0 0; }
      .ins-header-lbl { font-size: 11px; color: #FFCDD2; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
      .ins-header-val { font-size: 24px; color: #fff; font-weight: 900; }
      .ins-header-name { background: #5D0000; color: #fff; padding: 10px; text-align: center; font-weight: 800; font-size: 14px; }
      
      .ins-table { width: 100%; border-collapse: collapse; table-layout: fixed; background: #fff; border: 1px solid #E2E8F0; border-top: none; }
      .ins-table th { background: #F8FAFC; color: #475569; padding: 8px 4px; font-size: 10px; font-weight: 800; text-align: center; border-bottom: 2px solid #E2E8F0; border-right: 1px solid #E2E8F0; text-transform: uppercase; }
      .ins-table td { padding: 8px 4px; font-size: 11px; border-bottom: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0; color: #334155; vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      
      /* ⚡ LEBAR KOLOM DIPERBAIKI ⚡ */
      .ins-table th:nth-child(1), .ins-table td:nth-child(1) { width: 20%; text-align: left; padding-left: 6px; font-weight: 700; }
      .ins-table th:nth-child(2), .ins-table td:nth-child(2) { width: 15%; text-align: right; padding-right: 4px; }
      .ins-table th:nth-child(3), .ins-table td:nth-child(3) { width: 15%; text-align: right; padding-right: 4px; }
      .ins-table th:nth-child(4), .ins-table td:nth-child(4) { width: 10%; text-align: right; padding-right: 4px; }
      .ins-table th:nth-child(5), .ins-table td:nth-child(5) { width: 15%; text-align: right; padding-right: 4px; font-weight: 800; color: #16A34A; }
      .ins-table th:nth-child(6), .ins-table td:nth-child(6) { width: 25%; text-align: left; font-size: 9.5px; color: #475569; border-right: none; padding-left: 4px; white-space: normal; line-height: 1.2; }

      .ins-table tr.row-total td { background: #FFF8F8; font-weight: 900; color: #800000; border-top: 2px solid #FFCDD2; border-bottom: 2px solid #FFCDD2; }
      .ins-table tr.row-total td:nth-child(5) { color: #16A34A; }
    </style>

    ${uiSalesmanData.map(sm => `
      <div class="ins-wrapper">
        <div class="ins-header-top">
          <div class="ins-header-lbl">Total Insentif Didapat</div>
          <div class="ins-header-val">${compactRp(sm.totalInsentif)}</div>
        </div>
        <div class="ins-header-name">${esc(sm.name)}</div>
        
        <table class="ins-table">
          <thead>
            <tr>
              <th>KPI</th>
              <th>TARGET</th>
              <th>ACHV</th>
              <th>%</th>
              <th>NILAI</th>
              <th>KETERANGAN</th>
            </tr>
          </thead>
          <tbody>
            ${sm.rows.map(r => `
              <tr class="${r.label.includes('TOTAL') ? 'row-total' : ''}">
                <td>${esc(r.label)}</td>
                <td>${r.targetStr}</td>
                <td>${r.capaiStr}</td>
                <td style="color: ${r.pctColor}; font-weight: 800;">${r.pctStr}</td>
                <td>${r.earned > 0 ? compactRp(r.earned).replace('Rp ', '') : '—'}</td>
                <td>${r.kete}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}
  `;
}