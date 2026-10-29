import { iso, isoWeekKey, monthKey } from '../core/utils.js';
const LBP_ALIASES = {
  date:['tanggal faktur','tanggal','tgl faktur','tgl','date'],
  invoice:['faktur','no faktur','nomor faktur','invoice'],
  transtype:['transtype','trans type','tipe transaksi'],
  salesman:['salesman','nama salesman','sales'],
  salesteam:['sales team','team','tim sales'],
  rayon:['rayon','wilayah','area','region'],
  outletno:['no outlet','kode outlet','kode pelanggan'],
  outlet:['nama outlet','outlet','nama toko','customer'],
  tipe:['tipe outlet','tipe','type outlet'],
  pcode:['pcode','kode produk','sku'],
  product:['nama produk','produk','product'],
  kemasan:['kemasan','packaging','isi per karton'],
  subbrandname:['subbrandname','sub brand name','nama subbrand'],
  divisi:['divisi','division','kategori'],
  qty:['qtypcs','qty','quantity','jumlah','pcs'],
  amount:['amount','gross','nilai bruto','harga bruto'],
  disc:['disc','diskon'],
  disc1kh:['disc1kh','disc 1kh'],
  proamount:['proamount','promo amount','promo'],
  total:['total','net','net sales'],
  channel:['channel','kanal'],
  kabupaten:['kabupaten','kab','kota'],
  kecamatan:['kecamatan','kec'],
  kelurahan:['kelurahan','desa'],
  week:['week','minggu'],
  periode:['periode','period'],
};
const DMP_ALIASES = {
  outletno:['no outlet','kode outlet','kode pelanggan'],
  outlet:['nama outlet','outlet','nama toko','customer'],
  alamat:['alamat','address'],
  rayon:['rayon','wilayah','area','region'],
  kabupaten:['kabupaten','kab','kota'],
  kecamatan:['kecamatan','kec'],
  kelurahan:['kelurahan','desa'],
  tipe:['tipe outlet','tipe','type outlet'],
  grup:['grup outlet','grup'],
  channel:['channel','kanal'],
  salesman:['salesman','sales','nama sales'],
  salesteam:['sales team','team sales'],
  kreditlimit:['kredit limit','credit limit'],
};
function normKey(s){ return String(s||'').toLowerCase().replace(/[\s_.\-\/]/g,''); }
function detectDelim(line){
  const cands=['|',';','\t',',']; let best='|', bestN=-1;
  for(const c of cands){ const n=line.split(c).length-1; if(n>bestN){bestN=n;best=c;} }
  return bestN>0?best:'|';
}
function splitLine(line, delim){
  const out=[]; let cur='', q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(q){ if(c==='"'){ if(line[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else { if(c==='"') q=true; else if(c===delim){ out.push(cur); cur=''; } else cur+=c; }
  }
  out.push(cur); return out;
}
function toNum(v){
  if(v==null) return NaN;
  if(typeof v==='number') return v;
  let s=String(v).trim(); if(!s||s==='-'||s==='—') return NaN;
  s=s.replace(/[Rp\s]/gi,'');
  let neg=false; if(/^\(.*\)$/.test(s)){ neg=true; s=s.slice(1,-1); }
  const hasC=s.includes(','), hasD=s.includes('.');
  if(hasC&&hasD){
    if(s.lastIndexOf(',')>s.lastIndexOf('.')) s=s.replace(/\./g,'').replace(',', '.');
    else s=s.replace(/,/g,'');
  } else if(hasC){
    const p=s.split(',');
    s=(p.length===2 && p[1].length!==3) ? s.replace(',','.') : s.replace(/,/g,'');
  } else if(hasD){
    if(s.split('.').length>2) s=s.replace(/\./g,'');
  }
  const n=parseFloat(s); return isNaN(n) ? NaN : (neg ? -n : n);
}
function parseDate(s){
  s=String(s||'').trim(); if(!s) return null;
  let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if(m){ let y=+m[3]; if(y<100) y+=2000; const dt=new Date(Date.UTC(y, +m[2]-1, +m[1])); return isNaN(dt)?null:dt; }
  m=s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if(m){ const dt=new Date(Date.UTC(+m[1],+m[2]-1,+m[3])); return isNaN(dt)?null:dt; }
  return null;
}
function findHeaderLine(lines, pattern){
  for(let i=0;i<Math.min(lines.length,20);i++) if(pattern.test(lines[i])) return i;
  return -1;
}
function parseCartonFactor(kemasan){
  const m=String(kemasan||'').match(/CAR\s*\/\s*(\d+)/i);
  return m ? +m[1] : NaN;
}
export function detectFileType(text){
  const lines=String(text||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n').filter(l=>l.trim());
  if(!lines.length) return 'LBP';
  const hi=findHeaderLine(lines, /faktur|tanggal|outlet|produk|salesman|qty|pelanggan/i);
  const header=(hi>=0 ? lines[hi] : lines[0]).toLowerCase();
  const hasFaktur=/faktur|invoice/.test(header);
  const hasTgl=/tanggal|tgl\b/.test(header);
  const hasOutlet=/outlet|pelanggan|customer|toko/.test(header);
  const hasTT=/transtype|trans type|tipe transaksi/.test(header);
  if(hasFaktur && hasTgl) return 'LBP';
  if(hasOutlet && !hasFaktur && !hasTT) return 'DMP';
  return 'LBP';
}
export function parseLBP(text){
  const clean=String(text||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  const lines=clean.split('\n').filter(l=>l.trim()!=='');
  if(!lines.length) throw new Error('File LBP kosong.');
  const hi=findHeaderLine(lines, /faktur|tanggal|outlet|produk|salesman|qty/i);
  if(hi<0) throw new Error('Header LBP tidak ditemukan.');
  const delim=detectDelim(lines[hi]);
  const header=splitLine(lines[hi], delim).map(h=>h.trim());
  const nh=header.map(normKey);
  const idx={};
  for(const k in LBP_ALIASES){
    idx[k]=-1;
    for(const a of LBP_ALIASES[k]){ const j=nh.indexOf(normKey(a)); if(j>=0){ idx[k]=j; break; } }
  }
  if(idx.date<0) throw new Error('Kolom Tanggal tidak ditemukan.');
  if(idx.amount<0 && idx.total<0) throw new Error('Kolom AMOUNT/Total tidak ditemukan.');
  const records=[], errors=[];
  for(let i=hi+1;i<lines.length;i++){
    const raw=lines[i]; if(!raw.trim()) continue;
    const cells=splitLine(raw, delim);
    const g=k=> idx[k]>=0 ? String(cells[idx[k]]==null?'':cells[idx[k]]).trim() : '';
    const dt=parseDate(g('date'));
    if(!dt){ errors.push({line:i+1, reason:'Tanggal tidak valid', raw:raw.slice(0,120)}); continue; }
    const tt=(g('transtype')||'F').toUpperCase().charAt(0);
    const isRet=tt==='R';
    const amountRaw=toNum(g('amount'));
    const totalRaw=toNum(g('total'));
    const disc=toNum(g('disc'))||0, disc1=toNum(g('disc1kh'))||0, pro=toNum(g('proamount'))||0;
    let amount=isFinite(amountRaw)?amountRaw:(isFinite(totalRaw)?Math.abs(totalRaw):NaN);
    let total=isFinite(totalRaw)?totalRaw:(isFinite(amount)?(amount-disc-disc1-pro):NaN);
    if(!isFinite(amount)&&!isFinite(total)){ errors.push({line:i+1, reason:'Nilai invalid', raw:raw.slice(0,120)}); continue; }
    const qty=Math.abs(toNum(g('qty'))||0);
    const kemasan=g('kemasan');
    const pcode=g('pcode')||g('product');
    const cartonFactor=parseCartonFactor(kemasan);
    const qtyCarton=(isFinite(cartonFactor)&&cartonFactor>0)?qty/cartonFactor:NaN;
    const dayIso=iso(dt);
    records.push({
      idx: records.length, day: dayIso, invoice: g('invoice')||'-',
      tt: isRet?'R':'F', salesman: g('salesman')||'—', salesTeam: g('salesteam')||'—',
      rayon: g('rayon')||'—', outletNo: g('outletno')||'', outlet: g('outlet')||'(tanpa nama)',
      outletKey: (g('outletno')||'')+'|'+(g('outlet')||''), tipe: g('tipe')||'—',
      pcode, product: g('product')||'(tanpa nama)', kemasan: kemasan||'',
      cartonFactor: isFinite(cartonFactor)?cartonFactor:NaN,
      subbrand: g('subbrandname')||'—', divisi: g('divisi')||'—',
      qty, netQty: isRet?-qty:qty, qtyCarton, netCarton: isRet?-qtyCarton:qtyCarton,
      amount: Math.abs(amount), disc, disc1kh: disc1, pro,
      total: isRet?-Math.abs(total):Math.abs(total),
      channel: g('channel')||'—', kabupaten: g('kabupaten')||'—',
      kecamatan: g('kecamatan')||'—', kelurahan: g('kelurahan')||'—',
      week: g('week')||isoWeekKey(dayIso), periode: g('periode')||monthKey(dayIso),
    });
  }
  if(!records.length) throw new Error('LBP: tidak ada baris valid.');
  return { records, errors };
}
export function parseDMP(text){
  const clean=String(text||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  const lines=clean.split('\n').filter(l=>l.trim()!=='');
  if(!lines.length) throw new Error('File DMP kosong.');
  const hi=findHeaderLine(lines, /outlet|pelanggan|customer|toko|no outlet/i);
  if(hi<0) throw new Error('Header DMP tidak ditemukan.');
  const delim=detectDelim(lines[hi]);
  const header=splitLine(lines[hi], delim).map(h=>h.trim());
  const nh=header.map(normKey);
  const idx={};
  for(const k in DMP_ALIASES){
    idx[k]=-1;
    for(const a of DMP_ALIASES[k]){ const j=nh.indexOf(normKey(a)); if(j>=0){ idx[k]=j; break; } }
  }
  if(idx.outletno<0 && idx.outlet<0) throw new Error('DMP butuh kolom No Outlet / Nama Outlet.');
  const outlets=[], errors=[];
  for(let i=hi+1;i<lines.length;i++){
    if(!lines[i].trim()) continue;
    const cells=splitLine(lines[i], delim);
    const g=k=> idx[k]>=0 ? String(cells[idx[k]]==null?'':cells[idx[k]]).trim() : '';
    const no=g('outletno'), nm=g('outlet');
    if(!no && !nm) continue;
    outlets.push({
      outletNo: no, outlet: nm, rayon: g('rayon')||'—',
      kabupaten: g('kabupaten')||'—', kecamatan: g('kecamatan')||'—', kelurahan: g('kelurahan')||'—',
      tipe: g('tipe')||'—', grup: g('grup')||'—', channel: g('channel')||'—',
      salesman: g('salesman')||'—', salesTeam: g('salesteam')||'—',
      kreditlimit: toNum(g('kreditlimit'))||0,
    });
  }
  return { outlets, errors };
}