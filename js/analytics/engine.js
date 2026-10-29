import { selectFiltered, selectAgg, matchRow } from '../core/selectors.js';
import { overallComparison } from '../plugins/comparison.js';
import { groupBy } from '../data/aggregator.js';
import { store } from '../core/store.js';
import * as D from './detectors.js';

const DETECTORS = [
  D.detConcentrationHHI, D.detGiniInequality, D.detParetoGap, D.detEntropy,
  D.detTrendSignificance, D.detRegimeShift, D.detPersistence, D.detForecastDivergence,
  D.detDispersion, D.detOutliers,
  D.detCoverage, D.detDropoff, D.detCohortRetention, D.detRFM,
  D.detPVMDecomposition, D.detPortfolioImbalance, D.detWhitespace,
  D.detReturnAnomaly, D.detDiscountAbuse, D.detBasketDepth,
  D.detPriorPeriod, D.detRunrate,
];

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const CATEGORY_ORDER = { risk: 0, opportunity: 1, quality: 2, efficiency: 3, growth: 4 };

const DIM_FNS = {
  outlet: r => r.outletKey, salesman: r => r.salesman,
  product: r => r.pcode || r.product, channel: r => r.channel,
  rayon: r => r.rayon, kabupaten: r => r.kabupaten,
  kecamatan: r => r.kecamatan, divisi: r => r.divisi,
  subbrand: r => r.subbrand, day: r => r.day, periode: r => r.periode,
};

function makeByDim(rows){
  const cache = new Map();
  return function(dim, metric){
    const key = dim + '::' + metric;
    if(cache.has(key)) return cache.get(key);
    const fn = DIM_FNS[dim];
    if(!fn) return [];
    const result = groupBy(rows, fn, metric);
    cache.set(key, result);
    return result;
  };
}

export function runInsights(state = store.state){
  const rows = selectFiltered(state);
  if(!rows.length) return [];
  const agg = selectAgg(state);

  const ctx = {
    rows, agg, state,
    byDim: makeByDim(rows),
    overall: overallComparison(state),
    matchNonTime: (r) => {
      const f = state.filters;
      if(f.transtype !== 'ALL' && r.tt !== f.transtype) return false;
      for(const k in f){
        if(k === 'from' || k === 'to' || k === 'q' || k === 'transtype') continue;
        const set = f[k];
        if(!(set instanceof Set) || !set.size) continue;
        const def = {outlet:'outletKey',salesman:'salesman',product:'product',channel:'channel',rayon:'rayon',kabupaten:'kabupaten',kecamatan:'kecamatan',divisi:'divisi',subbrand:'subbrand',salesTeam:'salesTeam',tipe:'tipe',produk:'product'}[k];
        if(!def) continue;
        const val = def === 'outletKey' ? r.outletKey : r[def];
        if(!set.has(val)) return false;
      }
      return true;
    },
  };

  const out = [];
  for(const fn of DETECTORS){
    try {
      const r = fn(ctx);
      if(r) out.push(r);
    } catch(e){ /* fail-open */ }
  }
  return out.sort((a,b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 9;
    const sb = SEVERITY_ORDER[b.severity] ?? 9;
    if(sa !== sb) return sa - sb;
    return (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9);
  });
}

export function exportReport(insights){
  const now = new Date().toLocaleString('id-ID');
  const lines = [
    '# Laporan Insight Analytics',
    '',
    `_Generated: ${now}_`,
    `_Total temuan: ${insights.length}_`,
    '',
  ];
  const byCategory = {};
  insights.forEach(i => { (byCategory[i.category] = byCategory[i.category] || []).push(i); });
  for(const cat of Object.keys(byCategory)){
    lines.push(`## ${cat.toUpperCase()} (${byCategory[cat].length})`);
    for(const i of byCategory[cat]){
      lines.push('', `### ${i.title}`);
      lines.push(`- **Severity:** ${i.severity} · **Confidence:** ${i.confidence}`);
      lines.push(`- **Methodology:** ${i.methodology}`);
      lines.push('', i.desc);
      if(i.metric) lines.push('', `> ${i.metric}`);
      if(i.evidence && i.evidence.length){
        lines.push('', '**Bukti:**');
        i.evidence.forEach(e => lines.push(`- ${e.label}: ${e.value}`));
      }
      if(i.recommendation) lines.push('', `**Rekomendasi:** ${i.recommendation}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}