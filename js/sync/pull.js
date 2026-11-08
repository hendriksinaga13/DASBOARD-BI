// js/sync/pull.js
import { getUploadText } from '../supabase.js';
import { store } from '../core/store.js';
import { addFile } from '../data/loader.js';
import { ENTITIES } from './entities/index.js';

/** Tarik semua data dari cloud secara dinamis berdasarkan ENTITIES */
export async function pullAll() {
  const resultStats = {};

  for (const e of Object.values(ENTITIES)) {
    if (e.pull === false) continue; // Skip jika entity tidak mau di-pull (seperti files)
    if (typeof e.pull !== 'function') continue;

    try {
      const data = await e.pull();
      store.set({ [e.stateKey]: data });
      
      if (e.stateType === 'Map') resultStats[e.name] = data.size;
      else if (e.stateType === 'Array') resultStats[e.name] = data.length;
      else resultStats[e.name] = Object.keys(data).length;
      
    } catch (err) {
      console.warn(`[Pull] Gagal menarik ${e.name}:`, err.message);
    }
  }

  // Simpan targets ke localStorage untuk fallback offline
  if (store.state.targets) {
    try { localStorage.setItem('m245.targets', JSON.stringify(store.state.targets)); } catch(e){}
  }

  return resultStats;
}

/** Unduh 1 file dari cloud lalu parse ke state (skip upload ulang) */
export async function pullFileFromCloud(fileId) {
  const { text, name } = await getUploadText(fileId);
  const file = new File([text], name, { type: 'text/plain' });
  await addFile(file, true); // true = jangan upload ulang ke Supabase
  return name;
}