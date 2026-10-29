import * as S from './stats-advanced.js';
import * as TS from './timeseries.js';
import { priceVolumeMix, contributionAnalysis, ytdRunrate } from './decomposition.js';
import { rfmSegmentation, cohortAnalysis } from './segmentation.js';
import { groupBy } from '../data/aggregator.js';
import { compactRp } from '../core/utils.js';

const DAY_MS = 86400000;

/* ═══════════ CONCENTRATION & DISTRIBUTION ═══════════ */

export function detConcentrationHHI(ctx){
  const { byDim, agg } = ctx;
  const outlets = byDim('outlet', 'omset').filter(g => g.value > 0);
  if(outlets.length < 10) return null;
  const values = outlets.map(g => g.value);
  const ci = S.bootstrapCI(values, S.hhi, 300);
  const hhiVal = ci.point;
  if(hhiVal < 1500) return null;
  const pareto = S.paretoShare(values, 0.8);
  const sorted = outlets.slice().sort((a,b)=>b.value-a.value);
  return {
    id:'concentration-hhi', category:'risk',
    severity: hhiVal > 2500 ? 'critical' : 'high',
    confidence: 'high', effectSize: hhiVal/2500,
    methodology:'Herfindahl-Hirschman Index (HHI) dengan bootstrap 95% CI (n=300)',
    title:`Konsentrasi outlet ${hhiVal > 2500 ? 'ekstrem' : 'tinggi'} (HHI ${hhiVal.toFixed(0)})`,
    desc:`HHI ${hhiVal.toFixed(0)} (95% CI: ${ci.lo.toFixed(0)}–${ci.hi.toFixed(0)}). ${pareto.count} outlet (${(pareto.share*100).toFixed(0)}%) menghasilkan 80% omset.`,
    metric:`HHI: ${hhiVal.toFixed(0)} · Gini: ${S.gini(values).toFixed(2)} · Entropy: ${S.shannonEntropy(values).toFixed(2)}`,
    evidence:[
      {label:'Outlet 80% omset', value:`${pareto.count} dari ${pareto.total}`},
      {label:'Top outlet', value:`${sorted[0].label} (${(sorted[0].value/agg.omset*100).toFixed(1)}%)`},
      {label:'Top 3 share', value:`${(sorted.slice(0,3).reduce((s,g)=>s+g.value,0)/agg.omset*100).toFixed(1)}%`},
      {label:'Bootstrap CI', value:`${ci.lo.toFixed(0)} – ${ci.hi.toFixed(0)}`},
    ],
    recommendation:'Diversifikasi ke outlet tier menengah–bawah. Review program akuisisi & retensi outlet kecil.',
    actionView:'outlet',
  };
}

export function detGiniInequality(ctx){
  const { byDim } = ctx;
  const outlets = byDim('outlet', 'omset').filter(g => g.value > 0);
  if(outlets.length < 10) return null;
  const values = outlets.map(g => g.value);
  const ci = S.bootstrapCI(values, S.gini, 300);
  if(ci.point < 0.6) return null;
  const med = S.median(values), mu = S.mean(values);
  return {
    id:'gini-inequality', category:'opportunity',
    severity: ci.point > 0.75 ? 'high' : 'medium',
    confidence:'high', effectSize: ci.point,
    methodology:'Gini coefficient dengan bootstrap 95% CI',
    title:`Ketimpangan outlet tinggi (Gini ${ci.point.toFixed(2)})`,
    desc:`Gini ${ci.point.toFixed(2)} (95% CI: ${ci.lo.toFixed(2)}–${ci.hi.toFixed(2)}). Mean (${compactRp(mu)}) ${(mu/Math.max(med,1)).toFixed(1)}× median (${compactRp(med)}) — segelintir outlet besar mendistorsi agregat.`,
    metric:`Gini: ${ci.point.toFixed(2)} · Mean/Median: ${(mu/Math.max(med,1)).toFixed(2)}×`,
    evidence:[
      {label:'Outlet aktif', value:outlets.length},
      {label:'Median', value:compactRp(med)},
      {label:'Mean', value:compactRp(mu)},
    ],
    recommendation:'Program pemerataan outlet. Insentif tier menengah. Mean saja bukan KPI representatif.',
    actionView:'outlet',
  };
}

export function detParetoGap(ctx){
  const { byDim, agg } = ctx;
  const outlets = byDim('outlet', 'omset').filter(g => g.value > 0);
  if(outlets.length < 20) return null;
  const p80 = S.paretoShare(outlets.map(g=>g.value), 0.8);
  const p20 = S.paretoShare(outlets.map(g=>g.value), 0.2);
  const ratio = p80.count / p20.count;
  if(ratio < 5) return null;
  return {
    id:'pareto-gap', category:'efficiency', severity:'medium', confidence:'high',
    methodology:'Pareto analysis: outlet konsentrasi 20% vs 80%',
    title:`Pareto imbalance: ${p80.count} outlet vs ${p20.count}`,
    desc:`Untuk mencapai 80% omset butuh ${p80.count} outlet; 20% omset cukup dari ${p20.count} outlet. Rasio ${ratio.toFixed(1)}:1 — long tail sangat panjang.`,
    metric:`Tail ratio: ${ratio.toFixed(1)}× · Aktif: ${outlets.length}`,
    evidence:[
      {label:'Butuh 80% omset', value:`${p80.count} outlet`},
      {label:'Untuk 20% omset', value:`${p20.count} outlet`},
      {label:'Rasio tail', value:`${ratio.toFixed(1)}:1`},
    ],
    recommendation:'Revitalisasi long tail dengan program bundle SKU low-velocity atau channel alternatif.',
    actionView:'outlet',
  };
}

/* ═══════════ TREND & MOMENTUM ═══════════ */

export function detTrendSignificance(ctx){
  const daily = TS.toDailySeries(ctx.rows).map(d=>d.value);
  if(daily.length < 10) return null;
  const test = TS.trendTest(daily);
  if(test.significance === 'none') return null;
  const mu = S.mean(daily);
  const down = test.significance.includes('down');
  return {
    id:'trend-significance', category: down ? 'risk' : 'growth',
    severity: test.significance.startsWith('strong') ? 'high' : 'medium',
    confidence: 'high',
    effectSize: Math.abs(test.z),
    methodology:'Mann-Kendall trend test (non-parametrik, α=0.05/0.01)',
    title:`${test.interpretation} (τ = ${test.tau.toFixed(2)})`,
    desc:`Mann-Kendall Z-statistic = ${test.z.toFixed(2)}. Kendall's τ = ${test.tau.toFixed(3)} mengukur korelasi peringkat tren. ${daily.length} hari dievaluasi, rata-rata ${compactRp(mu)}/hari.`,
    metric:`Z: ${test.z.toFixed(2)} · τ: ${test.tau.toFixed(3)} · Signifikansi: ${down ? 'turun' : 'naik'}`,
    evidence:[
      {label:'Rata-rata harian', value:compactRp(mu)},
      {label:'Volatilitas (CV)', value:S.cv(daily).toFixed(2)},
      {label:'Hari dievaluasi', value:daily.length},
    ],
    recommendation: down
      ? 'Investigasi: outlet churn, distributor issue, atau kompetitor? Cek cross-dimensional drill-down.'
      : 'Dokumentasikan best practice. Skalakan ke periode & wilayah berikutnya.',
    actionView: down ? 'comparison' : 'salesman',
  };
}

export function detRegimeShift(ctx){
  const daily = TS.toDailySeries(ctx.rows);
  if(daily.length < 15) return null;
  const values = daily.map(d=>d.value);
  const cp = TS.detectRegimes(values);
  if(cp.length < 1) return null;
  const idx = cp[0];
  const before = values.slice(0, idx);
  const after = values.slice(idx);
  if(before.length < 5 || after.length < 3) return null;
  const mb = S.mean(before), ma = S.mean(after);
  const changePct = mb === 0 ? 0 : (ma-mb)/Math.abs(mb)*100;
  if(Math.abs(changePct) < 20) return null;
  return {
    id:'regime-shift', category:'risk', severity:'high', confidence:'high',
    effectSize: Math.abs(changePct)/100,
    methodology:'CUSUM change-point detection (k=0.5, h=4)',
    title:`Regime shift terdeteksi pada ${daily[idx].day}`,
    desc:`Perubahan mendadak: rata-rata ${compactRp(mb)} → ${compactRp(ma)} (${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%). CUSUM mendeteksi shift struktural.`,
    metric:`Change: ${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}% · Tanggal: ${daily[idx].day}`,
    evidence:[
      {label:'Sebelum shift', value:compactRp(mb) + '/hari'},
      {label:'Setelah shift', value:compactRp(ma) + '/hari'},
      {label:'Change point', value:daily[idx].day},
    ],
    recommendation:'Investigasi event-driven: perubahan kebijakan, distributor baru, produk launch/discontinue, atau gangguan operasional di sekitar tanggal tsb.',
    actionView:'comparison',
  };
}

export function detPersistence(ctx){
  const daily = TS.toDailySeries(ctx.rows).map(d=>d.value);
  if(daily.length < 14) return null;
  const p = TS.persistence(daily);
  if(Math.abs(p.lag1) < 0.6) return null;
  return {
    id:'persistence', category:'efficiency',
    severity:'info', confidence:'high',
    methodology:'Autocorrelation (lag-1, -7, -14)',
    title:`Persistensi harian tinggi (ρ₁ = ${p.lag1.toFixed(2)})`,
    desc:`Autokorelasi lag-1 = ${p.lag1.toFixed(2)} menunjukkan penjualan hari ini bergantung pada kemarin. Volatilitas bisa diprediksi jangka pendek.`,
    metric:`ρ₁: ${p.lag1.toFixed(2)} · ρ₇: ${p.lag7.toFixed(2)} · ρ₁₄: ${p.lag14.toFixed(2)}`,
    evidence:[
      {label:'Autokorelasi harian', value:p.lag1.toFixed(3)},
      {label:'Pola mingguan', value:p.lag7.toFixed(3)},
    ],
    recommendation: 'Gunakan model autoregressive untuk forecasting. Momentum bisa dimanfaatkan untuk stock planning.',
  };
}

export function detForecastDivergence(ctx){
  const daily = TS.toDailySeries(ctx.rows).map(d=>d.value);
  if(daily.length < 7) return null;
  const f = TS.forecast(daily, 7);
  if(!f) return null;
  const avgPred = S.mean(f.predictions.map(p=>p.pred));
  const lastWeek = S.mean(daily.slice(-7));
  if(lastWeek === 0) return null;
  const divergence = (avgPred-lastWeek)/lastWeek*100;
  if(Math.abs(divergence) < 15) return null;
  return {
    id:'forecast-divergence', category: divergence < 0 ? 'risk' : 'growth',
    severity: Math.abs(divergence) > 30 ? 'high' : 'medium',
    confidence:'medium', effectSize: Math.abs(divergence)/100,
    methodology:'Linear regression forecast dengan residual-based 95% prediction interval',
    title:`Proyeksi 7 hari ke depan ${divergence > 0 ? 'naik' : 'turun'} ${Math.abs(divergence).toFixed(0)}%`,
    desc:`Model OLS: ŷ = ${f.trend.slope.toFixed(0)}x + ${f.trend.intercept.toFixed(0)}, R² = ${f.trend.r2.toFixed(2)}. Rata-rata proyeksi ${compactRp(avgPred)} vs week terakhir ${compactRp(lastWeek)}.`,
    metric:`Divergence: ${divergence > 0 ? '+' : ''}${divergence.toFixed(1)}% · R²: ${f.trend.r2.toFixed(2)}`,
    evidence:[
      {label:'Proyeksi h+1', value:compactRp(f.predictions[0].pred) + ` [${compactRp(f.predictions[0].lo)} – ${compactRp(f.predictions[0].hi)}]`},
      {label:'Proyeksi h+7', value:compactRp(f.predictions[6].pred) + ` [${compactRp(f.predictions[6].lo)} – ${compactRp(f.predictions[6].hi)}]`},
      {label:'Residual SD', value:compactRp(f.residualSd)},
    ],
    recommendation: divergence < 0
      ? 'Ambil tindakan sebelum tren terwujud: push promo, tambah kunjungan, atau intensifikasi outlet pasif.'
      : 'Siapkan supply untuk antisipasi demand. Perkuat channel yang mendorong tren naik.',
    actionView: 'comparison',
  };
}

/* ═══════════ DISPERSION & ANOMALY ═══════════ */

export function detDispersion(ctx){
  const { byDim } = ctx;
  const sm = byDim('salesman', 'omset').filter(g => g.value > 0);
  if(sm.length < 5) return null;
  const values = sm.map(g=>g.value);
  const cvVal = S.cv(values);
  if(cvVal < 1.0) return null;
  const mu = S.mean(values), sd = S.stdev(values);
  return {
    id:'dispersion', category:'efficiency',
    severity: cvVal > 1.5 ? 'high' : 'medium',
    confidence:'high', effectSize: cvVal,
    methodology:'Coefficient of Variation antar salesman',
    title:`Dispersi salesman ekstrem (CV ${cvVal.toFixed(2)})`,
    desc:`Std dev ${(sd/mu*100).toFixed(0)}% dari rata-rata. Performa tidak konsisten — standar kerja belum merata.`,
    metric:`CV: ${cvVal.toFixed(2)} · SD: ${compactRp(sd)}`,
    evidence:[
      {label:'Mean', value:compactRp(mu)},
      {label:'Range', value:`${compactRp(Math.min(...values))} – ${compactRp(Math.max(...values))}`},
    ],
    recommendation:'Ekstrak best practice top performer. Sistem coaching bottom quartile. Review insentif.',
    actionView:'salesman',
  };
}

export function detOutliers(ctx){
  const { byDim } = ctx;
  const outlets = byDim('outlet', 'omset').filter(g => g.value > 0);
  if(outlets.length < 15) return null;
  const values = outlets.map(g=>g.value);
  const median = S.median(values), mad = S.mad(values);
  const outliers = outlets.filter(g => Math.abs(S.robustZscore(g.value, values)) > 3.5);
  if(!outliers.length) return null;
  return {
    id:'outliers', category:'opportunity',
    severity:'info', confidence:'high',
    methodology:'Robust Z-score (MAD-based, threshold 3.5σ)',
    title:`${outliers.length} outlet outlier robust (|z_MAD| > 3.5)`,
    desc:`${outliers.length} outlet menyimpang dari pola umum. Median ${compactRp(median)}, MAD ${compactRp(mad)}.`,
    metric:`Median: ${compactRp(median)} · MAD: ${compactRp(mad)}`,
    evidence: outliers.slice(0,5).map(o => ({
      label: o.label,
      value: `${compactRp(o.value)} (z=${S.robustZscore(o.value, values).toFixed(1)})`,
    })),
    recommendation:'Study outlet outlier untuk model bisnis unik. Replikasi karakteristik atau perlakukan sebagai segmen premium.',
    actionView:'outlet',
  };
}

/* ═══════════ COVERAGE & RETENTION ═══════════ */

export function detCoverage(ctx){
  const { agg, state } = ctx;
  const master = state.outletMaster.size;
  if(!master) return null;
  const coverage = agg.oa / master * 100;
  if(coverage >= 50 && coverage <= 90) return null;
  const ci = S.bootstrapCI([coverage], v=>v[0], 100);
  return {
    id:'coverage', category: coverage < 50 ? 'risk' : 'efficiency',
    severity: coverage < 30 ? 'critical' : coverage < 50 ? 'high' : 'info',
    confidence:'high',
    methodology:'Coverage ratio: OA / total DMP outlets',
    title:`Coverage ${coverage < 50 ? 'rendah' : 'sangat tinggi'} (${coverage.toFixed(1)}%)`,
    desc: coverage < 50
      ? `Hanya ${agg.oa} dari ${master} outlet DMP aktif. ${master-agg.oa} outlet pasif.`
      : `Coverage ${coverage.toFixed(1)}% — hampir penuh, fokus ke produktivitas bukan akuisisi.`,
    metric:`Coverage: ${coverage.toFixed(1)}%`,
    evidence:[
      {label:'Aktif', value:agg.oa},
      {label:'Master DMP', value:master},
      {label:'Pasif', value:master-agg.oa},
    ],
    recommendation: coverage < 50
      ? 'Prioritas #1: aktivasi outlet pasif. Review routing salesman, target kunjungan, insentif visitasi.'
      : 'Alihkan fokus ke basket size, repeat rate, dan tier harga lebih tinggi.',
    actionView:'outlet',
  };
}

export function detDropoff(ctx){
  const { rows, state } = ctx;
  if(!state.filters.from || !state.filters.to) return null;
  const from = new Date(state.filters.from+'T00:00:00Z');
  const to = new Date(state.filters.to+'T00:00:00Z');
  const periodDays = Math.round((to-from)/DAY_MS)+1;
  if(periodDays < 14) return null;
  const midIso = new Date(from.getTime() + Math.floor(periodDays/2)*DAY_MS).toISOString().slice(0,10);
  const first = new Set(), second = new Set();
  for(const r of rows){
    if(r.tt !== 'F') continue;
    if(r.day <= midIso) first.add(r.outletKey);
    else second.add(r.outletKey);
  }
  const dropped = Array.from(first).filter(k => !second.has(k));
  if(dropped.length < 3) return null;
  const rate = dropped.length / first.size * 100;
  return {
    id:'dropoff', category:'risk',
    severity: rate > 30 ? 'critical' : rate > 15 ? 'high' : 'medium',
    confidence:'high', effectSize: rate/100,
    methodology:'2-way period split drop-off analysis',
    title:`${dropped.length} outlet drop-off (${rate.toFixed(0)}%)`,
    desc:`Outlet yang aktif di paruh awal namun silent di paruh akhir. Leading indicator churn.`,
    metric:`Drop rate: ${rate.toFixed(1)}%`,
    evidence:[
      {label:'Aktif awal', value:first.size},
      {label:'Aktif akhir', value:second.size},
      {label:'Drop', value:dropped.length},
    ],
    recommendation:'Prioritaskan visitasi outlet drop-off. Cek stok, competitor, coverage salesperson.',
    actionView:'outlet',
  };
}

export function detCohortRetention(ctx){
  const cohorts = cohortAnalysis(ctx.rows);
  if(cohorts.length < 2) return null;
  const latest = cohorts[cohorts.length-1];
  const month2Retention = latest.retention.find(r => {
    const idx = latest.retention.findIndex(x=>x.month===latest.month);
    return latest.retention.indexOf(r) === idx+2;
  });
  if(!month2Retention || month2Retention.pct > 60) return null;
  return {
    id:'cohort-retention', category:'risk',
    severity: month2Retention.pct < 30 ? 'critical' : 'high',
    confidence:'high',
    methodology:'Cohort retention analysis (month-2 retention)',
    title:`Retensi bulan ke-2 hanya ${month2Retention.pct.toFixed(0)}%`,
    desc:`Kohort ${latest.month}: dari ${latest.totalOutlets} outlet baru, hanya ${month2Retention.active} bertransaksi ulang di bulan ke-2.`,
    metric:`M2 Retention: ${month2Retention.pct.toFixed(1)}%`,
    evidence: latest.retention.slice(0,4).map(r => ({
      label: r.month,
      value: `${r.active} outlet (${r.pct.toFixed(0)}%)`,
    })),
    recommendation:'Investigasi onboarding outlet baru. Follow-up minggu 1–2 critical. Program loyalty untuk first-repeat purchase.',
    actionView:'outlet',
  };
}

export function detRFM(ctx){
  const rfm = rfmSegmentation(ctx.rows, ctx.state.filters.to);
  if(!rfm.segments.length) return null;
  const atRisk = rfm.segments.find(s => s.name === 'At Risk');
  const champions = rfm.segments.find(s => s.name === 'Champion');
  if(!atRisk && !champions) return null;
  const churnRisk = atRisk && champions ? atRisk.count / Math.max(champions.count, 1) : 0;
  if(!atRisk || churnRisk < 0.5) return null;
  return {
    id:'rfm-segment', category:'risk',
    severity: churnRisk > 2 ? 'critical' : 'high',
    confidence:'high', effectSize: churnRisk,
    methodology:'RFM segmentation dengan quantile scoring (R, F, M 1–5)',
    title:`${atRisk.count} outlet "At Risk" vs ${champions?.count || 0} Champion`,
    desc:`Rasio churn risk ${churnRisk.toFixed(1)}:1. Segmen At Risk punya monetary potential ${compactRp(atRisk.monetary)} — reaktivasi bisa recover signifikan.`,
    metric:`At Risk: ${atRisk.count} outlet · Potential: ${compactRp(atRisk.monetary)}`,
    evidence: rfm.segments.slice(0,5).map(s => ({
      label: s.name,
      value: `${s.count} outlet (${compactRp(s.monetary)})`,
    })),
    recommendation:'Program reaktivasi At Risk: outreach personal, incentive win-back, atau bundling spesifik. RTM (route-to-market) check.',
    actionView:'outlet',
  };
}

/* ═══════════ COMPOSITION & DECOMPOSITION ═══════════ */

export function detPVMDecomposition(ctx){
  const { rows, state } = ctx;
  if(!state.filters.from || !state.filters.to) return null;
  const to = new Date(state.filters.to+'T00:00:00Z');
  const from = new Date(state.filters.from+'T00:00:00Z');
  const periodDays = Math.round((to-from)/DAY_MS)+1;
  if(periodDays < 7) return null;
  const prevTo = new Date(from.getTime()-DAY_MS);
  const prevFrom = new Date(prevTo.getTime()-(periodDays-1)*DAY_MS);
  const prevRows = state.rows.filter(r => {
    if(r.day < prevFrom.toISOString().slice(0,10) || r.day > prevTo.toISOString().slice(0,10)) return false;
    return ctx.matchNonTime ? ctx.matchNonTime(r) : true;
  });
  if(!prevRows.length) return null;
  const pvm = priceVolumeMix(rows, prevRows);
  if(!pvm) return null;
  if(Math.abs(pvm.totalChange) < Math.abs(pvm.totalChange)*0.01) return null;
  const dominant = Math.max(Math.abs(pvm.pctPrice), Math.abs(pvm.pctVolume), Math.abs(pvm.pctMix));
  if(dominant < 10) return null;
  const cause = dominant === Math.abs(pvm.pctPrice) ? 'harga' :
                dominant === Math.abs(pvm.pctVolume) ? 'volume' : 'mix produk';
  return {
    id:'pvm', category:'efficiency',
    severity:'medium', confidence:'high',
    methodology:'Price-Volume-Mix decomposition (Sullivan method)',
    title:`Perubahan omset didorong oleh ${cause}`,
    desc:`Total perubahan ${compactRp(pvm.totalChange)} didekomposisi menjadi: harga (${pvm.pctPrice>0?'+':''}${pvm.pctPrice.toFixed(1)}%), volume (${pvm.pctVolume>0?'+':''}${pvm.pctVolume.toFixed(1)}%), mix produk (${pvm.pctMix>0?'+':''}${pvm.pctMix.toFixed(1)}%).`,
    metric:`ΔOmset: ${compactRp(pvm.totalChange)}`,
    evidence: [
      {label:'Price effect', value:compactRp(pvm.priceEffect)},
      {label:'Volume effect', value:compactRp(pvm.volumeEffect)},
      {label:'Mix effect', value:compactRp(pvm.mixEffect)},
    ],
    recommendation: cause === 'harga' ?
      'Perubahan harga signifikan — review pricing strategy, diskon, competitor response.' :
      cause === 'volume' ?
      'Volume-driven — cek demand atau outlet aktivitas. Stabil atau volatile?' :
      'Mix produk berubah — cannibalization atau basket shift. Cek SKU move.',
    actionView:'comparison',
  };
}

export function detPortfolioImbalance(ctx){
  const { byDim, agg } = ctx;
  const products = byDim('product', 'omset').filter(g => g.value > 0);
  if(products.length < 5) return null;
  const sorted = products.slice().sort((a,b)=>b.value-a.value);
  const topShare = sorted[0].value / agg.omset * 100;
  if(topShare < 35) return null;
  const hhi = S.hhi(products.map(g=>g.value));
  return {
    id:'portfolio', category:'risk',
    severity: topShare > 60 ? 'critical' : 'high',
    confidence:'high', effectSize: topShare/100,
    methodology:'Single-SKU concentration + Portfolio HHI',
    title:`Ketergantungan SKU tunggal (${topShare.toFixed(0)}% omset)`,
    desc:`SKU "${sorted[0].rows[0]?.product || sorted[0].label}" menyumbang ${topShare.toFixed(1)}%. Portofolio HHI = ${hhi.toFixed(0)}.`,
    metric:`Top SKU: ${topShare.toFixed(1)}% · HHI Portfolio: ${hhi.toFixed(0)}`,
    evidence: sorted.slice(0,5).map(p => ({
      label: (p.rows[0]?.product || p.label).slice(0,40),
      value: `${(p.value/agg.omset*100).toFixed(1)}%`,
    })),
    recommendation:'Diversifikasi portofolio. Dorong SKU lini kedua via promo atau bundling. Buffer stock SKU utama.',
    actionView:'product',
  };
}

export function detWhitespace(ctx){
  const { rows } = ctx;
  const outletProducts = new Map();
  for(const r of rows){
    if(r.tt !== 'F') continue;
    if(!outletProducts.has(r.outletKey)) outletProducts.set(r.outletKey, new Set());
    outletProducts.get(r.outletKey).add(r.pcode || r.product);
  }
  if(outletProducts.size < 10) return null;
  const coverage = new Map();
  const names = new Map();
  for(const s of outletProducts.values())
    for(const p of s) coverage.set(p, (coverage.get(p)||0)+1);
  for(const r of rows) if(!names.has(r.pcode || r.product)) names.set(r.pcode||r.product, r.product);
  const under = Array.from(coverage.entries())
    .filter(([p,c]) => c/outletProducts.size < 0.3)
    .sort((a,b)=>a[1]-b[1]).slice(0, 5);
  if(under.length < 3) return null;
  return {
    id:'whitespace', category:'opportunity',
    severity:'medium', confidence:'medium',
    methodology:'Outlet-SKU coverage matrix (penetrasi <30%)',
    title:`${under.length} SKU whitespace besar`,
    desc:`SKU dengan penetrasi <30% outlet aktif — cross-sell opportunity signifikan.`,
    metric:`Coverage terendah: ${(under[0][1]/outletProducts.size*100).toFixed(1)}%`,
    evidence: under.map(([p,c]) => ({
      label: (names.get(p)||p).slice(0,40),
      value: `${c}/${outletProducts.size} outlet (${(c/outletProducts.size*100).toFixed(0)}%)`,
    })),
    recommendation:'Program cross-sell terarah. Identifikasi outlet yang belum beli SKU ini untuk promo eksklusif.',
    actionView:'product',
  };
}

/* ═══════════ QUALITY ═══════════ */

export function detReturnAnomaly(ctx){
  const { agg, byDim } = ctx;
  if(agg.retRate < 2) return null;
  const byProduct = byDim('product', 'grossR').filter(g => g.value > 0).sort((a,b)=>b.value-a.value);
  if(!byProduct.length) return null;
  return {
    id:'return', category:'quality',
    severity: agg.retRate > 5 ? 'critical' : agg.retRate > 3 ? 'high' : 'medium',
    confidence:'high',
    methodology:'Return rate + per-SKU drill-down',
    title:`Return rate ${agg.retRate.toFixed(1)}% — perhatian kualitas`,
    desc:`Total return ${compactRp(agg.grossR)} dari gross ${compactRp(agg.grossF)}. Produk retur terbesar: "${byProduct[0].rows[0]?.product || byProduct[0].label}".`,
    metric:`Return: ${agg.retRate.toFixed(2)}% · Threshold: <2%`,
    evidence: byProduct.slice(0,5).map(g => ({
      label: (g.rows[0]?.product || g.label).slice(0,40),
      value: compactRp(g.value),
    })),
    recommendation:'Investigasi kualitas produk, handling, expired date, atau abuse retur. Retur >5% biasanya struktural.',
    actionView:'product',
  };
}

export function detDiscountAbuse(ctx){
  const { byDim } = ctx;
  const sm = byDim('salesman', 'omset').filter(g=>g.value>0).map(g => {
    const disc = g.rows.reduce((s,r)=>s+r.disc+r.disc1kh+r.pro, 0);
    const gross = g.rows.reduce((s,r)=>s+(r.tt==='F'?r.amount:0), 0);
    return { ...g, discPct: gross>0 ? (disc/gross)*100 : 0 };
  }).filter(g => g.discPct > 0);
  if(sm.length < 3) return null;
  const pcts = sm.map(g => g.discPct);
  const mu = S.mean(pcts), sd = S.stdev(pcts);
  const abusers = sm.filter(g => g.discPct > mu + 2*sd && g.discPct > 10);
  if(!abusers.length) return null;
  return {
    id:'discount', category:'quality',
    severity: abusers.some(a=>a.discPct > mu+3*sd) ? 'high' : 'medium',
    confidence:'medium',
    methodology:'Z-score diskon (threshold μ + 2σ)',
    title:`${abusers.length} salesman diskon abnormal (Z > 2)`,
    desc:`Rata-rata diskon ${mu.toFixed(1)}% (σ ${sd.toFixed(1)}). Salesman di atas threshold: ${abusers.map(a=>a.label).join(', ')}.`,
    metric:`Threshold: ${(mu+2*sd).toFixed(1)}% · Mean: ${mu.toFixed(1)}%`,
    evidence: abusers.map(a => ({
      label: a.label,
      value: `${a.discPct.toFixed(1)}% (Z=${((a.discPct-mu)/sd).toFixed(1)})`,
    })),
    recommendation:'Audit diskon — kemungkinan volume-kejar tanpa margin logic. Erosi profit tanpa justifikasi.',
    actionView:'salesman',
  };
}

export function detBasketDepth(ctx){
  const { agg } = ctx;
  if(!agg.avgIpt || agg.hkDays < 5) return null;
  if(agg.avgIpt >= 2 && agg.avgIpt <= 6) return null;
  const shallow = agg.avgIpt < 2;
  return {
    id:'basket', category: shallow ? 'efficiency' : 'growth',
    severity: shallow ? 'medium' : 'info',
    confidence:'high',
    methodology:'Items per transaction (mean over HK)',
    title:`${shallow ? 'Basket size rendah' : 'Basket size sehat'} (${agg.avgIpt.toFixed(2)} item/faktur)`,
    desc: shallow
      ? `Outlet cenderung beli single SKU — cross-sell belum tergarap.`
      : `Outlet membeli ${agg.avgIpt.toFixed(1)} SKU/faktur — pola basket sehat.`,
    metric:`Items/Trx: ${agg.avgIpt.toFixed(2)} · Target: 3–5`,
    evidence:[
      {label:'HK', value:agg.hkDays + ' hari'},
      {label:'Total baris', value:agg.lines},
      {label:'Faktur', value:agg.invoices},
    ],
    recommendation: shallow
      ? 'Bundling program, minimum order multi-SKU, atau insentif cross-sell.'
      : 'Fokus upselling tier harga lebih tinggi, bukan menambah SKU.',
    actionView:'salesman',
  };
}

/* ═══════════ COMPARISON ═══════════ */

export function detPriorPeriod(ctx){
  const { overall } = ctx;
  if(!overall || !overall.lastMonth) return null;
  const growth = (overall.current-overall.lastMonth)/Math.abs(overall.lastMonth)*100;
  if(Math.abs(growth) < 20) return null;
  const down = growth < 0;
  return {
    id:'growth', category: down ? 'risk' : 'growth',
    severity: down ? (growth < -30 ? 'critical' : 'high') : 'info',
    confidence:'high', effectSize: Math.abs(growth)/100,
    methodology:'Month-over-Month growth',
    title:`${down ? 'Penurunan' : 'Pertumbuhan'} ${Math.abs(growth).toFixed(0)}% vs bulan lalu`,
    desc:`Omset ${compactRp(overall.current)} vs ${compactRp(overall.lastMonth)}. ${down ? 'Penurunan signifikan.' : 'Momentum positif.'}`,
    metric:`Growth: ${growth > 0 ? '+' : ''}${growth.toFixed(1)}%`,
    evidence:[
      {label:'Current', value:compactRp(overall.current)},
      {label:'Last Month', value:compactRp(overall.lastMonth)},
      {label:'Gap', value:compactRp(overall.current-overall.lastMonth)},
    ],
    recommendation: down
      ? 'Root cause analysis: distributor issue, outlet churn, competitor, atau seasonal?'
      : 'Dokumentasikan & skalakan. Cek apakah growth merata atau terkonsentrasi.',
    actionView:'comparison',
  };
}

export function detRunrate(ctx){
  const { rows, state } = ctx;
  if(!state.filters.from || !state.filters.to) return null;
  const from = new Date(state.filters.from+'T00:00:00Z');
  const to = new Date(state.filters.to+'T00:00:00Z');
  const days = Math.round((to-from)/DAY_MS)+1;
  const activeDays = new Set(rows.filter(r=>r.tt==='F').map(r=>r.day));
  const dailyVals = Array.from(activeDays).map(d => 
    rows.filter(r=>r.day===d && r.tt==='F').reduce((s,r)=>s+r.amount, 0)
  );
  const rr = ytdRunrate(dailyVals, activeDays.size, Math.max(0, days-activeDays.size));
  if(!rr || rr.ytd === 0) return null;
  return {
    id:'runrate', category:'efficiency', severity:'info', confidence:'medium',
    methodology:'YTD run-rate dengan proyeksi sisa periode',
    title:`Proyeksi akhir periode ${compactRp(rr.projection)}`,
    desc:`YTD ${compactRp(rr.ytd)} dalam ${rr.daysElapsed} hari aktif. Proyeksi linear ${compactRp(rr.projection)} untuk ${days} hari kalender.`,
    metric:`Rate: ${compactRp(rr.dailyAvg)}/hari aktif`,
    evidence:[
      {label:'YTD', value:compactRp(rr.ytd)},
      {label:'Daily avg', value:compactRp(rr.dailyAvg)},
      {label:'Proyeksi', value:compactRp(rr.projection)},
    ],
    recommendation:'Gunakan proyeksi untuk pacing target. Jika masih di bawah 80% target, ambil tindakan sekarang.',
    actionView:'target',
  };
}

/* ═══════════ DISTRIBUTION SHAPE ═══════════ */

export function detEntropy(ctx){
  const { byDim } = ctx;
  const outlets = byDim('outlet', 'omset').filter(g => g.value > 0);
  if(outlets.length < 20) return null;
  const entropy = S.shannonEntropy(outlets.map(g => g.value));
  const maxEntropy = Math.log2(outlets.length);
  const ratio = entropy / maxEntropy;
  if(ratio > 0.8) return null;
  return {
    id:'entropy', category:'efficiency', severity:'medium', confidence:'high',
    methodology:'Shannon entropy of revenue distribution',
    title:`Distribusi omset low entropy (${(ratio*100).toFixed(0)}% dari max)`,
    desc:`Shannon entropy ${entropy.toFixed(2)} dari max ${maxEntropy.toFixed(2)}. Distribusi tidak merata.`,
    metric:`Entropy ratio: ${(ratio*100).toFixed(1)}%`,
    evidence:[
      {label:'Entropy', value:entropy.toFixed(2)},
      {label:'Max possible', value:maxEntropy.toFixed(2)},
      {label:'Outlets', value:outlets.length},
    ],
    recommendation:'Distribusi omset sangat tidak seragam — perlu strategi tier-specific untuk outlet kecil.',
    actionView:'outlet',
  };
}