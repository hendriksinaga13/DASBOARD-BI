export default {
  id: 'targetcolor',
  defaultConfig: { showTargetColor: false },
  renderToolbar: (cfg) => `
    <label style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#475569;">
      <input type="checkbox" data-module="targetcolor" data-key="showTargetColor" ${cfg.showTargetColor ? 'checked' : ''} style="width:12px; height:12px;">🎯 Warnai Target
    </label>
  `,
  cellStyle: (rawVal, mKey, cfg, minMax, row) => {
    if (!cfg.showTargetColor || mKey !== 'omset' || !row.target || row.target <= 0) return '';
    
    // Jika Omset >= Target -> Hijau, Jika di bawah -> Merah
    if (rawVal >= row.target) {
      return 'background-color: #DCFCE7 !important; color: #166534 !important; font-weight: 800 !important;';
    } else if (rawVal < row.target * 0.5) {
      return 'background-color: #FEE2E2 !important; color: #991B1B !important; font-weight: 800 !important;'; // Di bawah 50% target (Kritis)
    } else {
      return 'background-color: #FEF2F2 !important; color: #B91C1C !important;'; // Di bawah target (Warning)
    }
  }
};