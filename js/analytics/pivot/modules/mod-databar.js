export default {
  id: 'databar',
  defaultConfig: { showDataBars: false },
  renderToolbar: (cfg) => `
    <label style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#475569;">
      <input type="checkbox" data-module="databar" data-key="showDataBars" ${cfg.showDataBars ? 'checked' : ''} style="width:12px; height:12px;">Bar
    </label>
  `,
  cellStyle: (rawVal, mKey, cfg, minMax) => {
    if (!cfg.showDataBars || cfg.pctMode !== 'raw' || !rawVal) return '';
    const min = minMax[mKey].min, max = minMax[mKey].max;
    if (min === max) return '';
    let ratio = (rawVal - min) / (max - min);
    if (ratio < 0) ratio = 0; if (ratio > 1) ratio = 1;
    const pct = (ratio * 100).toFixed(0);
    return `background: linear-gradient(to right, rgba(59, 130, 246, 0.2) ${pct}%, transparent ${pct}%);`;
  }
};