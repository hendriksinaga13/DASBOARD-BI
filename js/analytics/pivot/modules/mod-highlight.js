export default {
  id: 'highlight',
  defaultConfig: { condFmt: 'heatmap', thresholdValue: 0 },
  renderToolbar: (cfg) => `
    <label style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#475569;">Highlight:
      <select data-module="highlight" data-key="condFmt" style="padding:2px 4px; border:1px solid #CBD5E1; border-radius:4px; font-size:11px;">
        <option value="off" ${cfg.condFmt === 'off' ? 'selected' : ''}>Off</option>
        <option value="heatmap" ${cfg.condFmt === 'heatmap' ? 'selected' : ''}>Heatmap</option>
        <option value="negative" ${cfg.condFmt === 'negative' ? 'selected' : ''}>Negatif</option>
        <option value="threshold" ${cfg.condFmt === 'threshold' ? 'selected' : ''}>Threshold</option>
      </select>
    </label>
    ${cfg.condFmt === 'threshold' ? `
    <label style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#475569;">Val:
      <input type="number" data-module="highlight" data-key="thresholdValue" value="${cfg.thresholdValue || ''}" style="width:60px; padding:2px 4px; border:1px solid #CBD5E1; border-radius:4px; font-size:11px;">
    </label>` : ''}
  `,
  cellStyle: (rawVal, mKey, cfg, minMax) => {
    if (cfg.pctMode !== 'raw' || !cfg.condFmt || cfg.condFmt === 'off') return '';
    
    if (cfg.condFmt === 'negative') {
      return rawVal < 0 ? 'background:#FEE2E2; color:#B91C1C; font-weight:700;' : '';
    }
    if (cfg.condFmt === 'threshold') {
      const th = Number(cfg.thresholdValue) || 0;
      if (th <= 0) return '';
      if (rawVal >= th) return 'background:#DCFCE7; color:#166534; font-weight:700;';
      if (rawVal < th * 0.5) return 'background:#FEE2E2; color:#B91C1C; font-weight:700;';
      return 'background:#FEF3C7; color:#92400E; font-weight:700;';
    }
    if (cfg.condFmt === 'heatmap') {
      const min = minMax[mKey].min, max = minMax[mKey].max;
      if (rawVal === 0 || min === max) return '';
      let ratio = (rawVal - min) / (max - min);
      if (ratio < 0) ratio = 0; if (ratio > 1) ratio = 1;
      const op = 0.05 + (ratio * 0.4);
      return `background: rgba(29, 78, 216, ${op.toFixed(2)}); color: ${ratio > 0.6 ? '#fff' : '#1E293B'};`;
    }
    return '';
  }
};