import * as S from './stats-advanced.js';
import * as TS from './timeseries.js';
import { priceVolumeMix, contributionAnalysis, ytdRunrate } from './decomposition.js';
import { rfmSegmentation, cohortAnalysis } from './segmentation.js';
import { groupBy } from '../data/aggregator.js';
import { compactRp, NF1 } from '../core/utils.js';
import { selectMasterCount } from '../core/selectors.js';
import { comparisonBy } from '../plugins/comparison.js';

const DAY_MS = 86400000;

/* ═══════════════════════════════════════════════════════════════
   HELPER: Kalkulasi EC, IPT, dan Omset
   ═══════════════════════════════════════════════════════════════ */
function calcMetrics(rows) {
  const fRows = rows.filter(r => r.tt === 'F');
  const omset = rows.reduce((s, r) => s + (r.tt === 'F' ? (Number(r.amount)||0) : -(Number(r.amount)||0)), 0);
  const dailyOutlets = new Map();
  const invoices = new Set();
  
  fRows.forEach(r => {
    if (!dailyOutlets.has(r.day)) dailyOutlets.set(r.day, new Set());
    dailyOutlets.get(r.day).add(r.outletKey);
    invoices.add(r.invoice);
  });

  let totalCalls = 0; 
  dailyOutlets.forEach(s => totalCalls += s.size);
  const ec = dailyOutlets.size > 0 ? totalCalls / dailyOutlets.size : 0;
  const ipt = invoices.size > 0 ? fRows.length / invoices.size : 0;
  const oa = new Set(fRows.map(r => r.outletKey)).size;

  return { omset, ec, ipt, oa, faktur: invoices.size };
}

function calcGap(current, base, labelBase, workDaysLeft = 6) {
  const gap = base - current;
  if (gap <= 0) return { gap: 0, surplus: Math.abs(gap), perDay: 0, text: `✓ Surplus ${compactRp(Math.abs(gap))} dari ${labelBase}` };
  return { gap, perDay: gap / workDaysLeft, text: `Kurang ${compactRp(gap)} dari ${labelBase} · Kejar ${compactRp(gap/workDaysLeft)}/hari` };
}

/* ═══════════════════════════════════════════════════════════════
   DETEKTOR ULTIMATE: ROOT CAUSE ANALYSIS (EC & IPT)
   ═══════════════════════════════════════════════════════════════ */

export function detUltimateRootCause(ctx) {
  const cur = ctx.rows;
  const curMetrics = calcMetrics(cur);
  
  const activeWeek = ctx.overall?.activeWeek || 0;
  if (!activeWeek || activeWeek <= 5) return null;
  
  const w5List = [1, 2, 3, 4, 5].map(o => activeWeek - o);
  const w5Rows = ctx.state.rows.filter(r => w5List.includes(Number(r.week)));
  if (!w5Rows.length) return null;
  
  const baseMetrics = calcMetrics(w5Rows);
  const baseWeekly = {
    omset: baseMetrics.omset / 5,
    ec: baseMetrics.ec / 5,
    ipt: baseMetrics.ipt / 5,
  };

  const gap = calcGap(curMetrics.omset, baseWeekly.omset, 'Avg 5W');
  if (gap.gap <= 0) return null;

  const ecDrop = curMetrics.ec < baseMetrics.ec * 0.9; 
  const iptDrop = curMetrics.ipt < baseMetrics.ipt * 0.9;

  let rootCause = "Tidak diketahui";
  let action = [];

  if (ecDrop && !iptDrop) {
    rootCause = "Salesman kurang rajin berkunjung (EC Turun).";
    action = ["Instruksikan Salesman untuk menambah kunjungan harian.", "Cek apakah ada kendala rute atau cuaca."];
  } else if (!ecDrop && iptDrop) {
    rootCause = "Toko membeli lebih sedikit per transaksi (IPT Turun).";
    action = ["Instruksikan Salesman untuk melakukan Cross-Selling (tawarkan produk bundling).", "Cek apakah ada produk kompetitor yang masuk."];
  } else if (ecDrop && iptDrop) {
    rootCause = "Kombinasi: Salesman malas kunjungan DAN toko beli sedikit.";
    action = ["Evaluasi menyeluruh terhadap tim sales.", "Berikan pelatihan teknik closing dan dorong promosi bundling."];
  }

  return {
    id: 'root_cause', category: 'Root Cause Analysis', severity: 'critical',
    title: `Omset Turun ${((gap.gap / baseWeekly.omset)*100).toFixed(1)}%: ${rootCause}`,
    desc: `📉 **Gap Omset:** Kurang ${compactRp(gap.gap)} vs Avg 5W.\n\n` +
          `🎯 **Penyebab Utama:**\n` +
          `• EC (Kunjungan): ${NF1.format(curMetrics.ec)} vs ${NF1.format(baseMetrics.ec)} (${ecDrop ? '🔴 Turun' : '🟢 Stabil'})\n` +
          `• IPT (Keranjang): ${NF1.format(curMetrics.ipt)} vs ${NF1.format(baseMetrics.ipt)} (${iptDrop ? '🔴 Turun' : '🟢 Stabil'})\n\n` +
          `⚠️ **Kesimpulan:** ${rootCause}`,
    nonTechnicalActions: action,
    techActions: ['Filter tanggal untuk melihat detail EC & IPT di menu Pivot.'],
    actionData: null
  };
}

export function detDecliningSalesman(ctx) {
  const res = comparisonBy(ctx.state, 'salesman');
  if (!res || !res.rows) return null;
  
  const declining = res.rows
    .filter(r => r.current > 0 && r.delta5w != null && r.delta5w < -15)
    .sort((a, b) => a.delta5w - b.delta5w)
    .slice(0, 3);

  if (!declining.length) return null;
  const top = declining[0];

  const curRows = ctx.rows.filter(r => r.salesman === top.label);
  const activeWeek = ctx.overall?.activeWeek || 0;
  const w5List = [1, 2, 3, 4, 5].map(o => activeWeek - o);
  const baseRows = ctx.state.rows.filter(r => r.salesman === top.label && w5List.includes(Number(r.week)));

  const curM = calcMetrics(curRows);
  const baseM = calcMetrics(baseRows);
  const gap5w = calcGap(top.currentWeekly || 0, top.avg5w || 0, 'Avg 5W');
  
  const ecDrop = curM.ec < (baseM.ec / 5) * 0.9;
  const iptDrop = curM.ipt < (baseM.ipt / 5) * 0.9;
  
  let diagnosis = "Omset turun.";
  if (ecDrop) diagnosis += " Penyebab: EC (Kunjungan) menurun.";
  if (iptDrop) diagnosis += " Penyebab: IPT (Belanja toko) menurun.";

  // ⚡ FORENSIK: Cari Toko yang hilang/drop untuk Salesman ini
  const curOut = new Map();
  const baseOut = new Map();
  curRows.filter(r => r.tt === 'F').forEach(r => curOut.set(r.outlet, (curOut.get(r.outlet)||0) + r.amount));
  baseRows.filter(r => r.tt === 'F').forEach(r => baseOut.set(r.outlet, (baseOut.get(r.outlet)||0) + r.amount));

  const outletDeltas = [];
  const allOutlets = new Set([...curOut.keys(), ...baseOut.keys()]);
  allOutlets.forEach(o => {
    const c = curOut.get(o) || 0;
    const b = (baseOut.get(o) || 0) / 5; 
    const delta = c - b;
    if (delta < -1000000) outletDeltas.push({ outlet: o, delta, current: c, base: b }); 
  });
  outletDeltas.sort((a,b) => a.delta - b.delta);
  const topLostOutlets = outletDeltas.slice(0, 3);

  let outletDetail = '';
  if (topLostOutlets.length > 0) {
    outletDetail = `\n\n🏪 **Toko yang Drop (Penyebab Utama):**\n` + 
      topLostOutlets.map(o => `• ${o.outlet}: Turun ${compactRp(Math.abs(o.delta))} (Skrg: ${compactRp(o.current)}, Dulu: ${compactRp(o.base)})`).join('\n');
  }

  return {
    id: 'declining_sm', category: 'Penurunan SDM', severity: 'critical',
    title: `Salesman Turun: ${top.label} (-${Math.abs(top.delta5w).toFixed(1)}%)`,
    desc: `📉 **Omset ${top.label}:** ${compactRp(top.current)}\n` +
          `🎯 **Gap 5W:** ${gap5w.text}\n\n` +
          `🔍 **Diagnosis:** ${diagnosis}\n` +
          `• EC: ${NF1.format(curM.ec)} (Avg: ${NF1.format(baseM.ec/5)})\n` +
          `• IPT: ${NF1.format(curM.ipt)} (Avg: ${NF1.format(baseM.ipt/5)})` +
          outletDetail,
    nonTechnicalActions: [
      `Panggil ${top.label}. Tanyakan kenapa toko-toko di atas berhenti beli.`,
      `Target harian: ${compactRp(gap5w.perDay)}/hari.`,
      ecDrop ? "Paksa tambah kunjungan (EC)." : "Paksa jualan lebih banyak per toko (IPT)."
    ],
    techActions: [`Filter data ${top.label} untuk bedah fakturnya.`],
    actionData: { type: 'salesman', keys: declining.map(d => d.label) }
  };
}

export function detDecliningProduct(ctx) {
  const res = comparisonBy(ctx.state, 'product');
  if (!res || !res.rows) return null;
  
  const declining = res.rows
    .filter(r => r.current > 0 && r.delta5w != null && r.delta5w < -20)
    .sort((a, b) => a.delta5w - b.delta5w)
    .slice(0, 3);

  if (!declining.length) return null;
  const top = declining[0];
  const gap5w = calcGap(top.currentWeekly || 0, top.avg5w || 0, 'Avg 5W');

  // ⚡ FORENSIK: Cari Salesman yang berhenti jual produk ini
  const curRows = ctx.rows.filter(r => r.product === top.label);
  const activeWeek = ctx.overall?.activeWeek || 0;
  const w5List = [1, 2, 3, 4, 5].map(o => activeWeek - o);
  const baseRows = ctx.state.rows.filter(r => r.product === top.label && w5List.includes(Number(r.week)));

  const curSm = new Map();
  const baseSm = new Map();
  curRows.filter(r => r.tt === 'F').forEach(r => curSm.set(r.salesman, (curSm.get(r.salesman)||0) + r.amount));
  baseRows.filter(r => r.tt === 'F').forEach(r => baseSm.set(r.salesman, (baseSm.get(r.salesman)||0) + r.amount));

  const smDeltas = [];
  const allSm = new Set([...curSm.keys(), ...baseSm.keys()]);
  allSm.forEach(s => {
    const c = curSm.get(s) || 0;
    const b = (baseSm.get(s) || 0) / 5;
    const delta = c - b;
    if (delta < -500000) smDeltas.push({ sm: s, delta, current: c, base: b });
  });
  smDeltas.sort((a,b) => a.delta - b.delta);
  const topLostSm = smDeltas.slice(0, 3);

  let smDetail = '';
  if (topLostSm.length > 0) {
    smDetail = `\n\n👤 **Salesman yang Berhenti Jual:**\n` + 
      topLostSm.map(s => `• ${s.sm}: Turun ${compactRp(Math.abs(s.delta))}`).join('\n');
  } else {
    smDetail = `\n\n👤 **Tidak ada salesman spesifik yang drop, kemungkinan masalah di tingkat toko atau stok.**`;
  }

  return {
    id: 'declining_prod', category: 'Penurunan Produk', severity: 'high',
    title: `Produk Drop: "${top.label}" turun ${Math.abs(top.delta5w).toFixed(1)}%`,
    desc: `📦 **Produk:** ${top.label}\n` +
          `📊 **Omset:** ${compactRp(top.current)} (Avg: ${compactRp(top.avg5w)})\n` +
          `🎯 **Gap:** ${gap5w.text}` +
          smDetail,
    nonTechnicalActions: [
      `Cek stok ${top.label} di gudang SEKARANG (siapa tahu kosong).`,
      `Instruksikan Salesman yang disebut di atas untuk push lagi.`,
      `Buat Bundling dengan produk yang laku.`
    ],
    techActions: ['Filter produk ini untuk melihat siapa yang berhenti jual.'],
    actionData: { type: 'product', keys: [top.label] }
  };
}

export function detDecliningDivision(ctx) {
  const res = comparisonBy(ctx.state, 'divisi');
  if (!res || !res.rows) return null;
  
  const declining = res.rows
    .filter(r => r.current > 0 && r.delta5w != null && r.delta5w < -10)
    .sort((a, b) => a.delta5w - b.delta5w)
    .slice(0, 2);

  if (!declining.length) return null;
  const top = declining[0];
  const gap5w = calcGap(top.currentWeekly || 0, top.avg5w || 0, 'Avg 5W');

  // ⚡ FORENSIK: Cari Subrand yang drop di divisi ini
  const curRows = ctx.rows.filter(r => r.divisi === top.label);
  const activeWeek = ctx.overall?.activeWeek || 0;
  const w5List = [1, 2, 3, 4, 5].map(o => activeWeek - o);
  const baseRows = ctx.state.rows.filter(r => r.divisi === top.label && w5List.includes(Number(r.week)));

  const curSub = new Map();
  const baseSub = new Map();
  curRows.filter(r => r.tt === 'F').forEach(r => curSub.set(r.subbrand, (curSub.get(r.subbrand)||0) + r.amount));
  baseRows.filter(r => r.tt === 'F').forEach(r => baseSub.set(r.subbrand, (baseSub.get(r.subbrand)||0) + r.amount));

  const subDeltas = [];
  const allSub = new Set([...curSub.keys(), ...baseSub.keys()]);
  allSub.forEach(s => {
    const c = curSub.get(s) || 0;
    const b = (baseSub.get(s) || 0) / 5;
    const delta = c - b;
    if (delta < -1000000) subDeltas.push({ sub: s, delta });
  });
  subDeltas.sort((a,b) => a.delta - b.delta);
  const topLostSub = subDeltas.slice(0, 3);

  let subDetail = '';
  if (topLostSub.length > 0) {
    subDetail = `\n\n📦 **Subrand yang Drop:**\n` + 
      topLostSub.map(s => `• ${s.sub}: Turun ${compactRp(Math.abs(s.delta))}`).join('\n');
  }

  return {
    id: 'declining_div', category: 'Penurunan Divisi', severity: 'high',
    title: `Divisi ${top.label} Melemah (-${Math.abs(top.delta5w).toFixed(1)}%)`,
    desc: `🏢 **Divisi:** ${top.label}\n` +
          `📊 **Omset:** ${compactRp(top.current)} (Avg: ${compactRp(top.avg5w)})\n` +
          `🎯 **Gap:** ${gap5w.text}` +
          subDetail,
    nonTechnicalActions: [
      `Rapat koordinasi tim sales divisi ${top.label}.`,
      `Kejar ${compactRp(gap5w.perDay)}/hari.`,
      `Evaluasi strategi promosi divisi ini.`
    ],
    techActions: ['Filter divisi ini untuk melihat detail.'],
    actionData: null
  };
}

export function detGrowthEntities(ctx) {
  const res = comparisonBy(ctx.state, 'salesman');
  if (!res || !res.rows) return null;
  
  const growth = res.rows
    .filter(r => r.current > 0 && r.delta5w != null && r.delta5w > 20)
    .sort((a, b) => b.delta5w - a.delta5w)
    .slice(0, 3);

  if (!growth.length) return null;
  const top = growth[0];
  
  return {
    id: 'growth_5w', category: 'Pertumbuhan Positif', severity: 'growth',
    title: `Bintang Lapangan: ${top.label} tumbuh +${top.delta5w.toFixed(1)}%`,
    desc: `🌟 **Salesman:** ${top.label}\n` +
          `📊 **Omset:** ${compactRp(top.current)}\n` +
          `📈 **vs Avg 5W:** +${top.delta5w.toFixed(1)}%\n\n` +
          `💡 Jadikan ${top.label} sebagai mentor untuk tim lain.`,
    nonTechnicalActions: [
      `Berikan apresiasi / bonus.`,
      `Minta dia sharing teknik closing-nya.`
    ],
    techActions: ['Filter salesman ini untuk melihat resep suksesnya.'],
    actionData: { type: 'salesman', keys: growth.map(g => g.label) }
  };
}

export function detWorstDay(ctx) {
  const daily = ctx.byDim('day', 'omset').filter(d => d.value > 0).sort((a, b) => a.value - b.value);
  if (!daily.length) return null;
  
  const worst = daily[0];
  const avgDaily = daily.reduce((s, d) => s + d.value, 0) / daily.length;
  
  if (worst.value > avgDaily * 0.2) return null;
  
  return {
    id: 'worst_day', category: 'Anomali Harian', severity: 'high',
    title: `Hari Terburuk: ${worst.label} hanya ${compactRp(worst.value)}`,
    desc: `📅 **Tanggal:** ${worst.label}\n` +
          `📊 **Omset:** ${compactRp(worst.value)}\n` +
          `📊 **Rata-rata:** ${compactRp(avgDaily)}\n\n` +
          `🎯 **Gap:** Kurang ${compactRp(avgDaily - worst.value)} (-${(((avgDaily - worst.value)/avgDaily)*100).toFixed(0)}%)\n\n` +
          `⚠️ Cek libur nasional, mogok truk, atau tim tidak jualan.`,
    nonTechnicalActions: [
      `Cek kalender event.`,
      `Cek kehadiran tim sales.`
    ],
    techActions: ['Filter tanggal ini untuk melihat siapa yang tidak jualan.'],
    actionData: null
  };
}

export function detConcentrationHHI(ctx) {
  const group = ctx.byDim('outlet', 'omset');
  if (group.length < 10) return null;
  const vals = group.map(g => g.value);
  const hhi = S.hhi(vals);
  if (hhi < 1500) return null;
  return {
    id: 'hhi_risk', category: 'risk', severity: 'high',
    title: `Konsentrasi Pelanggan Sangat Tinggi (HHI: ${hhi.toFixed(0)})`,
    desc: `Omset sangat terpusat pada sedikit outlet.`,
    nonTechnicalActions: ['Cari toko baru.', 'Beri layanan VIP ke top outlet.'],
    techActions: ['Filter Outlet untuk melihat top 10 toko.'],
    actionData: { type: 'outlet', keys: group.slice(0, 5).map(g => g.label) }
  };
}

export function detCoverage(ctx) {
  if (!ctx.state.outletMaster || ctx.state.outletMaster.size === 0) return null;
  const totalMaster = selectMasterCount(ctx.state);
  if (totalMaster === 0) return null;
  const active = new Set(ctx.rows.filter(r => r.tt === 'F').map(r => r.outletKey)).size;
  const rate = (totalMaster - active) / totalMaster * 100;
  if (rate < 30) return null;
  return {
    id: 'coverage_gap', category: 'opportunity', severity: 'high',
    title: `Peluang Pasar: ${rate.toFixed(0)}% Toko Belum Dikunjungi`,
    desc: `Ada ${totalMaster - active} dari ${totalMaster} toko pada filter ini yang belum bertransaksi.`,
    nonTechnicalActions: ['Buat program Reaktivasi.', 'Suruh sales kunjungi kembali.'],
    techActions: ['Buka menu Belum Transaksi.'],
    actionData: null
  };
}

export function detBasketDepth(ctx) {
  const fRows = ctx.rows.filter(r => r.tt === 'F');
  const invoices = new Map();
  fRows.forEach(r => {
    if (!invoices.has(r.invoice)) invoices.set(r.invoice, new Set());
    invoices.get(r.invoice).add(r.pcode);
  });
  let totalIpt = 0; invoices.forEach(set => { totalIpt += set.size; });
  const avgIpt = invoices.size > 0 ? totalIpt / invoices.size : 0;
  if (avgIpt >= 3) return null;
  return {
    id: 'low_ipt', category: 'efficiency', severity: 'medium',
    title: `Keranjang Belanja Kecil (Avg IPT: ${avgIpt.toFixed(1)})`,
    desc: `Toko hanya membeli sedikit varian produk. Salesman gagal cross-selling.`,
    nonTechnicalActions: ['Wajibkan tawarkan produk bundling.', 'Beri insentif khusus > 5 SKU.'],
    techActions: ['Buka Pivot Table, cek salesman IPT rendah.'],
    actionData: null
  };
}

export function detPortfolioImbalance(ctx) {
  const fRows = ctx.rows.filter(r => r.tt === 'F');
  if (!fRows.length) return null;
  const total = fRows.reduce((s, r) => s + r.amount, 0);
  const products = ctx.byDim('product', 'omset');
  if (products.length === 0) return null;
  const topShare = (products[0].value / total) * 100;
  if (topShare < 40) return null;
  return {
    id: 'hero_product', category: 'risk', severity: 'high',
    title: `Ketergantungan 1 Produk (${topShare.toFixed(0)}%)`,
    desc: `Produk "${products[0].label}" mendominasi penjualan.`,
    nonTechnicalActions: ['Buat Bundling.', 'Dorong produk lain.'],
    techActions: ['Buka Basket Analysis.'],
    actionData: { type: 'product', keys: [products[0].label] }
  };
}

export function detPriorPeriod(ctx) {
  if (!ctx.overall || !ctx.overall.currentOmset || !ctx.overall.lastMonth) return null;
  const delta = ctx.overall.deltaLM;
  if (delta === null || Math.abs(delta) < 10) return null;
  return {
    id: 'trend_prior', category: 'growth', severity: delta > 0 ? 'growth' : 'high',
    title: delta > 0 ? `Pertumbuhan Positif (${delta.toFixed(1)}%)` : `Penurunan Signifikan (${delta.toFixed(1)}%)`,
    desc: delta > 0 ? 'Kinerja lebih baik dari bulan lalu.' : 'Waspada, omset turun drastis.',
    nonTechnicalActions: delta > 0 ? ['Pertahankan momentum.'] : ['Cari tahu penyebab turun.'],
    techActions: ['Buka menu Perbandingan.'],
    actionData: null
  };
}

export function detGiniInequality(ctx) {
  const group = ctx.byDim('salesman', 'omset');
  if (group.length < 5) return null;
  const gini = S.gini(group.map(g => g.value));
  if (gini < 0.5) return null;
  return {
    id: 'gini_risk', category: 'risk', severity: 'high',
    title: `Ketimpangan Omset Tinggi (Gini: ${gini.toFixed(2)})`,
    desc: `Selisih omset Top Sales dan terlemah sangat jauh.`,
    nonTechnicalActions: ['Mentoring Top Sales ke bawah.', 'Evaluasi area kerja.'],
    techActions: ['Buka Leaderboard.'],
    actionData: null
  };
}

// Stubs
export function detDropoff(ctx) { return null; }
export function detRFM(ctx) { return null; }
export function detReturnAnomaly(ctx) { return null; }
export function detDiscountAbuse(ctx) { return null; }
export function detWhitespace(ctx) { return null; }
export function detCohortRetention(ctx) { return null; }
export function detPVMDecomposition(ctx) { return null; }
export function detTrendSignificance(ctx) { return null; }
export function detRegimeShift(ctx) { return null; }
export function detPersistence(ctx) { return null; }
export function detForecastDivergence(ctx) { return null; }
export function detDispersion(ctx) { return null; }
export function detOutliers(ctx) { return null; }
export function detParetoGap(ctx) { return null; }
export function detEntropy(ctx) { return null; }
export function detRunrate(ctx) { return null; }