import { store } from '../core/store.js';
import { saveFileHash, loadFileHash, fileHash } from './cache.js';

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
const pending = new Map();
let _pendingId = 0;

worker.onmessage = ({ data }) => {
  const cb = pending.get(data.id);
  if(cb){ pending.delete(data.id); cb(data); }
};

function parseInWorker(text, forcedType){
  return new Promise((resolve, reject) => {
    const id = ++_pendingId;
    pending.set(id, data => { if(data.ok) resolve(data); else reject(new Error(data.error)); });
    worker.postMessage({ id, text, forcedType });
  });
}

/* ═══════════════════════════════════════════════════════════════
   ⚡ KONFIGURASI: File yang di-auto-load dari folder
   ═══════════════════════════════════════════════════════════════
   Taruh file di folder `data/` (sejajar dengan index.html).
   Contoh: data/lbp.txt, data/dmp.txt, atau data/database.db
*/
const BUNDLED_FILES = [
  { path: './data/lbp.txt', type: 'LBP' },
  { path: './data/dmp.txt', type: 'DMP' },
  // Opsional: { path: './data/database.db', type: 'DB' }
];

/* ═══════════════════════════════════════════════════════════════
   AUTO-LOAD BUNDLED FILES (Cek perubahan via ETag/Last-Modified)
   ═══════════════════════════════════════════════════════════════ */
export async function autoLoadBundledFiles() {
  let changes = [];
  
  // 1. Cek HEAD untuk setiap file (apakah berubah?)
  for (const cfg of BUNDLED_FILES) {
    try {
      const headRes = await fetch(cfg.path, { method: 'HEAD', cache: 'no-cache' });
      if (!headRes.ok) {
        // File tidak ada? Coba GET langsung jika cache belum ada
        if (store.state.rows.length === 0) {
          try {
            const getRes = await fetch(cfg.path, { cache: 'no-cache' });
            if (getRes.ok) changes.push({ cfg, force: true });
          } catch(e){}
        }
        continue;
      }
      
      // Dapatkan signature file (ETag / Last-Modified / Content-Length)
      const etag = headRes.headers.get('etag') || headRes.headers.get('last-modified') || headRes.headers.get('content-length') || '';
      const cacheKey = `m245.autoLoad.${cfg.path}`;
      const lastEtag = localStorage.getItem(cacheKey);
      
      // Jika belum ada cache (fresh install) atau ETag berbeda (file berubah)
      if (!lastEtag || (etag && lastEtag !== etag)) {
        changes.push({ cfg, etag, force: !lastEtag });
      }
    } catch (e) {
      console.warn(`[AutoLoad] Gagal cek ${cfg.path}:`, e.message);
    }
  }
  
  // 2. Jika tidak ada perubahan dan data sudah ada → skip
  if (changes.length === 0) {
    if (store.state.rows.length > 0) {
      console.log('[AutoLoad] Tidak ada perubahan file. Menggunakan data dari cache browser.');
      return false;
    }
    // Jika data kosong tapi tidak ada perubahan (misal habis hard refresh), paksa load ulang
    console.log('[AutoLoad] Data kosong. Memuat semua file...');
    changes = BUNDLED_FILES.map(cfg => ({ cfg, force: true }));
  }
  
  // 3. Reset data lama (karena file berubah)
  if (changes.length > 0) {
    console.log(`[AutoLoad] ${changes.length} file berubah. Reset data lama...`);
    store.set({
      rows: [],
      outletMaster: new Map(),
      files: [],
      errors: []
    });
  }
  
  // 4. Load semua file yang ada
  for (const item of BUNDLED_FILES) {
    try {
      const res = await fetch(item.path, { cache: 'no-cache' });
      if (!res.ok) continue;
      const text = await res.text();
      
      // Handle .db files
      if (item.path.endsWith('.db') || item.type === 'DB') {
        const data = JSON.parse(text);
        if (data.version && data.rows) {
          const outletMaster = new Map(data.outletMaster || []);
          store.set({
            files: data.files || [],
            rows: data.rows || [],
            outletMaster: outletMaster,
            targets: data.targets || store.state.targets,
            errors: data.errors || []
          });
          console.log(`[AutoLoad] ✅ Database .db dimuat.`);
          continue;
        }
      }
      
      // Handle LBP/DMP
      const data = await parseInWorker(text, item.type);
      pushFileToState({
        name: item.path.split('/').pop(),
        size: text.length,
        type: data.type,
        result: data.result
      });
      
      // Simpan ETag
      const headRes = await fetch(item.path, { method: 'HEAD' });
      const etag = headRes.headers.get('etag') || headRes.headers.get('last-modified') || '';
      if (etag) {
        localStorage.setItem(`m245.autoLoad.${item.path}`, etag);
      }
      
      console.log(`[AutoLoad] ✅ ${item.path} dimuat (${data.type}).`);
    } catch (e) {
      console.warn(`[AutoLoad] Gagal load ${item.path}:`, e.message);
    }
  }
  
  return true;
}

/* ── FUNGSI LAMA (Upload Manual) ── */
export async function addFile(file){
  // Handle .db
  if (file.name.toLowerCase().endsWith('.db')) {
    try {
      const text = await readAsText(file);
      const data = JSON.parse(text);
      if (!data.version || !data.rows) throw new Error('Format .db tidak dikenali');
      
      const outletMaster = new Map(data.outletMaster || []);
      store.set({
        files: data.files || [],
        rows: data.rows || [],
        outletMaster: outletMaster,
        targets: data.targets || {},
        errors: data.errors || []
      });
      try { localStorage.setItem('m245.targets', JSON.stringify(store.state.targets)); } catch(e){}
      return;
    } catch(err) {
      throw new Error('Gagal memuat .db: ' + err.message);
    }
  }
  
  const hash = fileHash(file.name, file.size);
  const cached = await loadFileHash(hash);
  if(cached){
    pushFileToState({ name: file.name, size: file.size, type: cached.type, result: cached.result });
    return;
  }
  const text = await readAsText(file);
  const data = await parseInWorker(text);
  await saveFileHash(hash, { type: data.type, result: data.result });
  pushFileToState({ name: file.name, size: file.size, type: data.type, result: data.result });
}

function pushFileToState({ name, size, type, result }){
  const rowCount = (result.records || result.outlets || []).length;
  const errorCount = (result.errors || []).length;

  const files = store.state.files.slice();
  // Hapus file lama dengan nama yang sama (untuk auto-load update)
  const existingIdx = files.findIndex(f => f.name === name);
  if (existingIdx >= 0) files.splice(existingIdx, 1);
  files.push({ name, size, type, rowCount, errorCount });

  const rows = store.state.rows.slice();
  const master = new Map(store.state.outletMaster);
  const errors = store.state.errors.slice();

  if(result.errors && result.errors.length){
    for(const e of result.errors){
      errors.push({ file: name, line: e.line, reason: e.reason, raw: e.raw });
    }
  }

  if(type === 'LBP'){
    for(const r of result.records) rows.push(r);
  } else {
    for(const o of result.outlets){
      const no = String(o.outletNo || '').trim();
      const nm = String(o.outlet || '').trim();
      const key = no || nm;
      if(!key) continue;
      master.set(key, o);
    }
  }

  const masterByName = new Map();
  for(const o of master.values()){
    if(o.outlet) masterByName.set(o.outlet, o);
  }

  for(const r of rows){
    const m = (r.outletNo && master.get(r.outletNo))
           || (r.outlet && master.get(r.outlet))
           || (r.outlet && masterByName.get(r.outlet));
    if(!m) continue;
    if((!r.rayon || r.rayon === '—') && m.rayon && m.rayon !== '—') r.rayon = m.rayon;
    if((!r.kabupaten || r.kabupaten === '—') && m.kabupaten && m.kabupaten !== '—') r.kabupaten = m.kabupaten;
    if((!r.kecamatan || r.kecamatan === '—') && m.kecamatan && m.kecamatan !== '—') r.kecamatan = m.kecamatan;
    if((!r.kelurahan || r.kelurahan === '—') && m.kelurahan && m.kelurahan !== '—') r.kelurahan = m.kelurahan;
    if((!r.tipe || r.tipe === '—') && m.tipe && m.tipe !== '—') r.tipe = m.tipe;
    if((!r.channel || r.channel === '—') && m.channel && m.channel !== '—') r.channel = m.channel;
    if((!r.salesTeam || r.salesTeam === '—') && m.salesTeam && m.salesTeam !== '—') r.salesTeam = m.salesTeam;
  }

  store.set({ files, rows, outletMaster: master, errors });
}

async function readAsText(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file, 'UTF-8');
  });
}