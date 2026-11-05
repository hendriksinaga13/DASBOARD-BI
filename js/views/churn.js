import { esc, compactRp, NF1 } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered } from '../core/selectors.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';
import { toast } from '../ui/feedback.js';

function shell(){
  return `<div id="churn-content"></div>`;
}

// Fungsi pembuka WhatsApp
function openWhatsApp(outletName, salesman) {
  // Template Pesan
  const text = `Halo Bapak/Ibu Pengelola *${outletName}*,\n\n` +
               `Kami dari tim penjualan M245 melihat bahwa sudah beberapa waktu ini outlet Bapak/Ibu belum melakukan pembelian rutin seperti bulan lalu.\n\n` +
               `Apakah ada kendala stok, pengiriman, atau ada produk kompetitor yang masuk?\n\n` +
               `Kami memiliki *Program Loyalitas Khusus* untuk outlet Bapak/Ibu. Jika melakukan pembelian minggu ini, kami akan memberikan [BONUS/DISKON KHUSUS].\n\n` +
               `Apakah besok *Salesman* kami (*${salesman}*) bisa berkunjung untuk menjelaskan detailnya?\n\n` +
               `Terima kasih atas kerja samanya. 🙏`;

  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  
  toast('Membuka WhatsApp...');
  
  // 🚀 TRIK MEMBUKA WA: Gunakan window.location.href
  // Agar tidak diblokir popup-blocker di HP.
  window.location.href = url;
}

function update(container, state){
  const allRows = selectFiltered(state).filter(r => r.tt === 'F');
  
  if (allRows.length < 10) {
    patchHTML('#churn-content', '<div class="empty" style="padding:40px; text-align:center;">Data tidak mencukupi untuk analisis churn.</div>');
    return;
  }

  const months = Array.from(new Set(allRows.map(r => r.day.slice(0, 7)))).sort();
  if (months.length < 2) {
    patchHTML('#churn-content', '<div class="empty" style="padding:40px; text-align:center;">Analisis Churn membutuhkan data minimal 2 bulan historis.</div>');
    return;
  }

  const currMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];

  const outletMap = new Map();
  for (const r of allRows) {
    if (!outletMap.has(r.outletKey)) {
      outletMap.set(r.outletKey, { 
        name: r.outlet, 
        key: r.outletKey,
        current: 0, 
        previous: 0,
        salesman: r.salesman
      });
    }
    const o = outletMap.get(r.outletKey);
    if (r.day.startsWith(currMonth)) o.current += r.amount;
    else if (r.day.startsWith(prevMonth)) o.previous += r.amount;
  }

  const atRiskList = [];
  let totalRiskValue = 0;
  let churnCount = 0;

  for (const o of outletMap.values()) {
    if (o.previous === 0) continue;

    let churnProb = 0;
    if (o.current === 0) {
      churnProb = 100; 
    } else if (o.current < o.previous) {
      churnProb = Math.round((1 - (o.current / o.previous)) * 100);
    }

    if (churnProb >= 50) {
      atRiskList.push({
        ...o,
        churnProb,
        dropValue: o.previous - o.current
      });
      totalRiskValue += (o.previous - o.current);
      churnCount++;
    }
  }

  atRiskList.sort((a, b) => b.dropValue - a.dropValue);
  
  patchHTML('#churn-content', `
    <div class="card mb12" style="background:linear-gradient(135deg, #991B1B 0%, #7F1D1D 100%); color:#fff;">
      <div style="font-size:16px; font-weight:900; margin-bottom:4px;">🎯 Churn Radar & Win-Back</div>
      <div style="font-size:12px; color:#FECACA; line-height:1.5;">
        Memprediksi outlet yang berhenti berlangganan. Total potensi omset yang hilang bulan ini: <b>${compactRp(totalRiskValue)}</b>.
      </div>
    </div>

    <div class="grid kpis mb12">
      <div class="kpi neg"><div class="kpi-l">Outlet Churn</div><div class="kpi-v">${churnCount}</div><div class="kpi-s">Penurunan > 50%</div></div>
      <div class="kpi warn"><div class="kpi-l">Revenue at Risk</div><div class="kpi-v">${compactRp(totalRiskValue)}</div></div>
    </div>

    <div class="tiny" style="font-weight:800; text-transform:uppercase; margin:20px 0 10px 4px; color:#64748B;">Target Win-Back Campaign</div>

    ${atRiskList.length === 0 ? '<div class="empty" style="padding:20px;text-align:center;color:#10B981;font-weight:700;">Luar biasa! Tidak ada outlet yang berisiko churn bulan ini.</div>' : ''}

    ${atRiskList.slice(0, 20).map(o => `
      <div class="card mb12" style="border-left:4px solid #DC2626; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div>
            <div style="font-size:14px; font-weight:800; color:#0F172A;">${esc(o.name)}</div>
            <div class="tiny" style="color:#64748B;">Sales: ${esc(o.salesman)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:16px; font-weight:900; color:#DC2626;">${o.churnProb}%</div>
            <div class="tiny" style="color:#DC2626; font-weight:700;">Churn Risk</div>
          </div>
        </div>
        
        <div style="display:flex; gap:12px; background:#FEF2F2; padding:8px; border-radius:6px; margin-bottom:12px;">
          <div style="flex:1;"><div class="tiny" style="color:#991B1B;">Bulan Lalu</div><div style="font-size:12px; font-weight:800; color:#991B1B;">${compactRp(o.previous)}</div></div>
          <div style="flex:1; text-align:right;"><div class="tiny" style="color:#991B1B;">Bulan Ini</div><div style="font-size:12px; font-weight:800; color:#991B1B;">${compactRp(o.current)}</div></div>
        </div>

        <button class="btn sm" data-wa-outlet="${esc(o.name)}" data-wa-sales="${esc(o.salesman)}" style="width:100%; background:#25D366; color:#fff; border:none; font-weight:700; padding:10px; border-radius:8px; cursor:pointer;">
          💬 Kirim WhatsApp Win-Back
        </button>
      </div>
    `).join('')}
  `);
}

registerView('churn', { 
  label: 'Churn Radar', 
  title: 'Churn Prediction', 
  sub: 'Prediksi Outlet Hilang & Win-Back', 
  shell, 
  update,
  mount() {
    // 🚀 EVENT DELEGATION: Tangkap klik tombol WA
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-wa-outlet]');
      if (btn) {
        const outletName = btn.dataset.waOutlet;
        const salesman = btn.dataset.waSales;
        openWhatsApp(outletName, salesman);
      }
    });
  }
});