import { esc, compactRp, NF1, pct } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectAgg } from '../core/selectors.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';

let simState = {
  effort: 0,      // % perubahan Efektif Call
  promo: 0,       // % perubahan diskon
  newOutlets: 0,  // jumlah outlet baru
  baseMargin: 15  // Asumsi margin awal 15%
};

function shell(){ return `<div id="sim-content"></div>`; }

function update(container, state){
  const agg = selectAgg(state);
  
  if (!agg.omset) {
    patchHTML('#sim-content', '<div class="empty" style="padding:40px; text-align:center;">Belum ada data untuk disimulasikan.</div>');
    return;
  }

  // ── KALKULASI SIMULASI ──
  const baseOmset = agg.omset;
  const baseOA = agg.oa;
  const avgPerOutlet = baseOA > 0 ? (baseOmset / baseOA) : 0;
  
  // 1. Efek Outlet Baru
  const omsetNewOutlets = simState.newOutlets * avgPerOutlet;
  
  // 2. Efek Effort (EC Naik -> Omset Naik, Elastisitas 0.8)
  const omsetEffort = baseOmset * (simState.effort / 100) * 0.8;
  
  // 3. Efek Promo (Diskon Naik -> Omset Naik, Elastisitas 1.5, tapi Margin turun)
  const omsetPromo = baseOmset * (simState.promo / 100) * 1.5;
  
  const projectedOmset = baseOmset + omsetNewOutlets + omsetEffort + omsetPromo;
  
  // 4. Proyeksi Laba (Net Profit)
  const projectedMarginPct = simState.baseMargin - (simState.promo * 0.5); 
  const baseProfit = baseOmset * (simState.baseMargin / 100);
  const projectedProfit = projectedOmset * (projectedMarginPct / 100);
  const deltaProfit = projectedProfit - baseProfit;

  // ── RENDER UI ──
  patchHTML('#sim-content', `
    <div class="card mb12" style="background:linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color:#fff;">
      <div style="font-size:16px; font-weight:900; margin-bottom:4px;">🔮 Predictive Simulator</div>
      <div style="font-size:12px; color:#E0E7FF; line-height:1.5;">Geser parameter di bawah untuk melihat dampaknya terhadap Omset dan Laba secara prediktif.</div>
    </div>

    <!-- PANEL SLIDER -->
    <div class="card mb12" style="padding:16px;">
      
      <!-- Slider 1: Salesman Effort -->
      <div style="margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span style="font-size:12px; font-weight:800; color:#0F172A;">Intensitas Salesman (EC)</span>
          <span style="font-size:12px; font-weight:800; color:#4F46E5;">${simState.effort > 0 ? '+' : ''}${simState.effort}%</span>
        </div>
        <input type="range" id="simEffort" min="-50" max="50" step="5" value="${simState.effort}" style="width:100%; accent-color:#4F46E5;">
        <div class="tiny" style="color:#64748B;">Meningkatkan jumlah kunjungan efektif per hari.</div>
      </div>

      <!-- Slider 2: Promo / Diskon -->
      <div style="margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span style="font-size:12px; font-weight:800; color:#0F172A;">Diskon / Promo</span>
          <span style="font-size:12px; font-weight:800; color:#DC2626;">${simState.promo > 0 ? '+' : ''}${simState.promo}%</span>
        </div>
        <input type="range" id="simPromo" min="0" max="20" step="1" value="${simState.promo}" style="width:100%; accent-color:#DC2626;">
        <div class="tiny" style="color:#64748B;">Menaikkan omset, tapi menggerus margin keuntungan.</div>
      </div>

      <!-- Slider 3: Outlet Baru -->
      <div style="margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span style="font-size:12px; font-weight:800; color:#0F172A;">Akuisisi Outlet Baru</span>
          <span style="font-size:12px; font-weight:800; color:#10B981;">${simState.newOutlets} Toko</span>
        </div>
        <input type="range" id="simOutlet" min="0" max="200" step="10" value="${simState.newOutlets}" style="width:100%; accent-color:#10B981;">
        <div class="tiny" style="color:#64748B;">Menambah outlet aktif baru ke database.</div>
      </div>
    </div>

    <!-- HASIL SIMULASI -->
    <div class="grid kpis">
      <div class="kpi pos">
        <div class="kpi-l">Proyeksi Omset</div>
        <div class="kpi-v">${compactRp(projectedOmset)}</div>
        <div class="kpi-s">Awal: ${compactRp(baseOmset)}</div>
      </div>
      
      <div class="kpi ${deltaProfit >= 0 ? 'pos' : 'neg'}">
        <div class="kpi-l">Proyeksi Laba (Net)</div>
        <div class="kpi-v">${compactRp(projectedProfit)}</div>
        <div class="kpi-s">${deltaProfit >= 0 ? '▲ Naik' : '▼ Turun'} ${compactRp(Math.abs(deltaProfit))}</div>
      </div>

      <div class="kpi purple">
        <div class="kpi-l">Margin Bersih</div>
        <div class="kpi-v">${NF1.format(projectedMarginPct)}%</div>
        <div class="kpi-s">Awal: ${simState.baseMargin}%</div>
      </div>

      <div class="kpi">
        <div class="kpi-l">Total Outlet</div>
        <div class="kpi-v">${baseOA + parseInt(simState.newOutlets)}</div>
        <div class="kpi-s">Awal: ${baseOA} OA</div>
      </div>
    </div>

    <div class="card mt12" style="background:${deltaProfit >= 0 ? '#F0FDF4' : '#FEF2F2'}; border:1px solid ${deltaProfit >= 0 ? '#BBF7D0' : '#FECACA'}; padding:16px;">
      <div style="font-size:12px; font-weight:800; color:${deltaProfit >= 0 ? '#166534' : '#991B1B'}; margin-bottom:4px;">💡 Analisis Skenario:</div>
      <div style="font-size:13px; color:#334155; line-height:1.5;">
        ${simState.promo > 10 
          ? '⚠️ Hati-hati: Diskon yang terlalu tinggi akan menaikkan omset, tetapi <b>menurunkan laba bersih</b> secara signifikan.' 
          : (simState.effort > 20 
            ? '✅ Strategi yang baik: Meningkatkan intensitas kunjungan salesman lebih menguntungkan daripada membakar diskon.'
            : 'Geser slider di atas untuk melihat proyeksi skenario bisnis Anda.')}
      </div>
    </div>
  `);
}

function handleSlider(e) {
  if (e.target.id === 'simEffort') simState.effort = +e.target.value;
  if (e.target.id === 'simPromo') simState.promo = +e.target.value;
  if (e.target.id === 'simOutlet') simState.newOutlets = +e.target.value;
  
  if (e.target.type === 'range') {
    store.emit(); // Trigger re-render
  }
}

registerView('simulator', { 
  label: 'Simulator', 
  title: 'Sales Simulator', 
  sub: 'Prediksi Skenario Bisnis', 
  shell, 
  update,
  mount() {
    document.addEventListener('input', handleSlider);
  }
});