// js/sync/queue.js
const DB_NAME = 'm245-outbox';
const STORE = 'ops';
let _db = null;

function openDB() {
  if (_db) return _db;
  _db = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('by_created', 'created_at');
        s.createIndex('by_dedupe', 'dedupe_key', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _db;
}

export async function enqueue(op) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);

    const doAdd = () => {
      const add = os.add({ ...op, created_at: Date.now(), tries: 0 });
      add.onerror = () => reject(add.error);
    };

    if (op.dedupe_key) {
      const idx = os.index('by_dedupe');
      const g = idx.getAll(op.dedupe_key);
      g.onsuccess = () => {
        for (const e of g.result || []) os.delete(e.id);
        doAdd();
      };
      g.onerror = () => reject(g.error);
    } else doAdd();
    
    // ⚡ Tunggu sampai transaksi selesai agar data pasti masuk
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function peekQueue(limit = 20) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(
      (req.result || []).sort((a, b) => a.created_at - b.created_at).slice(0, limit)
    );
    req.onerror = () => reject(req.error);
  });
}

export async function removeFromQueue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function updateQueue(id, patch) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    const g = os.get(id);
    g.onsuccess = () => {
      const cur = g.result; if (!cur) return resolve();
      const u = os.put({ ...cur, ...patch });
      u.onsuccess = () => resolve();
      u.onerror = () => reject(u.error);
    };
    g.onerror = () => reject(g.error);
  });
}

export async function queueSize() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}