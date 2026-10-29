export const store = {
  state: {
    files: [],
    rows: [],
    outletMaster: new Map(),
    errors: [],
    meta: { loadedAt: null },
    filters: { from: '', to: '', transtype: 'ALL', q: '' },
    view: 'overview',
    sort: {},
    ui: {
      trendMode: 'day',
      trendMetric: 'rupiah',
      outletTab: 'aktif',
      comparisonDim: 'salesman',
      pivot: { rows: 'salesman', cols: '', measure: 'omset', sort: 'value_desc' },
    },
    targets: {},
    targetMonth: null,
    targetView: 'all',
  },
  subs: new Set(),
  set(patch){ Object.assign(this.state, patch); this.emit(); },
  setFilter(key, value){ this.state.filters[key] = value; this.emit(); },
  sub(fn){ this.subs.add(fn); return () => this.subs.delete(fn); },
  emit(){ for(const fn of this.subs) fn(this.state); }
};