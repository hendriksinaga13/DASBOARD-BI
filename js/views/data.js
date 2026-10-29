import { esc, fmtSize } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { store } from '../core/store.js';
import { addFile } from '../data/loader.js';
import { toast } from '../ui/feedback.js';
import { registerView } from './registry.js';
import { exportTransactions, exportSalesman, exportProduct, exportOutlet, exportDmp, exportNotYet, exportComparison } from '../plugins/export.js';
function shell(){ return `<div id="data-content"></div>`; }
function content(state){
  const files = state.files;
  const totalSize = files.reduce((s, f) => s + (f.size || 0), 0);
  return `
    <div class="card">
      <div class="card-h"><div><div class="card-t">Muat Data</div>
        <div class="card-s">LBP & DMP · maks 500 MB/file</div></div></div>
      <div class="drop" id="dropzone">
        <b>Tarik & lepas file di sini</b>
        <span>atau klik · .txt .csv .tsv .dat</span>
      </div>
      ${files.length ? `<div class="mt12">${files.map(f => `
        <div class="file-card">
          <span class="fc-badge ${f.type}">${f.type}</span>
          <div class="fc-info"><div class="fc-name">${esc(f.name)}</div>
            <div class="fc-meta"><span class="ok">✓ ${f.rowCount || 0} baris</span> · ${fmtSize(f.size)}</div></div>
        </div>`).join('')}</div>
        <div class="tiny mt12">Total: ${fmtSize(totalSize)}</div>` : ''}
    </div>
    <div class="card mt12">
      <div class="card-h"><div><div class="card-t">Status</div></div></div>
      <dl class="kv">
        <dt>Baris LBP</dt><dd>${state.rows.length}</dd>
        <dt>Outlet DMP</dt><dd>${state.outletMaster.size}</dd>
        <dt>File</dt><dd>${files.length}</dd>
      </dl>
    </div>
    <div class="card mt12">
      <div class="card-h"><div><div class="card-t">Ekspor</div></div></div>
      <div class="row-flex">
        <button class="btn" data-export="tx">Transaksi</button>
        <button class="btn" data-export="sm">Salesman</button>
        <button class="btn" data-export="pr">Produk</button>
        <button class="btn" data-export="out">Outlet</button>
        <button class="btn" data-export="notyet">Belum</button>
        <button class="btn" data-export="dmp">DMP</button>
        <button class="btn" data-export="cmp">Perbandingan</button>
      </div>
    </div>
  `;
}
function update(container, state){ patchHTML('#data-content', content(state)); }
registerView('data', {
  label: 'Data', title: 'Data', sub: 'Upload, validasi, ekspor', shell, update,
  mount(){
    document.addEventListener('click', async e => {
      if(e.target.closest('#dropzone')){
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.txt,.csv,.tsv,.dat,text/plain';
        input.onchange = async () => {
          if(!input.files) return;
          for(const file of input.files){
            toast('Memuat ' + file.name + '...');
            try { await addFile(file); }
            catch(err){ toast('Gagal: ' + err.message); }
          }
        };
        input.click();
        return;
      }
      const btn = e.target.closest('[data-export]');
      if(!btn) return;
      const k = btn.dataset.export;
      if(k === 'tx') exportTransactions();
      else if(k === 'sm') exportSalesman();
      else if(k === 'pr') exportProduct();
      else if(k === 'out') exportOutlet();
      else if(k === 'dmp') exportDmp();
      else if(k === 'notyet') exportNotYet();
      else if(k === 'cmp') exportComparison();
    });
  },
});