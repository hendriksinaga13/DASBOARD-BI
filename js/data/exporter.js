import { store } from '../core/store.js';

export function exportDatabase() {
  const state = store.state;
  const outletMasterArray = Array.from(state.outletMaster.entries());

  const dbPayload = {
    version: 'M245-DB-v1',
    exportedAt: new Date().toISOString(),
    files: state.files || [],
    rows: state.rows || [],
    outletMaster: outletMasterArray,
    targets: state.targets || {},
    errors: state.errors || []
  };

  const jsonString = JSON.stringify(dbPayload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  
  const d = new Date();
  const dateStr = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const timeStr = String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  
  a.download = `Database_M245_${dateStr}_${timeStr}.db`;
  document.body.appendChild(a);
  a.click();
  
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}