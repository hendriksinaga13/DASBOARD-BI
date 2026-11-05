import { esc, compactRp, NF1, pct, fmtDateID } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered, selectAgg } from '../core/selectors.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';
import { toast } from '../ui/feedback.js';

// ═══════════════════════════════════════════════════════════════
// CLV CALCULATION ENGINE
// ═══════════════════════════════════════════════════════════════
function calculateCLV(rows) {
  // 1. Agregasi per outlet
  const outletMap = new Map();
  for (const r of rows) {
    if (r.tt !== 'F') continue;
    if (!outletMap.has(r.outletKey)) {
      outletMap.set(r.outletKey, {
        key: r.outletKey,
        name: r.outlet,
        salesman: r.salesman,
        kabupaten: r.kabupaten,
        tipe: r.tipe,
        firstDay: r.day,
        lastDay: r.day,
        totalRevenue: 0,
        totalInvoices: new Set(),
        days: new Set(),
        totalLines: 0,
      });
    }
    const o = outletMap.get(r.outletKey);
    if (r.day < o.firstDay) o.firstDay = r.day;
    if (r.day > o.lastDay) o.lastDay = r.day;
    o.totalRevenue += r.amount;
    o.totalInvoices.add(r.invoice);
    o.days.add(r.day);
    o.totalLines += 1;
  }

  // 2. Hitung metrik CLV untuk tiap outlet
  const outlets = [];
  for (const o of outletMap.values()) {
    const invoiceCount = o.totalInvoices.size;
    const activeDays = o.days.size;

    // AOV (Average Order Value)
    const aov = invoiceCount > 0 ? o.totalRevenue / invoiceCount : 0;

    // Purchase Frequency (per bulan)
    const firstDate = new Date(o.firstDay);
    const lastDate = new Date(o.lastDay);
    const daysDiff = Math.max(1, Math.round((lastDate - firstDate) / 86400000));
    const monthsSpan = Math.max(1, daysDiff / 30);
    const purchaseFreq = invoiceCount / monthsSpan; // kali order per bulan

    // Customer Lifespan (bulan) — estimasi dari aktivitas
    const lifespan = monthsSpan;

    // CLV = AOV × Freq × Lifespan (dalam bulan)
    const clv = aov * purchaseFreq * lifespan;

    // Recency (hari sejak order terakhir)
    const today = new Date();
    const daysSinceLast = Math.round((today - lastDate) / 86400000);

    // Avg IPT (Item per Transaction)
    const ipt = invoiceCount > 0 ? o.totalLines / invoiceCount : 0;

    outlets.push({
      ...o,
      invoiceCount,
      activeDays,
      aov,
      purchaseFreq,
      lifespan,
      clv,
      daysSinceLast,
      ipt,
      avgPerVisit: activeDays > 0 ? o.totalRevenue / activeDays : 0,
    });
  }

  // 3. Klasifikasi segmen berdasarkan CLV percentile
  outlets.sort((a, b) => b.clv - a.clv);
  const totalCLV = outlets.reduce((s, o) => s + o.clv, 0);

  outlets.forEach((o, i) => {
    const pctile = (i / outlets.length) * 100;
    if (pctile < 10) o.segment = 'whale';
    else if (pctile < 30) o.segment = 'dolphin';
    else if (pctile < 70) o.segment = 'fish';
    else o.segment = 'shrimp';
  });

  // 4. Agregasi per segmen
  const segments = {
    whale: { label: 'Whale', icon: '🐋', color: '#1D4ED8', bg: '#EFF6FF', outlets: [], clv: 0, revenue: 0, avgFreq: 0, avgAov: 0 },
    dolphin: { label: 'Dolphin', icon: '🐟', color: '#10B981', bg: '#F0FDF4', outlets: [], clv: 0, revenue: 0, avgFreq: 0, avgAov: 0 },
    fish: { label: 'Fish', icon: '🐠', color: '#F59E0B', bg: '#FFFBEB', outlets: [], clv: 0, revenue: 0, avgFreq: 0, avgAov: 0 },
    shrimp: { label: 'Shrimp', icon: '🦐', color: '#94A3B8', bg: '#F8FAFC', outlets: [], clv: 0, revenue: 0, avgFreq: 0, avgAov: 0 },
  };

  outlets.forEach(o => {
    const s = segments[o.segment];
    s.outlets.push(o);
    s.clv += o.clv;
    s.revenue += o.totalRevenue;
    s.avgFreq += o.purchaseFreq;
    s.avgAov += o.aov;
  });

  Object.keys(segments).forEach(k => {
    const s = segments[k];
    if (s.outlets.length > 0) {
      s.avgFreq /= s.outlets.length;
      s.avgAov /= s.outlets.length;
    }
  });

  return { outlets, segments, totalCLV, totalOutlets: outlets.length };
}

// ═══════════════════════════════════════════════════════════════
// SVG: Pareto Chart CLV
// ═══════════════════════════════════════════════════════════════
function generateParetoChart(outlets) {
  if (outlets.length < 5) return '';

  const W = 400, H = 140, PAD_L = 30, PAD_R = 10, PAD_T = 10, PAD_B = 20;
  const iw = W - PAD_L - PAD_R;
  const ih = H - PAD_T - PAD_B;

  // Cumulative CLV
  const totalCLV = outlets.reduce((s, o) => s + o.clv, 0);
  let cum = 0;
  const cumulative = outlets.map(o => {
    cum += o.clv;
    return (cum / totalCLV) * 100;
  });

  // Bars: revenue per outlet (top 20)
  const top = outlets.slice(0, 20);
  const maxRev = Math.max(...top.map(o => o.totalRevenue)) || 1;
  const barW = iw / top.length;

  let bars = '';
  top.forEach((o, i) => {
    const h = (o.totalRevenue / maxRev) * ih;
    bars += `<rect x="${(PAD_L + i * barW).toFixed(1)}" y="${(PAD_T + ih - h).toFixed(1)}" width="${(barW - 1).toFixed(1)}" height="${h.toFixed(1)}" fill="${o.segment === 'whale' ? '#1D4ED8' : o.segment === 'dolphin' ? '#10B981' : o.segment === 'fish' ? '#F59E0B' : '#94A3B8'}" opacity="0.85"/>`;
  });

  // Cumulative line
  let line = '';
  cumulative.slice(0, 20).forEach((v, i) => {
    const x = PAD_L + i * barW + barW / 2;
    const y = PAD_T + ih - (v / 100) * ih;
    if (i === 0) line += `M${x.toFixed(1)} ${y.toFixed(1)} `;
    else line += `L${x.toFixed(1)} ${y.toFixed(1)} `;
  });

  // 80% line
  const y80 = PAD_T + ih - 0.8 * ih;

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; display:block;">
      ${bars}
      <line x1="${PAD_L}" y1="${PAD_T + ih}" x2="${W - PAD_R}" y2="${PAD_T + ih}" stroke="#CBD5E1" stroke-width="1"/>
      <line x1="${PAD_L}" y1="${y80.toFixed(1)}" x2="${W - PAD_R}" y2="${y80.toFixed(1)}" stroke="#EF4444" stroke-width="1" stroke-dasharray="3,3"/>
      <text x="${W - PAD_R}" y="${y80 - 3}" font-size="7" fill="#EF4444" text-anchor="end" font-weight="700">80% CLV</text>
      <path d="${line}" fill="none" stroke="#DC2626" stroke-width="2" stroke-linejoin="round"/>
      <text x="${PAD_L}" y="${H - 4}" font-size="7" fill="#64748B">Top 20 outlet (urut by revenue)</text>
    </svg>`;
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
function shell() {
  return `
    <style>
      .clv-segment-card {
        border-radius: 12px;
        padding: 14px;
        margin-bottom: 12px;
        cursor: pointer;
        transition: all 0.2s;
        border: 1px solid #E2E8F0;
      }
      .clv-segment-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
      .clv-outlet-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid #F1F5F9;
        font-size: 11px;
        gap: 8px;
      }
      .clv-outlet-row:last-child { border-bottom: none; }
      .clv-outlet-name {
        font-weight: 700;
        color: #0F172A;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .clv-outlet-val {
        font-weight: 800;
        color: #1D4ED8;
        flex-shrink: 0;
      }
      .clv-outlet-meta {
        font-size: 9px;
        color: #64748B;
        margin-top: 2px;
      }
    </style>
    <div id="clv-content"></div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// UPDATE — Render halaman
// ═══════════════════════════════════════════════════════════════
function update(container, state) {
  const rows = selectFiltered(state).filter(r => r.tt === 'F');

  if (rows.length < 10) {
    patchHTML('#clv-content', `
      <div class="card" style="text-align:center; padding:40px;">
        <div style="font-size:48px; margin-bottom:12px;">📭</div>
        <div style="font-size:15px; font-weight:800; color:#64748B;">Belum Cukup Data</div>
        <div style="font-size:12px; color:#94A3B8; margin-top:6px;">Upload minimal 10 transaksi untuk analisis CLV.</div>
      </div>
    `);
    return;
  }

  const { outlets, segments, totalCLV, totalOutlets } = calculateCLV(rows);
  const totalRevenue = outlets.reduce((s, o) => s + o.totalRevenue, 0);
  const avgCLV = totalCLV / Math.max(1, totalOutlets);

  // Top 3 per segment
  const segOrder = ['whale', 'dolphin', 'fish', 'shrimp'];

  patchHTML('#clv-content', `
    <!-- HERO -->
    <div class="card mb12" style="background:linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%); color:#fff; padding:20px;">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
        <div style="font-size:32px;">🐋</div>
        <div>
          <div style="font-size:16px; font-weight:900;">Customer Lifetime Value</div>
          <div style="font-size:11px; color:#A78BFA;">Segmentasi outlet berdasarkan nilai jangka panjang</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        <div style="background:rgba(255,255,255,0.1); padding:12px; border-radius:8px;">
          <div style="font-size:9px; color:#A78BFA; text-transform:uppercase; font-weight:800;">Total CLV Portfolio</div>
          <div style="font-size:18px; font-weight:900; margin-top:4px;">${compactRp(totalCLV)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.1); padding:12px; border-radius:8px;">
          <div style="font-size:9px; color:#A78BFA; text-transform:uppercase; font-weight:800;">Avg CLV / Outlet</div>
          <div style="font-size:18px; font-weight:900; margin-top:4px;">${compactRp(avgCLV)}</div>
        </div>
      </div>
    </div>

    <!-- SEGMENT CARDS -->
    <div class="tiny" style="font-weight:800; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px; color:#64748B;">4 Segmen Outlet</div>

    ${segOrder.map(key => {
      const s = segments[key];
      if (s.outlets.length === 0) return '';
      const pctPortfolio = totalCLV > 0 ? (s.clv / totalCLV) * 100 : 0;
      return `
        <div class="clv-segment-card" style="background:${s.bg}; border-left:4px solid ${s.color};" data-segment="${key}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
            <div>
              <div style="font-size:15px; font-weight:900; color:${s.color};">${s.icon} ${s.label}</div>
              <div style="font-size:10px; color:#64748B; margin-top:2px;">${s.outlets.length} outlet · ${pct(pctPortfolio)} portofolio</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:14px; font-weight:900; color:${s.color};">${compactRp(s.clv)}</div>
              <div style="font-size:9px; color:#64748B;">Total CLV</div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:10px; margin-bottom:10px;">
            <div style="background:rgba(255,255,255,0.6); padding:6px; border-radius:4px;">
              <div style="color:#64748B; font-size:8px; font-weight:800; text-transform:uppercase;">Freq/Bln</div>
              <div style="font-weight:900; color:#0F172A; margin-top:2px;">${NF1.format(s.avgFreq)}×</div>
            </div>
            <div style="background:rgba(255,255,255,0.6); padding:6px; border-radius:4px;">
              <div style="color:#64748B; font-size:8px; font-weight:800; text-transform:uppercase;">Avg Order</div>
              <div style="font-weight:900; color:#0F172A; margin-top:2px;">${compactRp(s.avgAov)}</div>
            </div>
          </div>

          <!-- Top 3 Outlet per Segmen -->
          <div style="background:rgba(255,255,255,0.7); border-radius:6px; padding:8px;">
            <div style="font-size:9px; font-weight:800; color:#64748B; text-transform:uppercase; margin-bottom:6px;">Top 3 Outlet</div>
            ${s.outlets.slice(0, 3).map((o, i) => `
              <div class="clv-outlet-row">
                <div style="flex:1; min-width:0;">
                  <div class="clv-outlet-name">${i+1}. ${esc(o.name)}</div>
                  <div class="clv-outlet-meta">AOV ${compactRp(o.aov)} · ${NF1.format(o.purchaseFreq)}×/bln</div>
                </div>
                <div class="clv-outlet-val">${compactRp(o.clv)}</div>
              </div>
            `).join('')}
          </div>

          <button class="btn sm" data-view-seg="${key}" style="width:100%; margin-top:10px; background:${s.color}; color:#fff; border:none; font-weight:800; padding:8px; border-radius:6px; cursor:pointer;">
            Lihat Semua ${s.outlets.length} Outlet →
          </button>
        </div>
      `;
    }).join('')}

    <!-- PARETO CHART -->
    <div class="card mb12" style="margin-top:16px;">
      <div style="font-size:11px; font-weight:900; text-transform:uppercase; color:#0F172A; margin-bottom:10px;">
        📊 Pareto Analysis — 80/20 Rule
      </div>
      <div style="font-size:10px; color:#64748B; line-height:1.5; margin-bottom:12px;">
        Grafik menunjukkan: <b>20% outlet teratas</b> (biru/hijau) menyumbang <b>80% revenue</b>. Ini prinsip Pareto yang harus Anda sadari saat alokasi resource.
      </div>
      ${generateParetoChart(outlets)}
    </div>

    <!-- INSIGHT STRATEGIS -->
    <div class="card mb12" style="background:#F0FDF4; border-left:4px solid #10B981;">
      <div style="font-size:12px; font-weight:900; color:#166534; margin-bottom:8px;">💡 Insight Strategis</div>
      <div style="font-size:11px; color:#166534; line-height:1.7;">
        ${generateInsightText(segments, totalCLV, totalRevenue)}
      </div>
    </div>
  `);

  // Attach handlers
  document.querySelectorAll('[data-view-seg]').forEach(btn => {
    btn.onclick = () => {
      const seg = btn.dataset.viewSeg;
      // Filter outlets by segment name
      const names = segments[seg].outlets.map(o => o.name);
      store.state.filters.outlet = new Set(names.map(n => n));
      store.set({ view: 'outlet' });
      toast(`${segments[seg].label}: ${names.length} outlet — filter diterapkan`);
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// INSIGHT TEXT GENERATOR
// ═══════════════════════════════════════════════════════════════
function generateInsightText(segments, totalCLV, totalRevenue) {
  const whalePct = totalCLV > 0 ? (segments.whale.clv / totalCLV) * 100 : 0;
  const shrimpPct = totalCLV > 0 ? (segments.shrimp.clv / totalCLV) * 100 : 0;

  const insights = [];

  if (whalePct > 60) {
    insights.push(`🐋 <b>${segments.whale.outlets.length} Whale</b> menyumbang <b>${pct(whalePct)}</b> total CLV — bisnis Anda sangat bergantung pada segelintir outlet besar. <b>Saran:</b> berikan layanan VIP (kunjungan rutin, prioritas stok).`);
  } else if (whalePct > 40) {
    insights.push(`🐋 Segmen <b>Whale</b> menyumbang ${pct(whalePct)} CLV — distribusi cukup sehat.`);
  }

  if (shrimpPct > 20) {
    insights.push(`🦐 <b>${segments.shrimp.outlets.length} Shrimp</b> hanya menyumbang ${pct(shrimpPct)} CLV — pertimbangkan efisiensi kunjungan (kurangi frekuensi atau bundling dengan outlet lain di wilayah sama).`);
  }

  if (segments.dolphin.outlets.length > 0) {
    const potential = segments.dolphin.avgFreq < segments.whale.avgFreq * 0.7;
    if (potential) {
      insights.push(`🐟 <b>${segments.dolphin.outlets.length} Dolphin</b> punya potensi jadi Whale — frekuensi order mereka (${NF1.format(segments.dolphin.avgFreq)}×/bln) masih di bawah Whale (${NF1.format(segments.whale.avgFreq)}×/bln). <b>Saran:</b> fokus up-sell & bundling ke segmen ini.`);
    }
  }

  return insights.length > 0 ? insights.map(i => `<div style="margin-bottom:8px;">${i}</div>`).join('') : 'Portofolio outlet Anda seimbang dan sehat.';
}

// ═══════════════════════════════════════════════════════════════
// REGISTER VIEW
// ═══════════════════════════════════════════════════════════════
registerView('clv', {
  label: 'CLV Analytics',
  title: 'Customer Lifetime Value',
  sub: 'Segmentasi nilai jangka panjang outlet',
  shell,
  update,
});