// js/views/data.js
import { esc, fmtSize } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { store } from '../core/store.js';
import { toast } from '../ui/feedback.js';
import { registerView } from './registry.js';
import { addFile } from '../data/loader.js';
import { sendFileToCloud } from '../sync/crud.js';
import { listUploads, deleteUpload } from '../supabase.js';
import { pullFileFromCloud } from '../sync/pull.js'; // ⚡ Import fungsi tarik file

let _cloudFiles = [];
let _loadingCloud = false;

async function refreshCloud() {
  _loadingCloud = true;
  store.emit();
  try {
    _cloudFiles = await listUploads();
  } catch (e) {
    console.warn(e);
    _cloudFiles = [];
  } finally {
    _loadingCloud = false;
    store.emit();
  }
}

function shell() {
  return `
    <div class="card mb12">
      <div class="card-h"><div class="card-t">Muat Data Lokal</div></div>
      <div id="dropzone" style="border:2px dashed #94a3b8; border-radius:8px; padding:24px; text-align:center; cursor:pointer; transition:background 0.2s;">
        <div style="font-weight:600; color:#1e293b; margin-bottom:4px;">Tarik & lepas file di sini</div>
        <div style="font-size:12px; color:#64748b;">atau klik · .txt .csv .tsv .dat .db</div>
        <input type="file" id="fileInput" accept=".txt,.csv,.tsv,.dat,.db" style="display:none" multiple>
      </div>
    </div>

    <div class="card mb12">
      <div class="card-h"><div class="card-t">File Lokal (Siap di-upload)</div></div>
      <div id="local-files-list"></div>
    </div>

    <div class="card mb12">
      <div class="card-h" style="display:flex; justify-content:space-between; align-items:center;">
        <div class="card-t">Riwayat Upload Cloud</div>
        <!-- ⚡ UBAH TOMBOL REFRESH MENJADI SYNC CLOUD -->
        <button class="btn sm" id="btn-refresh-cloud" style="padding:6px 12px;">🔄 Sync Cloud</button>
      </div>
      <div id="cloud-files-list" style="margin-top:12px; min-height:100px;">
        <div style="text-align:center; color:#94a3b8; font-size:13px; padding:20px;">Memuat data...</div>
      </div>
    </div>
  `;
}

function update(container, state) {
  const localList = container.querySelector('#local-files-list');
  if (localList) {
    if (state.files.length === 0) {
      localList.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:13px; padding:20px;">Belum ada file di HP.</div>';
    } else {
      localList.innerHTML = state.files.map(f => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #f1f5f9;">
          <div>
            <div style="font-weight:600; color:#0f172a; font-size:14px;">${esc(f.name)}</div>
            <div style="font-size:12px; color:#64748b;">
              <span style="color:#10b981; font-weight:600;">✓ ${f.rowCount.toLocaleString('id-ID')} baris</span> · ${fmtSize(f.size)}
            </div>
          </div>
          <button class="btn primary sm" data-upload-local="${esc(f.name)}">☁️ Kirim ke Cloud</button>
        </div>
      `).join('');
    }
  }

  const cloudList = container.querySelector('#cloud-files-list');
  if (cloudList) {
    if (_loadingCloud) {
      cloudList.innerHTML = '<div style="text-align:center; color:#3b82f6; font-size:13px; padding:20px;">Menghubungi Supabase...</div>';
    } else if (_cloudFiles.length === 0) {
      cloudList.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:13px; padding:20px;">Belum ada file di Cloud Supabase.</div>';
    } else {
      cloudList.innerHTML = _cloudFiles.map(c => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #f1f5f9;">
          <div>
            <div style="font-weight:600; color:#0f172a; font-size:14px;">${esc(c.file_name)}</div>
            <div style="font-size:12px; color:#64748b;">
              ${c.row_count ? c.row_count.toLocaleString('id-ID') + ' baris' : ''} · ${new Date(c.uploaded_at).toLocaleDateString('id-ID')}
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <!-- ⚡ TOMBOL TARIK DARI CLOUD -->
            <button class="btn sm primary" data-pull-cloud="${esc(c.file_name)}">⬇️ Tarik</button>
            <button class="btn sm" style="color:var(--neg); border-color:#fca5a5;" data-del-cloud="${esc(c.file_name)}">🗑️ Hapus</button>
          </div>
        </div>
      `).join('');
    }
  }
}

registerView('data', {
  label: 'Data', title: 'Data', sub: 'Upload, validasi, ekspor', shell, update,
  mount() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');

    if (dropzone && !dropzone._bound) {
      dropzone._bound = true;
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.background = '#f1f5f9'; });
      dropzone.addEventListener('dragleave', () => { dropzone.style.background = 'transparent'; });
      dropzone.addEventListener('drop', async (e) => {
        e.preventDefault(); dropzone.style.background = 'transparent';
        if (e.dataTransfer.files.length) await handleFiles(e.dataTransfer.files);
      });
      fileInput.addEventListener('change', async (e) => {
        if (e.target.files.length) await handleFiles(e.target.files);
        fileInput.value = '';
      });
    }

    async function handleFiles(files) {
      for (const file of files) {
        try {
          toast(`Memproses ${file.name}...`);
          await addFile(file);
          toast(`Berhasil memuat ${file.name}`);
        } catch (err) {
          alert(`Gagal: ${err.message}`);
        }
      }
      store.emit();
    }

    if (!document._dataListenersBound) {
      document._dataListenersBound = true;
      document.addEventListener('click', async (e) => {
        // 1. Kirim File ke Cloud
        const btnUpload = e.target.closest('[data-upload-local]');
        if (btnUpload) {
          const name = btnUpload.dataset.uploadLocal;
          btnUpload.disabled = true; btnUpload.textContent = 'Mengirim...';
          try {
            await sendFileToCloud(name);
            toast(`Berhasil memasukkan ${name} ke antrean cloud`);
            setTimeout(refreshCloud, 2000);
          } catch(err) {
            btnUpload.disabled = false; btnUpload.textContent = '☁️ Kirim ke Cloud';
          }
        }

        // 2. Hapus File dari Cloud
        const btnDelCloud = e.target.closest('[data-del-cloud]');
        if (btnDelCloud) {
          if (!confirm('Hapus file ini dari Cloud Supabase?')) return;
          const fileName = btnDelCloud.dataset.delCloud;
          btnDelCloud.disabled = true; btnDelCloud.textContent = '...';
          try {
            await deleteUpload(fileName);
            toast('File berhasil dihapus dari cloud');
            refreshCloud();
          } catch(err) {
            alert('Gagal menghapus: ' + err.message);
            btnDelCloud.disabled = false; btnDelCloud.textContent = '🗑️ Hapus';
          }
        }

        // 3. ⚡ Tarik File dari Cloud ke Lokal
        const btnPullCloud = e.target.closest('[data-pull-cloud]');
        if (btnPullCloud) {
          const fileName = btnPullCloud.dataset.pullCloud;
          btnPullCloud.disabled = true; btnPullCloud.textContent = 'Mengunduh...';
          try {
            await pullFileFromCloud(fileName);
            toast(`Berhasil memuat ${fileName} dari cloud`);
          } catch(err) {
            alert('Gagal mengunduh: ' + err.message);
          } finally {
            btnPullCloud.disabled = false; btnPullCloud.textContent = '⬇️ Tarik';
          }
        }

        // 4. Sync Daftar File Cloud
        if (e.target.id === 'btn-refresh-cloud') {
          refreshCloud();
        }
      });
    }

    refreshCloud();
  }
});