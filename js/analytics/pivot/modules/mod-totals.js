export default {
  id: 'totals',
  defaultConfig: { showTotals: true },
  renderToolbar: (cfg) => `
    <label style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#475569;">
      <input type="checkbox" data-module="totals" data-key="showTotals" ${cfg.showTotals !== false ? 'checked' : ''} style="width:12px; height:12px;">Total
    </label>
  `
};