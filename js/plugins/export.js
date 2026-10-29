import { toast } from '../ui/feedback.js';
import { selectFiltered, selectAgg, selectNotYet } from '../core/selectors.js';
import { groupBy } from '../data/aggregator.js';
import { store } from '../core/store.js';
import { comparisonBy } from './comparison.js';
function escCSV(v){
  const s = String(v == null ? '' : v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(rows){
  if(!rows.length) return '';
  const cols = Object.keys(rows[0]);
  return [cols.join(',')].concat(rows.map(r => cols.map(c => escCSV(r[c])).join(','))).join('\r\n');
}
export function downloadCSV(rows, filename){
  if(!rows.length){ toast('Tidak ada data untuk diekspor.'); return; }
  const csv = '\uFEFF' + toCSV(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  toast('Ekspor: ' + filename);
}
export function exportTransactions(){
  const rows = selectFiltered(store.state);
  downloadCSV(rows.map(r => ({
    Tanggal: r.day, Periode: r.periode, Week: r.week, Faktur: r.invoice, TRANSTYPE: r.tt,
    Salesman: r.salesman, Outlet: r.outlet, Rayon: r.rayon,
    Kabupaten: r.kabupaten, Kecamatan: r.kecamatan,
    Pcode: r.pcode, Produk: r.product, Kemasan: r.kemasan,
    Subbrand: r.subbrand, Divisi: r.divisi, QtyPCS: r.netQty,
    QtyKarton: isFinite(r.netCarton) ? +r.netCarton.toFixed(3) : '',
    HargaBruto: r.amount, TotalNet: r.total,
  })), 'transaksi_filter.csv');
}
export function exportSalesman(){
  const rows = selectFiltered(store.state);
  const a = selectAgg(store.state);
  const data = groupBy(rows, r => r.salesman, 'omset').sort((x, y) => y.value - x.value).map(g => ({
    Salesman: g.label, Omset: Math.round(g.value), Baris: g.rows.length,
    KontribusiPct: a.omset ? ((g.value / a.omset) * 100).toFixed(2) : '0',
  }));
  downloadCSV(data, 'ringkasan_salesman.csv');
}
export function exportProduct(){
  const rows = selectFiltered(store.state);
  const data = groupBy(rows, r => r.pcode || r.product, 'omset').sort((x, y) => y.value - x.value).map(g => ({
    Pcode: g.label, Produk: g.rows[0]?.product || '', Subbrand: g.rows[0]?.subbrand || '',
    Divisi: g.rows[0]?.divisi || '', Kemasan: g.rows[0]?.kemasan || '',
    Omset: Math.round(g.value), Baris: g.rows.length,
  }));
  downloadCSV(data, 'ringkasan_produk.csv');
}
export function exportOutlet(){
  const rows = selectFiltered(store.state);
  const a = selectAgg(store.state);
  const data = groupBy(rows, r => r.outletKey, 'omset').sort((x, y) => y.value - x.value).map(g => ({
    Outlet: g.rows[0]?.outlet || '', NoOutlet: g.rows[0]?.outletNo || '',
    Tipe: g.rows[0]?.tipe || '', Rayon: g.rows[0]?.rayon || '',
    Kabupaten: g.rows[0]?.kabupaten || '', Salesman: g.rows[0]?.salesman || '',
    Omset: Math.round(g.value), Baris: g.rows.length,
    KontribusiPct: a.omset ? ((g.value / a.omset) * 100).toFixed(2) : '0',
  }));
  downloadCSV(data, 'ringkasan_outlet.csv');
}
export function exportDmp(){
  const arr = Array.from(store.state.outletMaster.values());
  downloadCSV(arr.map(o => ({
    NoOutlet: o.outletNo, NamaOutlet: o.outlet, Rayon: o.rayon,
    Kabupaten: o.kabupaten, Kecamatan: o.kecamatan, TipeOutlet: o.tipe,
    Channel: o.channel, Salesman: o.salesman, KreditLimit: o.kreditlimit,
  })), 'master_outlet.csv');
}
export function exportNotYet(){
  const notYet = selectNotYet(store.state);
  downloadCSV(notYet.map(o => ({
    NoOutlet: o.outletNo, NamaOutlet: o.outlet, Rayon: o.rayon, Salesman: o.salesman,
    Kabupaten: o.kabupaten, Kecamatan: o.kecamatan, Tipe: o.tipe, Channel: o.channel,
  })), 'outlet_belum_transaksi.csv');
}
export function exportComparison(){
  const dim = store.state.ui.comparisonDim || 'salesman';
  const result = comparisonBy(store.state, dim);
  if(!result.rows.length){ toast('Tidak ada data.'); return; }
  downloadCSV(result.rows.map(r => ({
    Dimensi: dim, Label: r.label, Current: Math.round(r.current),
    LastMonth: Math.round(r.lastMonth), DeltaLM: r.deltaLM != null ? +r.deltaLM.toFixed(2) : '',
    LastYear: Math.round(r.lastYear), DeltaLY: r.deltaLY != null ? +r.deltaLY.toFixed(2) : '',
    Avg5W: Math.round(r.avg5w), Delta5W: r.delta5w != null ? +r.delta5w.toFixed(2) : '',
    Avg13W: Math.round(r.avg13w), Delta13W: r.delta13w != null ? +r.delta13w.toFixed(2) : '',
  })), 'perbandingan_' + dim + '.csv');
}