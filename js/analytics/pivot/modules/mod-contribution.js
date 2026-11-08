export default {
  id: 'contribution',
  defaultConfig: { showContribution: false },
  renderToolbar: (cfg) => `
    <label style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#475569;">
      <input type="checkbox" data-module="contribution" data-key="showContribution" ${cfg.showContribution ? 'checked' : ''} style="width:12px; height:12px;">📊 Kontribusi %
    </label>
  `,
  cellStyle: (rawVal, mKey, cfg, minMax, row, grandMeasures) => {
    if (!cfg.showContribution || mKey !== 'omset' || !rawVal || !grandMeasures || !grandMeasures['omset']) return '';
    
    const total = grandMeasures['omset'];
    const pct = (rawVal / total) * 100;
    
    // Tampilkan bar biru transparan sesuai persentase kontribusi
    return `background: linear-gradient(to right, rgba(59, 130, 246, 0.15) ${pct.toFixed(1)}%, transparent ${pct.toFixed(1)}%);`;
  },
  cellBadge: (rawVal, mKey, cfg, compareDelta, minMax, row, grandMeasures) => {
    if (!cfg.showContribution || mKey !== 'omset' || !rawVal || !grandMeasures || !grandMeasures['omset']) return '';
    
    const total = grandMeasures['omset'];
    const pct = (rawVal / total) * 100;
    
    return `<div style="font-size:9px; color:#1E40AF; font-weight:700; margin-top:1px;">${pct.toFixed(1)}% share</div>`;
  }
};