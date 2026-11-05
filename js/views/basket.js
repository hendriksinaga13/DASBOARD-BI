import { esc, compactRp, NF1 } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered } from '../core/selectors.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';

function shell(){
  return `<div id="basket-content"></div>`;
}

function update(container, state){
  // 🛑 GATEKEEPER: Butuh minimal 20 faktur unik untuk analisis valid
  const rows = selectFiltered(state).filter(r => r.tt === 'F');
  
  // 1. Kelompokkan produk per faktur
  const invoiceMap = new Map();
  const productNames = new Map();
  const productRevenue = new Map(); // Untuk simulasi potensi pendapatan

  for (const r of rows) {
    const inv = r.invoice;
    const p = r.pcode || r.product;
    if (!inv || !p) continue;

    if (!invoiceMap.has(inv)) invoiceMap.set(inv, new Set());
    invoiceMap.get(inv).add(p);
    
    productNames.set(p, r.product);
    productRevenue.set(p, (productRevenue.get(p) || 0) + r.amount);
  }

  const totalInvoices = invoiceMap.size;
  
  if (totalInvoices < 20) {
    patchHTML('#basket-content', `
      <div class="card" style="text-align:center; padding:40px; background:#FEF2F2; border:1px solid #FECACA;">
        <div style="font-size:40px; margin-bottom:12px;">📭</div>
        <div style="font-weight:800; color:#991B1B; font-size:16px;">Data Tidak Mencukupi</div>
        <div style="font-size:13px; color:#B91C1C; margin-top:8px;">Market Basket Analysis membutuhkan minimal 20 faktur unik. Saat ini hanya ada ${totalInvoices} faktur yang cocok dengan filter.</div>
      </div>
    `);
    return;
  }

  // 2. Hitung Frekuensi Produk (Support) dan Pasangan (Pair)
  const itemCounts = new Map();
  const pairCounts = new Map();

  for (const items of invoiceMap.values()) {
    const arr = Array.from(items);
    for (let i = 0; i < arr.length; i++) {
      itemCounts.set(arr[i], (itemCounts.get(arr[i]) || 0) + 1);
      
      for (let j = i + 1; j < arr.length; j++) {
        // Urutkan nama produk agar (A,B) dan (B,A) dianggap sama
        const pair = [arr[i], arr[j]].sort().join('|||');
        pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
      }
    }
  }

  // 3. Hitung Metrik Asosiasi (Support, Confidence, Lift)
  const results = [];
  for (const [pairStr, count] of pairCounts.entries()) {
    if (count < 3) continue; // Abaikan pasangan yang terlalu jarang
    
    const [prodA, prodB] = pairStr.split('|||');
    const countA = itemCounts.get(prodA);
    const countB = itemCounts.get(prodB);
    
    const support = (count / totalInvoices) * 100; 
    const confAtoB = (count / countA) * 100; 
    const confBtoA = (count / countB) * 100; 
    const lift = (count * totalInvoices) / (countA * countB); 
    
    // Simpan arah yang paling kuat
    const isAtoBStronger = confAtoB >= confBtoA;
    const strongFrom = isAtoBStronger ? prodA : prodB;
    const strongTo = isAtoBStronger ? prodB : prodA;
    const strongConf = isAtoBStronger ? confAtoB : confBtoA;
    
    // Estimasi Revenue Potensial (Jika kita bisa menaikkan cross-sell)
    const revenueTo = productRevenue.get(strongTo) || 0;
    const estRevenue = revenueTo * (support / 100);

    results.push({
      prodA: productNames.get(prodA),
      prodB: productNames.get(prodB),
      strongFrom: productNames.get(strongFrom),
      strongTo: productNames.get(strongTo),
      support,
      conf: strongConf,
      lift,
      estRevenue
    });
  }

  // Urutkan berdasarkan Confidence & Lift tertinggi
  results.sort((a, b) => (b.conf * b.lift) - (a.conf * a.lift));

  // 4. Render UI
  patchHTML('#basket-content', `
    <div class="card mb12" style="background:linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%); color:#fff;">
      <div style="font-size:16px; font-weight:900; margin-bottom:4px;">🛒 Market Basket Intelligence</div>
      <div style="font-size:12px; color:#C4B5FD; line-height:1.5;">
        Menganalisis ${totalInvoices.toLocaleString('id-ID')} faktur unik. Fitur ini mendeteksi pola pembelian produk yang sering terjadi bersamaan untuk strategi <i>Cross-Selling</i> dan <i>Bundling</i>.
      </div>
    </div>

    <div class="grid kpis mb12">
      <div class="kpi pos"><div class="kpi-l">Total Faktur</div><div class="kpi-v">${totalInvoices}</div></div>
      <div class="kpi purple"><div class="kpi-l">Pola Ditemukan</div><div class="kpi-v">${results.length}</div></div>
    </div>

    <div class="tiny" style="font-weight:800; text-transform:uppercase; letter-spacing:1px; margin:20px 0 10px 4px; color:#64748B;">Top Cross-Selling Opportunities</div>

    ${results.length === 0 ? '<div class="empty">Tidak ada pola signifikan ditemukan (butuh minimal 3 transaksi untuk 1 pasangan).</div>' : ''}

    ${results.slice(0, 30).map((r, i) => `
      <div class="card mb12" style="padding:16px; border-left:4px solid ${r.conf > 70 ? '#10B981' : (r.conf > 40 ? '#F59E0B' : '#E2E8F0')};">
        
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
          <div style="flex:1; background:#F8FAFC; padding:10px; border-radius:8px; border:1px solid #E2E8F0;">
            <div class="tiny" style="color:#64748B; font-weight:700; margin-bottom:2px;">JIKA BELI</div>
            <div style="font-size:13px; font-weight:800; color:#0F172A; line-height:1.2;">${esc(r.strongFrom)}</div>
          </div>
          <div style="font-size:18px; color:#8B5CF6; font-weight:900;">➔</div>
          <div style="flex:1; background:#F0FDF4; padding:10px; border-radius:8px; border:1px solid #BBF7D0;">
            <div class="tiny" style="color:#166534; font-weight:700; margin-bottom:2px;">TAWARKAN INI</div>
            <div style="font-size:13px; font-weight:800; color:#166534; line-height:1.2;">${esc(r.strongTo)}</div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:12px;">
          <div style="text-align:center; background:#fff; border:1px solid #E2E8F0; border-radius:6px; padding:6px;">
            <div class="tiny" style="color:#64748B;">Peluang</div>
            <div style="font-size:14px; font-weight:900; color:#1D4ED8;">${NF1.format(r.conf)}%</div>
          </div>
          <div style="text-align:center; background:#fff; border:1px solid #E2E8F0; border-radius:6px; padding:6px;">
            <div class="tiny" style="color:#64748B;">Support</div>
            <div style="font-size:14px; font-weight:900; color:#1D4ED8;">${NF1.format(r.support)}%</div>
          </div>
          <div style="text-align:center; background:#fff; border:1px solid #E2E8F0; border-radius:6px; padding:6px;">
            <div class="tiny" style="color:#64748B;">Lift</div>
            <div style="font-size:14px; font-weight:900; color:#8B5CF6;">${NF1.format(r.lift)}x</div>
          </div>
        </div>

        <div style="font-size:11.5px; color:#475569; background:#F8FAFC; padding:8px 10px; border-radius:6px;">
          💡 <b>Rekomendasi Aksi:</b> Instruksikan salesman untuk selalu menawarkan <b>${esc(r.strongTo)}</b> jika outlet sudah membeli <b>${esc(r.strongFrom)}</b>. Potensi tambahan omset: ${compactRp(r.estRevenue)}.
        </div>
      </div>
    `).join('')}
  `);
}

registerView('basket', { 
  label: 'Cross-Selling', 
  title: 'Market Basket', 
  sub: 'Analisis Pola Pembelian Bersamaan', 
  shell, 
  update 
});