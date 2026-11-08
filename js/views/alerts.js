import { esc, compactRp, fmtDateID, NF1 } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered, selectAgg } from '../core/selectors.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';
import { mean, stdev, median, mad } from '../analytics/stats-advanced.js';
import { toast } from '../ui/feedback.js';

// ═══════════════════════════════════════════════════════════════
// ANOMALY DETECTORS
// ═══════════════════════════════════════════════════════════════

function detectOutletDrop(rows) {
  const outletHistory = new Map();
  for (const r of rows) {
    if (r.tt !== 'F') continue;
    if (!outletHistory.has(r.outletKey)) {
      outletHistory.set(r.outletKey, { name: r.outlet, salesman: r.salesman, days: [], total: 0 });
    }
    const o = outletHistory.get(r.outletKey);
    o.days.push(r.day);
    o.total += r.amount;
  }
  
  const dates = Array.from(new Set(rows.filter(r=>r.tt==='F').map(r=>r.day))).sort();
  if (dates.length < 14) return [];
  
  const midDay = dates[Math.floor(dates.length / 2)];
  const alerts = [];
  
  for (const [key, o] of outletHistory) {
    const before = o.days.filter(d => d <= midDay).length;
    const after = o.days.filter(d => d > midDay).length;
    if (before >= 3 && after === 0) {
      alerts.push({
        type: 'outlet_drop',
        severity: 'high',
        title: 'Outlet Berhenti Membeli',
        desc: `${o.name} aktif ${before} kali di paruh awal periode, tapi silent di paruh akhir.`,
        impact: -(o.total / before),
        context: { Outlet: o.name, Salesman: o.salesman, 'Aktif Sebelumnya': `${before} kali` },
        recommendation: 'Kunjungi outlet segera. Cek stok, harga, atau kompetitor.',
        navigate: { view: 'outlet' }
      });
    }
  }
  
  return alerts.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 10);
}

function detectPriceAnomaly(rows) {
  const byDay = new Map();
  for (const r of rows) {
    if (r.tt !== 'F') continue;
    if (!byDay.has(r.day)) byDay.set(r.day, []);
    byDay.get(r.day).push(r);
  }
  
  const alerts = [];
  for (const [day, dayRows] of byDay) {
    const discPcts = dayRows.map(r => {
      const disc = r.disc + r.disc1kh + r.pro;
      return r.amount > 0 ? (disc / r.amount) * 100 : 0;
    });
    if (discPcts.length < 5) continue;
    
    const mu = mean(discPcts);
    const sd = stdev(discPcts);
    if (sd === 0) continue;
    
    dayRows.forEach((r) => {
      const disc = r.disc + r.disc1kh + r.pro;
      const pct = r.amount > 0 ? (disc / r.amount) * 100 : 0;
      const z = (pct - mu) / sd;
      if (z > 2.5 && pct > 15) {
        alerts.push({
          type: 'price_anomaly',
          severity: 'medium',
          title: 'Diskon Abnormal Terdeteksi',
          desc: `${r.outlet} dari ${r.salesman} dapat diskon ${pct.toFixed(1)}% (rata-rata hari: ${mu.toFixed(1)}%) pada ${fmtDateID(day)}.`,
          impact: -disc,
          context: { Outlet: r.outlet, Salesman: r.salesman, Produk: r.product, Faktur: r.invoice, Tanggal: fmtDateID(day), Diskon: pct.toFixed(1) + '%' },
          recommendation: 'Review approval diskon. Pastikan tidak menggerus margin berlebihan.',
          navigate: { view: 'salesman' }
        });
      }
    });
  }
  
  return alerts.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 8);
}

function detectQuietDays(rows) {
  const dates = Array.from(new Set(rows.filter(r=>r.tt==='F').map(r=>r.day))).sort();
  if (dates.length < 7) return [];
  
  const byDay = new Map();
  for (const r of rows) {
    if (r.tt !== 'F') continue;
    byDay.set(r.day, (byDay.get(r.day) || 0) + r.amount);
  }
  
  const dailyVals = dates.map(d => byDay.get(d) || 0);
  const med = median(dailyVals);
  const md = mad(dailyVals);
  
  const alerts = [];
  dates.forEach((d, i) => {
    const v = dailyVals[i];
    if (md > 0 && v < med * 0.3 && med > 0) {
      alerts.push({
        type: 'quiet_day',
        severity: 'medium',
        title: 'Hari dengan Penjualan Sangat Rendah',
        desc: `${fmtDateID(d)} hanya ${compactRp(v)}, jauh di bawah median harian ${compactRp(med)}.`,
        impact: -(med - v),
        context: { Tanggal: fmtDateID(d), Omset: compactRp(v), 'Median Harian': compactRp(med) },
        recommendation: 'Investigasi: apakah hari libur, sistem down, atau tim sales tidak aktif?',
        navigate: { view: 'overview' }
      });
    }
  });
  
  return alerts.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 5);
}

function detectSpikeOrders(rows) {
  const amounts = rows.filter(r => r.tt === 'F').map(r => r.amount);
  if (amounts.length < 20) return [];
  
  const med = median(amounts);
  const md = mad(amounts);
  if (md === 0 || med === 0) return [];
  
  const alerts = [];
  const seen = new Set();
  
  for (const r of rows) {
    if (r.tt !== 'F') continue;
    const z = (r.amount - med) / md;
    if (z > 4 && r.amount > med * 5) {
      const key = r.invoice + '|' + r.product;
      if (seen.has(key)) continue;
      seen.add(key);
      
      alerts.push({
        type: 'spike_order',
        severity: 'info',
        title: 'Orderan Besar Tidak Biasa',
        desc: `${r.outlet} memesan ${r.product} senilai ${compactRp(r.amount)} (${z.toFixed(1)}σ di atas normal).`,
        impact: r.amount,
        context: { Outlet: r.outlet, Produk: r.product, Faktur: r.invoice, Tanggal: fmtDateID(r.day), Nilai: compactRp(r.amount) },
        recommendation: 'Pastikan order valid. Bisa jadi prospek grosir atau bulk order.',
        navigate: { view: 'topoutlet' }
      });
    }
  }
  
  return alerts.sort((a, b) => b.impact - a.impact).slice(0, 8);
}

function detectReturnSpike(rows) {
  const returns = rows.filter(r => r.tt === 'R');
  if (returns.length === 0) return [];
  
  const byDay = new Map();
  for (const r of returns) {
    byDay.set(r.day, (byDay.get(r.day) || 0) + r.amount);
  }
  
  const dailyReturns = Array.from(byDay.values());
  if (dailyReturns.length < 3) {
    return returns.slice(0, 5).map(r => ({
      type: 'return_spike',
      severity: 'medium',
      title: 'Return Terdeteksi',
      desc: `${r.outlet} mengembalikan ${r.product} senilai ${compactRp(r.amount)} pada ${fmtDateID(r.day)}.`,
      impact: -r.amount,
      context: { Outlet: r.outlet, Produk: r.product, Faktur: r.invoice, Tanggal: fmtDateID(r.day) },
      recommendation: 'Cek kondisi produk. Apakah rusak, expired, atau salah kirim?',
      navigate: { view: 'product' }
    }));
  }
  
  const med = median(dailyReturns);
  const alerts = [];
  
  for (const [day, amt] of byDay) {
    if (med > 0 && amt > med * 3) {
      alerts.push({
        type: 'return_spike',
        severity: 'high',
        title: 'Lonjakan Return',
        desc: `Tanggal ${fmtDateID(day)} terdapat return sebesar ${compactRp(amt)}, ${(amt/med).toFixed(1)}x lipat dari rata-rata harian.`,
        impact: -amt,
        context: { Tanggal: fmtDateID(day), 'Total Return': compactRp(amt), 'Rata-rata Harian': compactRp(med) },
        recommendation: 'Periksa kualitas produk & handling gudang. Mungkin ada batch bermasalah.',
        navigate: { view: 'product' }
      });
    }
  }
  
  return alerts.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 5);
}

function detectSalesmanInactivity(rows) {
  const dates = Array.from(new Set(rows.filter(r=>r.tt==='F').map(r=>r.day))).sort();
  if (dates.length < 7) return [];
  
  const lastDays = dates.slice(-7);
  const salesmen = new Set(rows.filter(r=>r.tt==='F').map(r => r.salesman));
  const salesmenActive = new Set(rows.filter(r=>r.tt==='F' && lastDays.includes(r.day)).map(r => r.salesman));
  
  const alerts = [];
  for (const sm of salesmen) {
    if (sm === '—' || sm === '') continue;
    if (!salesmenActive.has(sm)) {
      alerts.push({
        type: 'salesman_inactive',
        severity: 'critical',
        title: 'Salesman Tidak Aktif',
        desc: `${sm} tidak melakukan transaksi selama 7 hari terakhir (${fmtDateID(lastDays[0])} - ${fmtDateID(lastDays[lastDays.length-1])}).`,
        impact: 0,
        context: { Salesman: sm, Periode: `7 hari terakhir`, Status: 'TIDAK ADA TRANSAKSI' },
        recommendation: 'Hubungi salesman segera. Cek apakah cuti, sakit, atau ada masalah.',
        navigate: { view: 'salesman' }
      });
    }
  }
  
  return alerts;
}

function detectConcentration(rows) {
  const byDay = new Map();
  for (const r of rows) {
    if (r.tt !== 'F') continue;
    if (!byDay.has(r.day)) byDay.set(r.day, { total: 0, outlets: new Map() });
    const d = byDay.get(r.day);
    d.total += r.amount;
    d.outlets.set(r.outlet, (d.outlets.get(r.outlet) || 0) + r.amount);
  }
  
  const alerts = [];
  for (const [day, d] of byDay) {
    if (d.total === 0) continue;
    const top = Array.from(d.outlets.entries()).sort((a,b)=>b[1]-a[1])[0];
    const pct = (top[1] / d.total) * 100;
    if (pct > 60 && d.outlets.size >= 3) {
      alerts.push({
        type: 'concentration',
        severity: 'info',
        title: 'Konsentrasi Penjualan Tinggi',
        desc: `${top[0]} menyumbang ${pct.toFixed(1)}% dari total penjualan pada ${fmtDateID(day)}.`,
        impact: top[1],
        context: { Tanggal: fmtDateID(day), Outlet: top[0], Kontribusi: pct.toFixed(1) + '%', 'Total Hari': compactRp(d.total) },
        recommendation: 'Diversifikasi: pastikan tidak bergantung pada satu outlet di hari itu.',
        navigate: { view: 'outlet' }
      });
    }
  }
  
  return alerts.sort((a, b) => b.impact - a.impact).slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════
// MAIN DETECTION
// ═══════════════════════════════════════════════════════════════
function runDetection(state) {
  const rows = selectFiltered(state);
  if (rows.length < 10) return [];
  
  const alerts = [
    ...detectOutletDrop(rows),
    ...detectPriceAnomaly(rows),
    ...detectQuietDays(rows),
    ...detectSpikeOrders(rows),
    ...detectReturnSpike(rows),
    ...detectSalesmanInactivity(rows),
    ...detectConcentration(rows),
  ];
  
  const sevOrder = { critical: 0, high: 1, medium: 2, info: 3 };
  alerts.sort((a, b) => {
    const sa = sevOrder[a.severity] ?? 9;
    const sb = sevOrder[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    return Math.abs(b.impact) - Math.abs(a.impact);
  });
  
  return alerts;
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const ALERT_STYLES = {
  critical: { bg: '#FEF2F2', border: '#DC2626', icon: '🚨', label: 'KRITIS' },
  high: { bg: '#FFF7ED', border: '#F97316', icon: '⚠️', label: 'TINGGI' },
  medium: { bg: '#FFFBEB', border: '#F59E0B', icon: '⚡', label: 'SEDANG' },
  info: { bg: '#EFF6FF', border: '#3B82F6', icon: 'ℹ️', label: 'INFO' },
};

let currentFilter = 'all';
let cachedAlerts = [];

function shell() {
  return `
    <style>
      .alert-card {
        background: #fff;
        border-radius: 10px;
        padding: 14px;
        margin-bottom: 10px;
        border-left: 5px solid #E2E8F0;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        transition: all 0.2s;
      }
      .alert-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
      .alert-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
      .alert-title { font-size: 13px; font-weight: 800; color: #0F172A; line-height: 1.3; flex: 1; }
      .alert-badge { font-size: 9px; font-weight: 900; padding: 3px 8px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; color: #fff; }
      .alert-desc { font-size: 12px; color: #475569; line-height: 1.5; margin-bottom: 8px; }
      .alert-impact { font-size: 11px; font-weight: 800; margin-bottom: 8px; }
      .alert-action { background: #F8FAFC; padding: 8px 10px; border-radius: 6px; font-size: 11px; line-height: 1.5; color: #334155; margin-bottom: 10px; border-left: 3px solid #1D4ED8; }
      .alert-btn-row { display: flex; gap: 6px; }
      .alert-btn { flex: 1; padding: 8px 12px; border: none; border-radius: 6px; font-size: 11px; font-weight: 800; cursor: pointer; transition: opacity 0.15s; }
      .alert-btn:active { opacity: 0.7; }
      .alert-btn-filter { background: #1D4ED8; color: #fff; }
      .alert-btn-dismiss { background: #F1F5F9; color: #64748B; }
      
      .filter-chip { padding: 6px 12px; background: #fff; border: 1px solid #E2E8F0; border-radius: 20px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: all 0.15s; color: #475569; }
      .filter-chip.active { background: #1D4ED8; color: #fff; border-color: #1D4ED8; }
    </style>
    <div id="alerts-content"></div>
  `;
}

function render() {
  const state = store.state;
  const alerts = runDetection(state);
  cachedAlerts = alerts;
  
  const filtered = currentFilter === 'all' ? alerts : alerts.filter(a => a.severity === currentFilter);
  
  const counts = {
    all: alerts.length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    high: alerts.filter(a => a.severity === 'high').length,
    medium: alerts.filter(a => a.severity === 'medium').length,
    info: alerts.filter(a => a.severity === 'info').length,
  };
  
  const totalImpact = alerts.reduce((s, a) => s + Math.abs(a.impact || 0), 0);
  
  patchHTML('#alerts-content', `
    <div class="card mb12" style="background: linear-gradient(135deg, #0F172A 0%, #7F1D1D 100%); color: #fff; border: none;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="font-size: 32px;">🚨</div>
        <div>
          <div style="font-size: 16px; font-weight: 900;">Anomaly Alert Center</div>
          <div style="font-size: 11px; color: #FCA5A5;">Deteksi otomatis anomali & pola tidak biasa</div>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
        <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 20px; font-weight: 900;">${counts.all}</div>
          <div style="font-size: 9px; color: #FCA5A5; text-transform: uppercase; font-weight: 700;">Total Alert</div>
        </div>
        <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 20px; font-weight: 900; color: #FCA5A5;">${counts.critical}</div>
          <div style="font-size: 9px; color: #FCA5A5; text-transform: uppercase; font-weight: 700;">Kritis</div>
        </div>
        <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 6px; text-align: center;">
          <div style="font-size: 14px; font-weight: 900;">${compactRp(totalImpact)}</div>
          <div style="font-size: 9px; color: #FCA5A5; text-transform: uppercase; font-weight: 700;">Est. Impact</div>
        </div>
      </div>
    </div>

    <div style="display: flex; gap: 6px; overflow-x: auto; padding: 4px 0 12px; -webkit-overflow-scrolling: touch;">
      <button class="filter-chip ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">Semua (${counts.all})</button>
      ${counts.critical > 0 ? `<button class="filter-chip ${currentFilter === 'critical' ? 'active' : ''}" data-filter="critical">🚨 Kritis (${counts.critical})</button>` : ''}
      ${counts.high > 0 ? `<button class="filter-chip ${currentFilter === 'high' ? 'active' : ''}" data-filter="high">⚠️ Tinggi (${counts.high})</button>` : ''}
      ${counts.medium > 0 ? `<button class="filter-chip ${currentFilter === 'medium' ? 'active' : ''}" data-filter="medium">⚡ Sedang (${counts.medium})</button>` : ''}
      ${counts.info > 0 ? `<button class="filter-chip ${currentFilter === 'info' ? 'active' : ''}" data-filter="info">ℹ️ Info (${counts.info})</button>` : ''}
    </div>

    ${filtered.length === 0 ? `
      <div class="card" style="text-align: center; padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
        <div style="font-size: 15px; font-weight: 800; color: #10B981; margin-bottom: 6px;">Tidak Ada Anomali</div>
        <div style="font-size: 12px; color: #64748B;">Semua data dalam rentang normal. Sistem akan terus memantau.</div>
      </div>
    ` : filtered.map((a, idx) => {
      const style = ALERT_STYLES[a.severity] || ALERT_STYLES.info;
      const realIdx = cachedAlerts.indexOf(a);
      return `
        <div class="alert-card" data-alert-idx="${realIdx}" style="border-left-color: ${style.border}; background: ${style.bg};">
          <div class="alert-header">
            <div class="alert-title">${style.icon} ${esc(a.title)}</div>
            <div class="alert-badge" style="background: ${style.border};">${style.label}</div>
          </div>
          <div class="alert-desc">${esc(a.desc)}</div>
          ${a.impact !== 0 && a.impact != null ? `
            <div class="alert-impact" style="color: ${a.impact < 0 ? '#DC2626' : '#10B981'};">
              ${a.impact < 0 ? '📉 Potensi kehilangan: ' : '📈 Nilai: '}${compactRp(Math.abs(a.impact))}
            </div>
          ` : ''}
          <div class="alert-action"><b style="color: #1D4ED8;">💡 Rekomendasi:</b> ${esc(a.recommendation)}</div>
          <div class="alert-btn-row">
            <button class="alert-btn alert-btn-filter" data-alert-detail="${realIdx}">🔍 Lihat Detail</button>
            <button class="alert-btn alert-btn-dismiss" data-dismiss="${realIdx}">Abaikan</button>
          </div>
        </div>
      `;
    }).join('')}
  `);
}

function showAlertDetail(idx) {
  const alert = cachedAlerts[idx];
  if (!alert) return;
  
  const c = alert.context || {};
  const details = Object.entries(c)
    .filter(([k, v]) => v != null && v !== '')
    .map(([k, v]) => `<dt style="font-size:10px;color:#64748B;text-transform:uppercase;font-weight:800;margin-top:6px;">${esc(k)}</dt><dd style="font-size:12px;color:#0F172A;font-weight:700;margin:0 0 4px 0;">${esc(String(v))}</dd>`)
    .join('');
  
  const navBtn = alert.navigate ? `<button id="alert-nav-btn" data-nav="${esc(alert.navigate.view)}" style="width:100%;margin-top:12px;padding:12px;background:#1D4ED8;color:#fff;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;">→ Buka Halaman ${esc(alert.navigate.view)}</button>` : '';
  
  import('../ui/feedback.js').then(({ openModal }) => {
    openModal(`
      <div class="modal-h">
        <h3 style="font-size:15px;margin:0;">🔍 Detail Anomali</h3>
        <button class="x">×</button>
      </div>
      <div class="modal-b" style="padding:16px;">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px;">${esc(alert.title)}</div>
        <div style="font-size:12px;color:#475569;line-height:1.6;margin-bottom:16px;">${esc(alert.desc)}</div>
        ${alert.impact !== 0 && alert.impact != null ? `
          <div style="padding:12px;background:${alert.impact < 0 ? '#FEF2F2' : '#F0FDF4'};border-radius:8px;margin-bottom:16px;text-align:center;">
            <div style="font-size:10px;color:${alert.impact < 0 ? '#991B1B' : '#166534'};text-transform:uppercase;font-weight:800;">Estimasi Dampak</div>
            <div style="font-size:20px;font-weight:900;color:${alert.impact < 0 ? '#DC2626' : '#10B981'};margin-top:4px;">${compactRp(Math.abs(alert.impact))}</div>
          </div>
        ` : ''}
        ${details ? `<dl style="margin:0 0 16px 0; padding:10px; background:#F8FAFC; border-radius:6px;">${details}</dl>` : ''}
        <div style="padding:12px;background:#EFF6FF;border-radius:8px;border-left:3px solid #1D4ED8;">
          <div style="font-size:10px;color:#1E40AF;text-transform:uppercase;font-weight:800;margin-bottom:4px;">💡 Rekomendasi</div>
          <div style="font-size:12px;color:#1E3A8A;line-height:1.5;">${esc(alert.recommendation)}</div>
        </div>
        ${navBtn}
      </div>
    `);
    
    setTimeout(() => {
      const nav = document.getElementById('alert-nav-btn');
      if (nav) {
        nav.onclick = () => {
          document.getElementById('modalScrim').classList.remove('on');
          store.set({ view: nav.dataset.nav });
        };
      }
    }, 50);
  });
}

function dismissAlert(idx) {
  const card = document.querySelector(`[data-alert-idx="${idx}"]`);
  if (card) {
    card.style.opacity = '0.3';
    card.style.pointerEvents = 'none';
    setTimeout(() => card.remove(), 300);
  }
  toast('Alert diabaikan');
}

function update(container, state) {
  if (state.rows.length < 10) {
    patchHTML('#alerts-content', `
      <div class="card" style="text-align: center; padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
        <div style="font-size: 15px; font-weight: 800; color: #64748B;">Belum Cukup Data</div>
        <div style="font-size: 12px; color: #94A3B8; margin-top: 6px;">Upload minimal 10 baris transaksi untuk analisis anomali.</div>
      </div>
    `);
    return;
  }
  render();
}

registerView('alerts', {
  label: 'Alert Center',
  title: 'Anomaly Alerts',
  sub: 'Deteksi otomatis anomali & pola kritis',
  shell,
  update,
  mount() {
    document.addEventListener('click', (e) => {
      const filterBtn = e.target.closest('[data-filter]');
      if (filterBtn) {
        currentFilter = filterBtn.dataset.filter;
        render();
        return;
      }
      const detailBtn = e.target.closest('[data-alert-detail]');
      if (detailBtn) {
        showAlertDetail(+detailBtn.dataset.alertDetail);
        return;
      }
      const dismissBtn = e.target.closest('[data-dismiss]');
      if (dismissBtn) {
        dismissAlert(+dismissBtn.dataset.dismiss);
      }
    });
  }
});