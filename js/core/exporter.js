import { store } from './store.js';

/* ═══════════════════════════════════════════════════════════════
   LIBRARY LOADER (Lazy Load)
   ═══════════════════════════════════════════════════════════════ */
const LIBS = {
  html2canvas: { url: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', global: 'html2canvas' },
  jspdf:       { url: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', global: 'jspdf' },
  xlsx:        { url: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', global: 'XLSX' }
};
const _libCache = {};

function loadLib(key) {
  if (_libCache[key]) return _libCache[key];
  const cfg = LIBS[key];
  _libCache[key] = new Promise((resolve, reject) => {
    if (window[cfg.global]) return resolve(window[cfg.global]);
    if (key === 'jspdf' && window.jspdf) return resolve(window.jspdf);
    const s = document.createElement('script');
    s.src = cfg.url;
    s.async = true;
    s.onload = () => resolve(window[cfg.global] || window.jspdf);
    s.onerror = () => { delete _libCache[key]; reject(new Error(`Gagal memuat ${key}`)); };
    document.head.appendChild(s);
  });
  return _libCache[key];
}

/* ═══════════════════════════════════════════════════════════════
   UTILITAS & METADATA
   ═══════════════════════════════════════════════════════════════ */
function resolveTarget(t) {
  if (!t) return null;
  if (typeof t === 'string') return document.querySelector(t);
  if (t instanceof HTMLElement) return t;
  return null;
}

function buildFilterMeta() {
  const f = store.state.filters || {};
  const meta = [];
  if (f.from) meta.push({ label: 'Dari Tanggal', value: f.from });
  if (f.to) meta.push({ label: 'Sampai Tanggal', value: f.to });
  if (f.transtype && f.transtype !== 'ALL') meta.push({ label: 'Transaksi', value: f.transtype === 'F' ? 'Faktur' : 'Return' });
  
  const filterLabels = {
    salesman: 'Salesman', divisi: 'Divisi', subbrand: 'Subrand', product: 'Produk',
    kabupaten: 'Wilayah', channel: 'Channel', outlet: 'Outlet', periode: 'Periode'
  };
  Object.keys(filterLabels).forEach(k => {
    const set = f[k];
    if (set && set.size > 0) {
      const arr = Array.from(set);
      const display = arr.length > 3 ? `${arr.slice(0, 3).join(', ')} (+${arr.length - 3})` : arr.join(', ');
      meta.push({ label: filterLabels[k], value: display });
    }
  });
  return meta;
}

/* ═══════════════════════════════════════════════════════════════
   MEMBUAT BINGKAI LAPORAN (WRAPPER)
   ═══════════════════════════════════════════════════════════════ */
function buildReportWrapper(clonedBody, opts) {
  const { title, subtitle, meta } = opts;
  const now = new Date();
  const ts = now.toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    position: fixed; left: -99999px; top: 0;
    width: 1100px; background: #fff; padding: 30px;
    font-family: 'Segoe UI', Arial, sans-serif; color: #1E293B; box-sizing: border-box;
  `;

  const metaHtml = meta.length ? `
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:8px 24px; margin-bottom:20px; font-size:12px; padding:12px; background:#F8FAFC; border-radius:6px; border-left:4px solid #1D4ED8;">
      ${meta.map(m => `<div><span style="color:#64748B;">${m.label}:</span> <b style="color:#0F172A;">${m.value}</b></div>`).join('')}
    </div>
  ` : '';

  wrapper.innerHTML = `
    <div style="border-bottom: 3px solid #1D4ED8; padding-bottom: 12px; margin-bottom: 20px; display:flex; justify-content:space-between; align-items:flex-end;">
      <div>
        <div style="font-size:10px; letter-spacing:2px; color:#1D4ED8; font-weight:800;">M245 SALES INTELLIGENCE</div>
        <div style="font-size:22px; font-weight:900; color:#0F172A; margin-top:4px; line-height:1.1;">${title}</div>
        ${subtitle ? `<div style="font-size:12px; color:#475569; margin-top:4px;">${subtitle}</div>` : ''}
      </div>
      <div style="text-align:right; font-size:10px; color:#64748B;">
        <div>Dicetak: <b>${ts}</b></div>
      </div>
    </div>
    ${metaHtml}
    <div data-report-body style="font-size:12px;"></div>
    <div style="margin-top:20px; padding-top:12px; border-top:1px solid #E2E8F0; font-size:10px; color:#94A3B8; display:flex; justify-content:space-between;">
      <div>Laporan digenerate otomatis oleh sistem.</div>
      <div>M245 &copy; ${now.getFullYear()}</div>
    </div>
  `;

  // Bersihkan elemen yang tidak perlu diekspor (tombol, input)
  const cleanClone = clonedBody.cloneNode(true);
  cleanClone.querySelectorAll('button, [data-quick-export]').forEach(el => el.remove());
  cleanClone.querySelectorAll('input').forEach(inp => {
    const span = document.createElement('span'); span.textContent = inp.value || ''; inp.replaceWith(span);
  });

  wrapper.querySelector('[data-report-body]').appendChild(cleanClone);
  return wrapper;
}

/* ═══════════════════════════════════════════════════════════════
   FUNGSI EKSPOR: PDF, EXCEL, GAMBAR
   ═══════════════════════════════════════════════════════════════ */
export async function toPDF(target, opts) {
  const el = resolveTarget(target);
  if (!el) throw new Error('Elemen tidak ditemukan');
  const [html2canvas, jspdfG] = await Promise.all([loadLib('html2canvas'), loadLib('jspdf')]);
  const jsPDF = jspdfG.jsPDF || jspdfG;
  
  const wrapper = buildReportWrapper(el, opts);
  document.body.appendChild(wrapper);
  try {
    const canvas = await html2canvas(wrapper, { scale: 2, useCORS: true, backgroundColor: '#fff' });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgW = 210 - 16; 
    const imgH = (canvas.height * imgW) / canvas.width;
    
    if (imgH < 297) {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 8, 8, imgW, imgH);
    } else {
      let hLeft = imgH, y = 8;
      while (hLeft > 0) {
        const hSlice = Math.min(hLeft, 281);
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 8, y, imgW, imgH, null, 'FAST', 0);
        hLeft -= hSlice; y -= 281;
        if (hLeft > 0) { pdf.addPage(); y = 8; }
      }
    }
    pdf.save(`${opts.filename || 'Laporan'}.pdf`);
  } finally { wrapper.remove(); }
}

export async function toExcel(target, opts) {
  const el = resolveTarget(target);
  if (!el) throw new Error('Elemen tidak ditemukan');
  const xlsx = await loadLib('xlsx');
  const tableEl = el.tagName === 'TABLE' ? el : el.querySelector('table');
  if (!tableEl) throw new Error('Tidak ada tabel untuk diekspor.');

  const rows = Array.from(tableEl.querySelectorAll('tr')).map(tr => 
    Array.from(tr.querySelectorAll('th,td')).map(td => td.innerText.trim())
  );

  const header = [
    ['M245 SALES INTELLIGENCE'], [opts.title], [opts.subtitle || ''], [],
    ...opts.meta.map(m => [m.label + ':', m.value]), []
  ];
  const ws = xlsx.utils.aoa_to_sheet([...header, ...rows]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Laporan');
  xlsx.writeFile(wb, `${opts.filename || 'Laporan'}.xlsx`);
}

export async function toImage(target, opts) {
  const el = resolveTarget(target);
  if (!el) throw new Error('Elemen tidak ditemukan');
  const html2canvas = await loadLib('html2canvas');
  const wrapper = buildReportWrapper(el, opts);
  document.body.appendChild(wrapper);
  try {
    const canvas = await html2canvas(wrapper, { scale: 2, useCORS: true, backgroundColor: '#fff' });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${opts.filename || 'Laporan'}.png`;
    a.click();
  } finally { wrapper.remove(); }
}

/* ═══════════════════════════════════════════════════════════════
   QUICK EXPORT (MODAL OTOMATIS)
   ═══════════════════════════════════════════════════════════════ */
export function bindQuickExport() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quick-export]');
    if (!btn) return;
    e.preventDefault();

    const targetSel = btn.getAttribute('data-quick-export');
    const title = btn.getAttribute('data-title') || 'Laporan Monitoring';
    const subtitle = btn.getAttribute('data-subtitle') || '';
    const filename = btn.getAttribute('data-filename') || title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    // 1. Munculkan Modal Pilihan Format
    const modalId = 'quickExportModal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = modalId;
    modal.style.cssText = `position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(2px);`;
    
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:400px;width:100%;box-shadow:0 20px 40px rgba(0,0,0,.2);text-align:center;">
        <h3 style="margin-top:0;color:#0F172A;">Ekspor Laporan</h3>
        <p style="font-size:13px;color:#64748B;margin-bottom:20px;">${title}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <button class="qe-btn" data-fmt="pdf" style="padding:16px 8px;border:1px solid #E2E8F0;border-radius:8px;background:#F8FAFC;cursor:pointer;font-weight:bold;color:#334155;">
            <span style="font-size:24px;display:block;margin-bottom:8px;">📄</span>PDF
          </button>
          <button class="qe-btn" data-fmt="excel" style="padding:16px 8px;border:1px solid #E2E8F0;border-radius:8px;background:#F8FAFC;cursor:pointer;font-weight:bold;color:#334155;">
            <span style="font-size:24px;display:block;margin-bottom:8px;">📊</span>Excel
          </button>
          <button class="qe-btn" data-fmt="image" style="padding:16px 8px;border:1px solid #E2E8F0;border-radius:8px;background:#F8FAFC;cursor:pointer;font-weight:bold;color:#334155;">
            <span style="font-size:24px;display:block;margin-bottom:8px;">🖼️</span>Gambar
          </button>
        </div>
        <button id="qe-cancel" style="margin-top:20px;background:none;border:none;color:#EF4444;cursor:pointer;font-size:12px;font-weight:bold;">Batal</button>
      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    document.getElementById('qe-cancel').onclick = closeModal;
    modal.addEventListener('click', (ev) => { if (ev.target === modal) closeModal(); });

    // 2. Proses saat format dipilih
    modal.querySelectorAll('.qe-btn').forEach(qBtn => {
      qBtn.onclick = async () => {
        const fmt = qBtn.dataset.fmt;
        const originalHtml = qBtn.innerHTML;
        qBtn.innerHTML = '⏳';
        qBtn.disabled = true;

        try {
          const opts = { title, subtitle, meta: buildFilterMeta(), filename };
          if (fmt === 'pdf') await toPDF(targetSel, opts);
          if (fmt === 'excel') await toExcel(targetSel, opts);
          if (fmt === 'image') await toImage(targetSel, opts);
          closeModal();
        } catch (err) {
          alert('Gagal ekspor: ' + err.message);
          qBtn.innerHTML = originalHtml;
          qBtn.disabled = false;
        }
      };
    });
  });
}