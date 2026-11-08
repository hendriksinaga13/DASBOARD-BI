// js/ui/outlet.js
import { esc, compactRp, fmtKtn } from '../core/utils.js';

export function renderOutletTable(uiData) {
  if (!uiData || uiData.length === 0) {
    return `<div class="empty" style="text-align:center; padding:40px; color:#800000; font-weight:bold;">Tidak ada data outlet di tab ini.</div>`;
  }

  const sum = (arr, key) => arr.reduce((s, x) => s + (Number(x[key]) || 0), 0);

  return `
    <style>
      .out-full-wrap { background: #fff; width: 100%; border-top: 2px solid #800000; border-bottom: 2px solid #800000; margin-bottom: 20px; }
      .out-header { background: #800000; color: #fff; padding: 14px; text-align: center; font-weight: 900; font-size: 16px; letter-spacing: 1px; }
      .out-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      
      /* ⚡ HEADER TABEL DENGAN WRAP TEXT ⚡ */
      .out-table th { 
        background: #F8FAFC; 
        color: #475569; 
        padding: 10px 2px; 
        font-size: 9.5px; 
        font-weight: 900; 
        text-align: center; 
        border-bottom: 2px solid #E2E8F0; 
        border-right: 1px solid #E2E8F0; 
        text-transform: uppercase; 
        white-space: normal; 
        word-wrap: break-word; 
        line-height: 1.2;
        vertical-align: middle;
      }
      
      .out-table th:first-child { 
        width: 20%; 
        border-right: 2px solid #800000; 
      }
      .out-table th:last-child { border-right: none; }
      
      .out-table th.sub-hdr { 
        text-align: center; 
        font-size: 9px; 
        padding: 6px; 
        background: #E2E8F0; 
        color: #800000; 
        border-bottom: 2px solid #800000; 
        font-weight: 800; 
      }
      
      /* BODY */
      .out-table td { padding: 8px 4px; font-size: 11px; border-bottom: 1px solid #E2E8F0; border-right: 1px solid #E2E8F0; color: #334155; vertical-align: middle; font-variant-numeric: tabular-nums; text-align: right; }
      
      .out-table td:first-child { 
        text-align: center; 
        padding: 8px 4px; 
        font-weight: 800; 
        color: #0F172A; 
        border-right: 2px solid #800000; 
        background: #FAFAFA; 
        word-wrap: break-word; 
        white-space: normal; 
        line-height: 1.2; 
        font-size: 11px;
      }
      .out-table td:last-child { border-right: none; }
      
      .row-oms td { background: #fff; font-weight: 700; }
      .row-ctn td { background: #F1F5F9; font-size: 10.5px; color: #475569; }
      .row-total-oms td { background: #FFF0F0; font-weight: 900; color: #800000; border-top: 2px solid #800000; font-size: 12px; }
      .row-total-ctn td { background: #FFE4E4; font-weight: 900; color: #800000; border-bottom: 2px solid #800000; font-size: 12px; }
      
      .td-tgt { color: #800000 !important; font-weight: 900 !important; }
      .gap-pos { color: #16A34A !important; }
      .gap-neg { color: #DC2626 !important; }
    </style>

    <div class="out-full-wrap">
      <div class="out-header">MONITORING OUTLET</div>
      <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
        <table class="out-table">
          <thead>
            <tr>
              <th rowspan="2">Nama Outlet</th>
              <th rowspan="2">Avg 5W</th>
              <th rowspan="2">Avg 13W</th>
              <th rowspan="2">Avg LM</th>
              <th rowspan="2">TGT Bulanan</th>
              <th rowspan="2">Capai</th>
              <th rowspan="2">Gap</th>
            </tr>
            <tr></tr>
            <tr>
              <th colspan="7" class="sub-hdr">( IN OMS / IN CTN )</th>
            </tr>
          </thead>
          <tbody>
            ${uiData.slice(0, 150).map(out => `
              <tr class="row-oms">
                <td rowspan="2">${esc(out.name)}</td>
                <td>${compactRp(out.avg5w_oms).replace('Rp ', '')}</td>
                <td>${compactRp(out.avg13w_oms).replace('Rp ', '')}</td>
                <td>${compactRp(out.avgLM_oms).replace('Rp ', '')}</td>
                <td class="td-tgt">${compactRp(out.tgt_oms).replace('Rp ', '')}</td>
                <td style="color:#1D4ED8;">${compactRp(out.capai_oms).replace('Rp ', '')}</td>
                <td class="${out.gap_oms >= 0 ? 'gap-pos' : 'gap-neg'}">
                  ${out.gap_oms !== 0 ? compactRp(out.gap_oms).replace('Rp ', '') : '0'}
                </td>
              </tr>
              <tr class="row-ctn">
                <td>${fmtKtn(out.avg5w_ctn).replace(' ktn', '')}</td>
                <td>${fmtKtn(out.avg13w_ctn).replace(' ktn', '')}</td>
                <td>${fmtKtn(out.avgLM_ctn).replace(' ktn', '')}</td>
                <td class="td-tgt">${fmtKtn(out.tgt_ctn).replace(' ktn', '')}</td>
                <td style="color:#1D4ED8;">${fmtKtn(out.capai_ctn).replace(' ktn', '')}</td>
                <td class="${out.gap_ctn >= 0 ? 'gap-pos' : 'gap-neg'}">
                  ${out.gap_ctn !== 0 ? fmtKtn(out.gap_ctn).replace(' ktn', '') : '0'}
                </td>
              </tr>
            `).join('')}
            
            ${uiData.length > 150 ? `<tr><td colspan="7" style="text-align:center; padding:12px; font-size:11px; color:#64748B; background:#F8FAFC;">Menampilkan 150 dari ${uiData.length} outlet.</td></tr>` : ''}
            
            <tr class="row-total-oms">
              <td>TOTAL</td>
              <td>${compactRp(sum(uiData, 'avg5w_oms')).replace('Rp ', '')}</td>
              <td>${compactRp(sum(uiData, 'avg13w_oms')).replace('Rp ', '')}</td>
              <td>${compactRp(sum(uiData, 'avgLM_oms')).replace('Rp ', '')}</td>
              <td class="td-tgt">${compactRp(sum(uiData, 'tgt_oms')).replace('Rp ', '')}</td>
              <td style="color:#1D4ED8;">${compactRp(sum(uiData, 'capai_oms')).replace('Rp ', '')}</td>
              <td class="${sum(uiData, 'gap_oms') >= 0 ? 'gap-pos' : 'gap-neg'}">${compactRp(sum(uiData, 'gap_oms')).replace('Rp ', '')}</td>
            </tr>
            <tr class="row-total-ctn">
              <td></td>
              <td>${fmtKtn(sum(uiData, 'avg5w_ctn')).replace(' ktn', '')}</td>
              <td>${fmtKtn(sum(uiData, 'avg13w_ctn')).replace(' ktn', '')}</td>
              <td>${fmtKtn(sum(uiData, 'avgLM_ctn')).replace(' ktn', '')}</td>
              <td class="td-tgt">${fmtKtn(sum(uiData, 'tgt_ctn')).replace(' ktn', '')}</td>
              <td style="color:#1D4ED8;">${fmtKtn(sum(uiData, 'capai_ctn')).replace(' ktn', '')}</td>
              <td class="${sum(uiData, 'gap_ctn') >= 0 ? 'gap-pos' : 'gap-neg'}">${fmtKtn(sum(uiData, 'gap_ctn')).replace(' ktn', '')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}