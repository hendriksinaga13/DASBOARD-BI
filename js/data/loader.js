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
export async function addFile(file){
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
  const files = store.state.files.slice();
  files.push({ name, size, type, rowCount: (result.records || result.outlets || []).length });
  const rows = store.state.rows.slice();
  const master = new Map(store.state.outletMaster);
  if(type === 'LBP'){ for(const r of result.records) rows.push(r); }
  else { for(const o of result.outlets){ if(o.outletNo) master.set(o.outletNo, o); if(o.outlet) master.set(o.outlet, o); } }
  store.set({ files, rows, outletMaster: master });
}
async function readAsText(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file, 'UTF-8');
  });
}