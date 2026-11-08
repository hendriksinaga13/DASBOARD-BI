/* ================================================================== */
/* INSIGHT FACTS — buildFactPack + module 13/17/18                    */
/* Semua perhitungan deterministik dari rows.                          */
/* ================================================================== */
import { selectFiltered, selectAgg, selectNotYet } from '../core/selectors.js';
import { comparisonBy } from '../plugins/comparison.js';
import { BENCHMARKS, formatIDR, formatSignedPercent } from './insight-shared.js';

/* ══════════════════════════════════════════════════════════════════ */
/* STATISTICAL HELPERS                                                */
/* ══════════════════════════════════════════════════════════════════ */
function computeZScore(values) {
  if (!values || values.length < 3) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);
  if (std === 0 || !isFinite(std)) return null;
  const last = values[values.length - 1];
  return { mean, std, last, zScore: (last - mean) / std };
}

function linearRegression(values) {
  const n = values.length;
  if (n < 3) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += values[i];
    sumXY += i * values[i]; sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * i + intercept;
    ssTot += Math.pow(values[i] - meanY, 2);
    ssRes += Math.pow(values[i] - pred, 2);
  }
  const r2 = ssTot === 0 ? 1 : 1 - (ssRes / ssTot);
  return {
    slope, intercept, r2,
    predictedNext: slope * n + intercept,
    direction: slope > 0 ? 'up' : slope < 0 ? 'down' : 'flat',
  };
}

/* ══════════════════════════════════════════════════════════════════ */
/* ROW HELPERS                                                        */
/* ══════════════════════════════════════════════════════════════════ */
const DIM_FIELDS = ['product', 'salesman', 'outlet', 'kabupaten', 'channel', 'divisi', 'subbrand'];

function _rowOmset(r) {
  const a = Number(r.amount) || 0;
  return r.tt === 'F' ? a : -a;
}

function _matchesNonTime(r, filters) {
  const timeKeys = new Set(['from', 'to', 'periode', 'week', 'month', 'year', 'date', 'q', 'transtype']);
  for (const k of Object.keys(filters)) {
    if (timeKeys.has(k)) continue;
    const v = filters[k];
    if (!v) continue;
    if (v instanceof Set) { if (v.size && !v.has(r[k])) return false; }
    else if (typeof v === 'string' && v && v !== 'ALL' && String(r[k] || '') !== v) return false;
  }
  return true;
}

/* ══════════════════════════════════════════════════════════════════ */
/* MODUL 13: TARGET vs ACTUAL                                         */
/* ══════════════════════════════════════════════════════════════════ */
function buildTargetFacts(state, rows) {
  let targets = state.targets || {};
  if (!targets || Object.keys(targets).length === 0) {
    try {
      const raw = localStorage.getItem('m245.targets');
      if (raw) targets = JSON.parse(raw);
    } catch {}
  }

  let activeMonth = state.targetMonth || null;
  if (!activeMonth && rows.length > 0) {
    const months = Array.from(new Set(rows.map(r => r.day ? r.day.slice(0, 7) : null).filter(Boolean))).sort();
    activeMonth = months[months.length - 1] || null;
  }
  if (!activeMonth || !targets[activeMonth]) return { hasTarget: false, month: activeMonth };

  const t = targets[activeMonth];

  let globalTarget = 0;
  for (const sm in (t.salesman || {})) {
    const smData = t.salesman[sm];
    let smTotal = smData?.all?.ALL?.omset || 0;
    if (!smTotal) {
      for (const lvl of ['divisi', 'subbrand', 'produk']) {
        if (smData[lvl]) for (const item in smData[lvl]) smTotal += (smData[lvl][item]?.omset || 0);
      }
    }
    globalTarget += smTotal;
  }
  if (globalTarget === 0) globalTarget = t.global?.all || 0;

  let globalActual = 0;
  const smActual = new Map();
  for (const r of rows) {
    const v = r.tt === 'F' ? (Number(r.amount) || 0) : -(Number(r.amount) || 0);
    globalActual += v;
    if (r.salesman) smActual.set(r.salesman, (smActual.get(r.salesman) || 0) + v);
  }

  const today = new Date();
  const [yy, mm] = activeMonth.split('-');
  const monthStart = new Date(+yy, +mm - 1, 1);
  const monthEnd = new Date(+yy, +mm, 0);
  const daysTotal = monthEnd.getDate();
  const daysElapsed = Math.min(daysTotal, Math.max(1, Math.ceil((today - monthStart) / 86400000)));
  let workdaysTotal = 0, workdaysElapsed = 0;
  for (let d = 1; d <= daysTotal; d++) {
    const day = new Date(+yy, +mm - 1, d);
    if (day.getDay() !== 0) {
      workdaysTotal++;
      if (d <= daysElapsed) workdaysElapsed++;
    }
  }
  const paceExpected = workdaysTotal > 0 ? (workdaysElapsed / workdaysTotal) * 100 : 0;
  const paceActual = globalTarget > 0 ? (globalActual / globalTarget) * 100 : 0;
  const paceDelta = paceActual - paceExpected;
  const projectedOmset = workdaysElapsed > 0 ? (globalActual / workdaysElapsed) * workdaysTotal : 0;

  const perSalesman = [];
  for (const sm in (t.salesman || {})) {
    let smTarget = t.salesman[sm]?.all?.ALL?.omset || 0;
    if (!smTarget) {
      for (const lvl of ['divisi', 'subbrand', 'produk']) {
        if (t.salesman[sm][lvl]) for (const item in t.salesman[sm][lvl]) smTarget += (t.salesman[sm][lvl][item]?.omset || 0);
      }
    }
    if (smTarget <= 0) continue;
    const actual = smActual.get(sm) || 0;
    const pct = (actual / smTarget) * 100;
    perSalesman.push({
      name: sm, target: smTarget, actual, pct, gap: actual - smTarget,
      status: pct >= 100 ? 'good' : pct >= 75 ? 'warn' : 'bad',
    });
  }
  perSalesman.sort((a, b) => b.pct - a.pct);

  return {
    hasTarget: true, month: activeMonth,
    globalTarget, globalActual, globalPct: paceActual, globalGap: globalActual - globalTarget,
    paceExpected, paceActual, paceDelta, projectedOmset,
    workdaysElapsed, workdaysTotal, daysElapsed, daysTotal,
    perSalesman,
    achieving: perSalesman.filter(s => s.pct >= 100).length,
    critical: perSalesman.filter(s => s.pct < 75).length,
    total: perSalesman.length,
  };
}

/* ══════════════════════════════════════════════════════════════════ */
/* MODUL 17: COHORT DEEP DIVE                                         */
/* ══════════════════════════════════════════════════════════════════ */
function buildCohortDeepDive(state, rows) {
  if (!state.filters.from) return null;
  if (!rows.some(r => r.outletKey)) return null;

  const fromDate = state.filters.from;
  const allRows = state.rows || [];

  const curOutlets = new Map();
  for (const r of rows) {
    if (r.tt !== 'F' || !r.outletKey) continue;
    const ex = curOutlets.get(r.outletKey);
    if (!ex) {
      curOutlets.set(r.outletKey, {
        key: r.outletKey, outlet: r.outlet, salesman: r.salesman,
        kabupaten: r.kabupaten, channel: r.channel,
        firstDay: r.day, lastDay: r.day,
        totalAmount: Number(r.amount) || 0,
      });
    } else {
      if (r.day < ex.firstDay) ex.firstDay = r.day;
      if (r.day > ex.lastDay) ex.lastDay = r.day;
      ex.totalAmount += Number(r.amount) || 0;
    }
  }

  const prevStartD = new Date(fromDate + 'T00:00:00');
  prevStartD.setDate(prevStartD.getDate() - 30);
  const prevStartStr = prevStartD.toISOString().slice(0, 10);

  const prevOutlets = new Map();
  for (const r of allRows) {
    if (r.tt !== 'F' || !r.outletKey || !r.day) continue;
    if (r.day >= prevStartStr && r.day < fromDate) {
      const ex = prevOutlets.get(r.outletKey);
      if (!ex) prevOutlets.set(r.outletKey, {
        key: r.outletKey, outlet: r.outlet, salesman: r.salesman,
        kabupaten: r.kabupaten, totalAmount: Number(r.amount) || 0, lastDay: r.day,
      });
      else { ex.totalAmount += Number(r.amount) || 0; if (r.day > ex.lastDay) ex.lastDay = r.day; }
    }
  }

  const newOutlets = [...curOutlets.values()].filter(o => !prevOutlets.has(o.key));
  const churningOutlets = [...prevOutlets.values()].filter(o => !curOutlets.has(o.key));
  const retainedOutlets = [...curOutlets.values()].filter(o => prevOutlets.has(o.key));

  newOutlets.sort((a, b) => b.totalAmount - a.totalAmount);
  churningOutlets.sort((a, b) => b.totalAmount - a.totalAmount);

  const totalBase = prevOutlets.size;
  const retentionRate = totalBase > 0 ? (retainedOutlets.length / totalBase) * 100 : 0;
  const churnRate = totalBase > 0 ? (churningOutlets.length / totalBase) * 100 : 0;
  const acquisitionRate = curOutlets.size > 0 ? (newOutlets.length / curOutlets.size) * 100 : 0;

  const today = new Date();
  for (const o of churningOutlets) {
    o.daysSinceLast = Math.floor((today - new Date(o.lastDay + 'T00:00:00')) / 86400000);
  }

  return {
    newCount: newOutlets.length, churningCount: churningOutlets.length, retainedCount: retainedOutlets.length,
    totalPrev: totalBase, totalCur: curOutlets.size,
    retentionRate, churnRate, acquisitionRate,
    newList: newOutlets.slice(0, 10),
    churningList: churningOutlets.slice(0, 10),
    netChange: curOutlets.size - prevOutlets.size,
    newRevenue: newOutlets.reduce((s, o) => s + o.totalAmount, 0),
    lostRevenue: churningOutlets.reduce((s, o) => s + o.totalAmount, 0),
  };
}

/* ══════════════════════════════════════════════════════════════════ */
/* MODUL 18: RETURN DEEP DIVE                                         */
/* ══════════════════════════════════════════════════════════════════ */
function buildReturnDeepDive(state, rows) {
  const returnRows = rows.filter(r => r.tt === 'R');
  if (returnRows.length === 0) return { hasReturns: false };

  let totalReturn = 0, grossF = 0;
  const byProduct = new Map(), byOutlet = new Map(), bySalesman = new Map();
  const byChannel = new Map(), bySubbrand = new Map();

  for (const r of rows) if (r.tt === 'F') grossF += Number(r.amount) || 0;

  for (const r of returnRows) {
    const amt = Number(r.amount) || 0;
    totalReturn += amt;

    const pr = r.product || '—';
    const pEx = byProduct.get(pr) || { name: pr, amount: 0, count: 0, subbrand: r.subbrand };
    pEx.amount += amt; pEx.count++; byProduct.set(pr, pEx);

    const ol = r.outlet || '—';
    const oEx = byOutlet.get(ol) || { name: ol, amount: 0, count: 0, salesman: r.salesman, kabupaten: r.kabupaten };
    oEx.amount += amt; oEx.count++; byOutlet.set(ol, oEx);

    const sm = r.salesman || '—';
    const sEx = bySalesman.get(sm) || { name: sm, amount: 0, count: 0 };
    sEx.amount += amt; sEx.count++; bySalesman.set(sm, sEx);

    const ch = r.channel || '—';
    const cEx = byChannel.get(ch) || { name: ch, amount: 0, count: 0 };
    cEx.amount += amt; cEx.count++; byChannel.set(ch, cEx);

    const sb = r.subbrand || '—';
    const sbEx = bySubbrand.get(sb) || { name: sb, amount: 0, count: 0 };
    sbEx.amount += amt; sbEx.count++; bySubbrand.set(sb, sbEx);
  }

  const sortArr = (map) => [...map.values()].sort((a, b) => b.amount - a.amount);
  const topProducts = sortArr(byProduct).slice(0, 8);
  const topOutlets = sortArr(byOutlet).slice(0, 8);
  const topSalesmen = sortArr(bySalesman).slice(0, 5);
  const topChannels = sortArr(byChannel).slice(0, 5);
  const topSubbrands = sortArr(bySubbrand).slice(0, 5);

  const retRate = grossF > 0 ? (totalReturn / grossF) * 100 : 0;

  const allOutlets = sortArr(byOutlet);
  const totalOutlets = allOutlets.length;
  let cum = 0, pareto80 = 0;
  for (let i = 0; i < allOutlets.length; i++) {
    cum += allOutlets[i].amount;
    if (cum / totalReturn >= 0.8) { pareto80 = i + 1; break; }
  }

  return {
    hasReturns: true, totalReturn, grossF, retRate,
    returnCount: returnRows.length,
    topProducts, topOutlets, topSalesmen, topChannels, topSubbrands,
    uniqueOutlets: totalOutlets,
    pareto80Count: pareto80,
    pareto80Rate: totalOutlets > 0 ? (pareto80 / totalOutlets) * 100 : 0,
  };
}

/* ══════════════════════════════════════════════════════════════════ */
/* FACT PACK — MAIN                                                   */
/* ══════════════════════════════════════════════════════════════════ */
export function buildFactPack(state) {
  const rows = selectFiltered(state);
  if (!rows || rows.length === 0) return { error: 'no_data', facts: [], sections: {} };

  const a = selectAgg(state);
  const notYet = selectNotYet(state).length;
  const masterCount = a.masterCount || 0;
  const coverage = masterCount > 0 ? (a.oa / masterCount) * 100 : null;

  let cs = null;
  let cmpRows = [];
  try { const c = comparisonBy(state, 'salesman'); cs = c.summary; cmpRows = c.rows || []; } catch (e) {}

  const facts = [];
  const sections = { period: [], growth: [], trend: [], concentration: [], ranking: [], anomaly: [], cohort: [], quality: [] };
  const push = (section, fact) => { fact.section = section; facts.push(fact); sections[section].push(fact); };

  const _weekSet = new Set();
  for (const r of rows) { if (r.week != null) _weekSet.add(String(r.week)); }
  const _wkCount = _weekSet.size || 1;

  /* PERIOD */
  push('period', { id: 'P_OMSET', label: 'Omset (Bruto − Return)', raw: a.omset, formatted: formatIDR(a.omset), meta: { type: 'currency' } });
  push('period', { id: 'P_GROSS_F', label: 'Gross Bruto', raw: a.grossF, formatted: formatIDR(a.grossF), meta: { type: 'currency' } });
  push('period', { id: 'P_GROSS_R', label: 'Total Return', raw: a.grossR, formatted: formatIDR(a.grossR), meta: { type: 'currency' } });
  push('period', { id: 'P_RET_RATE', label: 'Return Rate', raw: a.retRate, formatted: a.retRate.toFixed(2) + '%', meta: { type: 'percent' } });
  push('period', { id: 'P_OA', label: 'Outlet Aktif', raw: a.oa, formatted: `${a.oa} outlet`, meta: { type: 'count' } });
  push('period', { id: 'P_MASTER', label: 'Outlet DMP', raw: masterCount, formatted: `${masterCount} outlet`, meta: { type: 'count' } });
  push('period', { id: 'P_NOT_YET', label: 'Outlet belum transaksi', raw: notYet, formatted: `${notYet} outlet`, meta: { type: 'count' } });
  push('period', { id: 'P_INVOICES', label: 'Jumlah Faktur', raw: a.invoices, formatted: `${a.invoices} faktur`, meta: { type: 'count' } });
  push('period', { id: 'P_IPT', label: 'Item/Transaksi', raw: a.avgIpt, formatted: a.avgIpt.toFixed(2), meta: { type: 'ratio' } });
  push('period', { id: 'P_EC', label: 'Efektif Call/HK', raw: a.efektifCall, formatted: a.efektifCall.toFixed(1) + ' toko/HK', meta: { type: 'ratio' } });
  push('period', { id: 'P_HK', label: 'Hari Kerja', raw: a.hkDays, formatted: `${a.hkDays} hari`, meta: { type: 'count' } });
  push('period', { id: 'P_LINES', label: 'Baris data', raw: a.lines, formatted: `${a.lines.toLocaleString('id-ID')} baris`, meta: { type: 'count' } });
  if (a.qtyCarton != null) push('period', { id: 'P_QTY_KTN', label: 'Qty Karton', raw: a.qtyCarton, formatted: a.qtyCarton.toFixed(1) + ' ktn', meta: { type: 'quantity' } });
  if (a.qty != null) push('period', { id: 'P_QTY_PCS', label: 'Qty PCS', raw: a.qty, formatted: a.qty.toLocaleString('id-ID') + ' pcs', meta: { type: 'quantity' } });
  if (a.avgPerOutlet != null) push('period', { id: 'P_AVG_OA', label: 'Avg omset/OA', raw: a.avgPerOutlet, formatted: formatIDR(a.avgPerOutlet), meta: { type: 'currency' } });
  if (coverage != null) push('period', { id: 'P_COVERAGE', label: 'Coverage outlet', raw: coverage, formatted: coverage.toFixed(1) + '%', meta: { type: 'percent' } });

  push('period', { id: 'P_WEEKS', label: 'Jumlah minggu', raw: _wkCount, formatted: `${_wkCount} minggu`, meta: { type: 'count' } });
  if (a.omset) push('period', { id: 'P_WEEKLY', label: 'Omset/minggu', raw: a.omset / _wkCount, formatted: `${formatIDR(a.omset / _wkCount)}/minggu`, meta: { type: 'currency' } });
  if (a.qtyCarton != null && _wkCount > 0) push('period', { id: 'P_QTY_KTN_WEEKLY', label: 'Qty Karton/minggu', raw: a.qtyCarton / _wkCount, formatted: `${(a.qtyCarton / _wkCount).toFixed(1)} ktn/minggu`, meta: { type: 'quantity' } });

  /* GROWTH */
  if (cs) {
    if (cs.currentOmset != null) push('growth', { id: 'G_CUR', label: 'Omset periode ini', raw: cs.currentOmset, formatted: formatIDR(cs.currentOmset), meta: { type: 'currency' } });
    if (cs.currentWeekly != null) push('growth', { id: 'G_CUR_WEEKLY', label: 'Omset/minggu periode', raw: cs.currentWeekly, formatted: formatIDR(cs.currentWeekly) + '/minggu', meta: { type: 'currency' } });
    if (cs.lastMonth != null) push('growth', { id: 'G_LM', label: 'Omset bulan lalu (TOTAL)', raw: cs.lastMonth, formatted: formatIDR(cs.lastMonth), meta: { type: 'currency' } });
    if (cs.lastMonthWeekly != null) push('growth', { id: 'G_LM_WEEKLY', label: 'Omset/minggu LM', raw: cs.lastMonthWeekly, formatted: formatIDR(cs.lastMonthWeekly) + '/minggu', meta: { type: 'currency' } });
    if (cs.deltaLM != null) push('growth', { id: 'G_GROWTH_LM', label: 'Growth vs LM (weekly-basis)', raw: cs.deltaLM, formatted: formatSignedPercent(cs.deltaLM), meta: { type: 'percent', signed: true } });
    if (cs.lastYear != null) push('growth', { id: 'G_LY', label: 'Omset tahun lalu (TOTAL)', raw: cs.lastYear, formatted: formatIDR(cs.lastYear), meta: { type: 'currency' } });
    if (cs.deltaLY != null) push('growth', { id: 'G_GROWTH_LY', label: 'Growth vs LY (weekly-basis)', raw: cs.deltaLY, formatted: formatSignedPercent(cs.deltaLY), meta: { type: 'percent', signed: true } });
    if (cs.avg5w != null) push('growth', { id: 'G_AVG5W', label: 'Avg 5 minggu', raw: cs.avg5w, formatted: formatIDR(cs.avg5w) + '/minggu', meta: { type: 'currency' } });
    if (cs.avg13w != null) push('growth', { id: 'G_AVG13W', label: 'Avg 13 minggu', raw: cs.avg13w, formatted: formatIDR(cs.avg13w) + '/minggu', meta: { type: 'currency' } });
    if (cs.delta5w != null) push('growth', { id: 'G_DELTA5W', label: 'Delta vs avg 5w', raw: cs.delta5w, formatted: formatSignedPercent(cs.delta5w), meta: { type: 'percent', signed: true } });
    if (cs.delta13w != null) push('growth', { id: 'G_DELTA13W', label: 'Delta vs avg 13w', raw: cs.delta13w, formatted: formatSignedPercent(cs.delta13w), meta: { type: 'percent', signed: true } });

    /* TOTAL-BASIS growth dengan weeks mismatch awareness */
    if (cs.currentOmset != null && cs.lastMonth != null && cs.lastMonth > 0) {
      const totalDeltaLM = ((cs.currentOmset / cs.lastMonth) - 1) * 100;
      const curWk = cs.currentWeeks || 1;
      const lmWk = cs.lastMonthWeeks || 1;
      const weeksMismatch = curWk !== lmWk;
      push('growth', {
        id: 'G_GROWTH_LM_TOTAL',
        label: `Growth vs LM (TOTAL periode${weeksMismatch ? ` — PERINGATAN: ${curWk} vs ${lmWk} minggu, TIDAK apples-to-apples` : ''})`,
        raw: totalDeltaLM,
        formatted: formatSignedPercent(totalDeltaLM) + (weeksMismatch ? ` [${curWk} mgg vs ${lmWk} mgg]` : ''),
        meta: { type: 'percent', signed: true, weeksMismatch, curWeeks: curWk, lmWeeks: lmWk },
      });
    }
    if (cs.currentOmset != null && cs.lastYear != null && cs.lastYear > 0) {
      const totalDeltaLY = ((cs.currentOmset / cs.lastYear) - 1) * 100;
      push('growth', {
        id: 'G_GROWTH_LY_TOTAL',
        label: 'Growth vs LY (TOTAL periode — bukan weekly)',
        raw: totalDeltaLY,
        formatted: formatSignedPercent(totalDeltaLY),
        meta: { type: 'percent', signed: true },
      });
    }

    /* PERIOD CONTEXT — kunci untuk narasi growth yang jujur */
    if (cs.currentOmset != null && cs.lastMonth != null) {
      const curWk = cs.currentWeeks || 1;
      const lmWk = cs.lastMonthWeeks || 1;
      push('growth', {
        id: 'G_PERIOD_CONTEXT',
        label: 'Konteks periode (current vs LM)',
        raw: { curWk, lmWk },
        formatted: `Current = ${curWk} minggu, LM = ${lmWk} minggu · ${curWk !== lmWk ? `PERHATIAN: selisih ${Math.abs(curWk - lmWk)} minggu, total-basis growth TIDAK apples-to-apples (gunakan weekly-basis untuk momentum sebenarnya)` : 'jumlah minggu SAMA, total-basis growth apples-to-apples'}`,
        meta: { type: 'info', curWeeks: curWk, lmWeeks: lmWk, mismatch: curWk !== lmWk },
      });
    }
  }

  /* WoW + SWLY */
  if (state.filters.from && state.rows) {
    const fromStr = state.filters.from;
    const toStr = state.filters.to || '9999-12-31';
    const fromD = new Date(fromStr + 'T00:00:00');
    const lwD = new Date(fromD); lwD.setDate(lwD.getDate() - 7);
    const lwStr = lwD.toISOString().slice(0, 10);
    const swD = new Date(fromD); swD.setDate(swD.getDate() - 364);
    const swlyFromStr = swD.toISOString().slice(0, 10);
    const eD = new Date(toStr === '9999-12-31' ? fromD : new Date(toStr + 'T00:00:00'));
    eD.setDate(eD.getDate() - 364);
    const swlyToStr = eD.toISOString().slice(0, 10);

    let curOmset = 0, prevWeekOmset = 0, swlyOmset = 0;
    for (const r of state.rows) {
      if (!r.day || !_matchesNonTime(r, state.filters)) continue;
      const v = _rowOmset(r);
      if (r.day >= fromStr && r.day <= toStr) curOmset += v;
      if (r.day >= lwStr && r.day < fromStr) prevWeekOmset += v;
      if (r.day >= swlyFromStr && r.day <= swlyToStr) swlyOmset += v;
    }
    if (prevWeekOmset > 0) {
      const wow = ((curOmset / prevWeekOmset) - 1) * 100;
      push('growth', { id: 'G_WOW', label: 'Growth WoW', raw: wow, formatted: formatSignedPercent(wow), meta: { type: 'percent', signed: true } });
    }
    if (swlyOmset > 0) {
      push('growth', { id: 'G_SWLY', label: 'Omset same-week-LY', raw: swlyOmset, formatted: formatIDR(swlyOmset), meta: { type: 'currency' } });
      if (curOmset > 0) {
        const swlyGrowth = ((curOmset / swlyOmset) - 1) * 100;
        push('growth', { id: 'G_GROWTH_SWLY', label: 'Growth vs SWLY', raw: swlyGrowth, formatted: formatSignedPercent(swlyGrowth), meta: { type: 'percent', signed: true } });
      }
    }
  }

  /* TREND */
  const weekMap = new Map();
  for (const r of rows) {
    const w = r.week;
    if (w == null) continue;
    weekMap.set(w, (weekMap.get(w) || 0) + _rowOmset(r));
  }
  const weekSeries = Array.from(weekMap.entries()).sort((x, y) => Number(x[0]) - Number(y[0])).map(([w, v]) => ({ week: w, omset: v }));
  let momentum = null;
  if (weekSeries.length >= 4) {
    const mid = Math.floor(weekSeries.length / 2);
    const firstAvg = weekSeries.slice(0, mid).reduce((s, x) => s + x.omset, 0) / mid;
    const secondAvg = weekSeries.slice(mid).reduce((s, x) => s + x.omset, 0) / (weekSeries.length - mid);
    momentum = firstAvg > 0 ? ((secondAvg / firstAvg) - 1) * 100 : null;
  }
  if (weekSeries.length > 0) {
    const seriesStr = weekSeries.map(x => `W${x.week}=${formatIDR(x.omset)}`).join(' | ');
    push('trend', { id: 'T_SERIES', label: 'Tren per minggu', raw: weekSeries, formatted: seriesStr, meta: { series: weekSeries } });
  }
  if (momentum != null) push('trend', { id: 'T_MOMENTUM', label: 'Momentum', raw: momentum, formatted: formatSignedPercent(momentum), meta: { type: 'percent', signed: true } });

  let regression = null;
  if (weekSeries.length >= 3) {
    const reg = linearRegression(weekSeries.map(x => x.omset));
    if (reg && reg.r2 >= BENCHMARKS.r2Min) {
      regression = reg;
      push('trend', {
        id: 'T_REGRESSION',
        label: `Regresi linear (R²=${reg.r2.toFixed(2)})`,
        raw: reg.predictedNext,
        formatted: `Slope ${reg.slope >= 0 ? '+' : ''}${formatIDR(reg.slope)}/minggu · R²=${reg.r2.toFixed(2)} · Prediksi W+1 ${formatIDR(reg.predictedNext)}`,
        meta: { type: 'currency', slope: reg.slope, r2: reg.r2, predictedNext: reg.predictedNext, direction: reg.direction },
      });
    }
  }

  /* CONCENTRATION & RANKING */
  const sample = rows[0] || {};
  const paretoByDim = {};
  for (const dim of DIM_FIELDS) {
    if (!(dim in sample)) continue;
    const map = new Map();
    for (const r of rows) {
      const k = r[dim];
      if (k == null || k === '') continue;
      map.set(k, (map.get(k) || 0) + _rowOmset(r));
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v, 0);
    if (total === 0 || map.size === 0) continue;
    const sorted = Array.from(map.entries())
      .map(([k, v]) => ({ key: String(k), value: v, share: (v / total) * 100 }))
      .sort((x, y) => y.value - x.value);
    let cum = 0, pareto80 = 0;
    for (let i = 0; i < sorted.length; i++) {
      cum += sorted[i].value;
      if (cum / total >= 0.8) { pareto80 = i + 1; break; }
    }
    paretoByDim[dim] = { total, list: sorted, pareto80, topShare: sorted[0]?.share || 0 };

    if (['product', 'outlet', 'salesman', 'subbrand'].includes(dim)) {
      const top = sorted[0];
      const weekCount = _wkCount || 1;
      if (top) {
        const topWeekly = top.value / weekCount;
        push('concentration', {
          id: `C_TOP_${dim.toUpperCase()}`,
          label: `Top-1 ${dim} (TOTAL PERIODE)`,
          raw: top.value,
          formatted: `${top.key} = ${formatIDR(top.value)} [TOTAL PERIODE, ${weekCount} minggu] (${top.share.toFixed(1)}%)`,
          meta: { dim, key: top.key, share: top.share, rawValue: top.value, weeklyValue: topWeekly, unit: 'period', type: 'currency' },
        });
        push('concentration', {
          id: `C_TOP_${dim.toUpperCase()}_WEEKLY`,
          label: `Top-1 ${dim} (PER MINGGU)`,
          raw: topWeekly,
          formatted: `${top.key} = ${formatIDR(topWeekly)}/minggu [WEEKLY] (${top.share.toFixed(1)}%)`,
          meta: { dim, key: top.key, share: top.share, rawValue: top.value, weeklyValue: topWeekly, unit: 'weekly', type: 'currency' },
        });
      }
      push('concentration', {
        id: `C_PARETO_${dim.toUpperCase()}`,
        label: `Pareto 80/20 ${dim}`,
        raw: pareto80,
        formatted: `${pareto80}/${sorted.length} ${dim} (${((pareto80 / sorted.length) * 100).toFixed(1)}%) menyumbang 80% omset`,
        meta: { dim, count: pareto80, total: sorted.length },
      });
    }

    const top5 = sorted.slice(0, 5);
    if (top5.length > 0) {
      const wc = _wkCount || 1;
      const str = top5.map((t, i) => `${i + 1}. ${t.key} → ${formatIDR(t.value)} [TOTAL PERIODE, ${wc} minggu] (${t.share.toFixed(1)}%)`).join(' | ');
      push('ranking', {
        id: `R_TOP_${dim.toUpperCase()}`,
        label: `Top-5 ${dim} (TOTAL PERIODE)`,
        raw: top5[0].value,
        formatted: str,
        meta: { dim, list: top5, unit: 'period', type: 'currency' },
      });
    }
  }

  /* Z-SCORE */
  const zScoreOutliers = [];
  if (weekSeries.length >= 3 && sample.salesman) {
    const smList = (paretoByDim.salesman?.list || []).slice(0, 10);
    let smIdx = 0;
    for (const sm of smList) {
      const smWeeks = new Map();
      for (const r of rows) {
        if (r.salesman !== sm.key || r.week == null) continue;
        smWeeks.set(String(r.week), (smWeeks.get(String(r.week)) || 0) + _rowOmset(r));
      }
      if (smWeeks.size < 3) continue;
      const series = Array.from(smWeeks.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
      const zs = computeZScore(series);
      if (!zs) continue;
      if (Math.abs(zs.zScore) >= BENCHMARKS.zScoreThreshold) {
        zScoreOutliers.push({ salesman: sm.key, zScore: zs.zScore, last: zs.last, mean: zs.mean, std: zs.std });
        push('anomaly', {
          id: `A_SM_Z_${smIdx++}`,
          label: `Salesman outlier ${sm.key} (${zs.zScore.toFixed(1)}σ)`,
          raw: zs.zScore,
          formatted: `${sm.key}: W-terakhir ${formatIDR(zs.last)} vs avg ${formatIDR(zs.mean)} (${zs.zScore > 0 ? '+' : ''}${zs.zScore.toFixed(1)}σ)`,
          meta: { severity: Math.abs(zs.zScore) >= BENCHMARKS.zScoreHighThreshold ? 'high' : 'medium', salesman: sm.key, zScore: zs.zScore },
        });
      }
    }
  }

  /* MATRIX SALESMAN × PRODUCT */
  let skuMatrix = null;
  if (sample.salesman && sample.product) {
    const matrix = new Map();
    const salesmanTotal = new Map();
    for (const r of rows) {
      const sm = r.salesman, pr = r.product;
      if (!sm || !pr) continue;
      const v = _rowOmset(r);
      if (!matrix.has(sm)) matrix.set(sm, new Map());
      matrix.get(sm).set(pr, (matrix.get(sm).get(pr) || 0) + v);
      salesmanTotal.set(sm, (salesmanTotal.get(sm) || 0) + v);
    }
    const smStats = [];
    for (const [sm, prods] of matrix) {
      const total = salesmanTotal.get(sm) || 0;
      if (total === 0) continue;
      const topProds = Array.from(prods.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const topShare = total > 0 ? (topProds[0]?.[1] / total) * 100 : 0;
      smStats.push({ sm, total, skuCount: prods.size, topShare, topProds });
    }
    smStats.sort((a, b) => b.total - a.total);
    skuMatrix = smStats;

    const top5Sm = smStats.slice(0, 5);
    if (top5Sm.length) {
      const str = top5Sm.map(s => `${s.sm}: ${s.skuCount} SKU`).join(' | ');
      push('ranking', { id: 'R_SM_SKU_MIX', label: 'SKU mix salesman', raw: top5Sm, formatted: str, meta: { type: 'matrix' } });
    }

    const skuCounts = smStats.map(s => s.skuCount).sort((a, b) => a - b);
    const medianSku = skuCounts[Math.floor(skuCounts.length / 2)] || 0;
    const lowSku = smStats.filter(s => s.skuCount < medianSku * 0.6 && s.total > 0);
    if (lowSku.length > 0 && medianSku >= 3) {
      push('anomaly', {
        id: 'A_SM_LOW_SKU',
        label: 'Salesman SKU mix sempit',
        raw: lowSku.length,
        formatted: `${lowSku.length} salesman jual <60% median SKU (${medianSku}): ${lowSku.slice(0, 3).map(s => s.sm).join(', ')}`,
        meta: { severity: 'medium', list: lowSku.slice(0, 5).map(s => s.sm) },
      });
    }
  }

  /* COHORT simple */
  let cohort = null;
  if (sample.outletKey && state.filters.from && state.rows) {
    const fromDate = state.filters.from;
    const toDate = state.filters.to || '9999-12-31';
    const prevStartD = new Date(fromDate + 'T00:00:00');
    prevStartD.setDate(prevStartD.getDate() - 30);
    const prevStartStr = prevStartD.toISOString().slice(0, 10);

    const hasHistorical = state.rows.some(r => r.day && r.day < fromDate);
    if (hasHistorical) {
      const curOutlets = new Set();
      const prevOutlets = new Set();
      for (const r of state.rows) {
        if (r.tt !== 'F' || !r.outletKey || !r.day) continue;
        if (!_matchesNonTime(r, state.filters)) continue;
        if (r.day >= fromDate && r.day <= toDate) curOutlets.add(r.outletKey);
        else if (r.day >= prevStartStr && r.day < fromDate) prevOutlets.add(r.outletKey);
      }
      const newOutlets = [...curOutlets].filter(o => !prevOutlets.has(o));
      const churning = [...prevOutlets].filter(o => !curOutlets.has(o));
      const retained = [...curOutlets].filter(o => prevOutlets.has(o));

      cohort = { new: newOutlets.length, churning: churning.length, retained: retained.length };
      if (newOutlets.length > 0) push('cohort', { id: 'P_COHORT_NEW', label: 'Outlet baru', raw: newOutlets.length, formatted: `${newOutlets.length} outlet baru`, meta: { type: 'count' } });
      if (retained.length > 0) push('cohort', { id: 'P_COHORT_RETAINED', label: 'Outlet retained', raw: retained.length, formatted: `${retained.length} outlet`, meta: { type: 'count' } });
      if (churning.length > 0) {
        const sev = churning.length >= BENCHMARKS.cohortChurnMin ? 'high' : 'medium';
        push('anomaly', { id: 'A_COHORT_CHURN', label: 'Outlet churning', raw: churning.length, formatted: `${churning.length} outlet churning`, meta: { severity: sev } });
        push('cohort', { id: 'P_COHORT_CHURN', label: 'Outlet churning', raw: churning.length, formatted: `${churning.length} outlet`, meta: { type: 'count' } });
      }
    }
  }

  /* DATA QUALITY */
  let dataQuality = null;
  {
    const today = new Date();

    const activeDays = new Set();
    for (const r of rows) if (r.day && r.tt === 'F') activeDays.add(r.day);
    const sortedDays = Array.from(activeDays).sort();
    const actualFirstDay = sortedDays[0] || null;
    const actualLastDay = sortedDays[sortedDays.length - 1] || null;

    const rangeStart = state.filters.from || actualFirstDay;
    const rangeEnd = state.filters.to || actualLastDay || today.toISOString().slice(0, 10);

    let daysInRange = 1;
    if (rangeStart && rangeEnd) {
      const fromD = new Date(rangeStart + 'T00:00:00');
      const toD = new Date(rangeEnd + 'T00:00:00');
      if (isFinite(fromD.getTime()) && isFinite(toD.getTime())) {
        daysInRange = Math.max(1, Math.ceil((toD - fromD) / 86400000) + 1);
      }
    }

    const lastDataDay = actualLastDay || rangeEnd;
    let daysStale = 0;
    if (lastDataDay) {
      const lastD = new Date(lastDataDay + 'T00:00:00');
      if (isFinite(lastD.getTime())) {
        daysStale = Math.max(0, Math.floor((today - lastD) / 86400000));
      }
    }

    const rawCoverage = (activeDays.size / daysInRange) * 100;
    const dayCoverage = Math.min(100, Math.round(rawCoverage * 10) / 10);

    let qualityScore = 100;
    if (daysStale > BENCHMARKS.dayStaleMax) qualityScore -= 30;
    else if (daysStale > 3) qualityScore -= 10;
    if (dayCoverage < BENCHMARKS.dayCoverageMin) qualityScore -= 30;
    else if (dayCoverage < 80) qualityScore -= 10;
    if (rows.length < 50) qualityScore -= 20;
    qualityScore = Math.max(0, Math.min(100, qualityScore));

    dataQuality = {
      daysStale, dayCoverage,
      activeDays: activeDays.size, daysInRange,
      rangeStart, rangeEnd, actualFirstDay, actualLastDay,
      qualityScore,
    };

    push('quality', {
      id: 'Q_FRESHNESS',
      label: 'Freshness (hari sejak data terakhir)',
      raw: daysStale,
      formatted: `${daysStale} hari${daysStale === 0 ? ' (data live hari ini)' : daysStale > BENCHMARKS.dayStaleMax ? ' (STALE)' : ''}`,
      meta: { type: 'count', severity: daysStale > BENCHMARKS.dayStaleMax ? 'high' : daysStale > 3 ? 'medium' : 'low' },
    });
    push('quality', {
      id: 'Q_DAY_COVERAGE',
      label: 'Coverage hari (hari aktif / hari kalender dalam range)',
      raw: dayCoverage,
      formatted: `${dayCoverage.toFixed(1)}% (${activeDays.size}/${daysInRange} hari)`,
      meta: { type: 'percent', severity: dayCoverage < BENCHMARKS.dayCoverageMin ? 'high' : dayCoverage < 80 ? 'medium' : 'low' },
    });
    push('quality', {
      id: 'Q_SCORE',
      label: 'Quality score',
      raw: qualityScore,
      formatted: `${qualityScore}/100`,
      meta: { type: 'ratio', severity: qualityScore < 60 ? 'high' : qualityScore < 80 ? 'medium' : 'low' },
    });
  }

  /* ANOMALY basic */
  if (a.retRate > BENCHMARKS.returnRateBad) push('anomaly', { id: 'A_RET_HIGH', label: 'Return rate tinggi', raw: a.retRate, formatted: `${a.retRate.toFixed(2)}%`, meta: { severity: 'high' } });
  if (coverage != null && coverage < BENCHMARKS.coverageMin) push('anomaly', { id: 'A_COVERAGE_LOW', label: 'Coverage rendah', raw: coverage, formatted: `${coverage.toFixed(1)}%`, meta: { severity: 'high' } });
  if (notYet > 0) push('anomaly', { id: 'A_NOT_YET', label: 'Outlet belum transaksi', raw: notYet, formatted: `${notYet} outlet`, meta: { severity: 'medium' } });
  const topProductShare = paretoByDim.product?.topShare || 0;
  if (topProductShare > BENCHMARKS.concentrationDanger) push('anomaly', { id: 'A_CONCENTRATION_HIGH', label: 'Konsentrasi produk tinggi', raw: topProductShare, formatted: `${topProductShare.toFixed(1)}%`, meta: { severity: 'high' } });
  if (momentum != null && momentum < -15) push('anomaly', { id: 'A_MOMENTUM_DOWN', label: 'Momentum negatif', raw: momentum, formatted: formatSignedPercent(momentum), meta: { severity: 'medium' } });

  const salesmanDrops = [];
  for (const row of cmpRows) {
    if (row.deltaLM != null && row.deltaLM < BENCHMARKS.salesmanDropThreshold && row.current > 0) {
      salesmanDrops.push({ salesman: row.label, delta: row.deltaLM, current: row.current });
    }
  }
  salesmanDrops.sort((x, y) => x.delta - y.delta);
  if (salesmanDrops.length > 0) {
    const worst = salesmanDrops.slice(0, 3).map(s => `${s.salesman} (${s.delta.toFixed(1)}%)`).join(', ');
    push('anomaly', { id: 'A_SALESMAN_DROP', label: 'Salesman drop >30%', raw: salesmanDrops, formatted: `${salesmanDrops.length} salesman: ${worst}`, meta: { severity: 'high', list: salesmanDrops } });
  }

  /* MODUL 13, 17, 18 */
  const targetFacts = buildTargetFacts(state, rows);
  const cohortDeepDive = buildCohortDeepDive(state, rows);
  const returnDeepDive = buildReturnDeepDive(state, rows);

  return {
    facts, sections,
    growth: {
      lm: cs?.deltaLM ?? null, ly: cs?.deltaLY ?? null,
      cur: cs?.currentOmset ?? null, lastMonth: cs?.lastMonth ?? null, lastYear: cs?.lastYear ?? null,
      curWeekly: cs?.currentWeekly ?? null, lmWeekly: cs?.lastMonthWeekly ?? null,
      avg5w: cs?.avg5w ?? null, avg13w: cs?.avg13w ?? null,
    },
    retRate: a.retRate || 0, coverage, ec: a.efektifCall || 0, ipt: a.avgIpt || 0,
    oa: a.oa || 0, notYet, hkDays: a.hkDays || 0, invoices: a.invoices || 0,
    omset: a.omset || 0, masterCount, concentration: topProductShare,
    qtyCarton: a.qtyCarton || 0, weeks: _wkCount,
    trend: { series: weekSeries, momentum, regression },
    paretoByDim, salesmanDrops, zScoreOutliers, skuMatrix, cohort, dataQuality,
    targetFacts, cohortDeepDive, returnDeepDive,
    rows, totalRows: rows.length,
  };
}