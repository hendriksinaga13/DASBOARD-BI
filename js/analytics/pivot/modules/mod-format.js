export default {
  id: 'format',
  defaultConfig: { pctMode: 'raw' },
  renderToolbar: (cfg) => `
    <label style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#475569;">Format:
      <select data-module="format" data-key="pctMode" style="padding:2px 4px; border:1px solid #CBD5E1; border-radius:4px; font-size:11px;">
        <option value="raw" ${cfg.pctMode === 'raw' ? 'selected' : ''}>Raw</option>
        <option value="row" ${cfg.pctMode === 'row' ? 'selected' : ''}>% Row</option>
        <option value="col" ${cfg.pctMode === 'col' ? 'selected' : ''}>% Col</option>
        <option value="grand" ${cfg.pctMode === 'grand' ? 'selected' : ''}>% Grand</option>
      </select>
    </label>
  `,
  formatValue: (rawVal, mKey, denom, cfg) => {
    if (cfg.pctMode === 'raw' || !cfg.pctMode) return null; // Biarkan modul lain handle
    if (!denom || denom === 0) return '—';
    return ((rawVal / denom) * 100).toFixed(1) + '%';
  }
};