export default {
  id: 'compare',
  defaultConfig: { compareMode: 'none' },
  renderToolbar: (cfg) => `
    <label style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#475569;">Compare:
      <select data-module="compare" data-key="compareMode" style="padding:2px 4px; border:1px solid #CBD5E1; border-radius:4px; font-size:11px;">
        <option value="none" ${cfg.compareMode === 'none' ? 'selected' : ''}>Tanpa</option>
        <option value="lm" ${cfg.compareMode === 'lm' ? 'selected' : ''}>vs LM</option>
        <option value="ly" ${cfg.compareMode === 'ly' ? 'selected' : ''}>vs LY</option>
        <option value="target" ${cfg.compareMode === 'target' ? 'selected' : ''}>vs Target</option>
      </select>
    </label>
  `,
  cellBadge: (rawVal, mKey, cfg, compareDelta) => {
    if (cfg.compareMode === 'none' || mKey !== 'omset' || compareDelta == null) return '';
    const color = compareDelta >= 0 ? '#10B981' : '#EF4444';
    const arrow = compareDelta >= 0 ? '▲' : '▼';
    return `<div style="font-size:9px; color:${color}; font-weight:700; margin-top:1px;">${arrow} ${compareDelta >= 0 ? '+' : ''}${compareDelta.toFixed(1)}%</div>`;
  }
};