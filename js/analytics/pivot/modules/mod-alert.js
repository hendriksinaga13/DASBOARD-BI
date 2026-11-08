export default {
  id: 'alert',
  defaultConfig: { showAlerts: false },
  renderToolbar: (cfg) => `
    <label style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#475569;">
      <input type="checkbox" data-module="alert" data-key="showAlerts" ${cfg.showAlerts ? 'checked' : ''} style="width:12px; height:12px;">🚨 Trend Alert
    </label>
  `,
  cellBadge: (rawVal, mKey, cfg, compareDelta) => {
    if (!cfg.showAlerts || mKey !== 'omset' || compareDelta == null) return '';
    
    // Bandingkan dengan bulan lalu (LM)
    if (compareDelta <= -25) {
      return `<div style="font-size:10px; color:#EF4444; font-weight:900; margin-top:2px;">🔻 Drop Tajam</div>`;
    }
    if (compareDelta >= 25) {
      return `<div style="font-size:10px; color:#10B981; font-weight:900; margin-top:2px;">🚀 Spike!</div>`;
    }
    return '';
  }
};