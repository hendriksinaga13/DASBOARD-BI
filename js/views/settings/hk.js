// js/views/settings/hk.js
import { toast } from '../../ui/feedback.js';
import { setGlobalSetting } from '../../sync/crud.js';

export function initHkView() {
  document.addEventListener('click', async e => {
    if (e.target.id === 'btnSaveHk') {
      const hkVal = +document.getElementById('setHkInput').value || 25;
      const btn = e.target; 
      btn.disabled = true; btn.textContent = 'Menyimpan...';
      try { 
        await setGlobalSetting('hk', { value: hkVal }); 
        toast('HK Berhasil disimpan!'); 
      } catch (err) { 
        alert('Gagal: ' + err.message); 
      } finally { 
        btn.disabled = false; btn.textContent = 'Simpan HK'; 
      }
    }
  });
}