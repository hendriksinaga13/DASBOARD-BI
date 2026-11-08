/* ═══════════════════════════════════════════════════════════════
   Program Berjalan — CORE LOGIC
   Pure functions. No DOM, no side effects.
   ═══════════════════════════════════════════════════════════════ */

import { compactRp, NF1 } from './utils.js';
import { store } from './store.js';

export const DAY_MS = 86400000;

export const RULE_TYPES = {
  divisi:        { label: 'Divisi',         icon: '📂', kind: 'multiselect', source: 'divisi' },
  subrand:       { label: 'Subrand',        icon: '🏷️', kind: 'multiselect', source: 'subbrand' },
  produk:        { label: 'Produk',         icon: '📦', kind: 'multiselect', source: 'product' },
  salesman:      { label: 'Salesman',       icon: '👤', kind: 'multiselect', source: 'salesman' },
  channel:       { label: 'Channel',        icon: '🏬', kind: 'multiselect', source: 'channel' },
  toko:          { label: 'Toko Spesifik',  icon: '🏪', kind: 'multiselect', source: 'outlet' },
  minTransaksi:  { label: 'Min Transaksi',  icon: '💰', kind: 'number', unit: 'Rp' },
  minSku:        { label: 'Min SKU',        icon: '🔢', kind: 'number', unit: 'SKU' },
  minPerProduct: { label: 'Min per Produk', icon: '📊', kind: 'productConfig' },
};
export const SCOPE_RULES       = ['salesman', 'channel', 'toko'];
export const PRODUCT_RULES     = ['divisi', 'subrand', 'produk'];
export const ALL_MULTI_RULES   = [...PRODUCT_RULES, ...SCOPE_RULES];
export const DMP_SCOPE_SOURCES = ['salesman', 'channel', 'outlet'];

// ─── unit helpers ─────────────────────────────────────────────
export function getPcs(r) { return Math.abs(r.netQty || 0); }
export function getCrtn(r) { return (r.netCarton != null && isFinite(r.netCarton)) ? Math.abs(r.netCarton) : 0; }
export function getRcg(r) {
  if (r.netRcg != null && isFinite(r.netRcg)) return Math.abs(r.netRcg);
  const m = String(r.kemasan || '').match(/RCG\s*\/\s*(\d+)/i);
  if (m) { const f = +m[1]; if (f > 0) return Math.abs((r.netQty || 0) / f); }
  const m2 = String(r.kemasan || '').match(/RENCENG\s*(\d+)/i);
  if (m2) { const f = +m2[1]; if (f > 0) return Math.abs((r.netQty || 0) / f); }
  return 0;
}
export function getUnitValue(r, u) {
  if (u === 'crtn') return getCrtn(r);
  if (u === 'rcg')  return getRcg(r);
  if (u === 'pcs')  return getPcs(r);
  if (u === 'amount') return r.amount || 0;
  return 0;
}
export function getUnitLabel(u) { return { crtn: 'CTN', rcg: 'RCG', pcs: 'PCS', amount: 'Rp' }[u] || ''; }
export function getRowDiscount(r) { return (r.disc || 0) + (r.disc1kh || 0) + (r.pro || 0); }
export function normStr(v) {
  if (!v || v === '—' || v === '-') return '';
  return String(v).trim().toUpperCase().replace(/\s+/g, ' ');
}

// ─── channel cache ────────────────────────────────────────────
let _channelCache = null, _channelCacheRows = null;
export function buildChannelCache(rows) {
  if (_channelCacheRows === rows && _channelCache) return _channelCache;
  const map = new Map();
  for (const r of rows) {
    if (r.tt !== 'F') continue;
    const ch = normStr(r.channel);
    if (!ch) continue;
    const no = String(r.outletNo || '').trim();
    const nm = String(r.outlet || '').trim();
    if (no && !map.has('no:' + no)) map.set('no:' + no, ch);
    if (nm && !map.has('nm:' + nm)) map.set('nm:' + nm, ch);
  }
  _channelCache = map;
  _channelCacheRows = rows;
  return map;
}
export function getOutletChannel(o, cache) {
  const dmpCh = normStr(o.channel);
  if (dmpCh) return dmpCh;
  const no = String(o.outletNo || '').trim();
  const nm = String(o.outlet || '').trim();
  return cache.get('no:' + no) || cache.get('nm:' + nm) || '';
}

// ─── migrate / normalize ─────────────────────────────────────
export function migrateProgram(p) {
  return {
    id: p.id || ('PRG-' + Date.now() + Math.random().toString(36).slice(2, 8)),
    name: p.name || 'Untitled',
    startDate: p.startDate || new Date().toISOString().slice(0, 10),
    endDate: p.endDate || new Date(Date.now() + 30 * DAY_MS).toISOString().slice(0, 10),
    schemeNotes: p.schemeNotes || '',
    schemes: Array.isArray(p.schemes) ? p.schemes.map(migrateScheme) : [],
    createdAt: p.createdAt || new Date().toISOString(),
  };
}
export function migrateScheme(s) {
  return {
    id: s.id || ('SCH-' + Date.now() + Math.random().toString(36).slice(2, 8)),
    name: s.name || 'Scheme',
    evaluationMode: s.evaluationMode || 'per_invoice',
    rules: Array.isArray(s.rules) ? s.rules.map(migrateRule) : [],
    reward: migrateReward(s.reward || {}),
  };
}
export function migrateRule(r) {
  return {
    type: r.type,
    values: Array.isArray(r.values) ? r.values : [],
    value: r.value || 0,
    productConfig: Array.isArray(r.productConfig) ? r.productConfig : [],
  };
}
export function migrateReward(rw) {
  return {
    type: rw.type || 'discount',
    discountMode: rw.discountMode || 'fixed',
    discountType: rw.discountType || 'percent',
    discountValue: rw.discountValue || 0,
    strataUnit: rw.strataUnit || 'crtn',
    strataTiers: Array.isArray(rw.strataTiers)
      ? rw.strataTiers.map(t => ({
          min: t.min || 0,
          max: t.max != null ? t.max : null,
          type: t.type || 'percent',
          rate: t.rate || 0,
          amountValue: t.amountValue || 0,
        }))
      : [],
    maxEnabled: rw.maxEnabled === true,
    maxUnitType: rw.maxUnitType || 'invoice',
    maxValue: rw.maxValue || 0,
    pointBase: rw.pointBase || 'amount',
    pointRate: rw.pointRate || 10000,
    pointPerUnit: rw.pointPerUnit || 1,
    pointUnit: rw.pointUnit || 'rcg',
    prizes: Array.isArray(rw.prizes) ? rw.prizes : [],
  };
}

// ─── load ─────────────────────────────────────────────────────
export function loadPrograms() {
  try {
    const data = store.state.settings?.programs;
    const list = Array.isArray(data?.list) ? data.list : [];
    return list.map(migrateProgram);
  } catch { return []; }
}

// ─── status & progress ────────────────────────────────────────
export function getProgramStatus(program) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const start = new Date(program.startDate + 'T00:00:00Z');
  const end   = new Date(program.endDate   + 'T00:00:00Z');
  if (isNaN(start) || isNaN(end)) return { status: 'active', label: 'Periode invalid', color: '#94A3B8', bg: '#F8FAFC' };
  if (today < start) {
    const d = Math.ceil((start - today) / DAY_MS);
    return { status: 'upcoming', label: `Mulai dalam ${d} hari`, color: '#3B82F6', bg: '#EFF6FF' };
  }
  if (today > end) {
    const d = Math.ceil((today - end) / DAY_MS);
    return { status: 'expired', label: `Berakhir ${d} hari lalu`, color: '#94A3B8', bg: '#F8FAFC' };
  }
  const rem = Math.ceil((end - today) / DAY_MS) + 1;
  if (rem <= 3) return { status: 'critical', label: `⚠️ Sisa ${rem} hari!`, color: '#DC2626', bg: '#FEF2F2' };
  if (rem <= 7) return { status: 'warning',  label: `⏰ Sisa ${rem} hari`,  color: '#F59E0B', bg: '#FFFBEB' };
  return { status: 'active', label: `✅ Aktif (${rem} hari)`, color: '#10B981', bg: '#F0FDF4' };
}

export function getProgramProgress(program) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const start = new Date(program.startDate + 'T00:00:00Z');
  const end   = new Date(program.endDate   + 'T00:00:00Z');
  const totalDays = Math.max(1, Math.round((end - start) / DAY_MS) + 1);
  let e, r;
  if (today < start)    { e = 0;         r = totalDays; }
  else if (today > end) { e = totalDays; r = 0; }
  else { e = Math.round((today - start) / DAY_MS) + 1; r = Math.max(0, totalDays - e); }
  return { daysElapsed: e, daysRemaining: r, totalDays, progressPct: Math.min(100, Math.max(0, (e / totalDays) * 100)) };
}

// ─── scope / DMP ──────────────────────────────────────────────
export function getScopedRows(scheme, rows) {
  const productRules = scheme.rules.filter(r => PRODUCT_RULES.includes(r.type) && (r.values || []).length > 0);
  if (!productRules.length) return rows;
  let filtered = rows;
  for (const rule of productRules) {
    const v = rule.values;
    filtered = filtered.filter(r => {
      if (rule.type === 'divisi')  return v.includes(r.divisi);
      if (rule.type === 'subrand') return v.includes(r.subbrand);
      if (rule.type === 'produk')  return v.includes(r.product) || v.includes(r.pcode);
      return false;
    });
  }
  return filtered;
}

export function getTargetOutletsFromDMP(scheme, state) {
  const scopeRules = scheme.rules.filter(r => SCOPE_RULES.includes(r.type) && (r.values || []).length > 0);
  if (!scopeRules.length) return null;
  const outlets = state.outletMaster?.size > 0 ? Array.from(state.outletMaster.values()) : [];
  if (!outlets.length) return null;
  const cache = buildChannelCache(state.rows || []);
  return outlets.filter(o => {
    for (const rule of scopeRules) {
      const nv = (rule.values || []).map(normStr).filter(Boolean);
      if (!nv.length) continue;
      let val = '';
      if (rule.type === 'salesman')     val = normStr(o.salesman);
      else if (rule.type === 'toko')    val = normStr(o.outlet);
      else if (rule.type === 'channel') val = getOutletChannel(o, cache);
      if (!val || !nv.includes(val)) return false;
    }
    return true;
  });
}

export function findLBPRowsForOutlet(dmp, allRows) {
  const no = String(dmp.outletNo || '').trim();
  const nm = String(dmp.outlet   || '').trim();
  return allRows.filter(r => {
    const rn = String(r.outletNo || '').trim();
    const rm = String(r.outlet   || '').trim();
    if (no && rn === no) return true;
    if (nm && rm === nm) return true;
    return false;
  });
}

// ─── rule evaluation ──────────────────────────────────────────
export function evaluateRule(rule, rows, cache) {
  const t = rule.type;

  if (ALL_MULTI_RULES.includes(t)) {
    const v = rule.values || [];
    if (!v.length) return { passed: true, reason: 'Tidak difilter', matchingRows: rows };
    const nv = v.map(normStr).filter(Boolean);
    const mr = rows.filter(r => {
      if (t === 'divisi')   return v.includes(r.divisi);
      if (t === 'subrand')  return v.includes(r.subbrand);
      if (t === 'produk')   return v.includes(r.product) || v.includes(r.pcode);
      if (t === 'salesman') return v.includes(r.salesman);
      if (t === 'toko')     return v.includes(r.outlet);
      if (t === 'channel') {
        const rc = normStr(r.channel);
        if (rc && nv.includes(rc)) return true;
        if (cache) {
          const no = String(r.outletNo || '').trim();
          const nm = String(r.outlet   || '').trim();
          const c = cache.get('no:' + no) || cache.get('nm:' + nm);
          if (c && nv.includes(c)) return true;
        }
        return false;
      }
      return false;
    });
    return { passed: mr.length > 0, reason: mr.length > 0 ? `${mr.length} baris sesuai` : 'Tidak ada', matchingRows: mr };
  }

  if (t === 'minTransaksi') {
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const req = rule.value || 0;
    if (!req) return { passed: true, reason: 'Tidak difilter' };
    return { passed: total >= req, reason: `${compactRp(total)} / ${compactRp(req)}` };
  }

  if (t === 'minSku') {
    const req = rule.value || 0;
    if (!req) return { passed: true, reason: 'Tidak difilter' };
    const uniq = new Set(rows.map(r => r.product));
    return { passed: uniq.size >= req, reason: `${uniq.size} SKU / ${req}` };
  }

  if (t === 'minPerProduct') {
    const cfgs = (rule.productConfig || []).filter(c => c.enabled);
    if (!cfgs.length) return { passed: true, reason: 'Tidak difilter' };
    const res = cfgs.map(cfg => {
      const pr = rows.filter(r => r.product === cfg.product || r.pcode === cfg.product);
      const qty = pr.reduce((s, r) => s + getUnitValue(r, cfg.unit), 0);
      let ok = true, why = '';
      if (cfg.isKey && qty <= 0) { ok = false; why = 'Wajib ada (kunci)'; }
      else if (cfg.minValue > 0 && qty < cfg.minValue) { ok = false; why = `${NF1.format(qty)}/${NF1.format(cfg.minValue)} ${getUnitLabel(cfg.unit)}`; }
      return { ...cfg, actual: qty, passed: ok, reason: why };
    });
    return {
      passed: res.every(x => x.passed),
      reason: res.filter(x => !x.passed).map(x => `${x.product}: ${x.reason}`).join(' • ') || 'OK',
    };
  }

  return { passed: true, reason: 'Unknown' };
}

export function evaluateRulesOnRows(scheme, rows, cache) {
  const filters = scheme.rules.filter(r => ALL_MULTI_RULES.includes(r.type));
  const others  = scheme.rules.filter(r => !ALL_MULTI_RULES.includes(r.type));
  let fr = rows;
  const fails = [];
  for (const r of filters) {
    const x = evaluateRule(r, fr, cache);
    if (!x.passed) fails.push(`${RULE_TYPES[r.type]?.label}: ${x.reason}`);
    else if (x.matchingRows) fr = x.matchingRows;
  }
  for (const r of others) {
    const x = evaluateRule(r, fr, cache);
    if (!x.passed) fails.push(`${RULE_TYPES[r.type]?.label}: ${x.reason}`);
  }
  if (scheme.reward?.type === 'discount' && scheme.reward.discountMode === 'strata' && scheme.reward.strataTiers?.length > 0) {
    const u = scheme.reward.strataUnit || 'crtn';
    const qty = fr.reduce((s, r) => s + getUnitValue(r, u), 0);
    const tiers = [...scheme.reward.strataTiers].filter(t => t.min > 0).sort((a, b) => a.min - b.min);
    if (tiers.length && qty < tiers[0].min) {
      fails.push(`Strata: ${NF1.format(qty)} ${getUnitLabel(u)} < ${NF1.format(tiers[0].min)}`);
    }
  }
  return { passed: !fails.length, failures: fails, matchingRows: fr };
}

export function evaluateScheme(scheme, rows, cache) {
  if (!rows.length) return {
    passed: false, failures: ['Tidak ada transaksi'], matchingRows: [],
    invoiceResults: [], passingInvoices: [],
    evaluationMode: scheme.evaluationMode || 'per_invoice',
    totalInvoices: 0, passingCount: 0,
  };

  if (scheme.evaluationMode === 'per_invoice') {
    const im = new Map();
    for (const r of rows) {
      if (!im.has(r.invoice)) im.set(r.invoice, []);
      im.get(r.invoice).push(r);
    }
    const irs = [], pass = [];
    for (const [inv, rw] of im) {
      const res = evaluateRulesOnRows(scheme, rw, cache);
      irs.push({ invoice: inv, rows: rw, ...res });
      if (res.passed) pass.push({ invoice: inv, matchingRows: res.matchingRows });
    }
    const ok = pass.length > 0;
    const fails = ok ? [] : irs.slice(0, 3).map(x => `Faktur ${x.invoice}: ${x.failures.slice(0, 2).join(', ')}`);
    return {
      passed: ok, failures: fails,
      invoiceResults: irs, passingInvoices: pass,
      matchingRows: pass.flatMap(p => p.matchingRows),
      evaluationMode: 'per_invoice',
      totalInvoices: im.size, passingCount: pass.length,
    };
  }

  const res = evaluateRulesOnRows(scheme, rows, cache);
  return {
    ...res, invoiceResults: [], passingInvoices: [],
    evaluationMode: 'aggregate',
    totalInvoices: new Set(rows.map(r => r.invoice)).size,
    passingCount: res.passed ? 1 : 0,
  };
}

// ─── reward ───────────────────────────────────────────────────
export function countPackages(scheme, rows) {
  const rule = scheme.rules.find(r => r.type === 'minPerProduct');
  if (!rule?.productConfig?.length) return 0;
  const cfgs = rule.productConfig.filter(c => c.enabled);
  const pots = [];
  for (const cfg of cfgs) {
    const pr = rows.filter(r => r.product === cfg.product || r.pcode === cfg.product);
    const qty = pr.reduce((s, r) => s + getUnitValue(r, cfg.unit), 0);
    let min = cfg.minValue || (cfg.isKey ? 1 : 0);
    if (min > 0) pots.push(Math.floor(qty / min));
    else if (qty === 0 && cfg.isKey) return 0;
  }
  return pots.length ? Math.min(...pots) : 0;
}

export function calculateReward(scheme, rows, passInv) {
  const rw = scheme.reward;
  if (!rw) return { type: 'none' };
  if (rw.type === 'point') return calcPoint(scheme, rw, rows, passInv);
  return calcDiscount(scheme, rw, rows, passInv);
}

function calcDiscount(scheme, rw, rows, passInv) {
  const totalAmt = rows.reduce((s, r) => s + r.amount, 0);
  const actDisc  = rows.reduce((s, r) => s + getRowDiscount(r), 0);

  if (rw.discountMode === 'strata') {
    const u = rw.strataUnit || 'crtn';
    const qty = rows.reduce((s, r) => s + getUnitValue(r, u), 0);
    const tiers = (rw.strataTiers || []).filter(t => t.min > 0 && ((t.type === 'amount' ? t.amountValue : t.rate) > 0)).sort((a, b) => a.min - b.min);
    let tier = null;
    for (let i = tiers.length - 1; i >= 0; i--) {
      const t = tiers[i]; const hm = t.max != null && t.max > 0;
      if (qty >= t.min && (!hm || qty <= t.max)) { tier = t; break; }
    }
    if (!tier && tiers.length && qty >= tiers[0].min) for (let i = tiers.length - 1; i >= 0; i--) if (qty >= tiers[i].min) { tier = tiers[i]; break; }
    const tt = tier?.type || 'percent', rate = tier?.rate || 0, av = tier?.amountValue || 0;
    let capped = false, cQty = qty;
    if (rw.maxEnabled && rw.maxValue > 0) { capped = true; cQty = Math.min(qty, rw.maxValue); }
    const price = qty > 0 ? totalAmt / qty : 0;
    let exp = 0;
    if (tier) exp = tt === 'amount' ? cQty * av : cQty * price * (rate / 100);
    return {
      type: 'discount', isStrata: true, applicableTier: tier, tierType: tt, rate, amountValue: av,
      totalQty: qty, cappedQty: cQty, strataUnit: u, unitPrice: price,
      qualifiedRows: rows, totalDiscount: actDisc, totalOmset: totalAmt,
      expectedDiscount: exp, capped, maxUnits: rw.maxValue,
      overDiscount: capped && actDisc > exp ? actDisc - exp : 0,
    };
  }

  let capped = false, cnt = 0, applied = 0, exp = actDisc;
  if (rw.maxEnabled && rw.maxValue > 0) {
    capped = true;
    if (rw.maxUnitType === 'invoice')      cnt = passInv?.length || 1;
    else if (rw.maxUnitType === 'package') cnt = countPackages(scheme, rows);
    applied = Math.min(cnt, rw.maxValue);
    exp = rw.discountType === 'amount' ? applied * rw.discountValue : (cnt > 0 ? (actDisc / cnt) * applied : 0);
  }
  return {
    type: 'discount', qualifiedRows: rows, totalDiscount: actDisc, totalOmset: totalAmt,
    expectedDiscount: exp, capped, maxUnits: rw.maxValue,
    unitType: rw.maxUnitType, unitCount: cnt, appliedUnits: applied,
    overDiscount: capped && actDisc > exp ? actDisc - exp : 0,
  };
}

function calcPoint(scheme, rw, rows, passInv) {
  let pts = 0;
  if (rw.pointBase === 'amount') {
    const rate = rw.pointRate || 10000;
    pts = rows.reduce((s, r) => s + Math.floor((r.amount || 0) / rate), 0);
  } else {
    const pu = rw.pointPerUnit || 1, u = rw.pointUnit || 'rcg';
    pts = rows.reduce((s, r) => s + Math.floor(getUnitValue(r, u) * pu), 0);
  }
  let capped = false, cnt = 0, applied = 0, exp = pts;
  if (rw.maxEnabled && rw.maxValue > 0) {
    capped = true;
    if (rw.maxUnitType === 'invoice')      cnt = passInv?.length || 1;
    else if (rw.maxUnitType === 'package') cnt = countPackages(scheme, rows);
    applied = Math.min(cnt, rw.maxValue);
    exp = cnt > 0 ? Math.floor((pts / cnt) * applied) : 0;
  }
  const prizes = (rw.prizes || []).filter(p => p.points > 0 && exp >= p.points).sort((a, b) => b.points - a.points);
  return {
    type: 'point', totalPoints: pts, expectedPoints: exp, eligiblePrizes: prizes, qualifiedRows: rows,
    capped, maxUnits: rw.maxValue, unitType: rw.maxUnitType, unitCount: cnt, appliedUnits: applied,
  };
}

// ─── analyze ──────────────────────────────────────────────────
export function analyzeProgram(program, allRows, state) {
  const dateRows = allRows.filter(r => r.tt === 'F' && r.day >= program.startDate && r.day <= program.endDate);
  const cache = buildChannelCache(allRows);

  const schemes = program.schemes.map(scheme => {
    const dmp = getTargetOutletsFromDMP(scheme, state);
    const useDmp = dmp && dmp.length > 0;
    const list = useDmp
      ? dmp.map(o => ({
          key: (o.outletNo || '') + '|' + (o.outlet || ''),
          outlet: o.outlet || '(tanpa nama)',
          outletNo: o.outletNo || '',
          salesman: o.salesman || '—',
          channel: getOutletChannel(o, cache) || '—',
          kabupaten: o.kabupaten || '—',
          rows: findLBPRowsForOutlet(o, dateRows),
          fromDMP: true,
        }))
      : buildOutletListFromLBP(dateRows);

    const { qualified, notQualified } = categorizeOutlets(scheme, list, cache);

    return {
      scheme, qualified, notQualified, usingDmp: useDmp,
      totalQualified: qualified.length, totalOutlets: list.length,
      totalOmset:        qualified.reduce((s, o) => s + o.omset, 0),
      totalDiscount:     qualified.reduce((s, o) => s + (o.reward?.totalDiscount  || 0), 0),
      expectedDiscount:  qualified.reduce((s, o) => s + (o.reward?.expectedDiscount || 0), 0),
      totalPoints:       qualified.reduce((s, o) => s + (o.reward?.totalPoints    || 0), 0),
      expectedPoints:    qualified.reduce((s, o) => s + (o.reward?.expectedPoints  || 0), 0),
      overDiscount:      qualified.reduce((s, o) => s + (o.reward?.overDiscount    || 0), 0),
    };
  });
  return { schemes };
}

function buildOutletListFromLBP(rows) {
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.outletKey)) m.set(r.outletKey, {
      key: r.outletKey, outlet: r.outlet, outletNo: r.outletNo,
      salesman: r.salesman, channel: r.channel, kabupaten: r.kabupaten,
      rows: [], fromDMP: false,
    });
    m.get(r.outletKey).rows.push(r);
  }
  return Array.from(m.values());
}

function categorizeOutlets(scheme, list, cache) {
  const q = [], nq = [];
  for (const o of list) {
    if (!o.rows.length) {
      nq.push({
        ...o,
        evaluation: { passed: false, failures: ['Tidak ada transaksi di periode ini'], matchingRows: [], invoiceResults: [], passingInvoices: [], totalInvoices: 0, passingCount: 0 },
        omset: 0,
      });
      continue;
    }
    const ev = evaluateScheme(scheme, o.rows, cache);
    if (ev.passed) {
      const rw = calculateReward(scheme, ev.matchingRows, ev.passingInvoices);
      q.push({
        ...o, evaluation: ev, reward: rw,
        omset: ev.matchingRows.reduce((s, r) => s + r.amount, 0),
        txCount: ev.matchingRows.length,
        invoiceCount: ev.passingCount || 0,
      });
    } else {
      nq.push({ ...o, evaluation: ev, omset: o.rows.reduce((s, r) => s + r.amount, 0) });
    }
  }
  q.sort((a, b) => b.omset - a.omset);
  nq.sort((a, b) => b.omset - a.omset);
  return { qualified: q, notQualified: nq };
}

// ─── salesman stats & alerts ──────────────────────────────────
export function buildSalesmanStats(program, analysis) {
  const stats = new Map();
  const progress = getProgramProgress(program);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);

  const add = (sm, o, isQ) => {
    if (!stats.has(sm)) stats.set(sm, {
      name: sm, targetOutlets: 0, qualifiedOutlets: 0, notQualifiedOutlets: 0,
      omset: 0, discount: 0, lastActivityDay: null,
    });
    const st = stats.get(sm);
    st.targetOutlets++;
    if (isQ) {
      st.qualifiedOutlets++;
      st.omset    += o.omset || 0;
      st.discount += o.reward?.totalDiscount || 0;
    } else {
      st.notQualifiedOutlets++;
    }
    for (const r of (o.rows || [])) {
      if (!st.lastActivityDay || r.day > st.lastActivityDay) st.lastActivityDay = r.day;
    }
  };

  for (const sr of analysis.schemes) {
    for (const o of sr.qualified)    { const sm = o.salesman || '—'; if (sm !== '—') add(sm, o, true); }
    for (const o of sr.notQualified) { const sm = o.salesman || '—'; if (sm !== '—') add(sm, o, false); }
  }

  for (const st of stats.values()) {
    st.participation = st.targetOutlets > 0 ? (st.qualifiedOutlets / st.targetOutlets) * 100 : 0;
    st.daysSinceLastActivity = st.lastActivityDay
      ? Math.round((today - new Date(st.lastActivityDay + 'T00:00:00Z')) / DAY_MS)
      : null;
  }
  return { stats, progress };
}

export function detectAlerts(program, analysis) {
  const { stats, progress } = buildSalesmanStats(program, analysis);
  const alerts = [];

  if (progress.daysElapsed === 0) return { alerts: [], stats, progress, notStarted: true, ended: false };
  if (progress.daysRemaining === 0 && progress.daysElapsed >= progress.totalDays) return { alerts: [], stats, progress, notStarted: false, ended: true };

  const exp = progress.progressPct;
  const grace = progress.daysElapsed <= 2;

  for (const st of stats.values()) {
    if (!st.targetOutlets) continue;
    const p = st.participation, ds = st.daysSinceLastActivity;

    if (st.qualifiedOutlets === 0) {
      alerts.push({
        type: 'late_start', severity: 0, salesman: st.name, icon: '⚠️',
        title: progress.daysElapsed >= 3 ? 'Belum mulai sama sekali' : 'Belum ada aktivitas',
        message: `0 dari ${st.targetOutlets} outlet — hari ke-${progress.daysElapsed}/${progress.totalDays}`,
        stat: st,
      });
      continue;
    }
    if (!grace && p < exp * 0.5) {
      alerts.push({ type: 'critical', severity: 0, salesman: st.name, icon: '🚨', title: 'Jauh di bawah target', message: `${p.toFixed(0)}% (harus ≥${(exp * 0.8).toFixed(0)}%)`, stat: st });
      continue;
    }
    if (ds !== null && ds >= 3 && progress.daysElapsed >= 3) {
      alerts.push({ type: 'stagnant', severity: 1, salesman: st.name, icon: '🟡', title: `Tidak aktif ${ds} hari`, message: `${st.qualifiedOutlets}/${st.targetOutlets} outlet`, stat: st });
      continue;
    }
    if (!grace && p < exp * 0.8) {
      alerts.push({ type: 'below_target', severity: 1, salesman: st.name, icon: '🔴', title: 'Di bawah target', message: `${p.toFixed(0)}% (harus ≥${(exp * 0.8).toFixed(0)}%)`, stat: st });
      continue;
    }
    if (p >= 90) {
      alerts.push({ type: 'top', severity: 3, salesman: st.name, icon: '🟢', title: 'Top performer', message: `${p.toFixed(0)}%`, stat: st });
    }
  }

  alerts.sort((a, b) => a.severity - b.severity);
  return { alerts, stats, progress, notStarted: false, ended: false };
}

// ─── diagnose / playbook / wa ─────────────────────────────────
export function diagnoseSalesman(stat, program, analysis, progress) {
  const d = {
    mainIssue: null, detail: '', severity: 'info',
    outletStats: { total: 0, noTx: 0, belowMin: 0, disqualified: 0 },
    failureReasons: new Map(), topFailedOutlets: [],
  };
  const all = [];
  for (const sr of analysis.schemes) {
    for (const o of sr.qualified)    if (o.salesman === stat.name) all.push({ ...o, status: 'q' });
    for (const o of sr.notQualified) if (o.salesman === stat.name) all.push({ ...o, status: 'nq' });
  }
  d.outletStats.total = all.length;

  for (const o of all) {
    if (o.status === 'q') continue;
    if (!o.rows?.length) {
      d.outletStats.noTx++;
      d.topFailedOutlets.push({ outlet: o.outlet, reason: 'Belum ada transaksi', icon: '❌', category: 'no_tx' });
      continue;
    }
    const f = o.evaluation?.failures || [];
    if (!f.length) { d.outletStats.disqualified++; continue; }
    const fail = f[0];
    let cat = 'other';
    if (fail.includes('Min') || fail.toLowerCase().includes('butuh')) { cat = 'below_min'; d.outletStats.belowMin++; }
    else if (fail.includes('kunci')) cat = 'missing_key';
    else if (fail.includes('Strata')) cat = 'below_strata';

    d.failureReasons.set(fail, (d.failureReasons.get(fail) || 0) + 1);
    d.topFailedOutlets.push({ outlet: o.outlet, reason: fail, icon: '⚠️', category: cat });
  }

  const nt = d.outletStats.noTx, bm = d.outletStats.belowMin, tot = d.outletStats.total;
  if (nt / Math.max(1, tot) >= 0.7) {
    d.mainIssue = 'no_visit'; d.severity = 'critical';
    d.detail = `${nt} dari ${tot} outlet belum ada transaksi. Kemungkinan routing issue atau outlet menolak.`;
  } else if (bm / Math.max(1, tot) >= 0.5) {
    d.mainIssue = 'below_min'; d.severity = 'warning';
    d.detail = `${bm} outlet sudah order tapi belum capai minimal. Perlu push upsell.`;
  } else if (d.failureReasons.size > 0) {
    d.mainIssue = 'specific_rules'; d.severity = 'warning';
    const top = Array.from(d.failureReasons.entries()).sort((a, b) => b[1] - a[1])[0];
    d.detail = `Kegagalan utama: "${top[0]}" (${top[1]} outlet).`;
  } else if (stat.qualifiedOutlets > 0 && stat.participation >= 50) {
    d.mainIssue = 'on_track'; d.severity = 'success';
    d.detail = `On-track. ${stat.qualifiedOutlets} outlet lolos.`;
  }
  return d;
}

export function generateCoachingPlaybook(stat, d, program, progress) {
  const a = [];
  if (d.mainIssue === 'no_visit') {
    a.push({ icon: '🚗', title: 'Review routing', detail: `Cek apakah salesman mengunjungi ${d.outletStats.noTx} outlet ini.`, priority: 'high' });
    a.push({ icon: '📞', title: 'Call 3 outlet sampel', detail: `Telepon ${Math.min(3, d.outletStats.noTx)} outlet random.`, priority: 'high' });
    a.push({ icon: '🎯', title: 'Set daily target', detail: `${Math.ceil(d.outletStats.noTx / Math.max(1, progress.daysRemaining))} outlet/hari selama ${progress.daysRemaining} hari.`, priority: 'medium' });
  } else if (d.mainIssue === 'below_min') {
    a.push({ icon: '📈', title: 'Push upsell', detail: `${d.outletStats.belowMin} outlet sudah order, tinggal tambah sedikit.`, priority: 'high' });
    a.push({ icon: '🎁', title: 'Bundling', detail: 'Tawarkan bundle agar qty cepat naik.', priority: 'medium' });
    a.push({ icon: '📱', title: 'Follow-up WA', detail: 'Kirim personal message ke outlet hampir lolos.', priority: 'high' });
  } else if (d.mainIssue === 'specific_rules') {
    const top = Array.from(d.failureReasons.entries()).sort((a, b) => b[1] - a[1])[0];
    if (top) a.push({ icon: '🔍', title: `Fokus: ${top[0].split(':')[0]}`, detail: `${top[1]} outlet gagal karena: ${top[0]}.`, priority: 'high' });
    a.push({ icon: '📊', title: 'Buat cheat sheet', detail: 'Ringkasan program 1 lembar untuk salesman.', priority: 'medium' });
  } else if (d.mainIssue === 'on_track') {
    a.push({ icon: '🏆', title: 'Beri apresiasi', detail: `${stat.qualifiedOutlets} outlet sudah lolos.`, priority: 'low' });
    a.push({ icon: '📚', title: 'Dokumentasikan best practice', detail: 'Sharing strategi ke salesman lain.', priority: 'low' });
  }
  if (progress.daysRemaining > 0 && progress.daysRemaining <= 7) {
    a.push({ icon: '⏰', title: `Sisa ${progress.daysRemaining} hari`, detail: 'Buat daily report progress.', priority: 'high' });
  }
  return a;
}

export function generateWhatsAppMessage(stat, d, program, progress) {
  const p = stat.participation, days = progress.daysRemaining;
  const emoji = p >= 90 ? '🏆' : p >= 50 ? '💪' : '⚠️';
  let m = `Halo *${stat.name}* 👋\n\n`;
  m += `📢 Update Program *${program.name}*\n`;
  m += `📅 Sisa *${days} hari* (hari ke-${progress.daysElapsed}/${progress.totalDays})\n\n`;
  m += `${emoji} *Progress:*\n✅ Lolos: *${stat.qualifiedOutlets}*/${stat.targetOutlets}\n📊 Partisipasi: *${p.toFixed(0)}%*\n`;
  if (stat.omset > 0) m += `💰 Omset: *${compactRp(stat.omset)}*\n`;
  m += `\n`;
  if (d.topFailedOutlets.length > 0) {
    m += `🎯 *Perlu follow up:*\n`;
    d.topFailedOutlets.slice(0, 5).forEach((o, i) => { m += `${i + 1}. ${o.outlet} — ${o.reason}\n`; });
    if (d.topFailedOutlets.length > 5) m += `...dan ${d.topFailedOutlets.length - 5} lainnya\n`;
    m += `\n`;
  }
  if (d.mainIssue === 'no_visit') m += `💡 Fokus kunjungi outlet di atas. Sisa ${days} hari!\n`;
  else if (d.mainIssue === 'below_min') m += `💡 Outlet sudah order, tinggal tambah sedikit. Ajak upsell!\n`;
  else if (p >= 90) m += `💡 Luar biasa! Teruskan momentum! 🚀\n`;
  m += `\n_— Tim Program M245_`;
  return m;
}