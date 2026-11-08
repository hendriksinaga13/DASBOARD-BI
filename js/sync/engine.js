// js/sync/engine.js
import { peekQueue, removeFromQueue, updateQueue, queueSize } from './queue.js';
import { ENTITIES } from './entities/index.js';

const listeners = new Set();
let _running = false;
const _status = { online: navigator.onLine, syncing: false, pending: 0, lastSync: null, lastError: null };

export function getStatus() { return { ..._status }; }
export function onSyncChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) try { fn(getStatus()); } catch(e){} }

const HANDLERS = {};
for (const e of Object.values(ENTITIES)) {
  if (e.upsert) HANDLERS[`upsert_${e.name}`] = e.upsert.bind(e);
  if (e.remove) HANDLERS[`delete_${e.name}`] = e.remove.bind(e);
}

export async function syncNow() {
  if (_running || !navigator.onLine) return;
  _running = true;
  _status.syncing = true; _status.pending = await queueSize(); emit();

  let ok = 0, fail = 0;
  try {
    const items = await peekQueue(20);
    for (const op of items) {
      const fn = HANDLERS[op.op];
      
      // ⚡ JIKA FUNGSI TIDAK DITEMUKAN, TAMPILKAN ALERT
      if (!fn) { 
        alert('Error: Fungsi ' + op.op + ' tidak ditemukan!');
        await removeFromQueue(op.id); 
        continue; 
      }
      
      try {
        await fn(op);
        await removeFromQueue(op.id);
        ok++;
      } catch (e) {
        fail++;
        const tries = (op.tries || 0) + 1;
        
        // ⚡ MUNCULKAN KOTAK PESAN ERROR
        alert('Gagal Kirim ke Cloud:\n' + e.message);

        if (tries >= 5) await removeFromQueue(op.id);
        else await updateQueue(op.id, { tries, last_error: e.message });
      }
    }
    _status.lastSync = Date.now();
    _status.lastError = fail ? `${fail} op gagal` : null;
  } finally {
    _running = false; _status.syncing = false;
    _status.pending = await queueSize(); emit();
  }
  return { ok, fail };
}

export function initSync() {
  window.addEventListener('online',  () => { _status.online = true;  emit(); syncNow(); });
  window.addEventListener('offline', () => { _status.online = false; emit(); });
  setInterval(() => { if (navigator.onLine) syncNow().catch(()=>{}); }, 20_000);
  queueSize().then(n => { _status.pending = n; emit(); });
  setTimeout(() => syncNow().catch(()=>{}), 1000);
}