// js/ui/programs/modals.js — pure UI (return HTML string untuk openModal)
import { esc, compactRp, NF1, fmtDateID } from '../../core/utils.js';
import * as C from '../../core/programs.js';
import { renderAlertDashboard, renderSchemeDetail } from './read.js';

export function renderProgramDetailReadOnly(program, analysis, status) {
  return `
    <div class="modal-h"><h3 style="font-size:15px;margin:0;">${esc(program.name)}</h3><button class="x">×</button></div>
    <div class="modal-b" style="padding:16px;max-height:82vh;overflow-y:auto;">
      <div style="padding:12px;background:${status.bg};border-radius:8px;margin-bottom:12px;text-align:center;">
        <div style="font-size:13px;font-weight:900;color:${status.color};">${status.label}</div>
        <div style="font-size:10px;color:#64748B;margin-top:4px;">${fmtDateID(program.startDate)} — ${fmtDateID(program.endDate)}</div>
      </div>
      ${renderAlertDashboard(program, analysis)}
      ${program.schemeNotes ? `<div style="padding:10px;background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:6px;margin-bottom:12px;font-size:11px;color:#78350F;">${esc(program.schemeNotes)}</div>` : ''}
      ${analysis.schemes.map((sr, idx) => renderSchemeDetail(sr, idx)).join('')}
      <div style="margin-top:16px;padding:12px;background:#F1F5F9;border:1px dashed #CBD5E1;border-radius:8px;text-align:center;font-size:11px;color:#64748B;">
        🔒 <b>Mode Baca-Saja</b> — hubungi admin di <b>Pengaturan → 📢 Program</b> untuk mengubah.
      </div>
    </div>`;
}

export function renderProgramDetailEditor(program, analysis, status) {
  return `
    <div class="modal-h"><h3 style="font-size:15px;margin:0;">${esc(program.name)}</h3><button class="x">×</button></div>
    <div class="modal-b" style="padding:16px;max-height:82vh;overflow-y:auto;">
      <div style="padding:12px;background:${status.bg};border-radius:8px;margin-bottom:12px;text-align:center;">
        <div style="font-size:13px;font-weight:900;color:${status.color};">${status.label}</div>
        <div style="font-size:10px;color:#64748B;margin-top:4px;">${fmtDateID(program.startDate)} — ${fmtDateID(program.endDate)}</div>
      </div>
      ${renderAlertDashboard(program, analysis)}
      ${program.schemeNotes ? `<div style="padding:10px;background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:6px;margin-bottom:12px;font-size:11px;color:#78350F;">${esc(program.schemeNotes)}</div>` : ''}
      ${analysis.schemes.map((sr, idx) => renderSchemeDetail(sr, idx)).join('')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px;">
        <button id="prog-detail-edit" style="padding:10px;background:#F59E0B;color:#fff;border:none;border-radius:6px;font-weight:800;font-size:11px;cursor:pointer;">✏️ Edit</button>
        <button id="prog-detail-delete" style="padding:10px;background:#DC2626;color:#fff;border:none;border-radius:6px;font-weight:800;font-size:11px;cursor:pointer;">🗑️ Hapus</button>
      </div>
    </div>`;
}

export function renderScorecardModal(program, { alerts, stats, progress, notStarted, ended }) {
  const sorted = Array.from(stats.values()).sort((a, b) => b.participation - a.participation);
  const am = new Map();
  for (const a of alerts) am.set(a.salesman, a);

  let banner = '';
  if (notStarted) banner = `<div style="padding:8px;background:#EFF6FF;border-left:3px solid #3B82F6;border-radius:4px;margin-bottom:12px;font-size:10px;color:#1E40AF;">🕐 <b>Belum dimulai</b> — bukan indikasi salesman tidak aktif.</div>`;
  else if (ended) banner = `<div style="padding:8px;background:#F8FAFC;border-left:3px solid #94A3B8;border-radius:4px;margin-bottom:12px;font-size:10px;color:#475569;">📁 <b>Selesai</b> — data final.</div>`;

  return `
    <div class="modal-h"><h3 style="font-size:15px;margin:0;">📊 Scorecard Salesman</h3><button class="x">×</button></div>
    <div class="modal-b" style="padding:16px;max-height:82vh;overflow-y:auto;">
      <div style="padding:10px;background:#F8FAFC;border-radius:6px;margin-bottom:12px;font-size:11px;">
        <b>${esc(program.name)}</b><br>
        <span style="color:#64748B;">Progress: ${progress.progressPct.toFixed(0)}% (${progress.daysElapsed}/${progress.totalDays} hari)</span>
      </div>
      ${banner}
      <div class="tablewrap" style="max-height:60vh;">
        <table style="min-width:100%;">
          <thead style="position:sticky;top:0;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,0.05);z-index:1;">
            <tr>
              <th style="text-align:left;padding:8px 4px;">#</th>
              <th style="text-align:left;padding:8px 4px;">Salesman</th>
              <th class="num" style="padding:8px 4px;">Target</th>
              <th class="num" style="padding:8px 4px;">✓</th>
              <th class="num" style="padding:8px 4px;">%</th>
              <th class="num" style="padding:8px 4px;">Omset</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((s, i) => {
              const p = s.participation;
              const c = p >= 90 ? '#10B981' : p >= 50 ? '#F59E0B' : '#DC2626';
              const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1);
              const al = am.get(s.name);
              return `<tr style="border-bottom:1px solid #F1F5F9;">
                <td style="padding:8px 4px;">${rank}</td>
                <td class="strong" style="padding:8px 4px;">
                  ${esc(s.name)}${al ? `<span style="margin-left:4px;">${al.icon}</span>` : ''}
                  ${s.daysSinceLastActivity != null ? `<div style="font-size:9px;color:#94A3B8;font-weight:normal;">${s.daysSinceLastActivity === 0 ? 'aktif hari ini' : `${s.daysSinceLastActivity} hari lalu`}</div>` : ''}
                </td>
                <td class="num" style="padding:8px 4px;">${s.targetOutlets}</td>
                <td class="num" style="padding:8px 4px;">${s.qualifiedOutlets}</td>
                <td class="num" style="padding:8px 4px;color:${c};font-weight:800;">${p.toFixed(0)}%</td>
                <td class="num" style="padding:8px 4px;">${compactRp(s.omset)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

export function renderCoachingModal(name, stat, diagnosis, playbook, waMsg) {
  const sc = diagnosis.severity === 'critical' ? '#DC2626' : diagnosis.severity === 'warning' ? '#F59E0B' : diagnosis.severity === 'success' ? '#10B981' : '#3B82F6';
  const sb = diagnosis.severity === 'critical' ? '#FEF2F2' : diagnosis.severity === 'warning' ? '#FFFBEB' : diagnosis.severity === 'success' ? '#F0FDF4' : '#EFF6FF';

  return `
    <div class="modal-h"><h3 style="font-size:15px;margin:0;">🎯 Coaching: ${esc(name)}</h3><button class="x">×</button></div>
    <div class="modal-b" style="padding:16px;max-height:82vh;overflow-y:auto;">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px;">
        <div style="padding:10px;background:#F0FDF4;border-radius:6px;text-align:center;">
          <div style="font-size:9px;color:#166534;font-weight:800;">LOLOS</div>
          <div style="font-size:16px;font-weight:900;color:#10B981;">${stat.qualifiedOutlets}</div>
          <div style="font-size:9px;color:#64748B;">/ ${stat.targetOutlets}</div>
        </div>
        <div style="padding:10px;background:#EFF6FF;border-radius:6px;text-align:center;">
          <div style="font-size:9px;color:#1E40AF;font-weight:800;">PARTISIPASI</div>
          <div style="font-size:16px;font-weight:900;color:${stat.participation >= 90 ? '#10B981' : stat.participation >= 50 ? '#F59E0B' : '#DC2626'};">${stat.participation.toFixed(0)}%</div>
        </div>
        <div style="padding:10px;background:#F5F3FF;border-radius:6px;text-align:center;">
          <div style="font-size:9px;color:#5B21B6;font-weight:800;">OMSET</div>
          <div style="font-size:11px;font-weight:900;color:#8B5CF6;">${compactRp(stat.omset)}</div>
        </div>
      </div>
      <div style="padding:12px;background:${sb};border-left:4px solid ${sc};border-radius:6px;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:900;color:${sc};text-transform:uppercase;margin-bottom:4px;">🔍 Diagnosis</div>
        <div style="font-size:12px;color:#334155;line-height:1.5;">${esc(diagnosis.detail || 'OK.')}</div>
      </div>
      <div style="margin-bottom:12px;">
        <div style="font-size:11px;font-weight:900;color:#0F172A;text-transform:uppercase;margin-bottom:6px;">📋 Playbook</div>
        ${playbook.map(x => `
          <div style="padding:10px;background:#fff;border:1px solid #E2E8F0;border-left:3px solid ${x.priority === 'high' ? '#DC2626' : x.priority === 'medium' ? '#F59E0B' : '#10B981'};border-radius:6px;margin-bottom:6px;">
            <div style="display:flex;gap:8px;">
              <span style="font-size:16px;">${x.icon}</span>
              <div>
                <div style="font-size:11px;font-weight:800;color:#0F172A;">${esc(x.title)}</div>
                <div style="font-size:10px;color:#64748B;line-height:1.5;margin-top:2px;">${esc(x.detail)}</div>
              </div>
            </div>
          </div>`).join('')}
      </div>
      <div style="margin-bottom:12px;">
        <div style="font-size:11px;font-weight:900;color:#0F172A;text-transform:uppercase;margin-bottom:6px;">📱 Preview WhatsApp</div>
        <textarea id="wa-msg-text" style="width:100%;min-height:180px;padding:10px;border:1px solid #E2E8F0;border-radius:6px;font-family:monospace;font-size:10px;line-height:1.5;resize:vertical;background:#F8FAFC;">${esc(waMsg)}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
        <button data-wa-copy style="padding:10px;background:#25D366;color:#fff;border:none;border-radius:6px;font-weight:800;font-size:11px;cursor:pointer;">📋 Copy WA</button>
        <button data-wa-open style="padding:10px;background:#16A34A;color:#fff;border:none;border-radius:6px;font-weight:800;font-size:11px;cursor:pointer;">💬 Buka WA</button>
      </div>
      <button data-outlet-drill style="width:100%;padding:10px;background:#1D4ED8;color:#fff;border:none;border-radius:6px;font-weight:800;font-size:11px;cursor:pointer;">🏪 Lihat Outlet Gagal (${diagnosis.topFailedOutlets.length})</button>
    </div>`;
}

export function renderDrillModal(program, name, diagnosis) {
  return `
    <div class="modal-h"><h3 style="font-size:15px;margin:0;">🏪 Outlet: ${esc(name)}</h3><button class="x">×</button></div>
    <div class="modal-b" style="padding:16px;max-height:82vh;overflow-y:auto;">
      <div style="padding:10px;background:#F8FAFC;border-radius:6px;margin-bottom:12px;font-size:11px;">
        <b>Program:</b> ${esc(program.name)}<br>
        <span style="color:#64748B;">Total ${diagnosis.topFailedOutlets.length} outlet gagal</span>
      </div>
      ${diagnosis.topFailedOutlets.map((o, i) => {
        const cm = {
          no_tx:        { bg: '#FEF2F2', bd: '#DC2626', lb: 'Belum transaksi' },
          below_min:    { bg: '#FFFBEB', bd: '#F59E0B', lb: 'Di bawah min' },
          missing_key:  { bg: '#FEF2F2', bd: '#DC2626', lb: 'Produk kunci hilang' },
          below_strata: { bg: '#FFFBEB', bd: '#F59E0B', lb: 'Di bawah strata' },
          other:        { bg: '#F8FAFC', bd: '#94A3B8', lb: 'Lainnya' },
        };
        const s = cm[o.category] || cm.other;
        return `<div style="padding:10px;background:${s.bg};border-left:3px solid ${s.bd};border-radius:6px;margin-bottom:6px;">
          <div style="font-size:11px;font-weight:800;color:#0F172A;">${o.icon} ${i + 1}. ${esc(o.outlet)}</div>
          <div style="font-size:10px;color:${s.bd};font-weight:700;margin-top:2px;">${s.lb}</div>
          <div style="font-size:9px;color:#64748B;margin-top:2px;">${esc(o.reason)}</div>
        </div>`;
      }).join('')}
    </div>`;
}

export function renderBroadcastModal(contacts) {
  return `
    <div class="modal-h"><h3 style="font-size:15px;margin:0;">📱 Broadcast (${contacts.length})</h3><button class="x">×</button></div>
    <div class="modal-b" style="padding:16px;max-height:82vh;overflow-y:auto;">
      <div style="padding:10px;background:#FFFBEB;border-left:3px solid #F59E0B;border-radius:6px;margin-bottom:12px;font-size:11px;color:#92400E;">⚠️ Kirim satu per satu.</div>
      ${contacts.map((c, i) => `
        <div style="padding:12px;background:#fff;border:1px solid #E2E8F0;border-radius:6px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <div>
              <div style="font-size:12px;font-weight:800;color:#0F172A;">${c.icon} ${esc(c.name)}</div>
              <div style="font-size:9px;color:#64748B;">${c.stat.participation.toFixed(0)}% · ${c.stat.qualifiedOutlets}/${c.stat.targetOutlets}</div>
            </div>
            <button data-bulk-send="${i}" style="padding:8px 12px;background:#25D366;color:#fff;border:none;border-radius:6px;font-weight:800;font-size:10px;cursor:pointer;">💬 Kirim</button>
          </div>
        </div>`).join('')}
    </div>`;
}

export function renderOutletDetailModal(outlet, scheme, category, scopedRows) {
  const ev = outlet.evaluation || {};
  const isQ = category === 'qualified';
  const all = outlet.rows || [];
  const disp = isQ ? (ev.matchingRows?.length ? ev.matchingRows : scopedRows) : scopedRows;
  const hidden = all.length - scopedRows.length;
  const isPI = scheme.evaluationMode === 'per_invoice';
  const rw = outlet.reward || {};
  const noTx = all.length === 0;
  const noScoped = all.length > 0 && scopedRows.length === 0;

  return `
    <div class="modal-h"><h3 style="font-size:14px;margin:0;">🏪 ${esc(outlet.outlet)}</h3><button class="x">×</button></div>
    <div class="modal-b" style="padding:16px;max-height:75vh;overflow-y:auto;">
      <div style="padding:10px;background:#F8FAFC;border-radius:6px;margin-bottom:12px;font-size:11px;">
        <div><b>Salesman:</b> ${esc(outlet.salesman)}</div>
        <div><b>Channel:</b> ${esc(outlet.channel || '-')}</div>
        <div><b>Kabupaten:</b> ${esc(outlet.kabupaten || '-')}</div>
        <div><b>Total Faktur:</b> ${ev.totalInvoices || new Set(all.map(r => r.invoice)).size}</div>
        <div><b>Basis:</b> ${isPI ? '🧾 Per Faktur' : '📊 Akumulasi'}</div>
        ${outlet.fromDMP ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #E2E8F0;color:#1E40AF;font-weight:700;">🎯 DMP</div>` : ''}
        ${hidden > 0 ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #E2E8F0;color:#F59E0B;font-weight:700;">⚡ ${hidden} non-target disembunyikan</div>` : ''}
      </div>
      ${renderRewardBox(rw, isQ)}
      ${isPI ? renderInvoiceBreakdown(ev) : ''}
      ${noTx
        ? `<div style="padding:16px;background:#FEF2F2;border-radius:6px;text-align:center;font-size:11px;color:#991B1B;font-weight:700;">⚠️ Tidak ada transaksi</div>`
        : noScoped
          ? `<div style="padding:16px;background:#FFFBEB;border-radius:6px;text-align:center;font-size:11px;color:#92400E;font-weight:700;">⚠️ ${all.length} transaksi, tapi <b>tidak ada produk target</b></div>`
          : renderTransactionList(disp, isQ)}
    </div>`;
}

function renderRewardBox(rw, isQ) {
  if (!isQ || rw.type === 'none') return '';
  if (rw.isStrata) {
    const lbl = rw.tierType === 'amount' ? `💵 ${compactRp(rw.amountValue)} / ${C.getUnitLabel(rw.strataUnit)}` : `📈 ${rw.rate}%`;
    return `<div style="padding:12px;background:#FFFBEB;border-radius:6px;margin-bottom:12px;">
      <div style="font-size:10px;color:#92400E;font-weight:800;">📊 STRATA</div>
      <div style="font-size:16px;font-weight:900;color:#92400E;margin-top:4px;">${NF1.format(rw.totalQty)} ${C.getUnitLabel(rw.strataUnit)} → ${lbl}</div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #FDE68A;">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;"><span style="color:#78350F;">Aktual LBP:</span><span style="font-weight:800;color:#DC2626;">${compactRp(rw.totalDiscount || 0)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:11px;"><span style="color:#78350F;">Seharusnya:</span><span style="font-weight:800;color:#0284C7;">${compactRp(rw.expectedDiscount || 0)}</span></div>
      </div>
    </div>`;
  }
  if (rw.type === 'discount') {
    return `<div style="padding:12px;background:#FEF2F2;border-radius:6px;margin-bottom:12px;">
      <div style="font-size:10px;color:#991B1B;font-weight:800;">DISKON AKTUAL</div>
      <div style="font-size:20px;font-weight:900;color:#DC2626;margin-top:4px;">${compactRp(rw.totalDiscount || 0)}</div>
      ${rw.capped ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #FECACA;"><div style="font-size:10px;color:#0284C7;font-weight:800;">SEHARUSNYA</div><div style="font-size:16px;font-weight:900;color:#0284C7;">${compactRp(rw.expectedDiscount)}</div></div>` : ''}
    </div>`;
  }
  if (rw.type === 'point') {
    return `<div style="padding:12px;background:#F5F3FF;border-radius:6px;margin-bottom:12px;">
      <div style="font-size:10px;color:#5B21B6;font-weight:800;">POINT</div>
      <div style="font-size:20px;font-weight:900;color:#8B5CF6;margin-top:4px;">${NF1.format(rw.expectedPoints || rw.totalPoints)} poin</div>
      ${rw.eligiblePrizes?.length > 0 ? `<div style="margin-top:8px;padding:8px;background:#fff;border-radius:4px;">${rw.eligiblePrizes.map(p => `<div style="font-size:11px;color:#0F172A;font-weight:700;">🎁 ${esc(p.name)} (${p.points} poin)</div>`).join('')}</div>` : ''}
    </div>`;
  }
  return '';
}

function renderInvoiceBreakdown(ev) {
  if (!ev.invoiceResults?.length) return '';
  return `<div style="margin-bottom:12px;">
    <div style="font-size:11px;font-weight:900;color:#0F172A;text-transform:uppercase;margin-bottom:6px;">📋 Per Faktur (${ev.passingCount || 0}/${ev.totalInvoices})</div>
    ${ev.invoiceResults.map((ir, i) => {
      const rd = (ir.matchingRows || []).reduce((s, r) => s + C.getRowDiscount(r), 0);
      return `<div style="padding:8px;background:${ir.passed ? '#F0FDF4' : '#FEF2F2'};border-left:3px solid ${ir.passed ? '#10B981' : '#DC2626'};border-radius:6px;margin-bottom:6px;font-size:10px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="font-weight:800;color:#0F172A;">${i + 1}. ${esc(ir.invoice || '-')}</span>
          <span style="font-size:9px;color:${ir.passed ? '#10B981' : '#DC2626'};font-weight:800;">${ir.passed ? '✅' : '❌'}</span>
        </div>
        ${!ir.passed && ir.failures?.length ? `<div style="font-size:9px;color:#DC2626;margin-top:2px;">${esc(ir.failures.slice(0, 2).join(' • '))}</div>` : ''}
        ${ir.passed ? `<div style="font-size:9px;color:#166534;margin-top:2px;">Diskon: ${compactRp(rd)}</div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

function renderTransactionList(rows, isQ) {
  return `<div style="font-size:11px;font-weight:900;color:#0F172A;margin-bottom:8px;">${isQ ? '✅ Transaksi Lolos' : '📋 Transaksi Target'} (${rows.length}):</div>
    ${rows.map((r, i) => `
      <div style="padding:8px;background:#fff;border:1px solid #E2E8F0;border-radius:6px;margin-bottom:6px;font-size:10px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="font-weight:800;">${i + 1}. ${esc(r.invoice || '-')}</span>
          <span style="color:#64748B;">${fmtDateID(r.day)}</span>
        </div>
        <div style="color:#64748B;margin-bottom:3px;">${esc(r.product || '-')}</div>
        <div style="display:flex;justify-content:space-between;font-size:9px;">
          <span>Qty: <b>${NF1.format(C.getPcs(r))} pcs</b>${C.getRcg(r) > 0 ? ` (${NF1.format(C.getRcg(r))} rcg)` : ''}</span>
          <span>Amt: <b>${compactRp(r.amount)}</b></span>
          <span style="color:#DC2626;">Disc: <b>${compactRp(C.getRowDiscount(r))}</b></span>
        </div>
      </div>`).join('')}`;
}