// js/ui/musthave/read.js
import { esc, pct } from '../../core/utils.js';

export function renderKpis(totalOutlets, passedOutlets, config) {
  let periodText = 'Semua Waktu';
  if (config.startDate && config.endDate) periodText = `${config.startDate} s/d ${config.endDate}`;
  else if (config.startDate) periodText = `Sejak ${config.startDate}`;
  else if (config.endDate) periodText = `Sampai ${config.endDate}`;

  return `
    <div class="grid kpis mb12">
      <div class="kpi purple">
        <div class="kpi-l">Toko Dievaluasi</div>
        <div class="kpi-v">${totalOutlets}</div>
        <div class="kpi-s">Target: ${config.evaluateAllTypes ? 'Semua Tipe' : (config.targetMode === 'byType' ? esc(config.outletType || '—') : 'Manual')}</div>
        <div class="kpi-s" style="font-size:10px; color:#1D4ED8; margin-top:4px;">📅 ${esc(periodText)}</div>
      </div>
      <div class="kpi pos">
        <div class="kpi-l">Lulus</div>
        <div class="kpi-v">${passedOutlets}</div>
        <div class="kpi-s">${totalOutlets > 0 ? pct((passedOutlets/totalOutlets)*100) : '0%'}</div>
      </div>
      <div class="kpi ${totalOutlets - passedOutlets > 0 ? 'neg' : 'pos'}">
        <div class="kpi-l">Belum Lulus</div>
        <div class="kpi-v">${totalOutlets - passedOutlets}</div>
      </div>
    </div>
  `;
}

export function renderResultTable(results) {
  // ⚡ Menggabungkan semua syarat ke dalam 1 baris per Outlet
  const tableRows = results.map(r => {
    let totalAvailableSku = 0;
    let totalTargetSku = 0;
    let totalAchievedSku = 0;
    let missingSkusDesc = [];

    r.details.forEach(d => {
      if (d.skuDetails && d.skuDetails.length > 0) {
        totalAvailableSku += d.skuDetails.length;
        totalTargetSku += (d.minSkus || 1);
        
        const bought = d.skuDetails.filter(s => Number(s.qty) > 0);
        const missing = d.skuDetails.filter(s => Number(s.qty) <= 0);
        
        totalAchievedSku += bought.length;
        
        missing.forEach(s => {
           missingSkusDesc.push(s.name);
        });
      }
    });

    const missingSkuCount = Math.max(0, totalTargetSku - totalAchievedSku);
    const descText = missingSkusDesc.length > 0 
      ? missingSkusDesc.join(', ') 
      : (totalTargetSku > 0 ? 'Semua target terpenuhi' : 'Tidak ada target');

    return `
      <tr>
        <td style="padding:10px; border-bottom:1px solid #F1F5F9;" class="strong">${esc(r.outlet)}</td>
        <td class="num" style="padding:10px; border-bottom:1px solid #F1F5F9;">${totalAvailableSku} / ${totalTargetSku}</td>
        <td class="num" style="padding:10px; border-bottom:1px solid #F1F5F9;">
          <span style="color:#10B981; font-weight:bold;">${totalAchievedSku}</span> / 
          <span style="color:#DC2626; font-weight:bold;">${missingSkuCount}</span>
        </td>
        <td style="padding:10px; border-bottom:1px solid #F1F5F9; font-size:11px; color:#475569; max-width:200px; word-wrap:break-word;">
          ${esc(descText)}
        </td>
        <td class="num" style="padding:10px; border-bottom:1px solid #F1F5F9;">
          <button class="btn sm" data-mh-detail="${esc(r.outletKey)}" style="padding:4px 8px; font-size:11px;">Detail</button>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card" id="mh-table-wrap">
      <div style="background:#800000; color:#fff; padding:16px; text-align:center;">
        <h3 style="margin:0; font-size:16px; font-weight:900; letter-spacing:1px;">MONITORING MUST-HAVE SKU</h3>
      </div>
      <div class="tablewrap" style="max-height: 600px; overflow-x:auto;">
        <table style="min-width: 600px; width:100%; border-collapse:collapse;">
          <thead style="position:sticky; top:0; z-index:10; background:#F8FAFC; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
            <tr>
              <th style="padding:12px; text-align:left; border-bottom:2px solid #800000;">NAMA OUTLET</th>
              <th class="num" style="padding:12px; border-bottom:2px solid #800000;">SKU / TARGET</th>
              <th class="num" style="padding:12px; border-bottom:2px solid #800000;">CAPAI / KURANG</th>
              <th style="padding:12px; text-align:left; border-bottom:2px solid #800000;">DESKRIPSI</th>
              <th class="num" style="padding:12px; border-bottom:2px solid #800000;">AKSI</th>
            </tr>
          </thead>
          <tbody>
            ${results.length === 0 ? `<tr><td colspan="5" class="empty" style="text-align:center; padding:20px;">Tidak ada data.</td></tr>` : tableRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function renderDetailModalContent(outletResult, pcodeToProduct) {
  let rowsHtml = outletResult.details.map(d => {
    let detailHtml = '';
    
    if (d.skuDetails && d.skuDetails.length > 0) {
      const bought = d.skuDetails.filter(s => Number(s.qty) > 0);
      const missing = d.skuDetails.filter(s => Number(s.qty) <= 0);

      let boughtHtml = bought.map(s => 
        `<span style="display:inline-block; margin:2px; padding:4px 8px; background:#ECFDF5; color:#059669; border:1px solid #A7F3D0; border-radius:4px; font-size:11px; font-weight:700;">
          ✓ ${esc(s.name)}: ${Number(s.qty).toFixed(1)} ${s.isMerged ? '<span style="font-size:9px; opacity:0.7;">(Gabungan)</span>' : ''}
        </span>`
      ).join('');

      let missingHtml = missing.map(s => 
        `<span style="display:inline-block; margin:2px; padding:4px 8px; background:#FEF2F2; color:#DC2626; border:1px solid #FECACA; border-radius:4px; font-size:11px; font-weight:700;">
          ✗ ${esc(s.name)}: 0
        </span>`
      ).join('');

      detailHtml = `
        <div style="margin-top:8px;">
          ${bought.length > 0 ? `<div style="margin-bottom:6px;"><div style="font-size:9px; font-weight:800; color:#059669; text-transform:uppercase; margin-bottom:2px;">Sudah Diambil:</div>${boughtHtml}</div>` : ''}
          ${missing.length > 0 ? `<div><div style="font-size:9px; font-weight:800; color:#DC2626; text-transform:uppercase; margin-bottom:2px;">Belum Diambil:</div>${missingHtml}</div>` : ''}
        </div>
      `;
    } else {
      if (!d.met && (d.actualStr === '0.0 PCS' || d.actualStr === '0.0 CRT' || d.actualStr === '0.0 RCG')) {
         detailHtml = `<div style="font-size:10px; color:#EF4444; margin-top:4px;">Belum ada transaksi</div>`;
      }
    }
    
    let excHtml = '';
    if (d.excludedPcodes && d.excludedPcodes.length > 0) {
      const excNames = d.excludedPcodes.map(pc => pcodeToProduct.get(pc) || pc);
      excHtml = `<div style="font-size:10px; color:#64748B; margin-top:6px;">Dikecualikan: ${excNames.map(p => esc(p)).join(', ')}</div>`;
    }

    return `
    <tr>
      <td style="padding:12px 8px; border-bottom:1px solid #E2E8F0; vertical-align:top;">
        <div style="font-weight:800; font-size:13px; color:#0F172A;">${esc(d.label)}</div>
        ${detailHtml}
        ${excHtml}
      </td>
      <td class="num" style="padding:12px 8px; border-bottom:1px solid #E2E8F0; vertical-align:top; font-size:12px;">${esc(d.requiredStr)}</td>
      <td class="num" style="padding:12px 8px; border-bottom:1px solid #E2E8F0; vertical-align:top; font-size:12px; font-weight:700;">${esc(d.actualStr)}</td>
      <td class="num" style="padding:12px 8px; border-bottom:1px solid #E2E8F0; font-weight:900; font-size:14px; color:${d.met ? 'var(--pos)' : 'var(--neg)'}; vertical-align:top;">
        ${d.met ? '✓' : '✗'}
      </td>
    </tr>
  `}).join('');

  return `
    <div class="modal-h"><h3>Detail: ${esc(outletResult.outlet)}</h3><button class="x">×</button></div>
    <div class="modal-b" style="padding-bottom:24px;">
      <div class="mb12" style="background:#F8FAFC; padding:12px; border-radius:8px; font-size:13px; border:1px solid #E2E8F0;">
        <b>Tipe Outlet:</b> ${esc(outletResult.tipe)} <br>
        <b>Salesman:</b> ${esc(outletResult.salesman)} <br>
        <b>Status:</b> <span style="font-weight:800; color:${outletResult.isPassed ? 'var(--pos)' : 'var(--neg)'}">${outletResult.metCount} / ${outletResult.totalRules} Syarat Terpenuhi</span>
      </div>
      <div class="tablewrap" style="max-height: 450px; border:1px solid #E2E8F0; border-radius:8px;">
        <table style="width:100%;">
          <thead style="background:#F8FAFC; position:sticky; top:0; z-index:2;"><tr><th style="padding:10px 8px; text-align:left;">Syarat</th><th class="num" style="padding:10px 8px;">Target</th><th class="num" style="padding:10px 8px;">Aktual</th><th class="num" style="padding:10px 8px;">Status</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  `;
}