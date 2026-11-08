import { esc, compactRp, NF1, pct, fmtDateID } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { store } from '../core/store.js';
import { mean, stdev } from '../analytics/stats-advanced.js';
import { registerView } from './registry.js';
import { toast } from '../ui/feedback.js';
import { downloadCSV } from '../plugins/export.js';

// ═══════════════════════════════════════════════════════════════
// AUDIT ENGINE — 8 Kategori Audit
// ═══════════════════════════════════════════════════════════════
function auditData(state) {
  const rows = state.rows || [];
  const master = state.outletMaster || new Map();

  const result = {
    totalRows: rows.length,
    totalDMP: master.size,
    totalFiles: (state.files || []).length,
    issues: {
      duplicateInvoice: [],
      orphanOutlet: [],
      missingMandatory: [],
      invalidDate: [],
      negativeAmount: [],
      zeroQty: [],
      unknownSalesman: [],
      outlierAmount: [],
      inconsistentDMP: [],
    },
    stats: {},
  };

  if (rows.length === 0) return result;

  // === 1. DUPLICATE INVOICE (same invoice + product + amount + day) ===
  const invKey = new Map();
  for (const r of rows) {
    if (r.tt !== 'F') continue;
    const key = `${r.invoice}|${r.pcode || r.product}|${r.amount}|${r.day}`;
    if (!invKey.has(key)) invKey.set(key, []);
    invKey.get(key).push(r);
  }
  for (const [key, list] of invKey) {
    if (list.length > 1) {
      result.issues.duplicateInvoice.push({
        invoice: list[0].invoice,
        product: list[0].product,
        day: list[0].day,
        amount: list[0].amount,
        count: list.length,
        rows: list,
      });
    }
  }

  // === 2. ORPHAN OUTLET (LBP outlet tidak ada di DMP) ===
  const masterKeys = new Set();
  for (const [key, o] of master) {
    const no = String(o.outletNo || '').trim();
    const nm = String(o.outlet || '').trim().toUpperCase();
    if (no) masterKeys.add('no:' + no);
    if (nm) masterKeys.add('nm:' + nm);
  }

  const orphanSeen = new Set();
  for (const r of rows) {
    if (r.tt !== 'F') continue;
    const no = String(r.outletNo || '').trim();
    const nm = String(r.outlet || '').trim().toUpperCase();
    const inMaster = (no && masterKeys.has('no:' + no)) || (nm && masterKeys.has('nm:' + nm));
    if (!inMaster && (no || nm)) {
      const k = no || nm;
      if (!orphanSeen.has(k)) {
        orphanSeen.add(k);
        result.issues.orphanOutlet.push({
          outletNo: r.outletNo,
          outlet: r.outlet,
          salesman: r.salesman,
          rowCount: rows.filter(x => (x.outletNo === r.outletNo) || (x.outlet === r.outlet)).length,
        });
      }
    }
  }

  // === 3. MISSING MANDATORY FIELDS ===
  const mandatoryFields = [
    { key: 'day', label: 'Tanggal' },
    { key: 'invoice', label: 'No Faktur' },
    { key: 'outlet', label: 'Nama Outlet' },
    { key: 'product', label: 'Nama Produk' },
    { key: 'amount', label: 'Amount' },
    { key: 'salesman', label: 'Salesman' },
  ];
  for (const r of rows) {
    const missing = [];
    for (const f of mandatoryFields) {
      const v = r[f.key];
      if (v == null || v === '' || v === '—' || v === '(tanpa nama)' || v === 0) {
        missing.push(f.label);
      }
    }
    if (missing.length > 0) {
      result.issues.missingMandatory.push({
        row: r.idx + 1,
        invoice: r.invoice,
        day: r.day,
        missing,
      });
    }
  }

  // === 4. INVALID DATE ===
  const now = new Date();
  const futureLimit = new Date(now.getTime() + 365 * 86400000);
  const pastLimit = new Date('2015-01-01');
  for (const r of rows) {
    if (!r.day) continue;
    const d = new Date(r.day + 'T00:00:00Z');
    if (isNaN(d.getTime()) || d > futureLimit || d < pastLimit) {
      result.issues.invalidDate.push({
        row: r.idx + 1,
        day: r.day,
        invoice: r.invoice,
        reason: isNaN(d.getTime()) ? 'Format invalid' : d > futureLimit ? 'Tanggal masa depan' : 'Tanggal terlalu lama',
      });
    }
  }

  // === 5. NEGATIVE AMOUNT ===
  for (const r of rows) {
    if (r.amount < 0) {
      result.issues.negativeAmount.push({
        row: r.idx + 1,
        invoice: r.invoice,
        amount: r.amount,
        tt: r.tt,
        day: r.day,
      });
    }
  }

  // === 6. ZERO QTY ===
  for (const r of rows) {
    if (r.tt === 'F' && r.netQty === 0) {
      result.issues.zeroQty.push({
        row: r.idx + 1,
        invoice: r.invoice,
        product: r.product,
        amount: r.amount,
        day: r.day,
      });
    }
  }

  // === 7. UNKNOWN SALESMAN (salesman tidak ada di DMP manapun) ===
  const masterSalesmen = new Set();
  for (const [, o] of master) {
    if (o.salesman && o.salesman !== '—') masterSalesmen.add(o.salesman);
  }
  const lbpSalesmen = new Set();
  for (const r of rows) {
    if (r.tt === 'F' && r.salesman && r.salesman !== '—') lbpSalesmen.add(r.salesman);
  }
  for (const sm of lbpSalesmen) {
    if (!masterSalesmen.has(sm) && masterSalesmen.size > 0) {
      const txCount = rows.filter(r => r.salesman === sm && r.tt === 'F').length;
      result.issues.unknownSalesman.push({
        salesman: sm,
        transaksi: txCount,
      });
    }
  }

  // === 8. OUTLIER AMOUNT ===
  const amounts = rows.filter(r => r.tt === 'F' && r.amount > 0).map(r => r.amount);
  if (amounts.length >= 20) {
    const mu = mean(amounts);
    const sd = stdev(amounts);
    if (sd > 0) {
      for (const r of rows) {
        if (r.tt !== 'F') continue;
        const z = (r.amount - mu) / sd;
        if (Math.abs(z) > 4) {
          result.issues.outlierAmount.push({
            row: r.idx + 1,
            invoice: r.invoice,
            outlet: r.outlet,
            amount: r.amount,
            z,
            day: r.day,
          });
        }
      }
    }
  }

  // === 9. INCONSISTENT DMP (DMP outlets tanpa salesman valid) ===
  for (const [, o] of master) {
    if (!o.salesman || o.salesman === '—') {
      result.issues.inconsistentDMP.push({
        outletNo: o.outletNo,
        outlet: o.outlet,
        reason: 'Salesman tidak ditugaskan',
      });
    }
  }

  // === STATISTIK ===
  result.stats = {
    duplicateCount: result.issues.duplicateInvoice.length,
    orphanCount: result.issues.orphanOutlet.length,
    missingCount: result.issues.missingMandatory.length,
    invalidDateCount: result.issues.invalidDate.length,
    negativeCount: result.issues.negativeAmount.length,
    zeroQtyCount: result.issues.zeroQty.length,
    unknownSmCount: result.issues.unknownSalesman.length,
    outlierCount: result.issues.outlierAmount.length,
    inconsistentDmpCount: result.issues.inconsistentDMP.length,
  };

  return result;
}

// ═══════════════════════════════════════════════════════════════
// SCORE CALCULATOR — 6 Dimensi Kualitas Data
// ═══════════════════════════════════════════════════════════════
function calculateScore(audit) {
  if (audit.totalRows === 0) return { total: 0, dimensions: {} };

  const stats = audit.stats;
  const totalRows = audit.totalRows;
  const totalDMP = audit.totalDMP;

  // 1. COMPLETENESS = (100 - %missing)
  const completeness = Math.max(0, 100 - (stats.missingCount / totalRows) * 100);

  // 2. VALIDITY = (100 - %invalid)
  const validity = Math.max(0, 100 - ((stats.invalidDateCount + stats.negativeCount) / totalRows) * 100);

  // 3. UNIQUENESS = (100 - %duplicate)
  const uniqueness = Math.max(0, 100 - (stats.duplicateCount / Math.max(1, totalRows / 10)) * 10);

  // 4. CONSISTENCY = (100 - %inconsistent)  
  // Cross-reference: orphan outlets + inconsistent DMP
  const consistency = totalDMP > 0
    ? Math.max(0, 100 - (stats.orphanCount / Math.max(1, totalDMP)) * 20 - (stats.inconsistentDmpCount / totalDMP) * 30)
    : 100;

  // 5. ACCURACY = (100 - %outliers - %zeroQty)
  const accuracy = Math.max(0, 100 - (stats.outlierCount / totalRows) * 50 - (stats.zeroQtyCount / totalRows) * 30);

  // 6. INTEGRITY = (100 - %unknown salesman)
  const integrity = Math.max(0, 100 - (stats.unknownSmCount / Math.max(1, totalRows / 100)) * 10);

  const dimensions = {
    completeness: Math.round(completeness),
    validity: Math.round(validity),
    uniqueness: Math.round(uniqueness),
    consistency: Math.round(consistency),
    accuracy: Math.round(accuracy),
    integrity: Math.round(integrity),
  };

  // Weighted total
  const total = Math.round(
    dimensions.completeness * 0.2 +
    dimensions.validity * 0.2 +
    dimensions.uniqueness * 0.15 +
    dimensions.consistency * 0.2 +
    dimensions.accuracy * 0.15 +
    dimensions.integrity * 0.1
  );

  return { total, dimensions };
}

// ═══════════════════════════════════════════════════════════════
// UI RENDERERS
// ═══════════════════════════════════════════════════════════════
function scoreColor(score) {
  if (score >= 90) return { bg: '#F0FDF4', border: '#10B981', text: '#166534', label: 'EXCELLENT' };
  if (score >= 75) return { bg: '#F0F9FF', border: '#0EA5E9', text: '#075985', label: 'GOOD' };
  if (score >= 50) return { bg: '#FFFBEB', border: '#F59E0B', text: '#92400E', label: 'FAIR' };
  return { bg: '#FEF2F2', border: '#DC2626', text: '#991B1B', label: 'POOR' };
}

function renderGauge(score) {
  const W = 200, H = 110;
  const C = W / 2, R = 78, r = 55;
  const color = score >= 90 ? '#10B981' : score >= 75 ? '#0EA5E9' : score >= 50 ? '#F59E0B' : '#DC2626';
  
  const segments = [
    { from: 180, to: 120, color: '#DC2626' },
    { from: 120, to: 60, color: '#F59E0B' },
    { from: 60, to: 0, color: '#10B981' }
  ];
  
  const ptc = (cx, cy, radius, angleDeg) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
  };
  
  let arcs = '';
  segments.forEach(seg => {
    const p1 = ptc(C, H - 10, R, seg.from);
    const p2 = ptc(C, H - 10, R, seg.to);
    const p3 = ptc(C, H - 10, r, seg.to);
    const p4 = ptc(C, H - 10, r, seg.from);
    arcs += `<path d="M${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A${R} ${R} 0 0 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} L${p3.x.toFixed(1)} ${p3.y.toFixed(1)} A${r} ${r} 0 0 0 ${p4.x.toFixed(1)} ${p4.y.toFixed(1)} Z" fill="${seg.color}" opacity="0.9"/>`;
  });
  
  const needleAngle = 180 - (score / 100) * 180;
  const needleEnd = ptc(C, H - 10, R - 8, needleAngle);
  const needle1 = ptc(C, H - 10, 6, needleAngle + 90);
  const needle2 = ptc(C, H - 10, 6, needleAngle - 90);
  
  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:200px;height:auto;display:block;margin:0 auto;">
      ${arcs}
      <polygon points="${needleEnd.x.toFixed(1)},${needleEnd.y.toFixed(1)} ${needle1.x.toFixed(1)},${needle1.y.toFixed(1)} ${needle2.x.toFixed(1)},${needle2.y.toFixed(1)}" fill="#0F172A"/>
      <circle cx="${C}" cy="${H - 10}" r="7" fill="#0F172A"/>
      <text x="${C}" y="${H - 22}" font-size="28" font-weight="900" fill="${color}" text-anchor="middle">${score}</text>
      <text x="${C}" y="${H + 4}" font-size="8" fill="#64748B" text-anchor="middle" font-weight="800" letter-spacing="2">DATA SCORE</text>
    </svg>`;
}

function renderDimensionBar(label, value) {
  const color = value >= 90 ? '#10B981' : value >= 75 ? '#0EA5E9' : value >= 50 ? '#F59E0B' : '#DC2626';
  return `
    <div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:4px;">
        <span style="font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">${label}</span>
        <span style="font-weight:900;color:${color};">${value}%</span>
      </div>
      <div style="height:8px;background:#F1F5F9;border-radius:4px;overflow:hidden;">
        <div style="width:${value}%;height:100%;background:${color};border-radius:4px;transition:width 0.6s ease;"></div>
      </div>
    </div>`;
}

function renderIssueCard(title, icon, severity, count, description, samples, color) {
  if (count === 0) {
    return `
      <div style="padding:12px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;margin-bottom:8px;display:flex;align-items:center;gap:10px;">
        <div style="font-size:20px;">✅</div>
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:800;color:#166534;">${title}</div>
          <div style="font-size:10px;color:#15803D;">Tidak ada masalah terdeteksi</div>
        </div>
      </div>`;
  }

  return `
    <div style="padding:12px;background:${color.bg};border-left:4px solid ${color.border};border-radius:8px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;flex:1;">
          <div style="font-size:20px;">${icon}</div>
          <div>
            <div style="font-size:12px;font-weight:900;color:${color.text};">${title}</div>
            <div style="font-size:10px;color:${color.text};opacity:0.8;">${description}</div>
          </div>
        </div>
        <div style="background:${color.border};color:#fff;font-size:11px;font-weight:900;padding:4px 10px;border-radius:20px;white-space:nowrap;">${count}</div>
      </div>
      ${samples && samples.length > 0 ? `
        <div style="background:#fff;border-radius:6px;padding:8px;margin-top:8px;font-size:10px;max-height:120px;overflow-y:auto;">
          ${samples.slice(0, 5).map(s => `<div style="padding:4px 0;border-bottom:1px solid #F1F5F9;color:#475569;font-family:monospace;">${s}</div>`).join('')}
          ${samples.length > 5 ? `<div style="padding:4px 0;color:#94A3B8;font-style:italic;">...dan ${samples.length - 5} lainnya</div>` : ''}
        </div>
      ` : ''}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// SHELL
// ═══════════════════════════════════════════════════════════════
function shell() {
  return `<div id="dq-content"></div>`;
}

// ═══════════════════════════════════════════════════════════════
// UPDATE
// ═══════════════════════════════════════════════════════════════
function update(container, state) {
  if (!state.rows || state.rows.length === 0) {
    patchHTML('#dq-content', `
      <div class="card" style="text-align:center; padding:40px;">
        <div style="font-size:48px; margin-bottom:12px;">📂</div>
        <div style="font-size:15px; font-weight:800; color:#64748B;">Belum Ada Data</div>
        <div style="font-size:12px; color:#94A3B8; margin-top:6px;">Upload file LBP & DMP terlebih dahulu di menu Data.</div>
      </div>
    `);
    return;
  }

  const audit = auditData(state);
  const score = calculateScore(audit);
  const sc = scoreColor(score.total);

  // Total issue count
  const totalIssues = Object.values(audit.stats).reduce((s, n) => s + n, 0);
  const issuesWithData = Object.entries(audit.stats).filter(([k, v]) => v > 0).length;

  patchHTML('#dq-content', `
    <!-- HEADER ENTERPRISE -->
    <div class="card mb12" style="background:linear-gradient(135deg, #0F172A 0%, #1E40AF 100%); color:#fff; padding:24px; border-radius:12px; position:relative; overflow:hidden;">
      <div style="position:absolute; top:-30px; right:-30px; width:150px; height:150px; background:rgba(59,130,246,0.15); border-radius:50%; filter:blur(30px);"></div>
      <div style="position:relative; z-index:1;">
        <div style="display:flex; align-items:center; gap:14px; margin-bottom:14px;">
          <div style="font-size:36px;">🏛️</div>
          <div>
            <div style="font-size:18px; font-weight:900; letter-spacing:-0.5px;">Data Quality Auditor</div>
            <div style="font-size:11px; color:#93C5FD; letter-spacing:1px; text-transform:uppercase;">Enterprise Data Governance Center</div>
          </div>
        </div>
        
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(100px, 1fr)); gap:10px;">
          <div style="background:rgba(255,255,255,0.1); padding:10px; border-radius:6px; text-align:center; backdrop-filter:blur(10px);">
            <div style="font-size:20px; font-weight:900;">${audit.totalRows.toLocaleString('id-ID')}</div>
            <div style="font-size:9px; color:#93C5FD; text-transform:uppercase; font-weight:800; margin-top:2px;">Baris LBP</div>
          </div>
          <div style="background:rgba(255,255,255,0.1); padding:10px; border-radius:6px; text-align:center; backdrop-filter:blur(10px);">
            <div style="font-size:20px; font-weight:900;">${audit.totalDMP.toLocaleString('id-ID')}</div>
            <div style="font-size:9px; color:#93C5FD; text-transform:uppercase; font-weight:800; margin-top:2px;">Master DMP</div>
          </div>
          <div style="background:rgba(255,255,255,0.1); padding:10px; border-radius:6px; text-align:center; backdrop-filter:blur(10px);">
            <div style="font-size:20px; font-weight:900;">${audit.totalFiles}</div>
            <div style="font-size:9px; color:#93C5FD; text-transform:uppercase; font-weight:800; margin-top:2px;">File</div>
          </div>
          <div style="background:rgba(220,38,38,0.3); padding:10px; border-radius:6px; text-align:center; border:1px solid rgba(220,38,38,0.5);">
            <div style="font-size:20px; font-weight:900;">${totalIssues}</div>
            <div style="font-size:9px; color:#FCA5A5; text-transform:uppercase; font-weight:800; margin-top:2px;">Total Issues</div>
          </div>
        </div>
      </div>
    </div>

    <!-- OVERALL SCORE -->
    <div class="card mb12" style="background:${sc.bg}; border:1px solid ${sc.border}30;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:center;">
        <div>
          <div style="font-size:11px; font-weight:800; color:#64748B; text-transform:uppercase; letter-spacing:1px;">Overall Data Quality</div>
          <div style="font-size:12px; font-weight:900; color:${sc.text}; margin-top:4px;">${sc.label}</div>
          <div style="font-size:10px; color:${sc.text}; opacity:0.8; margin-top:8px; line-height:1.5;">
            ${score.total >= 90 ? 'Data Anda siap untuk analisis tingkat lanjut.' :
              score.total >= 75 ? 'Data cukup baik, ada beberapa area yang perlu diperbaiki.' :
              score.total >= 50 ? 'Data perlu perbaikan sebelum analisis yang valid.' :
              '⚠️ Data memiliki masalah serius. Perbaiki sebelum menggunakan insight.'}
          </div>
        </div>
        <div>${renderGauge(score.total)}</div>
      </div>
    </div>

    <!-- 6 DIMENSIONS -->
    <div class="card mb12">
      <div style="font-size:11px; font-weight:900; text-transform:uppercase; color:#0F172A; margin-bottom:14px; letter-spacing:1px;">📊 Quality Dimensions</div>
      ${renderDimensionBar('Completeness', score.dimensions.completeness)}
      ${renderDimensionBar('Validity', score.dimensions.validity)}
      ${renderDimensionBar('Uniqueness', score.dimensions.uniqueness)}
      ${renderDimensionBar('Consistency', score.dimensions.consistency)}
      ${renderDimensionBar('Accuracy', score.dimensions.accuracy)}
      ${renderDimensionBar('Integrity', score.dimensions.integrity)}
    </div>

    <!-- ISSUES BREAKDOWN -->
    <div style="font-size:11px; font-weight:900; text-transform:uppercase; color:#0F172A; margin:16px 0 10px 4px; letter-spacing:1px;">🚨 Issue Audit (${issuesWithData} kategori terdeteksi)</div>

    ${renderIssueCard(
      'Duplicate Invoice',
      '📄',
      'high',
      audit.stats.duplicateCount,
      'Faktur yang sama muncul lebih dari sekali',
      audit.issues.duplicateInvoice.slice(0, 10).map(i => `${i.invoice} • ${i.product.slice(0, 20)} • ${compactRp(i.amount)} × ${i.count}`),
      { bg: '#FEF2F2', border: '#DC2626', text: '#991B1B' }
    )}

    ${renderIssueCard(
      'Orphan Outlet',
      '👻',
      'high',
      audit.stats.orphanCount,
      'Outlet di LBP yang tidak terdaftar di DMP',
      audit.issues.orphanOutlet.slice(0, 10).map(i => `${i.outletNo || '-'} • ${i.outlet} • ${i.rowCount} baris`),
      { bg: '#FEF2F2', border: '#DC2626', text: '#991B1B' }
    )}

    ${renderIssueCard(
      'Missing Mandatory Fields',
      '📋',
      'medium',
      audit.stats.missingCount,
      'Baris dengan field wajib kosong',
      audit.issues.missingMandatory.slice(0, 10).map(i => `Row ${i.row} • ${i.invoice} • Missing: ${i.missing.join(', ')}`),
      { bg: '#FFFBEB', border: '#F59E0B', text: '#92400E' }
    )}

    ${renderIssueCard(
      'Invalid Date',
      '📅',
      'medium',
      audit.stats.invalidDateCount,
      'Tanggal tidak valid atau di luar rentang wajar',
      audit.issues.invalidDate.slice(0, 10).map(i => `Row ${i.row} • ${i.day} • ${i.reason}`),
      { bg: '#FFFBEB', border: '#F59E0B', text: '#92400E' }
    )}

    ${renderIssueCard(
      'Negative Amount',
      '💸',
      'high',
      audit.stats.negativeCount,
      'Nilai transaksi negatif',
      audit.issues.negativeAmount.slice(0, 10).map(i => `Row ${i.row} • ${i.invoice} • ${compactRp(i.amount)} • ${i.day}`),
      { bg: '#FEF2F2', border: '#DC2626', text: '#991B1B' }
    )}

    ${renderIssueCard(
      'Zero Quantity',
      '0️⃣',
      'low',
      audit.stats.zeroQtyCount,
      'Transaksi dengan qty = 0',
      audit.issues.zeroQty.slice(0, 10).map(i => `Row ${i.row} • ${i.invoice} • ${i.product}`),
      { bg: '#F8FAFC', border: '#94A3B8', text: '#475569' }
    )}

    ${renderIssueCard(
      'Unknown Salesman',
      '👤',
      'medium',
      audit.stats.unknownSmCount,
      'Salesman di LBP tidak terdaftar di DMP',
      audit.issues.unknownSalesman.slice(0, 10).map(i => `${i.salesman} • ${i.transaksi} transaksi`),
      { bg: '#FFFBEB', border: '#F59E0B', text: '#92400E' }
    )}

    ${renderIssueCard(
      'Statistical Outliers',
      '📊',
      'low',
      audit.stats.outlierCount,
      'Transaksi dengan nilai ekstrem (>4σ dari rata-rata)',
      audit.issues.outlierAmount.slice(0, 10).map(i => `${i.outlet} • ${compactRp(i.amount)} • Z=${i.z.toFixed(1)}`),
      { bg: '#F8FAFC', border: '#94A3B8', text: '#475569' }
    )}

    ${renderIssueCard(
      'Inconsistent DMP',
      '⚠️',
      'medium',
      audit.stats.inconsistentDmpCount,
      'Outlet DMP tanpa salesman atau data tidak lengkap',
      audit.issues.inconsistentDMP.slice(0, 10).map(i => `${i.outletNo || '-'} • ${i.outlet} • ${i.reason}`),
      { bg: '#FFFBEB', border: '#F59E0B', text: '#92400E' }
    )}

    <!-- RECOMMENDATIONS -->
    <div class="card mb12" style="background:linear-gradient(135deg, #1E1B4B 0%, #7C3AED 100%); color:#fff; padding:16px;">
      <div style="font-size:11px; font-weight:900; text-transform:uppercase; margin-bottom:10px; opacity:0.9; letter-spacing:1px;">💡 Governance Recommendations</div>
      <div style="font-size:12px; line-height:1.7;">
        ${totalIssues === 0 ? `
          <div style="padding:12px; background:rgba(16,185,129,0.2); border-radius:6px; border-left:3px solid #10B981;">
            ✅ <b>Sempurna!</b> Tidak ada masalah data yang terdeteksi. Sistem siap untuk analisis enterprise.
          </div>
        ` : `
          ${audit.stats.duplicateCount > 0 ? `<div style="margin-bottom:8px;">🔴 <b>Prioritas 1:</b> Perbaiki ${audit.stats.duplicateCount} duplicate invoice. Ini akan menggelembungkan omset.</div>` : ''}
          ${audit.stats.orphanCount > 0 ? `<div style="margin-bottom:8px;">🔴 <b>Prioritas 2:</b> ${audit.stats.orphanCount} outlet di LBP tidak ada di DMP. Lengkapi master DMP atau perbaiki data LBP.</div>` : ''}
          ${audit.stats.negativeCount > 0 ? `<div style="margin-bottom:8px;">🟠 <b>Prioritas 3:</b> ${audit.stats.negativeCount} transaksi dengan amount negatif. Cek apakah retur atau error input.</div>` : ''}
          ${audit.stats.missingCount > 0 ? `<div style="margin-bottom:8px;">🟡 <b>Prioritas 4:</b> ${audit.stats.missingCount} baris memiliki field wajib kosong. Lengkapi data.</div>` : ''}
          ${audit.stats.unknownSmCount > 0 ? `<div style="margin-bottom:8px;">🟡 <b>Prioritas 5:</b> ${audit.stats.unknownSmCount} salesman tidak terdaftar di DMP. Perbaiki penugasan.</div>` : ''}
          ${audit.stats.inconsistentDmpCount > 0 ? `<div style="margin-bottom:8px;">🟢 <b>Housekeeping:</b> ${audit.stats.inconsistentDmpCount} outlet DMP tanpa salesman. Assign salesman agar tracking akurat.</div>` : ''}
        `}
      </div>
    </div>

    <!-- EXPORT -->
    <div class="card mb12" style="background:#F8FAFC; border:1px solid #E2E8F0;">
      <div style="font-size:11px; font-weight:900; color:#0F172A; margin-bottom:10px; letter-spacing:1px; text-transform:uppercase;">📥 Export Audit Report</div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px;">
        <button class="btn" id="dq-export-all" style="padding:10px; background:#1D4ED8; color:#fff; border:none; border-radius:6px; font-weight:800; font-size:11px; cursor:pointer;">
          📄 Export Audit Lengkap
        </button>
        <button class="btn" id="dq-export-dup" style="padding:10px; background:#DC2626; color:#fff; border:none; border-radius:6px; font-weight:800; font-size:11px; cursor:pointer;">
          📄 Export Duplicates
        </button>
        <button class="btn" id="dq-export-orphan" style="padding:10px; background:#F59E0B; color:#fff; border:none; border-radius:6px; font-weight:800; font-size:11px; cursor:pointer;">
          📄 Export Orphans
        </button>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="text-align:center; font-size:10px; color:#94A3B8; padding:16px 0; font-family:monospace;">
      Audit performed: ${new Date().toLocaleString('id-ID')} · M245 Enterprise DQ Engine v1.0
    </div>
  `);

  // Attach export handlers
  const exportAll = document.getElementById('dq-export-all');
  if (exportAll) exportAll.onclick = () => {
    const data = [
      { Kategori: 'SUMMARY', Metric: 'Data Quality Score', Value: score.total + '/100' },
      { Kategori: 'SUMMARY', Metric: 'Total Rows', Value: audit.totalRows },
      { Kategori: 'SUMMARY', Metric: 'Total DMP', Value: audit.totalDMP },
      { Kategori: 'DIMENSION', Metric: 'Completeness', Value: score.dimensions.completeness + '%' },
      { Kategori: 'DIMENSION', Metric: 'Validity', Value: score.dimensions.validity + '%' },
      { Kategori: 'DIMENSION', Metric: 'Uniqueness', Value: score.dimensions.uniqueness + '%' },
      { Kategori: 'DIMENSION', Metric: 'Consistency', Value: score.dimensions.consistency + '%' },
      { Kategori: 'DIMENSION', Metric: 'Accuracy', Value: score.dimensions.accuracy + '%' },
      { Kategori: 'DIMENSION', Metric: 'Integrity', Value: score.dimensions.integrity + '%' },
      ...Object.entries(audit.stats).map(([k, v]) => ({ Kategori: 'ISSUE', Metric: k, Value: v })),
    ];
    downloadCSV(data, `dq_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    toast('Audit report diekspor!');
  };

  const exportDup = document.getElementById('dq-export-dup');
  if (exportDup) exportDup.onclick = () => {
    const data = audit.issues.duplicateInvoice.map(i => ({
      Invoice: i.invoice, Product: i.product, Day: i.day,
      Amount: i.amount, Duplicates: i.count,
    }));
    if (data.length === 0) { toast('Tidak ada duplicate'); return; }
    downloadCSV(data, 'dq_duplicates.csv');
    toast('Duplicates diekspor!');
  };

  const exportOrphan = document.getElementById('dq-export-orphan');
  if (exportOrphan) exportOrphan.onclick = () => {
    const data = audit.issues.orphanOutlet.map(i => ({
      OutletNo: i.outletNo, Outlet: i.outlet, Salesman: i.salesman, Rows: i.rowCount,
    }));
    if (data.length === 0) { toast('Tidak ada orphan'); return; }
    downloadCSV(data, 'dq_orphans.csv');
    toast('Orphans diekspor!');
  };
}

registerView('dataquality', {
  label: 'Data Quality',
  title: 'Data Quality Auditor',
  sub: 'Enterprise Data Governance Center',
  shell,
  update,
});