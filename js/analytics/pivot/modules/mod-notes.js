import { esc } from '../../../core/utils.js';

const NOTES_KEY = 'm245.pivotNotes';

function getNotes() {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY)) || {};
  } catch { return {}; }
}

export default {
  id: 'notes',
  defaultConfig: { showNotes: false },
  renderToolbar: (cfg) => `
    <label style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#475569;">
      <input type="checkbox" data-module="notes" data-key="showNotes" ${cfg.showNotes ? 'checked' : ''} style="width:12px; height:12px;">📝 Notes
    </label>
  `,
  renderRowLabel: (row, cfg) => {
    if (!cfg.showNotes || row._type === 'child') return '';
    
    const notes = getNotes();
    const val = notes[row.label] || '';
    
    return `
      <div style="margin-top:2px;">
        <input type="text" class="pv-note-input" data-row-label="${esc(row.label)}" 
          value="${esc(val)}" 
          placeholder="+ Ketik catatan..." 
          autocomplete="off" 
          onclick="event.stopPropagation()"
          style="width:100%; max-width:140px; padding:2px 4px; font-size:10px; border:1px dashed #CBD5E1; border-radius:4px; background:${val ? '#FEF9C3' : 'transparent'}; color:#475569;">
      </div>
    `;
  }
};