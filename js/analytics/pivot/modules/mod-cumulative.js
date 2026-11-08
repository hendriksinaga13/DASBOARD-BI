export default {
  id: 'cumulative',
  defaultConfig: { cumulative: false },
  renderToolbar: (cfg) => `
    <label style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#475569;">
      <input type="checkbox" data-module="cumulative" data-key="cumulative" ${cfg.cumulative ? 'checked' : ''} style="width:12px; height:12px;">∑ Running
    </label>
  `,
  processRows: (rows, cfg) => {
    if (!cfg.cumulative) return rows;
    let running = {};
    rows.forEach(r => {
      if (!running[r.mKey]) running[r.mKey] = 0; 
    });
    return rows.map(row => {
      const newMeasures = { ...row.measures };
      cfg.measures.forEach(mKey => {
        // running sum (butuh inisialisasi awal di luar mapping)
        // Kita simpan state di variabel luar (closure)
      });
      return row;
    });
  },
  // Implementasi disederhanakan agar mudah dibaca
  transformRows: (rows, cfg) => {
    if (!cfg.cumulative) return rows;
    const running = {};
    cfg.measures.forEach(m => running[m] = 0);
    return rows.map(r => {
      const copy = { ...r, measures: { ...r.measures } };
      cfg.measures.forEach(m => {
        running[m] += (r.measures[m] || 0);
        copy.measures[m] = running[m];
      });
      return copy;
    });
  }
};