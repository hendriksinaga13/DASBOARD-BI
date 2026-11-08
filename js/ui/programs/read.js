// js/ui/programs/read.js — pure UI, no side effects
import { esc, compactRp, NF1, fmtDateID } from '../../core/utils.js';
import * as C from '../../core/programs.js';

const chip = (color, text) =>
  `<span style="font-size:9px;color:${color};font-weight:800;padding:2px 6px;background:${color}15;border-radius:3px;">${text}</span>`;

export function renderHeader(programs) {
  const c = {
    total: programs.length,
    active: programs.filter(p => C.getProgramStatus(p).status === 'active').length,
    upcoming: programs.filter(p => C.getProgramStatus(p).status === 'upcoming').length,
    expired: programs.filter(p => C.getProgramStatus(p).status === 'expired').length,
  };
  return `<div class="card mb12" style="background:linear-gradient(135deg,#0F172A 0%,#7F1D1D 100%);color:#fff;padding:20px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
      <div style="font-size:32px;">📢</div>
      <div>
        <div style="font-size:16px;font-weight:900;">Program Berjalan</div>
        <div style="font-size:11px;color:#FCA5A5;">Rule-based · Strata · DMP Target · Read-Only</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:8px;">
      ${statCard(c.total, 'TOTAL', 'rgba(255,255,255,0.1)', '#FCA5A5')}
      ${statCard(c.active, 'AKTIF', 'rgba(16,185,129,0.3)', '#86EFAC')}
      ${statCard(c.upcoming, 'UPCOMING', 'rgba(59,130,246,0.3)', '#93C5FD')}
      ${statCard(c.expired, 'EXPIRED', 'rgba(148,163,184,0.3)', '#CBD5E1')}
    </div>
  </div>`;
}

function statCard(val, label, bg, color) {
  return `<div style="background:${bg};padding:10px;border-radius:6px;text-align:center;">
    <div style="font-size:20px;font-weight:900;">${val}</div>
    <div style="font-size:9px;color:${color};font-weight:800;">${label}</div>
  </div>`;
}

export function renderExpiringAlert(programs) {
  if (!programs.length) return '';
  return `<div class="card mb12" style="background:#FEF2F2;border-left:4px solid #DC2626;padding:14px;">
    <div style="font-size:12px;font-weight:900;color:#991B1B;margin-bottom:8px;">🚨 ${programs.length} Hampir Berakhir</div>
    ${programs.map(p => `<div style="font-size:11px;color:#7F1D1D;padding:6px 0;border-bottom:1px solid #FECACA;"><b>${esc(p.name)}</b> — ${C.getProgramStatus(p).label}</div>`).join('')}
  </div>`;
}

export function renderEmpty() {
  return `<div class="card" style="text-align:center;padding:40px;">
    <div style="font-size:48px;margin-bottom:12px;">📢</div>
    <div style="font-size:15px;font-weight:800;color:#64748B;">Belum Ada Program</div>
    <div style="font-size:11px;color:#94A3B8;margin-top:6px;">Program dibuat oleh admin di menu <b>Pengaturan → 📢 Program</b>.</div>
  </div>`;
}

export function renderProgramCard(p) {
  const s = C.getProgramStatus(p);
  const hasCap = p.schemes.some(x => x.reward?.maxEnabled);
  const hasPI  = p.schemes.some(x => x.evaluationMode === 'per_invoice');
  const hasStr = p.schemes.some(x => x.reward?.discountMode === 'strata');
  const totR   = p.schemes.reduce((sum, x) => sum + (x.rules?.length || 0), 0);
  return `<div class="card mb12" data-program-id="${p.id}" style="border-left:4px solid ${s.color};cursor:pointer;padding:14px;">
    <div style="font-size:14px;font-weight:900;color:#0F172A;margin-bottom:2px;">${esc(p.name)}</div>
    <div style="font-size:10px;color:#64748B;margin-bottom:6px;">${p.schemes.length} scheme · ${totR} aturan</div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">
      ${hasPI ? chip('#1D4ED8', '🧾 Per Faktur') : ''}
      ${hasStr ? chip('#F59E0B', '📊 Strata') : ''}
      ${hasCap ? chip('#DC2626', '🛑 Max Cap') : ''}
    </div>
    <div style="padding:8px;background:${s.bg};border-radius:6px;font-size:11px;font-weight:800;color:${s.color};text-align:center;">${s.label}</div>
    <div style="font-size:10px;color:#64748B;margin-top:8px;text-align:center;">${fmtDateID(p.startDate)} — ${fmtDateID(p.endDate)}</div>
  </div>`;
}

export function renderAlertDashboard(program, analysis) {
  const r = C.detectAlerts(program, analysis);
  const { alerts, stats, progress, notStarted, ended } = r;

  if (!stats.size) return `<div class="card" style="padding:12px;background:#F8FAFC;border-radius:8px;font-size:11px;color:#64748B;margin-bottom:12px;">📊 Belum ada data salesman.</div>`;

  if (notStarted) {
    const t = Array.from(stats.values()).reduce((s, x) => s + x.targetOutlets, 0);
    return `<div class="card" style="padding:12px;margin-bottom:12px;border-left:4px solid #3B82F6;background:#EFF6FF;">
      <div style="font-size:13px;font-weight:900;color:#1E40AF;">🕐 Program Belum Dimulai</div>
      <div style="font-size:11px;color:#1E3A8A;margin-top:4px;">Mulai ${fmtDateID(program.startDate)} · ${stats.size} salesman · ${t} outlet target</div>
      <button data-view-scorecard style="width:100%;padding:8px;background:#1D4ED8;color:#fff;border:none;border-radius:6px;font-weight:800;font-size:11px;margin-top:8px;cursor:pointer;">📊 Lihat Scorecard</button>
    </div>`;
  }

  if (ended) {
    const q = Array.from(stats.values()).reduce((s, x) => s + x.qualifiedOutlets, 0);
    const t = Array.from(stats.values()).reduce((s, x) => s + x.targetOutlets, 0);
    return `<div class="card" style="padding:12px;margin-bottom:12px;border-left:4px solid #94A3B8;background:#F8FAFC;">
      <div style="font-size:13px;font-weight:900;color:#475569;">📁 Selesai</div>
      <div style="font-size:11px;color:#64748B;margin-top:4px;">Final ${q}/${t} outlet</div>
      <button data-view-scorecard style="width:100%;padding:8px;background:#475569;color:#fff;border:none;border-radius:6px;font-weight:800;font-size:11px;margin-top:8px;cursor:pointer;">📊 Lihat Scorecard</button>
    </div>`;
  }

  if (!alerts.length) {
    return `<div class="card" style="background:#F0FDF4;border-left:4px solid #10B981;padding:12px;margin-bottom:12px;">
      <div style="font-size:13px;font-weight:900;color:#166534;">✅ Semua On-Track</div>
      <div style="font-size:10px;color:#64748B;margin-top:4px;">Progress ${progress.progressPct.toFixed(0)}% (${progress.daysElapsed}/${progress.totalDays})</div>
      <button data-view-scorecard style="width:100%;padding:8px;background:#1D4ED8;color:#fff;border:none;border-radius:6px;font-weight:800;font-size:11px;margin-top:8px;cursor:pointer;">📊 Scorecard (${stats.size})</button>
    </div>`;
  }

  const cc = alerts.filter(a => a.severity === 0).length;
  const wc = alerts.filter(a => a.severity === 1).length;
  const gc = alerts.filter(a => a.severity === 3).length;
  const bt = alerts.filter(a => a.severity <= 1).length;
  const bc = cc > 0 ? '#DC2626' : wc > 0 ? '#F59E0B' : '#10B981';

  return `<div class="card" style="padding:12px;margin-bottom:12px;border-left:4px solid ${bc};">
    <div style="margin-bottom:8px;">
      <div style="font-size:13px;font-weight:900;color:#0F172A;">🚨 Monitoring Salesman</div>
      <div style="font-size:10px;color:#64748B;margin-top:2px;">Progress ${progress.progressPct.toFixed(0)}% · ${progress.daysElapsed}/${progress.totalDays} · ${stats.size} salesman</div>
    </div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;">
      ${cc ? chip('#DC2626', `🚨 ${cc} kritis`) : ''}
      ${wc ? chip('#F59E0B', `⚠️ ${wc} warning`) : ''}
      ${gc ? chip('#10B981', `🟢 ${gc} top`) : ''}
    </div>
    ${alerts.slice(0, 5).map(a => `
      <div style="padding:8px;background:${a.severity === 0 ? '#FEF2F2' : a.severity === 1 ? '#FFFBEB' : '#F0FDF4'};border-radius:6px;margin-bottom:4px;font-size:11px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;color:#0F172A;">${a.icon} ${esc(a.salesman)}</div>
            <div style="font-size:9px;color:#64748B;margin-top:2px;">${esc(a.title)} — ${esc(a.message)}</div>
          </div>
          <button data-coaching="${esc(a.salesman)}" style="font-size:9px;color:#fff;padding:4px 8px;background:#8B5CF6;border:none;border-radius:6px;font-weight:800;cursor:pointer;">🎯 Coaching</button>
        </div>
      </div>`).join('')}
    ${alerts.length > 5 ? `<div style="font-size:10px;color:#64748B;text-align:center;padding:4px;">... ${alerts.length - 5} lainnya</div>` : ''}
    <button data-view-scorecard style="width:100%;padding:9px;background:#1D4ED8;color:#fff;border:none;border-radius:6px;font-weight:800;font-size:11px;margin-top:8px;cursor:pointer;">📊 Scorecard (${stats.size})</button>
    ${bt ? `<button data-bulk-broadcast style="width:100%;padding:9px;background:#25D366;color:#fff;border:none;border-radius:6px;font-weight:800;font-size:11px;margin-top:6px;cursor:pointer;">📱 Broadcast ke ${bt} Salesman</button>` : ''}
  </div>`;
}

export function renderSchemeDetail(sr, srIdx) {
  const sch = sr.scheme, rw = sch.reward || {};
  const isPI = sch.evaluationMode === 'per_invoice';
  const isS  = rw.discountMode === 'strata';
  const noTx = sr.notQualified.filter(o => !o.rows.length).length;

  let lbl = '';
  if (rw.type === 'discount') {
    lbl = isS
      ? `📊 Strata ${(rw.strataTiers || []).length} tier (${C.getUnitLabel(rw.strataUnit || 'crtn')})`
      : (rw.discountType === 'percent' ? `💰 ${rw.discountValue}%` : `💰 ${compactRp(rw.discountValue)}`);
  } else if (rw.type === 'point') lbl = '⭐ Point';

  return `<div style="margin-bottom:20px;padding:12px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;">
    <div style="margin-bottom:8px;">
      <div style="font-size:13px;font-weight:900;color:#9A3412;">🎯 ${esc(sch.name)}</div>
      <div style="font-size:10px;color:#9A3412;margin-top:2px;">${lbl} · ${sch.rules.length} aturan · ${isPI ? '🧾 Per Faktur' : '📊 Akumulasi'}</div>
    </div>
    ${renderRulesSummary(sch)}
    ${isS ? renderStrataSummary(rw) : ''}
    ${sr.usingDmp ? `<div style="background:#EFF6FF;padding:6px 8px;border-radius:6px;margin-bottom:8px;font-size:10px;color:#1E40AF;font-weight:700;">🎯 DMP: ${sr.totalOutlets} outlet</div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
      <div style="padding:8px;background:#F0FDF4;border-radius:6px;text-align:center;">
        <div style="font-size:9px;color:#166534;font-weight:800;">LOLOS</div>
        <div style="font-size:16px;font-weight:900;color:#10B981;">${sr.totalQualified}</div>
        <div style="font-size:9px;color:#64748B;">/ ${sr.totalOutlets}</div>
      </div>
      <div style="padding:8px;background:#EFF6FF;border-radius:6px;text-align:center;">
        <div style="font-size:9px;color:#1E40AF;font-weight:800;">OMSET</div>
        <div style="font-size:11px;font-weight:900;color:#1D4ED8;">${compactRp(sr.totalOmset)}</div>
      </div>
    </div>
    ${rw.type === 'discount' ? renderDiscountSummary(sr, rw) : ''}
    ${rw.type === 'point' ? `<div style="padding:8px;background:#F5F3FF;border-radius:6px;text-align:center;margin-bottom:8px;"><div style="font-size:9px;color:#5B21B6;font-weight:800;">POINT</div><div style="font-size:14px;font-weight:900;color:#8B5CF6;">${NF1.format(sr.expectedPoints || sr.totalPoints)}</div></div>` : ''}
    ${renderOutletList('qualified', sr, srIdx, isPI)}
    ${renderOutletList('notQualified', sr, srIdx, isPI, noTx)}
  </div>`;
}

function renderRulesSummary(sch) {
  if (!sch.rules.length) return `<div style="background:#fff;padding:8px;border-radius:6px;margin-bottom:8px;font-size:10px;color:#94A3B8;">Tidak ada aturan</div>`;
  return `<div style="background:#fff;padding:8px;border-radius:6px;margin-bottom:8px;">
    <div style="font-size:9px;font-weight:800;color:#64748B;text-transform:uppercase;margin-bottom:4px;">Aturan:</div>
    ${sch.rules.map(r => {
      const m = C.RULE_TYPES[r.type];
      if (!m) return '';
      let d = '';
      if (r.values?.length) d = r.values.slice(0, 3).join(', ') + (r.values.length > 3 ? '...' : '');
      if (r.value > 0) d = `${m.unit || ''} ${NF1.format(r.value)}`;
      if (r.productConfig?.length) d = `${r.productConfig.length} produk`;
      return `<div style="font-size:10px;color:#334155;padding:3px 0;border-bottom:1px solid #F1F5F9;"><b>${m.icon} ${m.label}:</b> ${esc(d)}</div>`;
    }).join('')}
  </div>`;
}

function renderStrataSummary(rw) {
  return `<div style="background:#FFFBEB;padding:8px;border-radius:6px;margin-bottom:8px;">
    <div style="font-size:9px;font-weight:800;color:#92400E;text-transform:uppercase;margin-bottom:4px;">📊 Strata (${C.getUnitLabel(rw.strataUnit || 'crtn')}):</div>
    ${(rw.strataTiers || []).sort((a, b) => a.min - b.min).map(t => {
      const isP = (t.type || 'percent') === 'percent';
      return `<div style="display:flex;justify-content:space-between;font-size:10px;padding:3px 0;border-bottom:1px solid #FDE68A;">
        <span style="color:#78350F;">${t.min} - ${t.max || '∞'}</span>
        <span style="font-weight:800;color:#92400E;">${isP ? '📈' : '💵'} ${isP ? `${t.rate}%` : compactRp(t.amountValue || 0)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

function renderDiscountSummary(sr, rw) {
  return `<div style="display:grid;grid-template-columns:1fr ${rw.maxEnabled || rw.discountMode === 'strata' ? '1fr' : ''};gap:6px;margin-bottom:8px;">
    <div style="padding:8px;background:#FEF2F2;border-radius:6px;text-align:center;">
      <div style="font-size:9px;color:#991B1B;font-weight:800;">AKTUAL</div>
      <div style="font-size:11px;font-weight:900;color:#DC2626;">${compactRp(sr.totalDiscount)}</div>
    </div>
    ${rw.maxEnabled || rw.discountMode === 'strata' ? `<div style="padding:8px;background:#F0F9FF;border-radius:6px;text-align:center;">
      <div style="font-size:9px;color:#0369A1;font-weight:800;">SEHARUSNYA</div>
      <div style="font-size:11px;font-weight:900;color:#0284C7;">${compactRp(sr.expectedDiscount)}</div>
    </div>` : ''}
  </div>
  ${sr.overDiscount > 0 ? `<div style="padding:8px;background:#FEF2F2;border-left:3px solid #DC2626;border-radius:4px;margin-bottom:8px;font-size:10px;"><b>⚠️ Over-discont: ${compactRp(sr.overDiscount)}</b></div>` : ''}`;
}

function renderOutletList(type, sr, srIdx, isPI, noTxCount = 0) {
  const isQ = type === 'qualified';
  const outlets = isQ ? sr.qualified : sr.notQualified;
  const bg = isQ ? '#F0FDF4' : '#FEF2F2';
  const bd = isQ ? '#BBF7D0' : '#FECACA';
  const tc = isQ ? '#166534' : '#991B1B';
  const key = isQ ? srIdx : `notq-${srIdx}`;
  const attr = isQ ? 'data-outlet-detail' : 'data-notq-detail';
  const header = isQ
    ? `✅ Sudah Dapat (${outlets.length})`
    : `❌ Belum Dapat (${outlets.length})${noTxCount > 0 ? ` · ${noTxCount} tanpa tx` : ''}`;

  return `<div style="${!isQ ? 'margin-top:0;' : 'margin-bottom:6px;'}">
    <button data-scheme-toggle="${key}" style="width:100%;padding:8px;background:${bg};border:1px solid ${bd};border-radius:6px;cursor:pointer;text-align:left;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:11px;font-weight:800;color:${tc};">${header}</span>
      <span style="font-size:10px;">▼</span>
    </button>
    <div data-scheme-content="${key}" style="display:none;max-height:200px;overflow-y:auto;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 6px 6px;">
      ${outlets.length === 0
        ? `<div style="text-align:center;padding:12px;font-size:10px;color:${isQ ? '#94A3B8' : '#10B981'};">${isQ ? 'Belum ada' : '🎉 Semua lolos!'}</div>`
        : outlets.slice(0, 50).map((o, i) => renderOutletRow(o, i, srIdx, isQ, isPI, attr)).join('')}
    </div>
  </div>`;
}

function renderOutletRow(o, i, srIdx, isQ, isPI, attr) {
  if (!isQ) {
    const noTx = !o.rows.length;
    return `<div style="padding:8px;border-bottom:1px solid #F1F5F9;font-size:11px;cursor:pointer;" ${attr}="${srIdx}:${i}">
      <div style="font-weight:800;color:#0F172A;">${i + 1}. ${esc(o.outlet)} ${noTx ? '<span style="font-size:8px;color:#94A3B8;">(no tx)</span>' : ''}</div>
      <div style="font-size:9px;color:#64748B;margin-top:2px;">${esc(o.salesman)} · ${compactRp(o.omset)}</div>
      ${o.evaluation.failures.length > 0 ? `<div style="font-size:9px;color:#DC2626;font-weight:700;margin-top:2px;">❌ ${o.evaluation.failures.slice(0, 2).join(' • ')}</div>` : ''}
    </div>`;
  }
  const rw = o.reward || {};
  return `<div style="padding:8px;border-bottom:1px solid #F1F5F9;cursor:pointer;font-size:11px;" ${attr}="${srIdx}:${i}">
    <div style="display:flex;justify-content:space-between;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:800;color:#0F172A;">${i + 1}. ${esc(o.outlet)}</div>
        <div style="font-size:9px;color:#64748B;">${esc(o.salesman)} · ${o.invoiceCount || o.txCount} ${isPI ? 'faktur' : 'baris'}</div>
        ${rw.isStrata ? `<div style="font-size:9px;color:#92400E;font-weight:700;margin-top:2px;">📊 ${NF1.format(rw.totalQty)} ${C.getUnitLabel(rw.strataUnit)} → ${rw.tierType === 'amount' ? compactRp(rw.amountValue) : rw.rate + '%'}</div>` : ''}
        ${rw.type === 'discount' ? `<div style="font-size:9px;margin-top:2px;"><span style="color:#DC2626;font-weight:700;">LBP: ${compactRp(rw.totalDiscount)}</span>${rw.capped || rw.isStrata ? `<span style="color:#0284C7;font-weight:700;margin-left:6px;">Exp: ${compactRp(rw.expectedDiscount)}</span>` : ''}</div>` : ''}
        ${rw.type === 'point' ? `<div style="font-size:9px;color:#8B5CF6;font-weight:700;">${NF1.format(rw.expectedPoints || rw.totalPoints)} poin</div>` : ''}
      </div>
      <div style="font-weight:800;color:#10B981;">${compactRp(o.omset)}</div>
    </div>
  </div>`;
}