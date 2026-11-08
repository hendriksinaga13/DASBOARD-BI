// views/basket.js
import { esc, compactRp, NF1 } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered } from '../core/selectors.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';

/* ══════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════ */
function getEntityKey(r, dim) {
  if (dim === 'divisi')  return r.divisi || null;
  if (dim === 'subrand') return r.subbrand || null;
  return r.pcode || r.product || null; // default: produk
}

function getEntityLabel(r, dim) {
  if (dim === 'divisi')  return r.divisi || '—';
  if (dim === 'subrand') return r.subbrand || '—';
  return r.product || '—';
}

function getDimConfig(dim) {
  return {
    product: { label: 'Produk',  icon: '📦', desc: 'pola pembelian produk (SKU) yang sering dibeli bersamaan' },
    subrand: { label: 'Subrand', icon: '🏷️', desc: 'pola pembelian subrand yang sering dibeli bersamaan' },
    divisi:  { label: 'Divisi',  icon: '🏢', desc: 'pola pembelian divisi (lintas kategori bisnis)' },
  }[dim] || { label: 'Produk', icon: '📦', desc: 'pola pembelian produk' };
}

/* ══════════════════════════════════════════════════════════════
   INSTALL CONTROL (sekali saja — tanpa perlu ubah main.js)
   ══════════════════════════════════════════════════════════════ */
let _controlsInstalled = false;
function installBasketControls() {
  if (_controlsInstalled) return;
  _controlsInstalled = true;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#basketDimSeg button');
    if (btn) {
      store.set({ ui: { ...store.state.ui, basketDim: btn.dataset.bd } });
    }
  });
}

/* ══════════════════════════════════════════════════════════════
   SHELL
   ══════════════════════════════════════════════════════════════ */
function shell(){
  return `<div id="basket-content"></div>`;
}

/* ══════════════════════════════════════════════════════════════
   UPDATE
   ══════════════════════════════════════════════════════════════ */
function update(container, state){
  installBasketControls();
  
  const dim = state.ui.basketDim || 'product';
  const cfg = getDimConfig(dim);

  // Ambil rows F saja (faktur)
  const rows = selectFiltered(state).filter(r => r.tt === 'F');
  
  // ── 1. Kelompokkan entitas per faktur (pakai Set agar dedup per level)
  const invoiceMap = new Map();
  const entityNames = new Map();
  const entityRevenue = new Map();
  
  for (const r of rows) {
    const inv = r.invoice;
    const key = getEntityKey(r, dim);
    if (!inv || !key) continue;
    
    if (!invoiceMap.has(inv)) invoiceMap.set(inv, new Set());
    invoiceMap.get(inv).add(key);
    
    entityNames.set(key, getEntityLabel(r, dim));
    entityRevenue.set(key, (entityRevenue.get(key) || 0) + (Number(r.amount) || 0));
  }
  
  const totalInvoices = invoiceMap.size;
  
  // ── 2. GATEKEEPER
  if (totalInvoices < 20) {
    patchHTML('#basket-content', `
      <div class="card" style="text-align:center; padding:40px; background:#FEF2F2; border:1px solid #FECACA;">
        <div style="font-size:40px; margin-bottom:12px;">📭</div>
        <div style="font-weight:800; color:#991B1B; font-size:16px;">Data Tidak Mencukupi</div>
        <div style="font-size:13px; color:#B91C1C; margin-top:8px;">
          Market Basket Analysis membutuhkan minimal 20 faktur unik. 
          Saat ini hanya ada <b>${totalInvoices} faktur</b> yang cocok dengan filter.
        </div>
      </div>
    `);
    return;
  }

  // ── 3. Hitung Frekuensi & Pasangan
  const itemCounts = new Map();
  const pairCounts = new Map();

  for (const items of invoiceMap.values()) {
    const arr = Array.from(items);
    for (let i = 0; i < arr.length; i++) {
      itemCounts.set(arr[i], (itemCounts.get(arr[i]) || 0) + 1);
      for (let j = i + 1; j < arr.length; j++) {
        const pair = [arr[i], arr[j]].sort().join('|||');
        pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
      }
    }
  }

  // ── 4. Hitung Metrics (Support, Confidence, Lift)
  // Threshold count dinamis: minimal 3, tapi kalau invoice > 500, pakai 1%
  const minCount = Math.max(3, Math.floor(totalInvoices * 0.01));
  
  const results = [];
  for (const [pairStr, count] of pairCounts.entries()) {
    if (count < minCount) continue;
    
    const [keyA, keyB] = pairStr.split('|||');
    const countA = itemCounts.get(keyA);
    const countB = itemCounts.get(keyB);
    
    const support = (count / totalInvoices) * 100;
    const confAtoB = (count / countA) * 100;
    const confBtoA = (count / countB) * 100;
    const lift = (count * totalInvoices) / (countA * countB);
    
    // Pilih arah terkuat
    const isAtoBStronger = confAtoB >= confBtoA;
    const strongFrom = isAtoBStronger ? keyA : keyB;
    const strongTo = isAtoBStronger ? keyB : keyA;
    const strongConf = isAtoBStronger ? confAtoB : confBtoA;
    
    const revenueTo = entityRevenue.get(strongTo) || 0;
    const estRevenue = revenueTo * (support / 100);
    
    results.push({
      from: entityNames.get(strongFrom) || strongFrom,
      to: entityNames.get(strongTo) || strongTo,
      support,
      conf: strongConf,
      lift,
      estRevenue
    });
  }

  results.sort((a, b) => (b.conf * b.lift) - (a.conf * a.lift));

  // ── 5. Render UI
  patchHTML('#basket-content', `
    <!-- HEADER dengan Toggle Level -->
    <div class="card mb12" style="background:linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%); color:#fff;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
        <div style="flex:1; min-width:240px;">
          <div style="font-size:16px; font-weight:900; margin-bottom:4px;">🛒 Market Basket Intelligence</div>
          <div style="font-size:12px; color:#C4B5FD; line-height:1.5;">
            Menganalisis <b>${totalInvoices.toLocaleString('id-ID')}</b> faktur unik. Level: 
            <b style="color:#fff;">${cfg.icon} ${cfg.label}</b> — mendeteksi ${cfg.desc}.
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
          <div style="font-size:10.5px; color:#C4B5FD; font-weight:700; text-transform:uppercase; letter-spacing:.5px;">Level Analisis:</div>
          <div class="seg" id="basketDimSeg" style="background:rgba(255,255,255,0.1); padding:4px; border-radius:8px;">
            <button data-bd="product" class="${dim === 'product' ? 'on' : ''}" 
              style="padding:6px 10px; border-radius:6px; font-size:11px; font-weight:700; ${dim === 'product' ? 'background:#fff; color:#0F172A;' : 'color:#C4B5FD; background:transparent; border:none;'}">📦 Produk</button>
            <button data-bd="subrand" class="${dim === 'subrand' ? 'on' : ''}" 
              style="padding:6px 10px; border-radius:6px; font-size:11px; font-weight:700; ${dim === 'subrand' ? 'background:#fff; color:#0F172A;' : 'color:#C4B5FD; background:transparent; border:none;'}">🏷️ Subrand</button>
            <button data-bd="divisi" class="${dim === 'divisi' ? 'on' : ''}" 
              style="padding:6px 10px; border-radius:6px; font-size:11px; font-weight:700; ${dim === 'divisi' ? 'background:#fff; color:#0F172A;' : 'color:#C4B5FD; background:transparent; border:none;'}">🏢 Divisi</button>
          </div>
        </div>
      </div>
    </div>

    <!-- KPI -->
    <div class="grid kpis mb12">
      <div class="kpi pos"><div class="kpi-l">Total Faktur</div><div class="kpi-v">${totalInvoices}</div></div>
      <div class="kpi purple"><div class="kpi-l">Pola Ditemukan</div><div class="kpi-v">${results.length}</div></div>
    </div>

    <!-- LIST HASIL -->
    <div class="tiny" style="font-weight:800; text-transform:uppercase; letter-spacing:1px; margin:20px 0 10px 4px; color:#64748B;">
      Top Cross-Selling Opportunities · Level ${cfg.label}
    </div>

    ${results.length === 0 ? `
      <div class="card" style="text-align:center; padding:30px; color:#64748B;">
        <div style="font-size:32px; margin-bottom:8px;">🔍</div>
        <div style="font-weight:700; margin-bottom:4px;">Tidak ada pola signifikan ditemukan</div>
        <div style="font-size:12px;">Coba: 
          <b>ganti level</b> ke Subrand/Divisi, 
          atau <b>perluas rentang filter</b>, 
          atau <b>kurangi batasan minimum</b> (saat ini min ${minCount} faktur berpasangan).
        </div>
      </div>
    ` : ''}

    ${results.slice(0, 30).map((r, i) => `
      <div class="card mb12" style="padding:16px; border-left:4px solid ${r.conf > 70 ? '#10B981' : (r.conf > 40 ? '#F59E0B' : '#E2E8F0')};">
        
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
          <div style="flex:1; background:#F8FAFC; padding:10px; border-radius:8px; border:1px solid #E2E8F0;">
            <div class="tiny" style="color:#64748B; font-weight:700; margin-bottom:2px;">JIKA BELI</div>
            <div style="font-size:13px; font-weight:800; color:#0F172A; line-height:1.2;">${esc(r.from)}</div>
          </div>
          <div style="font-size:18px; color:#8B5CF6; font-weight:900;">➔</div>
          <div style="flex:1; background:#F0FDF4; padding:10px; border-radius:8px; border:1px solid #BBF7D0;">
            <div class="tiny" style="color:#166534; font-weight:700; margin-bottom:2px;">TAWARKAN INI</div>
            <div style="font-size:13px; font-weight:800; color:#166534; line-height:1.2;">${esc(r.to)}</div>
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
          💡 <b>Rekomendasi:</b> Instruksikan salesman untuk selalu menawarkan <b>${esc(r.to)}</b> jika outlet sudah membeli <b>${esc(r.from)}</b>. 
          Potensi tambahan omset: <b>${compactRp(r.estRevenue)}</b>.
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