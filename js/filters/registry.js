export const FILTERS = {
  periode:   { label:'Periode',     get: r => r.periode,   time: true },
  week:      { label:'Week',        get: r => r.week,      time: true },
  tanggal:   { label:'Tanggal',     get: r => r.day,       time: true },
  rayon:     { label:'Rayon',       get: r => r.rayon },
  salesman:  { label:'Salesman',    get: r => r.salesman },
  salesTeam: { label:'Sales Team',  get: r => r.salesTeam },
  divisi:    { label:'Divisi',      get: r => r.divisi,    product: true },
  subbrand:  { label:'Subbrand',    get: r => r.subbrand,  product: true },
  produk:    { label:'Produk',      get: r => r.product,   product: true },
  kabupaten: { label:'Kabupaten',   get: r => r.kabupaten },
  kecamatan: { label:'Kecamatan',   get: r => r.kecamatan },
  tipe:      { label:'Tipe Outlet', get: r => r.tipe },
  channel:   { label:'Channel',     get: r => r.channel },
};
export function initFilters(filters){
  for(const key in FILTERS) if(!filters[key]) filters[key] = new Set();
}