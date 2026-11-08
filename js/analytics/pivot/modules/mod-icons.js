export default {
  id: 'icons',
  defaultConfig: { showIcons: false },
  renderToolbar: (cfg) => `
    <label style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#475569;">
      <input type="checkbox" data-module="icons" data-key="showIcons" ${cfg.showIcons ? 'checked' : ''} style="width:12px; height:12px;">🚦 Icons
    </label>
  `,
  // Badge ini akan muncul di samping angka
  cellBadge: (rawVal, mKey, cfg, compareDelta, minMax) => {
    if (!cfg.showIcons || mKey !== 'omset' || !rawVal || !minMax) return '';
    
    const min = minMax[mKey].min, max = minMax[mKey].max;
    if (min === max) return '';
    
    // Hitung posisi (0.0 sampai 1.0)
    let ratio = (rawVal - min) / (max - min);
    if (ratio < 0) ratio = 0; if (ratio > 1) ratio = 1;
    
    let icon = '🟡';
    if (ratio >= 0.8) icon = '🟢'; // Top 20%
    else if (ratio <= 0.2) icon = '🔴'; // Bottom 20%
    
    return `<div style="font-size:10px; display:inline-block; margin-left:4px; vertical-align:middle;" title="Posisi: ${(ratio * 100).toFixed(0)}% dari maksimal">${icon}</div>`;
  }
};