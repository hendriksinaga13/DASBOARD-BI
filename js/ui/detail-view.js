// ui/detail-view.js
import { store } from '../core/store.js';
import { esc, compactRp, fmtKtn, NF1, fmtDateID } from '../core/utils.js';

/* ✅ Ambil semua rows untuk entity (BYPASS filter) */
function getEntityRows(dim, val) {
  const allRows = store.state.rows || [];
  return allRows.filter(r => String(r[dim] || '') === String(val));
}

/* ✅ Hitung summary dari rows */
function computeSummary(rows) {
  let omset = 0, grossF = 0, grossR = 0, qtyCarton = 0;
  const invoices = new Set();
  const outlets = new Set();
  for(const r of rows) {
    if(r.tt === 'F') {
      grossF += Number(r.amount) || 0;
      if(r.invoice) invoices.add(r.invoice);
      if(r.outletKey) outlets.add(r.outletKey);
    } else if(r.tt === 'R') {
      grossR += Number(r.amount) || 0;
    }
    omset += r.tt === 'F' ? (Number(r.amount)||0) : -(Number(r.amount)||0);
    qtyCarton += isFinite(r.netCarton) ? r.netCarton : 0;
  }
  return { omset, grossF, grossR, qtyCarton, faktur: invoices.size, outlets: outlets.size, lines: rows.length };
}

/* ✅ Ambil info unik entity (divisi, rayon, dll) */
function getEntityInfo(dim, rows) {
  const info = {};
  const fields = ['divisi', 'subbrand', 'channel', 'rayon', 'kabupaten', 'kecamatan', 'salesman', 'outlet', 'outletNo', 'product'];
  for(const r of rows) {
    for(const f of fields) {
      if(f !== dim && !info[f] && r[f]) info[f] = r[f];
    }
  }
  return info;
}

/* ✅ Render tabel transaksi (max 100 baris terbaru) */
function renderTransaksi(rows) {
  const sorted = rows.slice().sort((a, b) => String(b.day || '').localeCompare(String(a.day || ''))).slice(0, 100);
  if(!sorted.length) return '<div style="padding:20px;text-align:center;color:#94A3B8;">Tidak ada transaksi</div>';
  
  const body = sorted.map(r => {
    const isRet = r.tt === 'R';
    const color = isRet ? '#DC2626' : '#334155';
    const sign = isRet ? '-' : '+';
    return `<tr style="border-bottom:1px solid #F1F5F9;">
      <td style="padding:8px; font-size:11px;">${esc(fmtDateID(r.day) || '—')}</td>
      <td style="padding:8px; font-size:11px; font-weight:600;">${esc(r.invoice || '—')}</td>
      <td style="padding:8px; font-size:11px;">${esc(r.outlet || '—')}</td>
      <td style="padding:8px; font-size:11px;">${esc(r.product || '—')}</td>
      <td style="padding:8px; font-size:11px; text-align:right;">${NF1.format(r.netCarton || 0)}</td>
      <td style="padding:8px; font-size:11px; text-align:right; color:${color}; font-weight:700;">${sign}${compactRp(r.amount || 0)}</td>
    </tr>`;
  }).join('');
  
  return `<div style="overflow:auto; max-height:380px; border:1px solid #E2E8F0; border-radius:8px;">
    <table style="width:100%; border-collapse:collapse; font-size:11px;">
      <thead style="position:sticky; top:0; background:#F8FAFC; z-index:2;">
        <tr>
          <th style="padding:8px; text-align:left; font-size:10px; color:#64748B;">TANGGAL</th>
          <th style="padding:8px; text-align:left; font-size:10px; color:#64748B;">FAKTUR</th>
          <th style="padding:8px; text-align:left; font-size:10px; color:#64748B;">OUTLET</th>
          <th style="padding:8px; text-align:left; font-size:10px; color:#64748B;">PRODUK</th>
          <th style="padding:8px; text-align:right; font-size:10px; color:#64748B;">KTN</th>
          <th style="padding:8px; text-align:right; font-size:10px; color:#64748B;">AMOUNT</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

/* ✅ FUNGSI UTAMA: Buka Detail View */
export function openDetail(dim, val) {
  const scrim = document.querySelector('#modalScrim');
  const modal = document.querySelector('#modal');
  if(!scrim || !modal) return;
  
  // Ambil SEMUA rows entity ini, TANPA filter
  const entityRows = getEntityRows(dim, val);
  if(!entityRows.length) {
    modal.innerHTML = `<div style="padding:40px;text-align:center;color:#94A3B8;">Tidak ada data untuk "${esc(val)}"</div>`;
    scrim.classList.add('on');
    return;
  }
  
  const s = computeSummary(entityRows);
  const info = getEntityInfo(dim, entityRows);
  const dimLabel = { salesman:'Salesman', outlet:'Outlet', product:'Produk', subbrand:'Subrand', divisi:'Divisi', kabupaten:'Kabupaten', channel:'Channel', rayon:'Rayon' }[dim] || dim;
  
  const infoHtml = Object.entries(info).slice(0, 6).map(([k, v]) => 
    `<div><span style="color:#64748B; font-size:11px;">${k.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase())}:</span> <b style="color:#334155; font-size:12px;">${esc(v)}</b></div>`
  ).join('');
  
  modal.innerHTML = `
    <div style="display:flex; flex-direction:column; height:100%; max-height:90vh;">
      <div style="padding:16px 20px; border-bottom:1px solid #E2E8F0; display:flex; align-items:center; justify-content:space-between; background:#F8FAFC;">
        <div>
          <div style="font-size:11px; color:#64748B; text-transform:uppercase;">Detail ${esc(dimLabel)}</div>
          <div style="font-size:18px; font-weight:800; color:#0F172A; margin-top:2px;">${esc(val)}</div>
        </div>
        <button id="dv-close" style="width:36px; height:36px; border-radius:8px; background:#fff; border:1px solid #E2E8F0; font-size:18px; cursor:pointer; color:#64748B;">✖</button>
      </div>
      
      <div style="flex:1; overflow-y:auto; padding:16px 20px;">
        ${infoHtml ? `<div style="margin-bottom:16px; padding:12px; background:#F8FAFC; border-radius:8px; display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:8px;">${infoHtml}</div>` : ''}
        
        <div style="margin-bottom:16px;">
          <div style="font-size:12px; font-weight:700; color:#475569; margin-bottom:8px;">📊 Total Sepanjang Masa <span style="font-size:10px; color:#94A3B8;">(bypass filter)</span></div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:8px;">
            <div style="padding:10px; background:#EFF6FF; border-radius:6px; border-left:3px solid #3B82F6;"><div style="font-size:10px; color:#64748B;">OMSET</div><div style="font-size:14px; font-weight:800; color:#1E40AF;">${compactRp(s.omset)}</div></div>
            <div style="padding:10px; background:#ECFDF5; border-radius:6px; border-left:3px solid #10B981;"><div style="font-size:10px; color:#64748B;">FAKTUR</div><div style="font-size:14px; font-weight:800; color:#065F46;">${NF1.format(s.faktur)}</div></div>
            <div style="padding:10px; background:#FEF3C7; border-radius:6px; border-left:3px solid #F59E0B;"><div style="font-size:10px; color:#64748B;">QTY KARTON</div><div style="font-size:14px; font-weight:800; color:#92400E;">${fmtKtn(s.qtyCarton)}</div></div>
            <div style="padding:10px; background:#F3E8FF; border-radius:6px; border-left:3px solid #8B5CF6;"><div style="font-size:10px; color:#64748B;">OUTLET</div><div style="font-size:14px; font-weight:800; color:#5B21B6;">${NF1.format(s.outlets)}</div></div>
            <div style="padding:10px; background:#FEE2E2; border-radius:6px; border-left:3px solid #EF4444;"><div style="font-size:10px; color:#64748B;">RETURN</div><div style="font-size:14px; font-weight:800; color:#991B1B;">${compactRp(s.grossR)}</div></div>
          </div>
        </div>
        
        <div>
          <div style="font-size:12px; font-weight:700; color:#475569; margin-bottom:8px;">📅 Transaksi Terbaru <span style="font-size:10px; color:#94A3B8;">(max 100)</span></div>
          ${renderTransaksi(entityRows)}
        </div>
      </div>
      
      <div style="padding:12px 20px; border-top:1px solid #E2E8F0; display:flex; gap:8px; justify-content:flex-end; background:#F8FAFC;">
        <button id="dv-filter" style="padding:10px 16px; border-radius:8px; border:none; background:#1D4ED8; color:#fff; font-weight:700; font-size:12px; cursor:pointer;">
          🔍 Filter Dashboard ke ${esc(dimLabel)} Ini
        </button>
      </div>
    </div>
  `;
  
  scrim.classList.add('on');
  
  document.querySelector('#dv-close')?.addEventListener('click', () => scrim.classList.remove('on'));
  document.querySelector('#dv-filter')?.addEventListener('click', () => {
    store.set({ filters: { ...store.state.filters, [dim]: new Set([val]) } });
    scrim.classList.remove('on');
  });
}

/* ✅ Install: tutup modal kalau klik luar / ESC */
export function installDetailView() {
  const scrim = document.querySelector('#modalScrim');
  if(!scrim) return;
  
  scrim.addEventListener('click', (e) => {
    if(e.target === scrim) scrim.classList.remove('on');
  });
  
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && scrim.classList.contains('on')) scrim.classList.remove('on');
  });
}