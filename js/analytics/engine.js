import { selectFiltered, selectAgg } from '../core/selectors.js';
import { overallComparison } from '../plugins/comparison.js';
import { groupBy } from '../data/aggregator.js';
import { store } from '../core/store.js';
import * as D from './detectors.js';
import { generateExpertInsights } from './expert-system.js';

const DETECTORS = [
  // Detektor Ultimate Baru
  D.detUltimateRootCause,
  D.detDecliningSalesman,
  D.detDecliningProduct,
  D.detDecliningDivision,
  D.detGrowthEntities,
  D.detWorstDay,
  
  // Detektor Dasar
  D.detConcentrationHHI, D.detGiniInequality, 
  D.detCoverage, D.detBasketDepth,
  D.detPortfolioImbalance, D.detPriorPeriod,
];

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4, growth: 5 };
const CATEGORY_ORDER = { risk: 0, opportunity: 1, quality: 2, efficiency: 3, growth: 4 };

const DIM_FNS = {
  outlet: r => r.outletKey, salesman: r => r.salesman, product: r => r.pcode || r.product,
  channel: r => r.channel, rayon: r => r.rayon, kabupaten: r => r.kabupaten,
  kecamatan: r => r.kecamatan, divisi: r => r.divisi, subbrand: r => r.subbrand,
  day: r => r.day, periode: r => r.periode,
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
    matchNonTime: (r) => true, 
  };

  const out = [];
  for(const fn of DETECTORS){
    try {
      const r = fn(ctx);
      if(r) out.push(r);
    } catch(e){ /* fail-open */ }
  }
  return out.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 9;
    const sb = SEVERITY_ORDER[b.severity] ?? 9;
    if(sa !== sb) return sa - sb;
    return (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9);
  });
}

export function generateAIReport(state = store.state){
  const filteredRows = selectFiltered(state);
  
  if (!filteredRows || filteredRows.length === 0) {
    return {
      healthScore: 0,
      summary: "Sistem tidak dapat menganalisis karena tidak ada data yang cocok dengan filter Anda saat ini.",
      insights: []
    };
  }

  const rawInsights = runInsights(state);
  const agg = selectAgg(state);
  const expertInsights = generateExpertInsights(state, agg, rawInsights);

  let riskScore = 0;
  expertInsights.forEach(i => {
    if(i.severity === 'critical') riskScore += 30;
    else if(i.severity === 'high') riskScore += 15;
    else if(i.severity === 'medium') riskScore += 5;
  });
  
  const isInsufficient = expertInsights.some(i => i.id === 'insufficient-data');
  const healthScore = isInsufficient ? 50 : Math.max(0, 100 - riskScore);

  let summary = `Selamat pagi Manajemen. Sistem **M245 Expert AI** telah memindai **${filteredRows.length.toLocaleString('id-ID')} baris transaksi** berdasarkan filter yang Anda terapkan.\n\n`;
  
  if (isInsufficient) {
    summary = `⚠️ **Analisis Dibatalkan.** Volume data pada filter saat ini terlalu kecil.`;
  } else if (healthScore >= 80) {
    summary += `Secara keseluruhan, kondisi berada di zona **SEHAT (Skor: ${healthScore}/100)**.`;
  } else if (healthScore >= 50) {
    summary += `Berdasarkan data, kondisi berada di zona **WASPADA (Skor: ${healthScore}/100)**.`;
  } else {
    summary += `⚠️ **STATUS BAHAYA (Skor: ${healthScore}/100)**. Dewan AI mendeteksi masalah kritikal.`;
  }

  return { healthScore, summary, insights: expertInsights };
}

export function exportReport(insights){
  // Sama seperti sebelumnya
  const now = new Date().toLocaleString('id-ID');
  let txt = `# Laporan AI Expert Board\n_Generated: ${now}_\n\n`;
  insights.forEach(i => {
    txt += `## ${i.title}\n**Kategori:** ${i.category} | **Severity:** ${i.severity}\n\n${i.desc}\n\n`;
    if (i.nonTechnicalActions) txt += `### Tindakan Non-Teknis:\n${i.nonTechnicalActions.map(a => '- '+a).join('\n')}\n\n`;
    if (i.techActions) txt += `### Tindakan Sistem:\n${i.techActions.map(a => '- '+a).join('\n')}\n\n---\n\n`;
  });
  return txt;
}