import { esc, fmtSize } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { store } from '../core/store.js';
import { addFile } from '../data/loader.js';
import { exportDatabase } from '../data/exporter.js'; // <-- Pastikan ini ada
import { toast } from '../ui/feedback.js';
import { registerView } from './registry.js';
import { exportTransactions, exportSalesman, exportProduct, exportOutlet, exportDmp, exportNotYet, exportComparison } from '../plugins/export.js';

function shell(){ return `<div id="data-content"></div>`; }

function content(state){
  const files = state.files;
  const totalSize = files.reduce((s, f) => s + (f.size || 0), 0);
  const errors = state.errors || [];

  return `
    <div class="card">
      <div class="card-h"><div><div class="card-t">Muat Data</div>
        <div class="card-s">LBP, DMP & Database (.db) · maks 500 MB/file</div></div></div>
      <div class="drop" id="dropzone">
        <b>Tarik & lepas file di sini</b>
        <span>atau klik · .txt .csv .tsv .dat .db</span>
      </div>
      ${files.length ? `<div class="mt12">${files.map(f => `
        <div class="file-card">
          <span class="fc-badge ${f.type}">${f.type}</span>
          <div class="fc-info"><div class="fc-name">${esc(f.name)}</div>
            <div class="fc-meta">
              <span class="ok">✓ ${f.rowCount || 0} baris</span>
              ${f.errorCount ? ` · <span style="color:var(--warn)">⚠ ${f.errorCount} invalid</span>` : ''}
              · ${fmtSize(f.size)}
            </div></div>
        </div>`).join('')}</div>
        <div class="tiny mt12">Total: ${fmtSize(totalSize)}</div>` : ''}
    </div>

    <div class="card mt12">
      <div class="card-h"><div><div class="card-t">Status</div></div></div>
      <dl class="kv">
        <dt>Baris LBP</dt><dd>${state.rows.length}</dd>
        <dt>Outlet DMP</dt><dd>${state.outletMaster.size}</dd>
        <dt>File</dt><dd>${files.length}</dd>
        <dt>Parse errors</dt><dd style="color:${errors.length ? 'var(--warn)' : 'inherit'}">${errors.length}</dd>
      </dl>
    </div>

    ${errors.length ? `
    <div class="card mt12">
      <div class="card-h"><div><div class="card-t">Parse Errors</div>
        <div class="card-s">${errors.length} baris tidak valid (di-skip)</div></div></div>
      <div class="tablewrap" style="max-height:280px"><table>
        <thead><tr><th>File</th><th class="num">Baris</th><th>Alasan</th><th>Preview</th></tr></thead>
        <tbody>${errors.slice(0, 200).map(e => `<tr>
          <td>${esc(e.file || '—')}</td>
          <td class="num">${e.line || '—'}</td>
          <td>${esc(e.reason || '')}</td>
          <td class="mono" style="font-size:11px">${esc((e.raw || '').slice(0, 80))}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}

    <div class="card mt12">
      <div class="card-h"><div><div class="card-t">Ekspor Data</div></div></div>
      <div class="row-flex">
        <button class="btn" data-export="tx">Transaksi</button>
        <button class="btn" data-export="sm">Salesman</button>
        <button class="btn" data-export="pr">Produk</button>
        <button class="btn" data-export="out">Outlet</button>
        <button class="btn" data-export="notyet">Belum</button>
        <button class="btn" data-export="dmp">DMP</button>
        <button class="btn" data-export="cmp">Perbandingan</button>
      </div>
      
      <!-- TOMBOL EXPORT DATABASE -->
      <div style="margin-top:16px; padding-top:16px; border-top:1px dashed #CBD5E1;">
        <button class="btn" data-export="db" style="background:#0F172A; border-color:#0F172A; color:white; width:100%;">
          💾 Export Database (.db)
        </button>
        <div class="tiny mt12" style="text-align:center; color:#64748B;">
          Simpan seluruh data (LBP, DMP, Target, Error) untuk di-backup atau dipindahkan.
        </div>
      </div>
    </div>
  `;
}

function update(container, state){ patchHTML('#data-content', content(state)); }

registerView('data', {
  label: 'Data', title: 'Data', sub: 'Upload, validasi, ekspor', shell, update,
  mount(){
    document.addEventListener('dragover', e => {
      const dz = e.target.closest('#dropzone');
      if(dz){ e.preventDefault(); dz.classList.add('drag'); }
    });
    document.addEventListener('dragleave', e => {
      const dz = e.target.closest('#dropzone');
      if(dz) dz.classList.remove('drag');
    });
    document.addEventListener('drop', async e => {
      const dz = e.target.closest('#dropzone');
      if(!dz) return;
      e.preventDefault();
      dz.classList.remove('drag');
      const files = e.dataTransfer && e.dataTransfer.files;
      if(!files || !files.length) return;
      for(const file of files){
        toast('Memuat ' + file.name + '...');
        try { await addFile(file); }
        catch(err){ toast('Gagal: ' + err.message); }
      }
    });

    document.addEventListener('click', async e => {
      if(e.target.closest('#dropzone')){
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.txt,.csv,.tsv,.dat,.db,text/plain,application/json';
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
      else if(k === 'db') exportDatabase();
    });
  },
});