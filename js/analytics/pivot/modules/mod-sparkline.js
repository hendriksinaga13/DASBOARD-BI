export default {
  id: 'sparkline',
  defaultConfig: { showSparkline: false, sparklineMeasure: 'omset' },
  renderToolbar: (cfg) => `
    <label style="display:flex; align-items:center; gap:4px; font-size:10px; font-weight:700; color:#475569;">
      <input type="checkbox" data-module="sparkline" data-key="showSparkline" ${cfg.showSparkline ? 'checked' : ''} style="width:12px; height:12px;">📈 Trend
    </label>
    ${cfg.showSparkline ? `
    <select data-module="sparkline" data-key="sparklineMeasure" style="padding:2px 4px; border:1px solid #CBD5E1; border-radius:4px; font-size:11px;">
      <option value="omset" ${cfg.sparklineMeasure === 'omset' ? 'selected' : ''}>Omset</option>
      <option value="qty" ${cfg.sparklineMeasure === 'qty' ? 'selected' : ''}>Qty</option>
    </select>` : ''}
  `,
  renderExtraHeader: (cfg) => cfg.showSparkline ? `<th style="background:#F0FDF4; text-align:center; border-bottom:1px solid #E2E8F0; padding:2px 6px; font-size:11px; min-width:60px;">📈 Trend</th>` : '',
  renderExtraCell: (rawVal, mKey, cfg, row, computeFn) => {
    if (!cfg.showSparkline) return '';
    const data = computeFn(row.rawRows, cfg.sparklineMeasure);
    const w = 50, h = 16;
    const nums = data.filter(v => isFinite(v));
    if (nums.length < 2) return '<td style="border-bottom:1px solid #E2E8F0; text-align:center;"></td>';
    
    const min = Math.min(...nums), max = Math.max(...nums), range = max - min || 1;
    const step = w / (nums.length - 1);
    const pts = nums.map((v, i) => `${(i*step).toFixed(1)},${(h - ((v-min)/range)*h).toFixed(1)}`).join(' ');
    const trend = nums[nums.length-1] >= nums[0];
    const stroke = trend ? '#10B981' : '#EF4444';
    const fill = trend ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
    const first = data[0] || 0, last = data[data.length-1] || 0;
    const pct = first !== 0 ? ((last - first)/Math.abs(first))*100 : 0;
    const tColor = last >= first ? '#10B981' : '#EF4444';

    return `<td style="border-bottom:1px solid #E2E8F0; padding:2px 4px; text-align:center; vertical-align:middle;">
      <svg width="${w}" height="${h}" style="display:block;">
        <polyline points="0,${h} ${pts} ${w},${h}" fill="${fill}" stroke="none"/>
        <polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round"/>
      </svg>
      <div style="font-size:8px; color:${tColor}; font-weight:700;">${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%</div>
    </td>`;
  }
};