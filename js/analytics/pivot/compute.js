/* ================================================================== */
/* PIVOT COMPUTE — Data processing engine                             */
/* ================================================================== */
import { MOpt, dimFn, computePercentile, getTargetForRow } from './utils.js';
import { comparisonBy } from '../../plugins/comparison.js';

export function calcMeasure(rows, mKey) {
  if (!rows || !rows.length) return 0;
  const m = MOpt(mKey);
  if (!m) return 0;
  try {
    if (m.type === 'sum') {
      return rows.reduce((s, r) => {
        const val = Number(r[m.field]) || 0;
        return s + ((r.tt === 'R' && m.isReturn) ? -val : val);
      }, 0);
    }
    if (m.type === 'count') {
      const set = new Set();
      rows.forEach(r => {
        const v = r[m.field];
        if (v != null && v !== '' && v !== '-') set.add(v);
      });
      return set.size || rows.length;
    }
    if (m.type === 'distinct') {
      const set = new Set();
      rows.forEach(r => {
        const v = r[m.field];
        if (v != null && v !== '' && v !== '—' && v !== '-') set.add(v);
      });
      return set.size;
    }
    if (m.type === 'avg') {
      const num = rows.reduce((s, r) => s + (r.tt === 'R' ? -(Number(r[m.num])||0) : (Number(r[m.num])||0)), 0);
      const den = new Set(rows.filter(r => r.tt === 'F').map(r => r[m.den]).filter(Boolean)).size;
      return den > 0 ? num / den : 0;
    }
    if (m.type === 'ratio') {
      const n = calcMeasure(rows, m.num);
      const d = calcMeasure(rows, m.den);
      return d > 0 ? n / d : 0;
    }
  } catch { return 0; }
  return 0;
}

export function computeSparklineData(rawRows, measureKey) {
  if (!rawRows || rawRows.length === 0) return [];
  const m = MOpt(measureKey) || MOpt('omset');
  const weekMap = new Map();
  for (const r of rawRows) {
    if (r.week == null) continue;
    const w = String(r.week);
    let v = 0;
    if (m.type === 'sum') { const raw = Number(r[m.field]) || 0; v = (r.tt === 'R' && m.isReturn) ? -raw : raw; }
    else if (m.type === 'count' || m.type === 'distinct') v = 1;
    else if (m.type === 'avg') v = Number(r[m.num]) || 0;
    weekMap.set(w, (weekMap.get(w) || 0) + v);
  }
  return Array.from(weekMap.entries()).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, v]) => v);
}

function computeStats(rows, config) {
  const minMax = {}, p80 = {}, p20 = {};
  config.measures.forEach(mKey => {
    minMax[mKey] = { min: Infinity, max: -Infinity };
    rows.forEach(r => {
      const v = r.measures?.[mKey] || 0;
      if (v < minMax[mKey].min) minMax[mKey].min = v;
      if (v > minMax[mKey].max) minMax[mKey].max = v;
    });
    const vals = rows.map(r => r.measures?.[mKey] || 0);
    p80[mKey] = computePercentile(vals, 0.8);
    p20[mKey] = computePercentile(vals, 0.2);
  });
  return { minMax, p80, p20 };
}

function buildCompareMap(state, config) {
  if (config.compareMode !== 'lm' && config.compareMode !== 'ly') return null;
  try {
    const cmp = comparisonBy(state, config.rowLevels[0]);
    const map = new Map();
    for (const cr of cmp.rows) {
      const delta = config.compareMode === 'lm' ? cr.deltaLM : cr.deltaLY;
      if (delta != null) map.set(cr.label, delta);
    }
    return map;
  } catch { return null; }
}

function compareRows(a, b, key, dir) {
  const av = a.measures?.[key] || 0;
  const bv = b.measures?.[key] || 0;
  return dir === 'asc' ? av - bv : bv - av;
}

function applySort(rows, config) {
  let sorted = rows.slice();
  if (config.sortBy) {
    sorted.sort((a, b) => compareRows(a, b, config.sortBy, config.sortDir));
  } else if (config.sort === 'label_asc') {
    sorted.sort((a, b) => a.label.localeCompare(b.label));
  } else if (config.sort === 'omset_asc') {
    sorted.sort((a, b) => (a.measures['omset'] || 0) - (b.measures['omset'] || 0));
  } else {
    sorted.sort((a, b) => (b.measures['omset'] || 0) - (a.measures['omset'] || 0));
  }
  return sorted;
}

function processDataFlat(rows, config, state) {
  const rFn = dimFn(config.rowLevels[0]);
  let filteredRows = rows || [];
  if (config.activeRowFilter?.length > 0) {
    filteredRows = filteredRows.filter(r => config.activeRowFilter.includes(rFn(r) || '—'));
  }

  const rowMap = new Map();
  filteredRows.forEach(r => {
    const rKey = rFn(r) || '—';
    if (!rowMap.has(rKey)) rowMap.set(rKey, { label: rKey, rows: [] });
    rowMap.get(rKey).rows.push(r);
  });

  const rowData = [];
  const colSet = new Set();

  rowMap.forEach((g, rLabel) => {
    const rowMeasures = {};
    config.measures.forEach(mKey => rowMeasures[mKey] = calcMeasure(g.rows, mKey));

    let cells = [];
    if (config.cols.length > 0) {
      const colMap = new Map();
      g.rows.forEach(r => {
        const cKey = config.cols.map(c => dimFn(c)(r) || '—').join(' / ');
        if (!colMap.has(cKey)) colMap.set(cKey, { label: cKey, rows: [] });
        colMap.get(cKey).rows.push(r);
        colSet.add(cKey);
      });
      colMap.forEach((cg, cLabel) => {
        const cMeasures = {};
        config.measures.forEach(mKey => cMeasures[mKey] = calcMeasure(cg.rows, mKey));
        cells.push({ label: cLabel, measures: cMeasures, rows: cg.rows });
      });
    }

    let target = 0, gap = 0, pctCapai = null;
    if (config.showTarget && config.measures.includes('omset')) {
      target = getTargetForRow(state, rLabel, config);
      const act = rowMeasures['omset'] || 0;
      if (target > 0) { pctCapai = (act / target) * 100; gap = act - target; }
    }

    rowData.push({ _type: 'flat', label: rLabel, measures: rowMeasures, cells, target, gap, pctCapai, rawRows: g.rows });
  });

  return finalizeFlat(rowData, config, state, filteredRows, colSet);
}

function processDataHierarchical(rows, config, state) {
  const [dim0, dim1] = config.rowLevels;
  const fn0 = dimFn(dim0), fn1 = dimFn(dim1);
  let filteredRows = rows || [];
  if (config.activeRowFilter?.length > 0) {
    filteredRows = filteredRows.filter(r => config.activeRowFilter.includes(fn0(r) || '—'));
  }

  const outerMap = new Map();
  filteredRows.forEach(r => {
    const k0 = fn0(r) || '—';
    const k1 = fn1(r) || '—';
    if (!outerMap.has(k0)) outerMap.set(k0, new Map());
    if (!outerMap.get(k0).has(k1)) outerMap.get(k0).set(k1, []);
    outerMap.get(k0).get(k1).push(r);
  });

  const flat = [];
  outerMap.forEach((innerMap, k0) => {
    const allRows0 = [];
    const children = [];
    innerMap.forEach((childRows, k1) => {
      allRows0.push(...childRows);
      const measures = {};
      config.measures.forEach(mKey => measures[mKey] = calcMeasure(childRows, mKey));
      children.push({ _type: 'child', label: k1, measures, rawRows: childRows, cells: [] });
    });

    const parentMeasures = {};
    config.measures.forEach(mKey => parentMeasures[mKey] = calcMeasure(allRows0, mKey));

    let target = 0, gap = 0, pctCapai = null;
    if (config.showTarget && config.measures.includes('omset')) {
      target = getTargetForRow(state, k0, config);
      const act = parentMeasures['omset'] || 0;
      if (target > 0) { pctCapai = (act / target) * 100; gap = act - target; }
    }

    flat.push({
      _type: 'parent', label: k0, measures: parentMeasures,
      rawRows: allRows0, cells: [], childCount: children.length,
      target, gap, pctCapai, children,
    });
  });

  return finalizeHierarchical(flat, config, state, filteredRows);
}

function finalizeFlat(rowData, config, state, filteredRows, colSet) {
  let searched = rowData;
  if (config.searchText?.trim()) {
    const q = config.searchText.trim().toLowerCase();
    searched = rowData.filter(r => String(r.label).toLowerCase().includes(q));
  }

  searched = applySort(searched, config);

  if (config.topN > 0 && searched.length > config.topN) searched = searched.slice(0, config.topN);

  if (config.cumulative && searched.length > 0) {
    searched = searched.map(r => ({ ...r, measures: { ...r.measures }, _orig: { ...r.measures } }));
    const running = {};
    config.measures.forEach(mKey => running[mKey] = 0);
    searched.forEach(r => {
      config.measures.forEach(mKey => {
        running[mKey] += (r._orig[mKey] || 0);
        r.measures[mKey] = running[mKey];
      });
    });
  }

  const colKeys = Array.from(colSet).sort();
  const grandMeasures = {};
  config.measures.forEach(mKey => grandMeasures[mKey] = calcMeasure(filteredRows, mKey));

  const colTotals = {};
  config.measures.forEach(mKey => { colTotals[mKey] = {}; });
  colKeys.forEach(ck => {
    config.measures.forEach(mKey => {
      colTotals[mKey][ck] = rowData.reduce((s, r) => {
        const cell = r.cells.find(c => c.label === ck);
        return s + (cell ? cell.measures[mKey] : 0);
      }, 0);
    });
  });

  const compareMap = buildCompareMap(state, config);
  const { minMax, p80, p20 } = computeStats(searched, config);

  return {
    rowData: searched, rowCountBeforeFilter: rowData.length,
    colKeys, grandMeasures, minMax, colTotals, compareMap, p80, p20,
  };
}

function finalizeHierarchical(flat, config, state, filteredRows) {
  let parents = flat.slice();

  if (config.searchText?.trim()) {
    const q = config.searchText.trim().toLowerCase();
    parents = parents.filter(p => {
      if (String(p.label).toLowerCase().includes(q)) return true;
      return p.children.some(c => String(c.label).toLowerCase().includes(q));
    });
  }

  parents = applySort(parents, config);

  if (config.topN > 0 && parents.length > config.topN) parents = parents.slice(0, config.topN);

  parents.forEach(p => {
    if (config.sortBy) p.children.sort((a, b) => compareRows(a, b, config.sortBy, config.sortDir));
    else if (config.sort === 'label_asc') p.children.sort((a, b) => a.label.localeCompare(b.label));
    else p.children.sort((a, b) => (b.measures['omset'] || 0) - (a.measures['omset'] || 0));
  });

  const finalRows = [];
  parents.forEach(p => {
    finalRows.push(p);
    p.children.forEach(c => {
      c._parentLabel = p.label;
      finalRows.push(c);
    });
  });

  const grandMeasures = {};
  config.measures.forEach(mKey => grandMeasures[mKey] = calcMeasure(filteredRows, mKey));

  const { minMax, p80, p20 } = computeStats(finalRows, config);
  const compareMap = buildCompareMap(state, config);

  return {
    rowData: finalRows, rowCountBeforeFilter: flat.length,
    colKeys: [], grandMeasures, minMax, colTotals: {}, compareMap, p80, p20,
    isHierarchical: true,
  };
}

export function processData(rows, config, state) {
  const isMulti = config.rowLevels.length > 1 && config.cols.length === 0;
  return isMulti ? processDataHierarchical(rows, config, state) : processDataFlat(rows, config, state);
}