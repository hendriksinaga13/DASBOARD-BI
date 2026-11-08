// js/sync/crud.js
import { store } from '../core/store.js';
import { enqueue } from './queue.js';
import { syncNow } from './engine.js';
import { loadFileHash } from '../data/cache.js';
import { ENTITIES } from './entities/index.js';

let _syncTimeout;
function debouncedSync() {
  clearTimeout(_syncTimeout);
  _syncTimeout = setTimeout(() => syncNow(), 1500);
}

export async function upsertEntity(entityName, key, data, options = {}) {
  const e = ENTITIES[entityName];
  if (!e) throw new Error('Entity tidak dikenal: ' + entityName);

  if (!options.silent) {
    if (e.stateType === 'Map') {
      const m = new Map(store.state[e.stateKey] || []);
      m.set(key, data);
      store.set({ [e.stateKey]: m });
    } else if (e.stateType === 'Array') {
      const arr = (store.state[e.stateKey] || []).filter(x => x.name !== key);
      arr.push({ name: key, ...data });
      store.set({ [e.stateKey]: arr });
    } else {
      store.set({ [e.stateKey]: { ...store.state[e.stateKey], [key]: data } });
    }
  }

  await enqueue({ op: `upsert_${entityName}`, dedupe_key: `${entityName}:${key}`, key, data });
  debouncedSync();
}

export async function deleteEntity(entityName, key) {
  const e = ENTITIES[entityName];
  if (!e) throw new Error('Entity tidak dikenal: ' + entityName);

  if (e.stateType === 'Map') {
    const m = new Map(store.state[e.stateKey] || []);
    m.delete(key);
    store.set({ [e.stateKey]: m });
  } else if (e.stateType === 'Array') {
    store.set({ [e.stateKey]: (store.state[e.stateKey] || []).filter(x => x.name !== key) });
  } else {
    const obj = { ...store.state[e.stateKey] };
    delete obj[key];
    store.set({ [e.stateKey]: obj });
  }

  await enqueue({ op: `delete_${entityName}`, dedupe_key: `${entityName}:${key}`, key });
  debouncedSync();
}

/* ═══════════════════════════════════════════════════
   ⚡ FUNGSI YANG SEBELUMNYA HILANG (DIPERBAIKI)
   ═══════════════════════════════════════════════════ */

// 1. Kirim Target secara manual ke Cloud
export async function sendTargetToCloud(month) {
  const data = store.state.targets[month];
  if (!data) throw new Error('Data target bulan ini kosong.');

  await enqueue({
    op: 'upsert_targets',
    dedupe_key: 'targets:' + month,
    key: month,
    data: data
  });
  
  await syncNow();
}

// 2. Hapus Target secara manual dari Cloud
export async function deleteTargetFromCloud(month) {
  const targets = { ...store.state.targets };
  delete targets[month];
  store.set({ targets });
  
  try { localStorage.setItem('m245.targets', JSON.stringify(targets)); } catch(e){}

  await enqueue({ op: 'delete_targets', dedupe_key: 'targets:' + month, key: month });
  await syncNow();
}

// 3. Simpan Pengaturan Global (HK)
export async function setGlobalSetting(key, data, options = {}) {
  await upsertEntity('settings', key, data, options);
}

// 4. Kirim File ke Cloud
export async function sendFileToCloud(name) {
  const fileObj = store.state.files.find(f => f.name === name);
  if (!fileObj || !fileObj.hash) throw new Error('File tidak ditemukan di lokal.');

  const cached = await loadFileHash(fileObj.hash);
  if (!cached || !cached.text) {
    alert('Gagal: Teks file tidak ditemukan di cache. Silakan upload ulang filenya.');
    throw new Error('Teks file hilang dari cache.');
  }

  await enqueue({
    op: 'upsert_files',
    dedupe_key: 'file:' + name,
    key: name,
    data: { name: fileObj.name, size: fileObj.size, type: fileObj.type, rowCount: fileObj.rowCount, text: cached.text, hash: fileObj.hash }
  });

  await syncNow();
}

// Fungsi standard (Auto-save lokal)
export async function updateOutlet(key, patch) {
  const current = store.state.outletMaster.get(key) || {};
  await upsertEntity('outlets', key, { ...current, ...patch });
}

export async function deleteOutlet(key) { await deleteEntity('outlets', key); }
export async function setTarget(key, data, options = {}) { await upsertEntity('targets', key, data, options); }
export async function deleteTarget(key) { await deleteEntity('targets', key); }