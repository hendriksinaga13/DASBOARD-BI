// plugins/comparison.js
import { store } from '../core/store.js';
import { selectFiltered } from '../core/selectors.js';
import { getSumOmset } from '../metrics/registry.js'; // ✅ Import dari Registry

/* ── Util ─────────────────────────────────────────────── */
function extractNum(val) {
  if (val == null) return null;
  const match = String(val).match(/\d+/);
  return match ? Number(match[0]) : null;
}

function getUniqueWeeks(rows) {
  const s = new Set();
  for (const r of rows) {
    const w = extractNum(r.week);
    if (w) s.add(w);
  }
  return Array.from(s).sort((a, b) => a - b);
}

function matchesNonTimeFilters(r, filters) {
  const timeKeys = ['from', 'to', 'periode', 'week', 'month', 'year', 'date'];
  for (const [k, val] of Object.entries(filters)) {
    if (timeKeys.includes(k)) continue;
    if (val === undefined || val === null || val === '' ||
        val === 'ALL' || val === 'all' || val === 'Semua' || val === '-') continue;

    if (Array.isArray(val) || val instanceof Set) {
      const arr = Array.from(val);
      if (arr.length === 0 || arr.includes('ALL') || arr.includes('all') || arr.includes('Semua')) continue;
      if (!arr.some(v => String(v).trim() === String(r[k] || '').trim())) return false;
    } else {
      if (String(r[k] || '').trim() !== String(val).trim()) return false;
    }
  }
  return true;
}

/* ── DETEKSI KONTEKS WAKTU ────────────────────────────── */
function detectContext(state, filtered) {
  const curWeeksArr = getUniqueWeeks(filtered);
  const currentWeeks = curWeeksArr.length || 1;
  const currentTotal = getSumOmset(filtered); // ✅ Pakai getSumOmset
  const currentWeekly = currentTotal / currentWeeks;

  let activePeriode = null;
  const pFilter = state.filters.periode;
  if (pFilter) {
    if (pFilter instanceof Set && pFilter.size > 0) activePeriode = extractNum(Array.from(pFilter)[0]);
    else if (Array.isArray(pFilter) && pFilter.length > 0) activePeriode = extractNum(pFilter[0]);
    else if (typeof pFilter === 'string' || typeof pFilter === 'number') activePeriode = extractNum(pFilter);
  }
  if (!activePeriode && filtered.length > 0) {
    const pList = filtered.map(r => extractNum(r.periode)).filter(Boolean);
    if (pList.length > 0) activePeriode = Math.max(...pList);
  }

  let activeWeek = null;
  if (state.filters.week) {
    const wf = state.filters.week;
    activeWeek = extractNum(Array.isArray(wf) ? wf[0] : (wf instanceof Set ? Array.from(wf)[0] : wf));
  }
  if (!activeWeek && curWeeksArr.length > 0) activeWeek = curWeeksArr[curWeeksArr.length - 1];

  let activeYear = null;
  for (const r of filtered) {
    if (r.year) { activeYear = extractNum(r.year); if (activeYear > 2000) break; }
    if (r.day) { const m = String(r.day).match(/(\d{4})/); if (m) { activeYear = Number(m[1]); break; } }
  }
  if (!activeYear) activeYear = new Date().getFullYear();

  return { currentWeeks, currentTotal, currentWeekly, activePeriode, activeWeek, activeYear };
}

/* ── HELPER: filter rows by context ───────────────────── */
function rowsForLM(state, activePeriode) {
  if (!activePeriode || activePeriode <= 1) return [];
  return state.rows.filter(r =>
    extractNum(r.periode) === activePeriode - 1 &&
    matchesNonTimeFilters(r, state.filters)
  );
}

function rowsForLY(state, activePeriode, activeYear) {
  if (!activePeriode || !activeYear) return [];
  return state.rows.filter(r => {
    if (extractNum(r.periode) !== activePeriode) return false;
    let rYear = null;
    if (r.day) { const m = String(r.day).match(/(\d{4})/); if (m) rYear = Number(m[1]); }
    if (!rYear && r.year) rYear = extractNum(r.year);
    if (rYear !== activeYear - 1) return false;
    return matchesNonTimeFilters(r, state.filters);
  });
}

function rowsForW5(state, activeWeek) {
  if (!activeWeek || activeWeek <= 5) return [];
  const w5List = [1, 2, 3, 4, 5].map(o => activeWeek - o);
  return state.rows.filter(r =>
    w5List.includes(extractNum(r.week)) &&
    matchesNonTimeFilters(r, state.filters)
  );
}

function rowsForW13(state, activeWeek) {
  if (!activeWeek || activeWeek <= 13) return [];
  const w13List = Array.from({ length: 13 }, (_, i) => activeWeek - 1 - i);
  return state.rows.filter(r =>
    w13List.includes(extractNum(r.week)) &&
    matchesNonTimeFilters(r, state.filters)
  );
}

/* ── MAIN: comparisonBy ───────────────────────────────── */
export function comparisonBy(state = store.state, dim = 'salesman') {
  const filtered = selectFiltered(state);
  if (!filtered.length) return { rows: [], periodDays: 0, summary: null };

  const ctx = detectContext(state, filtered);
  const { currentWeeks, currentTotal, currentWeekly, activePeriode, activeWeek, activeYear } = ctx;

  const lmRowsAll = rowsForLM(state, activePeriode);
  const lmTotal = getSumOmset(lmRowsAll); // ✅ Pakai getSumOmset
  const lmWeeks = getUniqueWeeks(lmRowsAll).length || 1;
  const lmWeekly = lmTotal / lmWeeks;
  const lmOk = lmRowsAll.length > 0;

  const lyRowsAll = rowsForLY(state, activePeriode, activeYear);
  const lyTotal = getSumOmset(lyRowsAll); // ✅ Pakai getSumOmset
  const lyWeeks = getUniqueWeeks(lyRowsAll).length || 1;
  const lyWeekly = lyTotal / lyWeeks;
  const lyOk = lyRowsAll.length > 0;

  const w5RowsAll = rowsForW5(state, activeWeek);
  const avg5w = w5RowsAll.length > 0 ? getSumOmset(w5RowsAll) / 5 : null; // ✅ Pakai getSumOmset

  const w13RowsAll = rowsForW13(state, activeWeek);
  const avg13w = w13RowsAll.length > 0 ? getSumOmset(w13RowsAll) / 13 : null; // ✅ Pakai getSumOmset

  const summary = {
    currentOmset: currentTotal,
    currentWeekly,
    currentWeeks,
    lastMonth: lmOk ? lmTotal : null,
    lastMonthWeekly: lmOk ? lmWeekly : null,
    lastMonthWeeks: lmWeeks,
    lastYear: lyOk ? lyTotal : null,
    lastYearWeekly: lyOk ? lyWeekly : null,
    lastYearWeeks: lyWeeks,
    avg5w,
    avg13w,
    deltaLM: lmOk && lmWeekly > 0 ? ((currentWeekly / lmWeekly) - 1) * 100 : null,
    deltaLY: lyOk && lyWeekly > 0 ? ((currentWeekly / lyWeekly) - 1) * 100 : null,
    delta5w: avg5w && avg5w > 0 ? ((currentWeekly / avg5w) - 1) * 100 : null,
    delta13w: avg13w && avg13w > 0 ? ((currentWeekly / avg13w) - 1) * 100 : null,
    prevPeriode: activePeriode ? activePeriode - 1 : null,
  };

  const dimValues = new Set();
  for (const r of filtered) dimValues.add(String(r[dim] || '(blank)'));

  const rows = [];
  for (const dimVal of dimValues) {
    const matchDim = (r) => String(r[dim] || '(blank)') === dimVal;

    const curRows = filtered.filter(matchDim);
    const current = getSumOmset(curRows); // ✅ Pakai getSumOmset
    if (current === 0 && curRows.length === 0) continue;
    const currentWeeklyRow = currentWeeks ? current / currentWeeks : 0;

    const lmRows = lmRowsAll.filter(matchDim);
    const lmTotalRow = lmRows.length ? getSumOmset(lmRows) : null; // ✅ Pakai getSumOmset
    const lmWeeklyRow = lmTotalRow != null ? lmTotalRow / lmWeeks : null;
    const deltaLM = lmWeeklyRow && lmWeeklyRow > 0 ? ((currentWeeklyRow / lmWeeklyRow) - 1) * 100 : null;

    const lyRows = lyRowsAll.filter(matchDim);
    const lyTotalRow = lyRows.length ? getSumOmset(lyRows) : null; // ✅ Pakai getSumOmset
    const lyWeeklyRow = lyTotalRow != null ? lyTotalRow / lyWeeks : null;
    const deltaLY = lyWeeklyRow && lyWeeklyRow > 0 ? ((currentWeeklyRow / lyWeeklyRow) - 1) * 100 : null;

    const w5Rows = w5RowsAll.filter(matchDim);
    const avg5wRow = w5Rows.length ? getSumOmset(w5Rows) / 5 : null; // ✅ Pakai getSumOmset
    const delta5w = avg5wRow && avg5wRow > 0 ? ((currentWeeklyRow / avg5wRow) - 1) * 100 : null;

    const w13Rows = w13RowsAll.filter(matchDim);
    const avg13wRow = w13Rows.length ? getSumOmset(w13Rows) / 13 : null; // ✅ Pakai getSumOmset
    const delta13w = avg13wRow && avg13wRow > 0 ? ((currentWeeklyRow / avg13wRow) - 1) * 100 : null;

    rows.push({
      label: dimVal,
      current,
      lastMonth: lmTotalRow,
      lastYear: lyTotalRow,
      avg5w: avg5wRow,
      avg13w: avg13wRow,
      deltaLM, deltaLY, delta5w, delta13w,
    });
  }

  return { rows, periodDays: 0, summary };
}

export function overallComparison(state = store.state) {
  return comparisonBy(state, 'salesman').summary;
}