import { NF1 } from '../core/utils.js';
export function deltaSpan(v){
  if(v == null || !isFinite(v)) return '<span class="delta fl">n/a</span>';
  const cls = v > 0.05 ? 'up' : v < -0.05 ? 'dn' : 'fl';
  const arrow = v > 0.05 ? '▲' : v < -0.05 ? '▼' : '■';
  return `<span class="delta ${cls}">${arrow} ${NF1.format(Math.abs(v))}%</span>`;
}