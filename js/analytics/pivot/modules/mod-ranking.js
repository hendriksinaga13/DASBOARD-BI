export default {
  id: 'ranking',
  defaultConfig: { showRanking: false },
  renderToolbar: (cfg) => `
    <label style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#475569;">
      <input type="checkbox" data-module="ranking" data-key="showRanking" ${cfg.showRanking ? 'checked' : ''} style="width:12px; height:12px;">🏆 Rank
    </label>
  `,
  // Hitung ranking setelah data di-sort
  transformRows: (rows, cfg) => {
    if (!cfg.showRanking) return rows;
    let rank = 1;
    return rows.map(r => {
      // Jangan beri ranking ke baris child (jika pakai hierarki)
      if (r._type === 'child') return r;
      return { ...r, rank: rank++ };
    });
  },
  // Tampilkan di samping label baris
  renderRowLabel: (row, cfg) => {
    if (!cfg.showRanking || !row.rank) return '';
    return `<span style="display:inline-block; margin-left:4px; padding:0px 4px; font-size:9px; font-weight:800; border-radius:4px; background:#F1F5F9; color:#475569; border:1px solid #E2E8F0;" title="Peringkat #${row.rank}">#${row.rank}</span>`;
  }
};