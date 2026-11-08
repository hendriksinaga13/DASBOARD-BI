// js/data/loader.js
import { store } from '../core/store.js';
import { saveFileHash, loadFileHash, fileHash, removeFileHash, listCachedHashes } from './cache.js'; 
import { activateMonth } from './lazy.js';

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

function syncDmpToMaster(outlets) {
  const master = new Map(store.state.outletMaster);
  for (const o of outlets) {
    const no = String(o.outletNo || '').trim();
    const nm = String(o.outlet || '').trim();
    const key = no || nm;
    if (key) master.set(key, o);
  }
  store.set({ outletMaster: master });
}

export async function recoverFilesFromCache() {
  try {
    const cachedList = await listCachedHashes();
    if (!cachedList || !cachedList.length) return false;

    const uniqueFilesMap = new Map();
    const allMonths = new Set();

    for (const c of cachedList) {
      if (!c.payload || !c.payload.result) continue;
      const { type, result } = c.payload;
      const name = c.hash.split('::')[1] || 'File Cache';
      
      const months = new Set();
      if (type === 'LBP' && result.records) {
        result.records.forEach(r => { if (r.periode) months.add(r.periode); });
      }

      if (type === 'DMP' && result.outlets) syncDmpToMaster(result.outlets);

      const fileObj = {
        name, size: c.size || 0, type: type,
        rowCount: (result.records || result.outlets || []).length,
        errorCount: (result.errors || []).length,
        hash: c.hash, months: Array.from(months), _ts: c.ts || 0
      };

      if (!uniqueFilesMap.has(name) || uniqueFilesMap.get(name)._ts < fileObj._ts) {
        uniqueFilesMap.set(name, fileObj);
      }
    }

    const files = Array.from(uniqueFilesMap.values());
    files.forEach(f => f.months.forEach(m => allMonths.add(m)));

    if (files.length > 0) {
      store.set({ files });
      const latestMonth = [...allMonths].sort().pop();
      if (latestMonth) activateMonth(latestMonth);
      return true;
    }
    return false;
  } catch(e) { return false; }
}

// ⚡ AUTO LOAD DIHAPUS TOTAL

export async function addFile(file){
  if (file.name.toLowerCase().endsWith('.db')) {
    try {
      const text = await readAsText(file);
      const data = JSON.parse(text);
      if (!data.version || !data.rows) throw new Error('Format .db tidak dikenali');
      store.set({
        files: data.files || [], rows: data.rows || [],
        outletMaster: new Map(data.outletMaster || []),
        targets: data.targets || {}, errors: data.errors || []
      });
      return;
    } catch(err) { throw new Error('Gagal memuat .db: ' + err.message); }
  }

  const hash = fileHash(file.name, file.size);
  const cached = await loadFileHash(hash);
  
  if(cached){
    pushFileToState({ name: file.name, size: file.size, type: cached.type, result: cached.result, hash: hash });
    if (cached.type === 'DMP') syncDmpToMaster(cached.result.outlets);
    if (cached.type === 'LBP' && cached.result.records) {
      const months = [...new Set(cached.result.records.map(r => r.periode))].sort();
      if (months.length) await activateMonth(months.pop());
    }
    return;
  }

  const text = await readAsText(file);
  const data = await parseInWorker(text);
  
  await saveFileHash(hash, { type: data.type, result: data.result, text });
  
  pushFileToState({ name: file.name, size: file.size, type: data.type, result: data.result, hash: hash });

  if (data.type === 'DMP') syncDmpToMaster(data.result.outlets);
  if (data.type === 'LBP' && data.result.records) {
    const months = [...new Set(data.result.records.map(r => r.periode))].sort();
    if (months.length) await activateMonth(months.pop());
  }
}

function pushFileToState({ name, size, type, result, hash }){
  const rowCount = (result.records || result.outlets || []).length;
  const errorCount = (result.errors || []).length;

  const months = new Set();
  if (type === 'LBP') {
    for (const r of result.records) if (r.periode) months.add(r.periode);
  }

  const files = store.state.files.slice();
  const existingIdx = files.findIndex(f => f.name === name);
  
  if (existingIdx >= 0) {
    const oldFile = files[existingIdx];
    if (oldFile.hash && oldFile.hash !== hash) removeFileHash(oldFile.hash);
    files.splice(existingIdx, 1);
  }
  
  files.push({ name, size, type, rowCount, errorCount, hash, months: Array.from(months) });

  const errors = store.state.errors.slice();
  if(result.errors && result.errors.length){
    for(const e of result.errors) errors.push({ file: name, line: e.line, reason: e.reason, raw: e.raw });
  }

  store.set({ files, errors });
}

async function readAsText(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file, 'UTF-8');
  });
}