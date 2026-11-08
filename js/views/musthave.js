// js/views/musthave.js
import { registerView } from './registry.js';
import { store } from '../core/store.js';
import { openModal, toast } from '../ui/feedback.js';
import * as C from '../core/musthave.js';
import * as R from '../ui/musthave/read.js';
import * as Svc from '../sync/musthave.js';

let cachedResults = [];
let cachedPcodeMap = new Map();

function shell(){ return `<div id="mh-content"></div>`; }

function update(container, state){
  if (!state.rows.length) {
    container.innerHTML = `<div class="empty" style="padding:32px; text-align:center;">Belum ada data. Silakan upload file LBP dan DMP.</div>`;
    return;
  }

  const config = C.getConfig();
  const computedData = C.processMustHave(state, config);

  cachedResults = computedData.results;
  cachedPcodeMap = computedData.pcodeToProduct;

  container.innerHTML = `
    <div class="card mb12" style="padding:12px; display:flex; gap:10px; align-items:center; background:#F8FAFC; border:1px solid #E2E8F0; flex-wrap:wrap;">
      <div style="flex:1; min-width:120px;">
        <label style="font-size:11px; font-weight:700; color:#64748B;">Dari Tanggal</label>
        <input type="date" id="mhViewStartDate" value="${config.startDate || ''}" style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:4px; font-size:12px;">
      </div>
      <div style="flex:1; min-width:120px;">
        <label style="font-size:11px; font-weight:700; color:#64748B;">Sampai Tanggal</label>
        <input type="date" id="mhViewEndDate" value="${config.endDate || ''}" style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:4px; font-size:12px;">
      </div>
      <div style="flex:0 0 auto; display:flex; align-items:flex-end;">
        <button class="btn primary" id="btnShareImage" style="padding:8px 16px; font-size:12px; height:35px; margin-top:auto;">📸 Share Gambar</button>
      </div>
    </div>
    ${R.renderKpis(computedData.totalOutlets, computedData.passedOutlets, config)}
    ${R.renderResultTable(computedData.results)}
  `;
}

registerView('musthave', {
  label: 'Must-Have SKU',
  title: 'Monitoring Must-Have SKU',
  sub: 'Kelengkapan Produk per Toko',
  shell,
  update,
  mount() {
    document.addEventListener('change', e => {
      if (e.target.id === 'mhViewStartDate') {
        const config = C.getConfig();
        config.startDate = e.target.value;
        Svc.saveMustHaveConfig(config).then(() => store.emit());
      }
      if (e.target.id === 'mhViewEndDate') {
        const config = C.getConfig();
        config.endDate = e.target.value;
        Svc.saveMustHaveConfig(config).then(() => store.emit());
      }
    });

    document.addEventListener('click', e => {
      if (e.target.hasAttribute('data-mh-detail')) {
        const oKey = e.target.getAttribute('data-mh-detail');
        const r = cachedResults.find(x => x.outletKey === oKey);
        if (r) {
          openModal(R.renderDetailModalContent(r, cachedPcodeMap));
        }
      }

      // ⚡ LOGIKA EXPORT GAMBAR
      if (e.target.id === 'btnShareImage') {
        const btn = e.target;
        const wrap = document.getElementById('mh-table-wrap');
        if (!wrap) return;

        // Cek & Load html2canvas
        if (typeof html2canvas === 'undefined') {
          btn.textContent = 'Memuat...';
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
          script.onload = () => generateImage(wrap, btn);
          document.head.appendChild(script);
        } else {
          generateImage(wrap, btn);
        }
      }
    });
  }
});

function generateImage(element, btn) {
  const originalText = btn.textContent;
  btn.textContent = 'Memproses...';
  btn.disabled = true;

  // Sembunyikan tombol aksi & scroll saat difoto
  const actionCols = element.querySelectorAll('th:last-child, td:last-child');
  actionCols.forEach(col => col.style.display = 'none');
  const tableWrap = element.querySelector('.tablewrap');
  const originalOverflow = tableWrap.style.overflow;
  const originalMaxHeight = tableWrap.style.maxHeight;
  
  tableWrap.style.overflow = 'visible';
  tableWrap.style.maxHeight = 'none';

  html2canvas(element, {
    scale: 2, // Resolusi tinggi
    useCORS: true,
    backgroundColor: '#ffffff'
  }).then(canvas => {
    // Kembalikan tampilan semula
    actionCols.forEach(col => col.style.display = '');
    tableWrap.style.overflow = originalOverflow;
    tableWrap.style.maxHeight = originalMaxHeight;
    btn.textContent = originalText;
    btn.disabled = false;

    // Convert to Blob & Download/Share
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MustHave_Report_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('Gambar berhasil disimpan!');
    }, 'image/png');
  }).catch(err => {
    console.error('Export Error:', err);
    toast('Gagal membuat gambar.');
    actionCols.forEach(col => col.style.display = '');
    tableWrap.style.overflow = originalOverflow;
    tableWrap.style.maxHeight = originalMaxHeight;
    btn.textContent = originalText;
    btn.disabled = false;
  });
}