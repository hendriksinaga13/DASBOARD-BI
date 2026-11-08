import { esc, compactRp, NF1, pct, fmtDateID } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered } from '../core/selectors.js';
import { mean, stdev, pearson } from '../analytics/stats-advanced.js';
import { registerView } from './registry.js';

// ═══════════════════════════════════════════════════════════════
// CORRELATION MATRIX — Pearson r antar 6 metrik
// ═══════════════════════════════════════════════════════════════
function computeCorrelationMatrix(rows) {
  const byOutlet = new Map();
  for (const r of rows) {
    if (r.tt !== 'F') continue;
    if (!byOutlet.has(r.outletKey)) byOutlet.set(r.outletKey, {
      omset: 0, qty: 0, invoices: new Set(), days: new Set(),
      discount: 0, lines: 0
    });
    const o = byOutlet.get(r.outletKey);
    o.omset += r.amount;
    o.qty += r.netQty || 0;
    o.invoices.add(r.invoice);
    o.days.add(r.day);
    o.discount += (r.disc + r.disc1kh + r.pro);
    o.lines += 1;
  }

  const arrays = { omset: [], aov: [], freq: [], ipt: [], qty: [], discount: [] };
  for (const o of byOutlet.values()) {
    const invCount = o.invoices.size;
    if (invCount === 0) continue;
    arrays.omset.push(o.omset);
    arrays.aov.push(o.omset / invCount);
    arrays.freq.push(o.days.size);
    arrays.ipt.push(o.lines / invCount);
    arrays.qty.push(o.qty);
    arrays.discount.push(o.omset > 0 ? (o.discount / o.omset) * 100 : 0);
  }

  const keys = Object.keys(arrays);
  const matrix = keys.map(k1 => ({
    key: k1,
    values: keys.map(k2 => pearson(arrays[k1], arrays[k2]))
  }));
  return { keys, matrix, count: arrays.omset.length, arrays };
}

// ═══════════════════════════════════════════════════════════════
// SIMPLE LINEAR REGRESSION: y = a + bx
// ═══════════════════════════════════════════════════════════════
function simpleRegression(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = my - slope * mx;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  return { slope, intercept, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

// ═══════════════════════════════════════════════════════════════
// DAY OF WEEK SEASONALITY
// ═══════════════════════════════════════════════════════════════
function dayOfWeekAnalysis(rows) {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const byDow = Array.from({ length: 7 }, () => []);
  for (const r of rows) {
    if (r.tt !== 'F') continue;
    const d = new Date(r.day + 'T00:00:00Z');
    byDow[d.getUTCDay()].push(r.amount);
  }
  return days.map((name, i) => ({
    name,
    total: byDow[i].reduce((s, v) => s + v, 0),
    count: byDow[i].length,
    avg: byDow[i].length > 0 ? byDow[i].reduce((s, v) => s + v, 0) / byDow[i].length : 0
  }));
}

// ═══════════════════════════════════════════════════════════════
// COEFFICIENT OF VARIATION (Consistency)
// ═══════════════════════════════════════════════════════════════
function cvRanking(rows) {
  const bySalesman = new Map();
  for (const r of rows) {
    if (r.tt !== 'F') continue;
    if (!bySalesman.has(r.salesman)) bySalesman.set(r.salesman, []);
    bySalesman.get(r.salesman).push(r.amount);
  }
  const result = [];
  for (const [sm, vals] of bySalesman) {
    if (vals.length < 3) continue;
    const mu = mean(vals);
    const sd = stdev(vals);
    result.push({ name: sm, cv: mu > 0 ? sd / mu : 0, mean: mu, stdev: sd });
  }
  return result.sort((a, b) => a.cv - b.cv);
}

// ═══════════════════════════════════════════════════════════════
// Z-SCORE ANOMALY DETECTION
// ═══════════════════════════════════════════════════════════════
function zScoreAnomalies(rows) {
  const amounts = rows.filter(r => r.tt === 'F').map(r => r.amount);
  if (amounts.length < 10) return [];
  const mu = mean(amounts);
  const sd = stdev(amounts);
  if (sd === 0) return [];
  return rows.filter(r => r.tt === 'F')
    .map(r => ({ ...r, z: (r.amount - mu) / sd }))
    .filter(r => Math.abs(r.z) > 2.5)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, 8);
}

// ═══════════════════════════════════════════════════════════════
// HEATMAP RENDERER
// ═══════════════════════════════════════════════════════════════
function renderHeatmap(matrix) {
  const getColor = (v) => {
    const a = Math.abs(v);
    if (v > 0.7) return '#15803D';
    if (v > 0.4) return '#22C55E';
    if (v > 0.1) return '#84CC16';
    if (v > -0.1) return '#94A3B8';
    if (v > -0.4) return '#F97316';
    if (v > -0.7) return '#DC2626';
    return '#991B1B';
  };

  return `
    <div style="overflow-x:auto; -webkit-overflow-scrolling:touch;">
      <table style="width:100%; border-collapse:collapse; font-size:10px; min-width:420px;">
        <thead>
          <tr>
            <th style="padding:8px 6px; background:#F1F5F9; border:1px solid #E2E8F0; font-size:8px;"></th>
            ${matrix.keys.map(k => `<th style="padding:8px 6px; background:#F1F5F9; border:1px solid #E2E8F0; font-weight:900; text-transform:uppercase; font-size:8px;">${k}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${matrix.matrix.map(row => `
            <tr>
              <td style="padding:8px 6px; background:#F1F5F9; border:1px solid #E2E8F0; font-weight:900; text-transform:uppercase; font-size:8px;">${row.key}</td>
              ${row.values.map(v => `
                <td style="padding:8px 6px; border:1px solid #E2E8F0; text-align:center; background:${getColor(v)}25; color:${getColor(v)}; font-weight:900; font-family:monospace; font-size:10px;">
                  ${v.toFixed(2)}
                </td>
              `).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function shell() {
  return `<div id="driver-content"></div>`;
}

function update(container, state) {
  const rows = selectFiltered(state);
  if (rows.length < 30) {
    patchHTML('#driver-content', `
      <div class="card" style="text-align:center; padding:40px;">
        <div style="font-size:48px; margin-bottom:12px;">📭</div>
        <div style="font-size:15px; font-weight:800; color:#64748B;">Belum Cukup Data</div>
        <div style="font-size:12px; color:#94A3B8; margin-top:6px;">Upload minimal 30 transaksi untuk analisis statistik lanjutan.</div>
      </div>
    `);
    return;
  }

  const corr = computeCorrelationMatrix(rows);
  const regFreq = simpleRegression(corr.arrays.freq, corr.arrays.aov);
  const regIpt = simpleRegression(corr.arrays.ipt, corr.arrays.aov);
  const dow = dayOfWeekAnalysis(rows);
  const cvList = cvRanking(rows);
  const anomalies = zScoreAnomalies(rows);

  const omsetIdx = corr.keys.indexOf('omset');
  let topCorr = { key: 'aov', val: 0 };
  corr.keys.forEach((k, i) => {
    if (i === omsetIdx) return;
    if (Math.abs(corr.matrix[omsetIdx].values[i]) > Math.abs(topCorr.val)) {
      topCorr = { key: k, val: corr.matrix[omsetIdx].values[i] };
    }
  });

  const sortedDow = [...dow].filter(d => d.count > 0).sort((a, b) => b.avg - a.avg);
  const bestDay = sortedDow[0];
  const worstDay = sortedDow[sortedDow.length - 1];

  const synthesis = [];
  if (regIpt && regIpt.r2 > 0.3) {
    synthesis.push(`📈 <b>IPT (Item per Transaction)</b> berpengaruh signifikan ke AOV (R²=${regIpt.r2.toFixed(2)}). Setiap +1 item = +${compactRp(regIpt.slope)}. Latih salesman cross-selling.`);
  }
  if (bestDay && worstDay && bestDay.avg > worstDay.avg * 1.5) {
    synthesis.push(`📅 <b>${bestDay.name}</b> adalah hari terkuat (${compactRp(bestDay.avg)}), <b>${worstDay.name}</b> terlemah. Push promo di hari lemah, kurangi kunjungan di hari kuat.`);
  }
  if (cvList.length > 0 && cvList[cvList.length - 1].cv > 1.5) {
    synthesis.push(`📉 <b>${esc(cvList[cvList.length - 1].name)}</b> paling fluktuatif (CV=${cvList[cvList.length - 1].cv.toFixed(2)}). Review stabilitas performa.`);
  }
  if (Math.abs(topCorr.val) > 0.7) {
    synthesis.push(`🎯 <b>${topCorr.key.toUpperCase()}</b> korelasi sangat kuat dengan Omset (r=${topCorr.val.toFixed(2)}). Ini lever utama bisnis.`);
  }
  if (anomalies.length > 3) {
    synthesis.push(`🚨 Terdeteksi ${anomalies.length} transaksi outlier (|Z|>2.5). Perlu investigasi.`);
  }

  patchHTML('#driver-content', `
    <div class="card mb12" style="background:linear-gradient(135deg,#0F172A 0%,#1E1B4B 100%);color:#fff;padding:20px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:32px;">🔬</div>
        <div>
          <div style="font-size:16px;font-weight:900;">Statistical Driver Analysis</div>
          <div style="font-size:11px;color:#A78BFA;">Correlation · Regression · Seasonality · Anomaly</div>
        </div>
      </div>
    </div>

    <div class="card mb12" style="background:#F0FDF4;border-left:4px solid #10B981;padding:14px;">
      <div style="font-size:11px;font-weight:900;color:#166534;text-transform:uppercase;margin-bottom:8px;">🎯 PRIMARY DRIVER</div>
      <div style="font-size:13px;color:#166534;line-height:1.6;">
        Faktor paling berkorelasi dengan Omset adalah <b style="color:#0F172A;font-size:15px;">${topCorr.key.toUpperCase()}</b> 
        (r = <b>${topCorr.val.toFixed(3)}</b>, ${Math.abs(topCorr.val) > 0.7 ? 'sangat kuat' : Math.abs(topCorr.val) > 0.4 ? 'kuat' : 'sedang'} ${topCorr.val > 0 ? 'positif' : 'negatif'}).
      </div>
    </div>

    <div class="card mb12">
      <div style="font-size:11px;font-weight:900;text-transform:uppercase;color:#0F172A;margin-bottom:8px;">📊 Correlation Matrix</div>
      <div style="font-size:10px;color:#64748B;margin-bottom:10px;line-height:1.5;">Nilai r dari -1 hingga +1. Makin mendekati +1 = hubungan positif kuat.</div>
      ${renderHeatmap(corr)}
      <div style="font-size:9px;color:#94A3B8;margin-top:10px;font-style:italic;">n = ${corr.count} outlet</div>
    </div>

    <div class="card mb12">
      <div style="font-size:11px;font-weight:900;text-transform:uppercase;color:#0F172A;margin-bottom:10px;">📈 Regression (Predictive)</div>
      ${regFreq ? `
        <div style="padding:12px;background:#F8FAFC;border-radius:6px;margin-bottom:8px;">
          <div style="font-size:10px;font-weight:800;color:#64748B;text-transform:uppercase;">Frekuensi Kunjungan → AOV</div>
          <div style="font-size:14px;font-weight:900;color:#0F172A;margin-top:4px;">Setiap +1 kunjungan = AOV +${compactRp(regFreq.slope)}</div>
          <div style="font-size:10px;color:#64748B;margin-top:4px;">R² = ${regFreq.r2.toFixed(3)} (menjelaskan ${(regFreq.r2*100).toFixed(1)}% variance)</div>
        </div>
      ` : ''}
      ${regIpt ? `
        <div style="padding:12px;background:#F8FAFC;border-radius:6px;">
          <div style="font-size:10px;font-weight:800;color:#64748B;text-transform:uppercase;">IPT → AOV</div>
          <div style="font-size:14px;font-weight:900;color:#0F172A;margin-top:4px;">Setiap +1 item = AOV +${compactRp(regIpt.slope)}</div>
          <div style="font-size:10px;color:#64748B;margin-top:4px;">R² = ${regIpt.r2.toFixed(3)} (menjelaskan ${(regIpt.r2*100).toFixed(1)}% variance)</div>
        </div>
      ` : ''}
    </div>

    <div class="card mb12">
      <div style="font-size:11px;font-weight:900;text-transform:uppercase;color:#0F172A;margin-bottom:10px;">📅 Seasonality</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:6px;">
        ${dow.map(d => {
          const isBest = d.name === bestDay?.name;
          const isWorst = d.name === worstDay?.name;
          return `
            <div style="padding:10px;background:${isBest?'#F0FDF4':(isWorst?'#FEF2F2':'#F8FAFC')};border:1px solid ${isBest?'#10B981':(isWorst?'#EF4444':'#E2E8F0')};border-radius:6px;text-align:center;">
              <div style="font-size:9px;font-weight:800;color:#64748B;text-transform:uppercase;">${d.name}</div>
              <div style="font-size:11px;font-weight:900;color:#0F172A;margin-top:4px;">${compactRp(d.avg)}</div>
              <div style="font-size:8px;color:#94A3B8;margin-top:2px;">${d.count} hari</div>
              ${isBest?'<div style="font-size:8px;color:#10B981;font-weight:800;margin-top:2px;">🏆 BEST</div>':''}
              ${isWorst?'<div style="font-size:8px;color:#EF4444;font-weight:800;margin-top:2px;">⚠️ WORST</div>':''}
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div class="card mb12">
      <div style="font-size:11px;font-weight:900;text-transform:uppercase;color:#0F172A;margin-bottom:10px;">📉 Consistency Ranking</div>
      <div style="font-size:10px;color:#64748B;margin-bottom:10px;">CV rendah = stabil, tinggi = fluktuatif.</div>
      ${cvList.slice(0, 5).map((sm, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:${i===0?'#F0FDF4':'#F8FAFC'};border-radius:6px;margin-bottom:6px;">
          <div>
            <div style="font-size:11px;font-weight:800;color:#0F172A;">${i+1}. ${esc(sm.name)}</div>
            <div style="font-size:9px;color:#64748B;">Avg ${compactRp(sm.mean)} · σ ${compactRp(sm.stdev)}</div>
          </div>
          <div style="font-size:14px;font-weight:900;color:${sm.cv < 0.5 ? '#10B981' : (sm.cv < 1 ? '#F59E0B' : '#EF4444')};">${sm.cv.toFixed(2)}</div>
        </div>
      `).join('')}
    </div>

    ${anomalies.length > 0 ? `
      <div class="card mb12">
        <div style="font-size:11px;font-weight:900;text-transform:uppercase;color:#0F172A;margin-bottom:10px;">🚨 Statistical Anomalies</div>
        ${anomalies.slice(0, 5).map(a => `
          <div style="padding:10px;background:${a.z>0?'#EFF6FF':'#FEF2F2'};border-left:3px solid ${a.z>0?'#3B82F6':'#EF4444'};border-radius:4px;margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;gap:8px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:11px;font-weight:800;color:#0F172A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(a.outlet)}</div>
                <div style="font-size:9px;color:#64748B;">${esc(a.product)} · ${fmtDateID(a.day)}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:11px;font-weight:900;color:#0F172A;">${compactRp(a.amount)}</div>
                <div style="font-size:9px;color:${a.z>0?'#3B82F6':'#EF4444'};font-weight:800;">Z=${a.z.toFixed(2)}</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="card" style="background:linear-gradient(135deg,#7C3AED 0%,#1D4ED8 100%);color:#fff;padding:16px;">
      <div style="font-size:11px;font-weight:900;text-transform:uppercase;margin-bottom:8px;opacity:0.8;">💡 Expert Synthesis</div>
      <div style="font-size:12px;line-height:1.7;">
        ${synthesis.length > 0 ? synthesis.map(s => `<div style="margin-bottom:8px;">${s}</div>`).join('') : 'Data stabil tanpa pola signifikan.'}
      </div>
    </div>
  `);
}

registerView('driver', {
  label: 'Driver Analysis',
  title: 'Statistical Driver Analysis',
  sub: 'Correlation · Regression · Seasonality',
  shell,
  update,
});