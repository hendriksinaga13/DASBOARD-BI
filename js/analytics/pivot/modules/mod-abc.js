export default {
  id: 'abc',
  defaultConfig: { showAbc: false },
  renderToolbar: (cfg) => `
    <label style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#475569;">
      <input type="checkbox" data-module="abc" data-key="showAbc" ${cfg.showAbc ? 'checked' : ''} style="width:12px; height:12px;">🔠 ABC
    </label>
  `,
  // Fungsi transformRows berjalan setelah data di-sort
  transformRows: (rows, cfg) => {
    if (!cfg.showAbc) return rows;
    
    // Cari total omset dari seluruh baris (kecuali child/parent jika hierarki)
    let total = 0;
    rows.forEach(r => {
      if (r._type !== 'child') total += (r.measures['omset'] || 0);
    });
    
    if (total === 0) return rows;

    let cumulative = 0;
    return rows.map(r => {
      // Lewati baris child dalam perhitungan kumulatif
      if (r._type === 'child') {
        return { ...r, abcClass: null };
      }

      const val = r.measures['omset'] || 0;
      cumulative += val;
      const pct = (cumulative / total) * 100;
      
      let abcClass = 'C';
      if (pct <= 80) abcClass = 'A';
      else if (pct <= 95) abcClass = 'B';

      return { ...r, abcClass };
    });
  },
  renderRowLabel: (row, cfg) => {
    if (!cfg.showAbc || !row.abcClass) return '';
    
    const colors = {
      'A': { bg: '#DCFCE7', text: '#166534', border: '#BBF7D0' },
      'B': { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
      'C': { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
    };
    const c = colors[row.abcClass];
    
    return `<span style="display:inline-block; margin-left:6px; padding:0px 4px; font-size:9px; font-weight:800; border-radius:4px; border:1px solid ${c.border}; background:${c.bg}; color:${c.text};" title="Kontribusi Kumulatif: ${row.abcClass}">${row.abcClass}</span>`;
  }
};