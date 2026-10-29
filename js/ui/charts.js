import { rp, compactRp, esc, shortNum } from '../core/utils.js';
const COLORS = ['#1D4ED8','#0EA5E9','#14B8A6','#F59E0B','#8B5CF6','#EC4899','#64748B','#22C55E','#EF4444','#06B6D4'];
export function chartTrend(points, opts = {}){
  if(!points.length) return '<div class="empty">Belum ada data.</div>';
  const fmt = opts.format || shortNum;
  const W = 780, H = 250, L = 62, R = 16, T = 16, B = 38;
  const iw = W - L - R, ih = H - T - B;
  const vals = points.map(p => p.value);
  const maxV = Math.max(0, ...vals), minV = Math.min(0, ...vals);
  const top = maxV > 0 ? maxV * 1.1 : 1, bot = minV < 0 ? minV * 1.1 : 0;
  const span = top - bot || 1;
  const n = points.length;
  const x = i => n === 1 ? L + iw/2 : L + (i/(n-1))*iw;
  const y = v => T + ih - ((v - bot) / span) * ih;
  let grid = '', ylab = '';
  for(let t = 0; t <= 4; t++){
    const val = bot + (span * t/4), yy = y(val);
    grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W-R}" y2="${yy.toFixed(1)}" stroke="#EEF2F7"/>`;
    ylab += `<text class="axis-l" x="${L-8}" y="${(yy+3.5).toFixed(1)}" text-anchor="end">${esc(fmt(val))}</text>`;
  }
  let d = '';
  points.forEach((p, i) => { d += (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1) + ' '; });
  const zeroY = y(0);
  const area = d + `L${x(n-1).toFixed(1)} ${zeroY.toFixed(1)} L${x(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;
  const step = Math.max(1, Math.ceil(n / 12));
  let xlab = '';
  points.forEach((p, i) => {
    if(i % step !== 0 && i !== n - 1) return;
    xlab += `<text class="axis-x" x="${x(i).toFixed(1)}" y="${H-14}" text-anchor="middle">${esc(p.label)}</text>`;
  });
  let dots = '';
  points.forEach((p, i) => {
    dots += `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.4" fill="#fff" stroke="${COLORS[0]}" stroke-width="2" data-tip="${esc(p.label)} • ${esc(rp(p.value))}"/>`;
  });
  return `<div class="chartbox"><svg viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="gradArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1D4ED8" stop-opacity=".22"/><stop offset="100%" stop-color="#1D4ED8" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}${ylab}${xlab}
    <path d="${area}" fill="url(#gradArea)"/>
    <path d="${d}" fill="none" stroke="${COLORS[0]}" stroke-width="2.4" stroke-linejoin="round"/>
    ${dots}
  </svg></div>`;
}
export function chartBars(items, opts = {}){
  if(!items.length) return '<div class="empty">Tidak ada data.</div>';
  const max = Math.max(...items.map(i => Math.abs(i.value)), 1);
  const fmt = opts.format || compactRp;
  return '<div class="barlist">' + items.map((it, i) => {
    const w = (Math.abs(it.value) / max * 100).toFixed(1);
    const col = COLORS[i % COLORS.length];
    return `<div class="barrow" data-tip="${esc(it.label)} • ${esc(rp(it.value))}">
      <div class="barlabel">${esc(it.label)}</div>
      <div class="bartrack"><div class="barfill" style="width:${w}%;background:${col}"></div></div>
      <div class="barval">${esc(fmt(it.value))}</div>
    </div>`;
  }).join('') + '</div>';
}
export function chartDonut(items){
  if(!items.length) return '<div class="empty">Tidak ada data.</div>';
  const total = items.reduce((s, i) => s + i.value, 0);
  const abs = Math.abs(total) || 1;
  const C = 70, R = 54, r = 36;
  let arcs = '';
  if(items.length === 1){
    arcs = `<circle cx="${C}" cy="${C}" r="${(R+r)/2}" fill="none" stroke="${COLORS[0]}" stroke-width="${R-r}"/>`;
  } else {
    let a = -Math.PI/2;
    items.forEach((it, i) => {
      const ang = (Math.abs(it.value) / abs) * Math.PI * 2;
      if(ang <= 0) return;
      const a0 = a, a1 = a + ang; a = a1;
      const large = ang > Math.PI ? 1 : 0;
      const x0 = C + R*Math.cos(a0), y0 = C + R*Math.sin(a0);
      const x1 = C + R*Math.cos(a1), y1 = C + R*Math.sin(a1);
      const x2 = C + r*Math.cos(a1), y2 = C + r*Math.sin(a1);
      const x3 = C + r*Math.cos(a0), y3 = C + r*Math.sin(a0);
      arcs += `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} A${r} ${r} 0 ${large} 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z" fill="${COLORS[i % COLORS.length]}" stroke="#fff" stroke-width="1.5"/>`;
    });
  }
  const legend = items.map((it, i) => `<div class="leg"><i style="background:${COLORS[i % COLORS.length]}"></i><span>${esc(it.label)}</span><b>${(Math.abs(it.value)/abs*100).toFixed(1)}%</b></div>`).join('');
  return `<div class="donutwrap"><svg viewBox="0 0 140 140" class="donut">${arcs}
    <text x="70" y="67" text-anchor="middle" class="donut-v">${esc(compactRp(total))}</text>
    <text x="70" y="83" text-anchor="middle" class="donut-l">TOTAL</text>
  </svg><div class="legend">${legend}</div></div>`;
}