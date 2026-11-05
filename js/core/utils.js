export const NF  = new Intl.NumberFormat('id-ID');
export const NF1 = new Intl.NumberFormat('id-ID',{minimumFractionDigits:1,maximumFractionDigits:1});
export const num = v => isFinite(v) ? NF.format(Math.round(v)) : '0';
export const rp  = v => 'Rp ' + num(v);
export const pct = v => isFinite(v) ? NF1.format(v) + '%' : '—';
export function compactRp(v){
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if(a >= 1e12) return s + 'Rp ' + NF1.format(a/1e12) + ' T';
  if(a >= 1e9)  return s + 'Rp ' + NF1.format(a/1e9)  + ' M';
  if(a >= 1e6)  return s + 'Rp ' + NF1.format(a/1e6)  + ' Jt';
  if(a >= 1e3)  return s + 'Rp ' + NF1.format(a/1e3)  + ' Rb';
  return s + 'Rp ' + num(a);
}
export function fmtKtn(v){ return isFinite(v) ? NF1.format(v) + ' ktn' : '—'; }
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function iso(d){ return d.toISOString().slice(0, 10); }
export function monthKey(isoStr){ return isoStr.slice(0, 7); }
export function fmtDateID(isoStr){
  if(!isoStr) return '—';
  const [y, m, d] = isoStr.split('-');
  return d + '/' + m + '/' + y;
}
export function dayLabel(isoStr){
  const [ , m, d] = isoStr.split('-');
  const N = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return +d + ' ' + N[+m - 1];
}
export function isoWeekKey(isoStr){
  const d = new Date(isoStr + 'T00:00:00Z');
  const t = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNr + 3);
  const firstThu = t.valueOf();
  t.setUTCMonth(0, 1);
  if(t.getUTCDay() !== 4) t.setUTCMonth(0, 1 + ((4 - t.getUTCDay()) + 7) % 7);
  return d.getUTCFullYear() + '-W' + String(1 + Math.ceil((firstThu - t) / 604800000)).padStart(2,'0');
}
export function hashKey(obj){
  let h = 0;
  const s = JSON.stringify(obj);
  for(let i = 0; i < s.length; i++){ h = (h * 31 + s.charCodeAt(i)) | 0; }
  return String(h);
}
export function fmtSize(bytes){
  if(bytes == null) return '—';
  if(bytes >= 1<<30) return (bytes / (1<<30)).toFixed(2) + ' GB';
  if(bytes >= 1<<20) return (bytes / (1<<20)).toFixed(1) + ' MB';
  if(bytes >= 1<<10) return (bytes / (1<<10)).toFixed(1) + ' KB';
  return bytes + ' B';
}
export function shortNum(v){
  const a = Math.abs(v);
  if(a >= 1e9) return NF1.format(v/1e9) + ' M';
  if(a >= 1e6) return NF1.format(v/1e6) + ' Jt';
  if(a >= 1e3) return NF1.format(v/1e3) + ' Rb';
  return num(v);
}