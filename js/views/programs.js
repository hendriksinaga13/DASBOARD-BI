/* ═══════════════════════════════════════════════════════════════
   M245 — Program Berjalan
   Features: Rule-based · Strata (%/Rp) · DMP Target · 
             Alert Dashboard · Scorecard · Coaching Playbook · 
             WhatsApp Broadcast
   ═══════════════════════════════════════════════════════════════ */

import { esc, compactRp, NF1, pct, fmtDateID } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered } from '../core/selectors.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';
import { toast, openModal } from '../ui/feedback.js';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const STORAGE_KEY = 'm245.programs.v2';
const DAY_MS = 86400000;

const RULE_TYPES = {
  divisi:       { label: 'Divisi',          icon: '📂', kind: 'multiselect', source: 'divisi' },
  subrand:      { label: 'Subrand',         icon: '🏷️', kind: 'multiselect', source: 'subbrand' },
  produk:       { label: 'Produk',          icon: '📦', kind: 'multiselect', source: 'product' },
  salesman:     { label: 'Salesman',        icon: '👤', kind: 'multiselect', source: 'salesman' },
  channel:      { label: 'Channel',         icon: '🏬', kind: 'multiselect', source: 'channel' },
  toko:         { label: 'Toko Spesifik',   icon: '🏪', kind: 'multiselect', source: 'outlet' },
  minTransaksi: { label: 'Min Transaksi',   icon: '💰', kind: 'number', unit: 'Rp' },
  minSku:       { label: 'Min SKU',         icon: '🔢', kind: 'number', unit: 'SKU' },
  minPerProduct:{ label: 'Min per Produk',  icon: '📊', kind: 'productConfig' },
};

const SCOPE_RULES = ['salesman', 'channel', 'toko'];
const PRODUCT_RULES = ['divisi', 'subrand', 'produk'];
const ALL_MULTI_RULES = [...PRODUCT_RULES, ...SCOPE_RULES];
const DMP_SCOPE_SOURCES = ['salesman', 'channel', 'outlet'];

// ═══════════════════════════════════════════════════════════════
// UNIT HELPERS
// ═══════════════════════════════════════════════════════════════
function getPcs(r) { return Math.abs(r.netQty || 0); }
function getCrtn(r) { return (r.netCarton != null && isFinite(r.netCarton)) ? Math.abs(r.netCarton) : 0; }
function getRcg(r) {
  if (r.netRcg != null && isFinite(r.netRcg)) return Math.abs(r.netRcg);
  const m = String(r.kemasan || '').match(/RCG\s*\/\s*(\d+)/i);
  if (m) { const f = +m[1]; if (f > 0) return Math.abs((r.netQty || 0) / f); }
  const m2 = String(r.kemasan || '').match(/RENCENG\s*(\d+)/i);
  if (m2) { const f = +m2[1]; if (f > 0) return Math.abs((r.netQty || 0) / f); }
  return 0;
}
function getUnitValue(r, unit) {
  if (unit === 'crtn') return getCrtn(r);
  if (unit === 'rcg') return getRcg(r);
  if (unit === 'pcs') return getPcs(r);
  if (unit === 'amount') return r.amount || 0;
  return 0;
}
function getUnitLabel(unit) { return { crtn: 'CTN', rcg: 'RCG', pcs: 'PCS', amount: 'Rp' }[unit] || ''; }
function getRowDiscount(r) { return (r.disc || 0) + (r.disc1kh || 0) + (r.pro || 0); }

function normStr(v) {
  if (!v || v === '—' || v === '-') return '';
  return String(v).trim().toUpperCase().replace(/\s+/g, ' ');
}

// ═══════════════════════════════════════════════════════════════
// CHANNEL CACHE
// ═══════════════════════════════════════════════════════════════
let _channelCache = null;
let _channelCacheRows = null;

function buildChannelCache(rows) {
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

function getOutletChannel(outlet, channelCache) {
  const dmpChannel = normStr(outlet.channel);
  if (dmpChannel) return dmpChannel;
  const no = String(outlet.outletNo || '').trim();
  const nm = String(outlet.outlet || '').trim();
  return channelCache.get('no:' + no) || channelCache.get('nm:' + nm) || '';
}

// ═══════════════════════════════════════════════════════════════
// STORAGE & MIGRATION
// ═══════════════════════════════════════════════════════════════
function loadPrograms() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').map(migrateProgram); }
  catch (e) { return []; }
}
function savePrograms(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
}

function migrateProgram(p) {
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

function migrateScheme(s) {
  return {
    id: s.id || ('SCH-' + Date.now() + Math.random().toString(36).slice(2, 8)),
    name: s.name || 'Scheme',
    evaluationMode: s.evaluationMode || 'per_invoice',
    rules: Array.isArray(s.rules) ? s.rules.map(migrateRule) : [],
    reward: migrateReward(s.reward || {}),
  };
}

function migrateRule(r) {
  return { type: r.type, values: Array.isArray(r.values) ? r.values : [], value: r.value || 0, productConfig: Array.isArray(r.productConfig) ? r.productConfig : [] };
}

function migrateReward(rw) {
  return {
    type: rw.type || 'discount',
    discountMode: rw.discountMode || 'fixed',
    discountType: rw.discountType || 'percent',
    discountValue: rw.discountValue || 0,
    strataUnit: rw.strataUnit || 'crtn',
    strataTiers: Array.isArray(rw.strataTiers) ? rw.strataTiers.map(t => ({
      min: t.min || 0,
      max: t.max != null ? t.max : null,
      type: t.type || 'percent',
      rate: t.rate || 0,
      amountValue: t.amountValue || 0,
    })) : [],
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

// ═══════════════════════════════════════════════════════════════
// PROGRAM STATUS & PROGRESS
// ═══════════════════════════════════════════════════════════════
function getProgramStatus(program) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const start = new Date(program.startDate + 'T00:00:00Z');
  const end = new Date(program.endDate + 'T00:00:00Z');
  if (isNaN(start) || isNaN(end)) return { status: 'active', label: 'Periode invalid', color: '#94A3B8', bg: '#F8FAFC' };
  if (today < start) {
    const days = Math.ceil((start - today) / DAY_MS);
    return { status: 'upcoming', label: `Mulai dalam ${days} hari`, color: '#3B82F6', bg: '#EFF6FF' };
  }
  if (today > end) {
    const days = Math.ceil((today - end) / DAY_MS);
    return { status: 'expired', label: `Berakhir ${days} hari lalu`, color: '#94A3B8', bg: '#F8FAFC' };
  }
  const remaining = Math.ceil((end - today) / DAY_MS) + 1;
  if (remaining <= 3) return { status: 'critical', label: `⚠️ Sisa ${remaining} hari!`, color: '#DC2626', bg: '#FEF2F2' };
  if (remaining <= 7) return { status: 'warning', label: `⏰ Sisa ${remaining} hari`, color: '#F59E0B', bg: '#FFFBEB' };
  return { status: 'active', label: `✅ Aktif (${remaining} hari)`, color: '#10B981', bg: '#F0FDF4' };
}

function getProgramProgress(program) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const start = new Date(program.startDate + 'T00:00:00Z');
  const end = new Date(program.endDate + 'T00:00:00Z');
  const totalDays = Math.max(1, Math.round((end - start) / DAY_MS) + 1);

  let daysElapsed, daysRemaining;
  if (today < start) { daysElapsed = 0; daysRemaining = totalDays; }
  else if (today > end) { daysElapsed = totalDays; daysRemaining = 0; }
  else {
    daysElapsed = Math.round((today - start) / DAY_MS) + 1;
    daysRemaining = Math.max(0, totalDays - daysElapsed);
  }
  const progressPct = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100));
  return { daysElapsed, daysRemaining, totalDays, progressPct };
}

// ═══════════════════════════════════════════════════════════════
// SCOPE & PRODUCT FILTERING
// ═══════════════════════════════════════════════════════════════
function getScopedRows(scheme, outletRows) {
  const productRules = scheme.rules.filter(r => PRODUCT_RULES.includes(r.type) && (r.values || []).length > 0);
  if (productRules.length === 0) return outletRows;
  let filtered = outletRows;
  for (const rule of productRules) {
    const values = rule.values;
    filtered = filtered.filter(r => {
      if (rule.type === 'divisi') return values.includes(r.divisi);
      if (rule.type === 'subrand') return values.includes(r.subbrand);
      if (rule.type === 'produk') return values.includes(r.product) || values.includes(r.pcode);
      return false;
    });
  }
  return filtered;
}

// ═══════════════════════════════════════════════════════════════
// DMP TARGETING
// ═══════════════════════════════════════════════════════════════
function getTargetOutletsFromDMP(scheme, state) {
  const scopeRules = scheme.rules.filter(r => SCOPE_RULES.includes(r.type) && (r.values || []).length > 0);
  if (scopeRules.length === 0) return null;
  const dmpOutlets = (state.outletMaster && state.outletMaster.size > 0) ? Array.from(state.outletMaster.values()) : [];
  if (dmpOutlets.length === 0) return null;
  const channelCache = buildChannelCache(state.rows || []);
  return dmpOutlets.filter(o => {
    for (const rule of scopeRules) {
      const normValues = (rule.values || []).map(normStr).filter(Boolean);
      if (normValues.length === 0) continue;
      let outletVal = '';
      if (rule.type === 'salesman') outletVal = normStr(o.salesman);
      else if (rule.type === 'toko') outletVal = normStr(o.outlet);
      else if (rule.type === 'channel') outletVal = getOutletChannel(o, channelCache);
      if (!outletVal || !normValues.includes(outletVal)) return false;
    }
    return true;
  });
}

function findLBPRowsForOutlet(dmpOutlet, allRows) {
  const no = String(dmpOutlet.outletNo || '').trim();
  const nm = String(dmpOutlet.outlet || '').trim();
  return allRows.filter(r => {
    const rNo = String(r.outletNo || '').trim();
    const rNm = String(r.outlet || '').trim();
    if (no && rNo === no) return true;
    if (nm && rNm === nm) return true;
    return false;
  });
}

// ═══════════════════════════════════════════════════════════════
// RULE EVALUATION
// ═══════════════════════════════════════════════════════════════
function evaluateRule(rule, rows, channelCache) {
  const type = rule.type;
  if (ALL_MULTI_RULES.includes(type)) {
    const values = rule.values || [];
    if (values.length === 0) return { passed: true, reason: 'Tidak difilter', matchingRows: rows };
    const normValues = values.map(normStr).filter(Boolean);
    const matchingRows = rows.filter(r => {
      if (type === 'divisi') return values.includes(r.divisi);
      if (type === 'subrand') return values.includes(r.subbrand);
      if (type === 'produk') return values.includes(r.product) || values.includes(r.pcode);
      if (type === 'salesman') return values.includes(r.salesman);
      if (type === 'toko') return values.includes(r.outlet);
      if (type === 'channel') {
        const rChannel = normStr(r.channel);
        if (rChannel && normValues.includes(rChannel)) return true;
        if (channelCache) {
          const rNo = String(r.outletNo || '').trim();
          const rNm = String(r.outlet || '').trim();
          const cached = channelCache.get('no:' + rNo) || channelCache.get('nm:' + rNm);
          if (cached && normValues.includes(cached)) return true;
        }
        return false;
      }
      return false;
    });
    return {
      passed: matchingRows.length > 0,
      reason: matchingRows.length > 0 ? `${matchingRows.length} baris sesuai` : 'Tidak ada baris sesuai',
      matchingRows,
    };
  }
  if (type === 'minTransaksi') {
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const required = rule.value || 0;
    if (required === 0) return { passed: true, reason: 'Tidak difilter' };
    return { passed: total >= required, reason: `${compactRp(total)} / ${compactRp(required)}`, current: total, required };
  }
  if (type === 'minSku') {
    const required = rule.value || 0;
    if (required === 0) return { passed: true, reason: 'Tidak difilter' };
    const uniqueProducts = new Set(rows.map(r => r.product));
    return { passed: uniqueProducts.size >= required, reason: `${uniqueProducts.size} SKU / ${required}`, current: uniqueProducts.size, required };
  }
  if (type === 'minPerProduct') {
    const configs = (rule.productConfig || []).filter(c => c.enabled);
    if (configs.length === 0) return { passed: true, reason: 'Tidak difilter' };
    const productResults = configs.map(cfg => {
      const prodRows = rows.filter(r => r.product === cfg.product || r.pcode === cfg.product);
      const qty = prodRows.reduce((s, r) => s + getUnitValue(r, cfg.unit), 0);
      let passed = true, reason = '';
      if (cfg.isKey && qty <= 0) { passed = false; reason = 'Wajib ada (kunci), tidak ditemukan'; }
      else if (cfg.minValue > 0 && qty < cfg.minValue) { passed = false; reason = `${NF1.format(qty)}/${NF1.format(cfg.minValue)} ${getUnitLabel(cfg.unit)}`; }
      return { ...cfg, actual: qty, passed, reason };
    });
    return {
      passed: productResults.every(r => r.passed),
      reason: productResults.filter(r => !r.passed).map(r => `${r.product}: ${r.reason}`).join(' • ') || 'OK',
      productResults,
    };
  }
  return { passed: true, reason: 'Tipe unknown' };
}

function evaluateRulesOnRows(scheme, rows, channelCache) {
  const filterRules = scheme.rules.filter(r => ALL_MULTI_RULES.includes(r.type));
  const otherRules = scheme.rules.filter(r => !ALL_MULTI_RULES.includes(r.type));
  let filteredRows = rows;
  const failures = [];
  for (const rule of filterRules) {
    const result = evaluateRule(rule, filteredRows, channelCache);
    if (!result.passed) failures.push(`${RULE_TYPES[rule.type]?.label}: ${result.reason}`);
    else if (result.matchingRows) filteredRows = result.matchingRows;
  }
  for (const rule of otherRules) {
    const result = evaluateRule(rule, filteredRows, channelCache);
    if (!result.passed) failures.push(`${RULE_TYPES[rule.type]?.label}: ${result.reason}`);
  }
  if (scheme.reward?.type === 'discount' && scheme.reward.discountMode === 'strata' && scheme.reward.strataTiers?.length > 0) {
    const unit = scheme.reward.strataUnit || 'crtn';
    const totalQty = filteredRows.reduce((s, r) => s + getUnitValue(r, unit), 0);
    const tiers = [...scheme.reward.strataTiers].filter(t => t.min > 0).sort((a, b) => a.min - b.min);
    if (tiers.length > 0 && totalQty < tiers[0].min) {
      failures.push(`Strata: hanya ${NF1.format(totalQty)} ${getUnitLabel(unit)}, butuh min ${NF1.format(tiers[0].min)}`);
    }
  }
  return { passed: failures.length === 0, failures, matchingRows: filteredRows };
}

function evaluateSchemePerInvoice(scheme, outletRows, channelCache) {
  const invoiceMap = new Map();
  for (const r of outletRows) {
    if (!invoiceMap.has(r.invoice)) invoiceMap.set(r.invoice, []);
    invoiceMap.get(r.invoice).push(r);
  }
  const invoiceResults = [];
  const passingInvoices = [];
  for (const [invoiceId, invRows] of invoiceMap) {
    const result = evaluateRulesOnRows(scheme, invRows, channelCache);
    invoiceResults.push({ invoice: invoiceId, rows: invRows, ...result });
    if (result.passed) passingInvoices.push({ invoice: invoiceId, matchingRows: result.matchingRows });
  }
  const passed = passingInvoices.length > 0;
  const matchingRows = passingInvoices.flatMap(p => p.matchingRows);
  const failures = passed ? [] : invoiceResults.slice(0, 3).map(ir =>
    `Faktur ${ir.invoice}: ${ir.failures.slice(0, 2).join(', ')}`
  );
  return {
    passed, failures, invoiceResults, passingInvoices, matchingRows,
    evaluationMode: 'per_invoice',
    totalInvoices: invoiceMap.size,
    passingCount: passingInvoices.length,
  };
}

function evaluateSchemeAggregate(scheme, outletRows, channelCache) {
  const result = evaluateRulesOnRows(scheme, outletRows, channelCache);
  return {
    ...result, invoiceResults: [], passingInvoices: [],
    evaluationMode: 'aggregate',
    totalInvoices: new Set(outletRows.map(r => r.invoice)).size,
    passingCount: result.passed ? 1 : 0,
  };
}

function evaluateScheme(scheme, outletRows, channelCache) {
  if (outletRows.length === 0) {
    return {
      passed: false, failures: ['Tidak ada transaksi'], matchingRows: [],
      invoiceResults: [], passingInvoices: [],
      evaluationMode: scheme.evaluationMode || 'per_invoice',
      totalInvoices: 0, passingCount: 0,
    };
  }
  return (scheme.evaluationMode || 'per_invoice') === 'per_invoice'
    ? evaluateSchemePerInvoice(scheme, outletRows, channelCache)
    : evaluateSchemeAggregate(scheme, outletRows, channelCache);
}

// ═══════════════════════════════════════════════════════════════
// REWARD CALCULATION
// ═══════════════════════════════════════════════════════════════
function countPackages(scheme, matchingRows) {
  const minRule = scheme.rules.find(r => r.type === 'minPerProduct');
  if (!minRule || !minRule.productConfig?.length) return 0;
  const configs = minRule.productConfig.filter(c => c.enabled);
  if (configs.length === 0) return 0;
  const potentials = [];
  for (const cfg of configs) {
    const prodRows = matchingRows.filter(r => r.product === cfg.product || r.pcode === cfg.product);
    const qty = prodRows.reduce((s, r) => s + getUnitValue(r, cfg.unit), 0);
    let minPerPackage = cfg.minValue || 0;
    if (cfg.isKey && minPerPackage === 0) minPerPackage = 1;
    if (minPerPackage > 0) potentials.push(Math.floor(qty / minPerPackage));
    else if (qty === 0 && cfg.isKey) return 0;
  }
  return potentials.length > 0 ? Math.min(...potentials) : 0;
}

function calculateReward(scheme, matchingRows, passingInvoices) {
  const reward = scheme.reward;
  if (!reward) return { type: 'none' };
  if (reward.type === 'discount') return calculateDiscountReward(scheme, reward, matchingRows, passingInvoices);
  if (reward.type === 'point') return calculatePointReward(scheme, reward, matchingRows, passingInvoices);
  return { type: 'none' };
}

function calculateDiscountReward(scheme, reward, matchingRows, passingInvoices) {
  const totalAmount = matchingRows.reduce((s, r) => s + r.amount, 0);
  const actualDiscount = matchingRows.reduce((s, r) => s + getRowDiscount(r), 0);

  if (reward.discountMode === 'strata') {
    const unit = reward.strataUnit || 'crtn';
    const totalQty = matchingRows.reduce((s, r) => s + getUnitValue(r, unit), 0);

    const tiers = (reward.strataTiers || [])
      .filter(t => t.min > 0 && ((t.type === 'amount' ? t.amountValue > 0 : t.rate > 0)))
      .sort((a, b) => a.min - b.min);

    let applicableTier = null;
    for (let i = tiers.length - 1; i >= 0; i--) {
      const t = tiers[i];
      const hasMax = t.max != null && t.max > 0;
      if (totalQty >= t.min && (!hasMax || totalQty <= t.max)) { applicableTier = t; break; }
    }
    if (!applicableTier && tiers.length > 0 && totalQty >= tiers[0].min) {
      for (let i = tiers.length - 1; i >= 0; i--) { if (totalQty >= tiers[i].min) { applicableTier = tiers[i]; break; } }
    }

    const tierType = applicableTier?.type || 'percent';
    const rate = applicableTier?.rate || 0;
    const amountValue = applicableTier?.amountValue || 0;

    let capped = false, cappedQty = totalQty;
    if (reward.maxEnabled && reward.maxValue > 0) {
      capped = true;
      cappedQty = Math.min(totalQty, reward.maxValue);
    }

    const unitPrice = totalQty > 0 ? totalAmount / totalQty : 0;

    let expectedDiscount = 0;
    if (applicableTier) {
      if (tierType === 'amount') {
        expectedDiscount = cappedQty * amountValue;
      } else {
        expectedDiscount = cappedQty * unitPrice * (rate / 100);
      }
    }

    return {
      type: 'discount',
      isStrata: true,
      applicableTier,
      tierType, rate, amountValue,
      totalQty, cappedQty,
      strataUnit: unit, unitPrice,
      qualifiedRows: matchingRows,
      totalDiscount: actualDiscount,
      totalOmset: totalAmount,
      expectedDiscount, capped,
      maxUnits: reward.maxValue,
      overDiscount: capped && actualDiscount > expectedDiscount ? actualDiscount - expectedDiscount : 0,
    };
  }

  let capped = false, unitCount = 0, appliedUnits = 0;
  let expectedDiscount = actualDiscount;
  if (reward.maxEnabled && reward.maxValue > 0) {
    capped = true;
    if (reward.maxUnitType === 'invoice') unitCount = passingInvoices?.length || 1;
    else if (reward.maxUnitType === 'package') unitCount = countPackages(scheme, matchingRows);
    appliedUnits = Math.min(unitCount, reward.maxValue);
    expectedDiscount = reward.discountType === 'amount'
      ? appliedUnits * reward.discountValue
      : (unitCount > 0 ? (actualDiscount / unitCount) * appliedUnits : 0);
  }
  return {
    type: 'discount', qualifiedRows: matchingRows,
    totalDiscount: actualDiscount, totalOmset: totalAmount,
    expectedDiscount, capped, maxUnits: reward.maxValue,
    unitType: reward.maxUnitType, unitCount, appliedUnits,
    overDiscount: capped && actualDiscount > expectedDiscount ? actualDiscount - expectedDiscount : 0,
  };
}

function calculatePointReward(scheme, reward, matchingRows, passingInvoices) {
  let totalPoints = 0;
  if (reward.pointBase === 'amount') {
    const rate = reward.pointRate || 10000;
    totalPoints = matchingRows.reduce((s, r) => s + Math.floor((r.amount || 0) / rate), 0);
  } else if (reward.pointBase === 'unit') {
    const perUnit = reward.pointPerUnit || 1;
    const unit = reward.pointUnit || 'rcg';
    totalPoints = matchingRows.reduce((s, r) => s + Math.floor(getUnitValue(r, unit) * perUnit), 0);
  }
  let capped = false, unitCount = 0, appliedUnits = 0;
  let expectedPoints = totalPoints;
  if (reward.maxEnabled && reward.maxValue > 0) {
    capped = true;
    if (reward.maxUnitType === 'invoice') unitCount = passingInvoices?.length || 1;
    else if (reward.maxUnitType === 'package') unitCount = countPackages(scheme, matchingRows);
    appliedUnits = Math.min(unitCount, reward.maxValue);
    expectedPoints = unitCount > 0 ? Math.floor((totalPoints / unitCount) * appliedUnits) : 0;
  }
  const eligiblePrizes = (reward.prizes || [])
    .filter(p => p.points > 0 && expectedPoints >= p.points)
    .sort((a, b) => b.points - a.points);
  return {
    type: 'point', totalPoints, expectedPoints, eligiblePrizes,
    qualifiedRows: matchingRows, capped, maxUnits: reward.maxValue,
    unitType: reward.maxUnitType, unitCount, appliedUnits,
  };
}

// ═══════════════════════════════════════════════════════════════
// ANALYZE PROGRAM
// ═══════════════════════════════════════════════════════════════
function analyzeProgram(program, allRows, state) {
  const dateRows = allRows.filter(r => r.tt === 'F' && r.day >= program.startDate && r.day <= program.endDate);
  const channelCache = buildChannelCache(allRows);

  const schemeResults = program.schemes.map(scheme => {
    const dmpOutlets = getTargetOutletsFromDMP(scheme, state);
    const useDmp = dmpOutlets && dmpOutlets.length > 0;
    const outletList = useDmp
      ? dmpOutlets.map(o => ({
          key: (o.outletNo || '') + '|' + (o.outlet || ''),
          outlet: o.outlet || '(tanpa nama)',
          outletNo: o.outletNo || '',
          salesman: o.salesman || '—',
          channel: getOutletChannel(o, channelCache) || '—',
          kabupaten: o.kabupaten || '—',
          rows: findLBPRowsForOutlet(o, dateRows),
          fromDMP: true,
        }))
      : buildOutletListFromLBP(dateRows);

    const { qualified, notQualified } = categorizeOutlets(scheme, outletList, channelCache);

    return {
      scheme, qualified, notQualified, usingDmp: useDmp,
      totalQualified: qualified.length,
      totalOutlets: outletList.length,
      participationRate: outletList.length > 0 ? (qualified.length / outletList.length) * 100 : 0,
      totalOmset: qualified.reduce((s, o) => s + o.omset, 0),
      totalDiscount: qualified.reduce((s, o) => s + (o.reward?.totalDiscount || 0), 0),
      expectedDiscount: qualified.reduce((s, o) => s + (o.reward?.expectedDiscount || 0), 0),
      totalPoints: qualified.reduce((s, o) => s + (o.reward?.totalPoints || 0), 0),
      expectedPoints: qualified.reduce((s, o) => s + (o.reward?.expectedPoints || 0), 0),
      overDiscount: qualified.reduce((s, o) => s + (o.reward?.overDiscount || 0), 0),
    };
  });
  return { schemes: schemeResults };
}

function buildOutletListFromLBP(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.outletKey)) map.set(r.outletKey, {
      key: r.outletKey, outlet: r.outlet, outletNo: r.outletNo,
      salesman: r.salesman, channel: r.channel, kabupaten: r.kabupaten,
      rows: [], fromDMP: false,
    });
    map.get(r.outletKey).rows.push(r);
  }
  return Array.from(map.values());
}

function categorizeOutlets(scheme, outletList, channelCache) {
  const qualified = [], notQualified = [];
  for (const outlet of outletList) {
    if (outlet.rows.length === 0) {
      notQualified.push({
        ...outlet,
        evaluation: { passed: false, failures: ['Tidak ada transaksi di periode ini'], matchingRows: [], invoiceResults: [], passingInvoices: [], totalInvoices: 0, passingCount: 0 },
        omset: 0,
      });
      continue;
    }
    const evaluation = evaluateScheme(scheme, outlet.rows, channelCache);
    if (evaluation.passed) {
      const reward = calculateReward(scheme, evaluation.matchingRows, evaluation.passingInvoices);
      qualified.push({
        ...outlet, evaluation, reward,
        omset: evaluation.matchingRows.reduce((s, r) => s + r.amount, 0),
        txCount: evaluation.matchingRows.length,
        invoiceCount: evaluation.passingCount || 0,
      });
    } else {
      notQualified.push({ ...outlet, evaluation, omset: outlet.rows.reduce((s, r) => s + r.amount, 0) });
    }
  }
  qualified.sort((a, b) => b.omset - a.omset);
  notQualified.sort((a, b) => b.omset - a.omset);
  return { qualified, notQualified };
}

// ═══════════════════════════════════════════════════════════════
// UNIQUE VALUES
// ═══════════════════════════════════════════════════════════════
function getUniqueValues(rows, source, state) {
  const values = new Set();
  if (DMP_SCOPE_SOURCES.includes(source) && state?.outletMaster?.size > 0) {
    const channelCache = (source === 'channel') ? buildChannelCache(rows) : null;
    for (const o of state.outletMaster.values()) {
      if (source === 'channel') {
        const ch = getOutletChannel(o, channelCache);
        if (ch) values.add(ch);
      } else {
        const key = source === 'outlet' ? 'outlet' : source;
        const v = normStr(o[key]);
        if (v) values.add(v);
      }
    }
  }
  const getter = {
    divisi: r => r.divisi, subrand: r => r.subbrand, product: r => r.product,
    salesman: r => r.salesman, channel: r => r.channel, outlet: r => r.outlet,
  }[source];
  if (getter) {
    for (const r of rows) {
      if (r.tt !== 'F') continue;
      const v = getter(r);
      const nv = normStr(v);
      if (nv) values.add(nv);
    }
  }
  return Array.from(values).sort();
}

// ═══════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════
const S = {
  card: 'padding:12px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;margin-bottom:12px;',
  sectionTitle: 'font-size:10px;font-weight:800;color:#9A3412;text-transform:uppercase;margin-bottom:6px;',
  label: 'font-size:10px;font-weight:800;color:#475569;text-transform:uppercase;',
  input: 'width:100%;padding:8px;border:1px solid #E2E8F0;border-radius:6px;font-size:12px;',
  smallInput: 'padding:6px;border:1px solid #E2E8F0;border-radius:4px;font-size:11px;',
  chip: (color) => `font-size:9px;color:${color};font-weight:800;padding:2px 6px;background:${color}15;border-radius:3px;`,
};

function renderFormRow(label, content) {
  return `<div style="margin-bottom:10px;"><div style="${S.sectionTitle}">${label}</div>${content}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// ⚡ SALESMAN STATS BUILDER
// ═══════════════════════════════════════════════════════════════
function buildSalesmanStats(program, analysis) {
  const stats = new Map();
  const progress = getProgramProgress(program);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);

  for (const sr of analysis.schemes) {
    for (const o of sr.qualified) {
      const sm = o.salesman || '—';
      if (sm === '—') continue;
      if (!stats.has(sm)) stats.set(sm, {
        name: sm, targetOutlets: 0, qualifiedOutlets: 0, notQualifiedOutlets: 0,
        omset: 0, discount: 0, lastActivityDay: null, qualifiedOutletsList: [],
      });
      const stat = stats.get(sm);
      stat.targetOutlets++;
      stat.qualifiedOutlets++;
      stat.omset += o.omset || 0;
      stat.discount += o.reward?.totalDiscount || 0;
      stat.qualifiedOutletsList.push(o);
      const days = (o.rows || []).map(r => r.day);
      for (const d of days) if (!stat.lastActivityDay || d > stat.lastActivityDay) stat.lastActivityDay = d;
    }
    for (const o of sr.notQualified) {
      const sm = o.salesman || '—';
      if (sm === '—') continue;
      if (!stats.has(sm)) stats.set(sm, {
        name: sm, targetOutlets: 0, qualifiedOutlets: 0, notQualifiedOutlets: 0,
        omset: 0, discount: 0, lastActivityDay: null, qualifiedOutletsList: [],
      });
      const stat = stats.get(sm);
      stat.targetOutlets++;
      stat.notQualifiedOutlets++;
      const days = (o.rows || []).map(r => r.day);
      for (const d of days) if (!stat.lastActivityDay || d > stat.lastActivityDay) stat.lastActivityDay = d;
    }
  }

  for (const stat of stats.values()) {
    stat.participation = stat.targetOutlets > 0 ? (stat.qualifiedOutlets / stat.targetOutlets) * 100 : 0;
    stat.daysSinceLastActivity = stat.lastActivityDay
      ? Math.round((today - new Date(stat.lastActivityDay + 'T00:00:00Z')) / DAY_MS)
      : null;
  }

  return { stats, progress };
}

// ═══════════════════════════════════════════════════════════════
// ⚡ ALERT DETECTION (FIXED — grace period + threshold adaptif)
// ═══════════════════════════════════════════════════════════════
function detectAlerts(program, analysis) {
  const { stats, progress } = buildSalesmanStats(program, analysis);
  const alerts = [];

  // ⚡ Guard #1: program belum dimulai
  if (progress.daysElapsed === 0) {
    return { alerts: [], stats, progress, notStarted: true, ended: false };
  }

  // ⚡ Guard #2: program sudah selesai
  if (progress.daysRemaining === 0 && progress.daysElapsed >= progress.totalDays) {
    return { alerts: [], stats, progress, notStarted: false, ended: true };
  }

  const expected = progress.progressPct;
  const isGracePeriod = progress.daysElapsed <= 2;

  for (const stat of stats.values()) {
    if (stat.targetOutlets === 0) continue;
    const p = stat.participation;
    const daysSince = stat.daysSinceLastActivity;

    // LATE_START — kasus paling kritis (0 outlet)
    if (stat.qualifiedOutlets === 0) {
      alerts.push({
        type: 'late_start', severity: 0, salesman: stat.name, icon: '⚠️',
        title: progress.daysElapsed >= 3 ? 'Belum mulai sama sekali' : 'Belum ada aktivitas',
        message: `0 dari ${stat.targetOutlets} outlet target — hari ke-${progress.daysElapsed}/${progress.totalDays}`,
        action: progress.daysElapsed >= 3 ? 'Emergency call' : 'Reminder',
        stat,
      });
      continue;
    }

    // CRITICAL — < 50% dari target progres (skip saat grace period)
    if (!isGracePeriod && p < expected * 0.5) {
      alerts.push({
        type: 'critical', severity: 0, salesman: stat.name, icon: '🚨',
        title: 'Jauh di bawah target progres',
        message: `Baru ${p.toFixed(0)}% — seharusnya ≥ ${(expected * 0.8).toFixed(0)}% di hari ke-${progress.daysElapsed}`,
        action: 'Call langsung', stat,
      });
      continue;
    }

    // STAGNANT — tidak aktif 3+ hari
    if (daysSince !== null && daysSince >= 3 && progress.daysElapsed >= 3) {
      alerts.push({
        type: 'stagnant', severity: 1, salesman: stat.name, icon: '🟡',
        title: `Tidak aktif ${daysSince} hari`,
        message: `${stat.qualifiedOutlets}/${stat.targetOutlets} outlet (${p.toFixed(0)}%)`,
        action: 'WA reminder', stat,
      });
      continue;
    }

    // BELOW_TARGET — < 80% dari expected (skip saat grace period)
    if (!isGracePeriod && p < expected * 0.8) {
      alerts.push({
        type: 'below_target', severity: 1, salesman: stat.name, icon: '🔴',
        title: 'Di bawah target progres',
        message: `${p.toFixed(0)}% — seharusnya ≥ ${(expected * 0.8).toFixed(0)}%`,
        action: 'Coaching call', stat,
      });
      continue;
    }

    // TOP performer
    if (p >= 90) {
      alerts.push({
        type: 'top', severity: 3, salesman: stat.name, icon: '🟢',
        title: 'Top performer',
        message: `${p.toFixed(0)}% (${stat.qualifiedOutlets}/${stat.targetOutlets})`,
        action: 'Apresiasi', stat,
      });
    }
  }

  alerts.sort((a, b) => a.severity - b.severity);
  return { alerts, stats, progress, notStarted: false, ended: false };
}

// ═══════════════════════════════════════════════════════════════
// ⚡ ALERT DASHBOARD UI (FIXED — belowTargetCount defined)
// ═══════════════════════════════════════════════════════════════
function renderAlertDashboard(program, analysis) {
  const result = detectAlerts(program, analysis);
  const { alerts, stats, progress, notStarted, ended } = result;

  if (stats.size === 0) {
    return `<div class="card" style="padding:12px; background:#F8FAFC; border-radius:8px; font-size:11px; color:#64748B; margin-bottom:12px;">📊 Belum ada data salesman untuk dimonitor.</div>`;
  }

  // Program belum dimulai
  if (notStarted) {
    const totalTarget = Array.from(stats.values()).reduce((s, x) => s + x.targetOutlets, 0);
    return `
      <div class="card" style="padding:12px; margin-bottom:12px; border-left:4px solid #3B82F6; background:#EFF6FF;">
        <div style="font-size:13px; font-weight:900; color:#1E40AF;">🕐 Program Belum Dimulai</div>
        <div style="font-size:11px; color:#1E3A8A; margin-top:4px;">
          Mulai tanggal <b>${fmtDateID(program.startDate)}</b>. ${stats.size} salesman siap dimonitor · ${totalTarget} outlet target total.
        </div>
        <button data-view-scorecard style="width:100%; padding:8px; background:#1D4ED8; color:#fff; border:none; border-radius:6px; font-weight:800; font-size:11px; margin-top:8px; cursor:pointer;">
          📊 Lihat Daftar Outlet Target
        </button>
      </div>`;
  }

  // Program sudah selesai
  if (ended) {
    const qualified = Array.from(stats.values()).reduce((s, x) => s + x.qualifiedOutlets, 0);
    const target = Array.from(stats.values()).reduce((s, x) => s + x.targetOutlets, 0);
    const rate = target > 0 ? (qualified / target) * 100 : 0;
    return `
      <div class="card" style="padding:12px; margin-bottom:12px; border-left:4px solid #94A3B8; background:#F8FAFC;">
        <div style="font-size:13px; font-weight:900; color:#475569;">📁 Program Sudah Selesai</div>
        <div style="font-size:11px; color:#64748B; margin-top:4px;">
          Akhir ${fmtDateID(program.endDate)} · Final: <b>${qualified}/${target}</b> outlet (${rate.toFixed(0)}%) · ${stats.size} salesman
        </div>
        <button data-view-scorecard style="width:100%; padding:8px; background:#475569; color:#fff; border:none; border-radius:6px; font-weight:800; font-size:11px; margin-top:8px; cursor:pointer;">
          📊 Lihat Hasil Akhir
        </button>
      </div>`;
  }

  // Program running tapi tidak ada alert
  if (alerts.length === 0) {
    return `
      <div class="card" style="background:#F0FDF4; border-left:4px solid #10B981; padding:12px; margin-bottom:12px;">
        <div style="font-size:13px; font-weight:900; color:#166534;">✅ Semua Salesman On-Track</div>
        <div style="font-size:10px; color:#64748B; margin-top:4px;">
          Progress program ${progress.progressPct.toFixed(0)}% (${progress.daysElapsed}/${progress.totalDays} hari).
          Target progres saat ini: ≥${(progress.progressPct * 0.8).toFixed(0)}%.
        </div>
        <button data-view-scorecard style="width:100%; padding:8px; background:#1D4ED8; color:#fff; border:none; border-radius:6px; font-weight:800; font-size:11px; margin-top:8px; cursor:pointer;">
          📊 Lihat Scorecard Lengkap (${stats.size} salesman)
        </button>
      </div>`;
  }

  // Program running dengan alert
  const criticalCount = alerts.filter(a => a.severity === 0).length;
  const warningCount = alerts.filter(a => a.severity === 1).length;
  const goodCount = alerts.filter(a => a.severity === 3).length;
  const belowTargetCount = alerts.filter(a => a.severity <= 1).length;
  const borderColor = criticalCount > 0 ? '#DC2626' : warningCount > 0 ? '#F59E0B' : '#10B981';

  return `
    <div class="card" style="padding:12px; margin-bottom:12px; border-left:4px solid ${borderColor};">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
        <div>
          <div style="font-size:13px; font-weight:900; color:#0F172A;">🚨 Monitoring Salesman</div>
          <div style="font-size:10px; color:#64748B; margin-top:2px;">
            Progress ${progress.progressPct.toFixed(0)}% · ${progress.daysElapsed}/${progress.totalDays} hari · ${stats.size} salesman
          </div>
        </div>
      </div>

      <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:10px;">
        ${criticalCount > 0 ? `<span style="${S.chip('#DC2626')}">🚨 ${criticalCount} kritis</span>` : ''}
        ${warningCount > 0 ? `<span style="${S.chip('#F59E0B')}">⚠️ ${warningCount} warning</span>` : ''}
        ${goodCount > 0 ? `<span style="${S.chip('#10B981')}">🟢 ${goodCount} top</span>` : ''}
      </div>

      ${alerts.slice(0, 5).map(a => `
        <div style="padding:8px; background:${a.severity === 0 ? '#FEF2F2' : a.severity === 1 ? '#FFFBEB' : '#F0FDF4'}; border-radius:6px; margin-bottom:4px; font-size:11px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:6px;">
            <div style="flex:1; min-width:0;">
              <div style="font-weight:800; color:#0F172A;">${a.icon} ${esc(a.salesman)}</div>
              <div style="font-size:9px; color:#64748B; margin-top:2px;">${esc(a.title)} — ${esc(a.message)}</div>
            </div>
            <button data-coaching="${esc(a.salesman)}" style="font-size:9px; color:#fff; padding:4px 8px; background:#8B5CF6; border:none; border-radius:6px; font-weight:800; cursor:pointer; white-space:nowrap; flex-shrink:0;">
              🎯 Coaching
            </button>
          </div>
        </div>
      `).join('')}

      ${alerts.length > 5 ? `<div style="font-size:10px; color:#64748B; text-align:center; padding:4px;">... ${alerts.length - 5} salesman lainnya</div>` : ''}

      <button data-view-scorecard style="width:100%; padding:9px; background:#1D4ED8; color:#fff; border:none; border-radius:6px; font-weight:800; font-size:11px; margin-top:8px; cursor:pointer;">
        📊 Lihat Scorecard Lengkap (${stats.size} salesman)
      </button>
      ${belowTargetCount > 0 ? `
        <button data-bulk-broadcast style="width:100%; padding:9px; background:#25D366; color:#fff; border:none; border-radius:6px; font-weight:800; font-size:11px; margin-top:6px; cursor:pointer;">
          📱 Broadcast ke ${belowTargetCount} Salesman di Bawah Target
        </button>
      ` : ''}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// ⚡ SALESMAN SCORECARD MODAL (FIXED — properly scoped)
// ═══════════════════════════════════════════════════════════════
function showSalesmanScorecard(program, analysis) {
  const result = detectAlerts(program, analysis);
  const { alerts, stats, progress, notStarted, ended } = result;
  const sorted = Array.from(stats.values()).sort((a, b) => b.participation - a.participation);

  const alertMap = new Map();
  for (const a of alerts) alertMap.set(a.salesman, a);

  let statusBanner = '';
  if (notStarted) {
    statusBanner = `<div style="padding:8px; background:#EFF6FF; border-left:3px solid #3B82F6; border-radius:4px; margin-bottom:12px; font-size:10px; color:#1E40AF;">
      🕐 <b>Program belum dimulai</b> — semua outlet masih 0% karena belum ada transaksi. Ini bukan indikasi salesman tidak aktif.
    </div>`;
  } else if (ended) {
    statusBanner = `<div style="padding:8px; background:#F8FAFC; border-left:3px solid #94A3B8; border-radius:4px; margin-bottom:12px; font-size:10px; color:#475569;">
      📁 <b>Program sudah selesai</b> — data final.
    </div>`;
  }

  openModal(`
    <div class="modal-h"><h3 style="font-size:15px; margin:0;">📊 Scorecard Salesman</h3><button class="x">×</button></div>
    <div class="modal-b" style="padding:16px; max-height:82vh; overflow-y:auto;">
      <div style="padding:10px; background:#F8FAFC; border-radius:6px; margin-bottom:12px; font-size:11px;">
        <b>${esc(program.name)}</b><br>
        <span style="color:#64748B;">Progress: ${progress.progressPct.toFixed(0)}% (${progress.daysElapsed}/${progress.totalDays} hari)</span>
      </div>

      ${statusBanner}

      <div class="tablewrap" style="max-height:60vh;">
        <table style="min-width:100%;">
          <thead style="position:sticky; top:0; background:#fff; box-shadow:0 2px 4px rgba(0,0,0,0.05); z-index:1;">
            <tr>
              <th style="text-align:left; padding:8px 4px;">#</th>
              <th style="text-align:left; padding:8px 4px;">Salesman</th>
              <th class="num" style="padding:8px 4px;">Target</th>
              <th class="num" style="padding:8px 4px;">✓</th>
              <th class="num" style="padding:8px 4px;">%</th>
              <th class="num" style="padding:8px 4px;">Omset</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((s, i) => {
              const p = s.participation;
              const color = p >= 90 ? '#10B981' : p >= 50 ? '#F59E0B' : '#DC2626';
              const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1);
              const alert = alertMap.get(s.name);
              const alertIcon = alert ? alert.icon : '';
              return `
                <tr style="border-bottom:1px solid #F1F5F9;">
                  <td style="padding:8px 4px;">${rank}</td>
                  <td class="strong" style="padding:8px 4px;">
                    ${esc(s.name)}
                    ${alertIcon ? `<span style="margin-left:4px;">${alertIcon}</span>` : ''}
                    ${s.daysSinceLastActivity != null ? `<div style="font-size:9px; color:#94A3B8; font-weight:normal;">${s.daysSinceLastActivity === 0 ? 'aktif hari ini' : `${s.daysSinceLastActivity} hari lalu`}</div>` : ''}
                  </td>
                  <td class="num" style="padding:8px 4px;">${s.targetOutlets}</td>
                  <td class="num" style="padding:8px 4px;">${s.qualifiedOutlets}</td>
                  <td class="num" style="padding:8px 4px; color:${color}; font-weight:800;">${p.toFixed(0)}%</td>
                  <td class="num" style="padding:8px 4px;">${compactRp(s.omset)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div style="margin-top:12px; padding:8px; background:#F8FAFC; border-radius:6px; font-size:10px; color:#64748B;">
        💡 <b>Alert aktif:</b> ${alerts.length > 0
          ? alerts.map(a => `${a.icon} ${esc(a.salesman)}`).slice(0, 5).join(' · ')
          : (notStarted ? 'Program belum dimulai' : ended ? 'Program selesai' : 'Tidak ada')}
      </div>
    </div>
  `);
}

// ═══════════════════════════════════════════════════════════════
// ⚡ DIAGNOSIS ENGINE — Kenapa salesman ini gagal? (module scope)
// ═══════════════════════════════════════════════════════════════
function diagnoseSalesman(stat, program, analysis, progress) {
  const diagnosis = {
    mainIssue: null,
    detail: '',
    severity: 'info',
    outletStats: { total: 0, noTx: 0, belowMin: 0, disqualified: 0 },
    failureReasons: new Map(),
    topFailedOutlets: [],
  };

  const allOutlet = [];
  for (const sr of analysis.schemes) {
    for (const o of sr.qualified) {
      if (o.salesman === stat.name) allOutlet.push({ ...o, status: 'qualified' });
    }
    for (const o of sr.notQualified) {
      if (o.salesman === stat.name) allOutlet.push({ ...o, status: 'notQualified' });
    }
  }

  diagnosis.outletStats.total = allOutlet.length;

  for (const o of allOutlet) {
    if (o.status === 'qualified') continue;

    if (!o.rows || o.rows.length === 0) {
      diagnosis.outletStats.noTx++;
      diagnosis.topFailedOutlets.push({
        outlet: o.outlet,
        reason: 'Belum ada transaksi',
        icon: '❌',
        category: 'no_tx',
      });
      continue;
    }

    const failures = o.evaluation?.failures || [];
    if (failures.length === 0) {
      diagnosis.outletStats.disqualified++;
      continue;
    }

    const failure = failures[0];
    let category = 'other';
    if (failure.includes('Min') || failure.toLowerCase().includes('butuh')) {
      category = 'below_min';
      diagnosis.outletStats.belowMin++;
    } else if (failure.includes('kunci')) {
      category = 'missing_key';
    } else if (failure.includes('Strata')) {
      category = 'below_strata';
    }

    diagnosis.failureReasons.set(failure, (diagnosis.failureReasons.get(failure) || 0) + 1);
    diagnosis.topFailedOutlets.push({
      outlet: o.outlet,
      reason: failure,
      icon: '⚠️',
      category,
    });
  }

  const noTx = diagnosis.outletStats.noTx;
  const belowMin = diagnosis.outletStats.belowMin;
  const total = diagnosis.outletStats.total;

  if (noTx / Math.max(1, total) >= 0.7) {
    diagnosis.mainIssue = 'no_visit';
    diagnosis.severity = 'critical';
    diagnosis.detail = `${noTx} dari ${total} outlet belum ada transaksi sama sekali. Kemungkinan salesman belum mengunjungi (routing issue) atau outlet menolak program.`;
  } else if (belowMin / Math.max(1, total) >= 0.5) {
    diagnosis.mainIssue = 'below_min';
    diagnosis.severity = 'warning';
    diagnosis.detail = `${belowMin} outlet sudah order tapi tidak memenuhi syarat minimal. Salesman perlu push upsell ke outlet ini untuk mencapai threshold.`;
  } else if (diagnosis.failureReasons.size > 0) {
    diagnosis.mainIssue = 'specific_rules';
    diagnosis.severity = 'warning';
    const topReason = Array.from(diagnosis.failureReasons.entries()).sort((a, b) => b[1] - a[1])[0];
    diagnosis.detail = `Kegagalan utama: "${topReason[0]}" (${topReason[1]} outlet). Fokus coaching pada aspek ini.`;
  } else if (stat.qualifiedOutlets > 0 && stat.participation >= 50) {
    diagnosis.mainIssue = 'on_track';
    diagnosis.severity = 'success';
    diagnosis.detail = `Salesman on-track. ${stat.qualifiedOutlets} outlet sudah memenuhi syarat.`;
  }

  return diagnosis;
}

// ═══════════════════════════════════════════════════════════════
// ⚡ COACHING PLAYBOOK — 3-5 aksi konkret (module scope)
// ═══════════════════════════════════════════════════════════════
function generateCoachingPlaybook(stat, diagnosis, program, progress) {
  const actions = [];

  if (diagnosis.mainIssue === 'no_visit') {
    actions.push({
      icon: '🚗',
      title: 'Review routing & visit plan',
      detail: `Cek apakah salesman benar-benar mengunjungi ${diagnosis.outletStats.noTx} outlet ini. Bisa jadi outlet sudah tutup, pindah, atau butuh reminder.`,
      priority: 'high',
    });
    actions.push({
      icon: '📞',
      title: 'Call 3 outlet sampel',
      detail: `Telepon ${Math.min(3, diagnosis.outletStats.noTx)} outlet random dari daftar belum. Tanya apakah salesman sudah datang & tawarkan program.`,
      priority: 'high',
    });
    actions.push({
      icon: '🎯',
      title: 'Set daily target kunjungan',
      detail: `Salesman harus handle ${Math.ceil(diagnosis.outletStats.noTx / Math.max(1, progress.daysRemaining))} outlet/hari selama ${progress.daysRemaining} hari sisa.`,
      priority: 'medium',
    });
  }

  else if (diagnosis.mainIssue === 'below_min') {
    actions.push({
      icon: '📈',
      title: 'Push upsell ke outlet hampir lolos',
      detail: `${diagnosis.outletStats.belowMin} outlet sudah order tapi belum capai min. Salesman tinggal minta tambahan sedikit. Highlight insentif program.`,
      priority: 'high',
    });
    actions.push({
      icon: '🎁',
      title: 'Review strategi bundling',
      detail: 'Jika outlet sulit naik min, tawarkan bundle kombinasi produk agar qty lebih cepat naik.',
      priority: 'medium',
    });
    actions.push({
      icon: '📱',
      title: 'Follow-up 1-on-1 via WA',
      detail: 'Kirim personal message ke outlet hampir lolos: "Tinggal X RCG lagi dapat [reward]. Mau saya proses?"',
      priority: 'high',
    });
  }

  else if (diagnosis.mainIssue === 'specific_rules') {
    const topReason = Array.from(diagnosis.failureReasons.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topReason) {
      actions.push({
        icon: '🔍',
        title: `Fokus: ${topReason[0].split(':')[0]}`,
        detail: `${topReason[1]} outlet gagal karena: ${topReason[0]}. Briefing salesman spesifik tentang aturan ini.`,
        priority: 'high',
      });
    }
    actions.push({
      icon: '📊',
      title: 'Buat cheat sheet aturan',
      detail: 'Buat 1 lembar ringkasan program untuk salesman (min qty, produk kunci, channel). Tempel di dashboard HP.',
      priority: 'medium',
    });
  }

  else if (diagnosis.mainIssue === 'on_track') {
    actions.push({
      icon: '🏆',
      title: 'Beri apresiasi',
      detail: `${stat.qualifiedOutlets} outlet sudah lolos. Sampaikan terima kasih personal, motivasi untuk pertahankan.`,
      priority: 'low',
    });
    actions.push({
      icon: '📚',
      title: 'Dokumentasikan best practice',
      detail: 'Tanya salesman: apa strategi suksesnya? Sharing ke salesman lain yang tertinggal.',
      priority: 'low',
    });
  }

  if (progress.daysRemaining > 0 && progress.daysRemaining <= 7) {
    actions.push({
      icon: '⏰',
      title: 'Program tinggal ' + progress.daysRemaining + ' hari',
      detail: 'Buat daily report progress untuk antisipasi akhir program.',
      priority: 'high',
    });
  }

  if (stat.discount > 0 && program.schemes.some(s => s.reward?.maxEnabled)) {
    actions.push({
      icon: '💰',
      title: 'Audit margin',
      detail: `Diskon salesman ini: ${compactRp(stat.discount)}. Cek apakah masih dalam batas wajar program.`,
      priority: 'medium',
    });
  }

  return actions;
}

// ═══════════════════════════════════════════════════════════════
// ⚡ WHATSAPP MESSAGE GENERATOR (module scope)
// ═══════════════════════════════════════════════════════════════
function generateWhatsAppMessage(stat, diagnosis, program, progress) {
  const p = stat.participation;
  const days = progress.daysRemaining;
  const emoji = p >= 90 ? '🏆' : p >= 50 ? '💪' : '⚠️';

  let msg = `Halo *${stat.name}* 👋\n\n`;
  msg += `📢 Update Program *${program.name}*\n`;
  msg += `📅 Sisa *${days} hari* lagi (hari ke-${progress.daysElapsed}/${progress.totalDays})\n\n`;

  msg += `${emoji} *Progress Anda:*\n`;
  msg += `✅ Outlet lolos: *${stat.qualifiedOutlets}* dari ${stat.targetOutlets} target\n`;
  msg += `📊 Partisipasi: *${p.toFixed(0)}%*\n`;

  if (stat.omset > 0) {
    msg += `💰 Omset program: *${compactRp(stat.omset)}*\n`;
  }

  msg += `\n`;

  if (diagnosis.topFailedOutlets.length > 0) {
    const topOutlets = diagnosis.topFailedOutlets.slice(0, 5);
    msg += `🎯 *Outlet yang perlu di-follow up:*\n`;
    topOutlets.forEach((o, i) => {
      msg += `${i + 1}. ${o.outlet} — ${o.reason}\n`;
    });
    if (diagnosis.topFailedOutlets.length > 5) {
      msg += `...dan ${diagnosis.topFailedOutlets.length - 5} outlet lainnya\n`;
    }
    msg += `\n`;
  }

  if (diagnosis.mainIssue === 'no_visit') {
    msg += `💡 *Saran:* Fokus kunjungi outlet di atas minggu ini. Program tinggal ${days} hari!\n`;
  } else if (diagnosis.mainIssue === 'below_min') {
    msg += `💡 *Saran:* Outlet di atas sudah order, tinggal tambah sedikit untuk capai minimum. Ajak upsell!\n`;
  } else if (p >= 90) {
    msg += `💡 *Luar biasa!* Teruskan momentum ini. Anda jadi role model tim! 🚀\n`;
  }

  msg += `\n_— Tim Program M245_`;
  return msg;
}

// ═══════════════════════════════════════════════════════════════
// ⚡ COACHING PLAYBOOK MODAL (module scope)
// ═══════════════════════════════════════════════════════════════
function openCoachingPlaybook(program, analysis, salesmanName) {
  const result = detectAlerts(program, analysis);
  const stat = result.stats.get(salesmanName);
  if (!stat) { toast('Salesman tidak ditemukan'); return; }

  const diagnosis = diagnoseSalesman(stat, program, analysis, result.progress);
  const playbook = generateCoachingPlaybook(stat, diagnosis, program, result.progress);
  const waMsg = generateWhatsAppMessage(stat, diagnosis, program, result.progress);

  const sevColor = diagnosis.severity === 'critical' ? '#DC2626' : diagnosis.severity === 'warning' ? '#F59E0B' : diagnosis.severity === 'success' ? '#10B981' : '#3B82F6';
  const sevBg = diagnosis.severity === 'critical' ? '#FEF2F2' : diagnosis.severity === 'warning' ? '#FFFBEB' : diagnosis.severity === 'success' ? '#F0FDF4' : '#EFF6FF';

  openModal(`
    <div class="modal-h"><h3 style="font-size:15px; margin:0;">🎯 Coaching: ${esc(salesmanName)}</h3><button class="x">×</button></div>
    <div class="modal-b" style="padding:16px; max-height:82vh; overflow-y:auto;">
      
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:12px;">
        <div style="padding:10px; background:#F0FDF4; border-radius:6px; text-align:center;">
          <div style="font-size:9px; color:#166534; font-weight:800; text-transform:uppercase;">Lolos</div>
          <div style="font-size:16px; font-weight:900; color:#10B981;">${stat.qualifiedOutlets}</div>
          <div style="font-size:9px; color:#64748B;">/ ${stat.targetOutlets}</div>
        </div>
        <div style="padding:10px; background:#EFF6FF; border-radius:6px; text-align:center;">
          <div style="font-size:9px; color:#1E40AF; font-weight:800; text-transform:uppercase;">Partisipasi</div>
          <div style="font-size:16px; font-weight:900; color:${stat.participation >= 90 ? '#10B981' : stat.participation >= 50 ? '#F59E0B' : '#DC2626'};">${stat.participation.toFixed(0)}%</div>
        </div>
        <div style="padding:10px; background:#F5F3FF; border-radius:6px; text-align:center;">
          <div style="font-size:9px; color:#5B21B6; font-weight:800; text-transform:uppercase;">Omset</div>
          <div style="font-size:11px; font-weight:900; color:#8B5CF6;">${compactRp(stat.omset)}</div>
        </div>
      </div>

      <div style="padding:12px; background:${sevBg}; border-left:4px solid ${sevColor}; border-radius:6px; margin-bottom:12px;">
        <div style="font-size:11px; font-weight:900; color:${sevColor}; text-transform:uppercase; margin-bottom:4px;">🔍 Diagnosis</div>
        <div style="font-size:12px; color:#334155; line-height:1.5;">${esc(diagnosis.detail || 'Tidak ada masalah signifikan.')}</div>
        ${diagnosis.outletStats.total > 0 ? `
          <div style="margin-top:8px; padding-top:8px; border-top:1px solid ${sevColor}40; display:flex; gap:8px; flex-wrap:wrap; font-size:10px; color:#475569;">
            <span>📍 ${diagnosis.outletStats.total} outlet target</span>
            ${diagnosis.outletStats.noTx > 0 ? `<span style="color:#DC2626;">❌ ${diagnosis.outletStats.noTx} belum transaksi</span>` : ''}
            ${diagnosis.outletStats.belowMin > 0 ? `<span style="color:#F59E0B;">⚠️ ${diagnosis.outletStats.belowMin} di bawah min</span>` : ''}
          </div>
        ` : ''}
      </div>

      <div style="margin-bottom:12px;">
        <div style="font-size:11px; font-weight:900; color:#0F172A; text-transform:uppercase; margin-bottom:6px;">📋 Coaching Playbook</div>
        ${playbook.map(a => `
          <div style="padding:10px; background:#fff; border:1px solid #E2E8F0; border-left:3px solid ${a.priority === 'high' ? '#DC2626' : a.priority === 'medium' ? '#F59E0B' : '#10B981'}; border-radius:6px; margin-bottom:6px;">
            <div style="display:flex; gap:8px; align-items:flex-start;">
              <span style="font-size:16px; flex-shrink:0;">${a.icon}</span>
              <div style="flex:1; min-width:0;">
                <div style="font-size:11px; font-weight:800; color:#0F172A;">${esc(a.title)}</div>
                <div style="font-size:10px; color:#64748B; line-height:1.5; margin-top:2px;">${esc(a.detail)}</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <div style="margin-bottom:12px;">
        <div style="font-size:11px; font-weight:900; color:#0F172A; text-transform:uppercase; margin-bottom:6px;">📱 WhatsApp Message (Preview)</div>
        <textarea id="wa-msg-text" style="width:100%; min-height:180px; padding:10px; border:1px solid #E2E8F0; border-radius:6px; font-family:monospace; font-size:10px; line-height:1.5; resize:vertical; background:#F8FAFC;">${esc(waMsg)}</textarea>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:6px;">
        <button data-wa-copy style="padding:10px; background:#25D366; color:#fff; border:none; border-radius:6px; font-weight:800; font-size:11px; cursor:pointer;">
          📋 Copy WA Text
        </button>
        <button data-wa-open style="padding:10px; background:#16A34A; color:#fff; border:none; border-radius:6px; font-weight:800; font-size:11px; cursor:pointer;">
          💬 Buka WhatsApp
        </button>
      </div>
      <button data-outlet-drill style="width:100%; padding:10px; background:#1D4ED8; color:#fff; border:none; border-radius:6px; font-weight:800; font-size:11px; cursor:pointer;">
        🏪 Lihat Detail Semua Outlet (${diagnosis.topFailedOutlets.length} gagal)
      </button>
    </div>
  `);

  setTimeout(() => {
    const txt = document.getElementById('wa-msg-text');
    const copyBtn = document.querySelector('[data-wa-copy]');
    const openBtn = document.querySelector('[data-wa-open]');
    const drillBtn = document.querySelector('[data-outlet-drill]');

    if (copyBtn) copyBtn.onclick = () => {
      navigator.clipboard.writeText(txt.value).then(() => {
        toast('Teks WA disalin!');
        copyBtn.textContent = '✅ Tersalin!';
        setTimeout(() => copyBtn.innerHTML = '📋 Copy WA Text', 2000);
      }).catch(() => {
        txt.select();
        document.execCommand('copy');
        toast('Teks WA disalin!');
      });
    };

    if (openBtn) openBtn.onclick = () => {
      const url = 'https://wa.me/?text=' + encodeURIComponent(txt.value);
      toast('Membuka WhatsApp...');
      window.location.href = url;
    };

    if (drillBtn) drillBtn.onclick = () => {
      openSalesmanOutletDrill(program, analysis, salesmanName, diagnosis);
    };
  }, 50);
}

// ═══════════════════════════════════════════════════════════════
// ⚡ OUTLET DRILL — daftar outlet yang gagal (module scope)
// ═══════════════════════════════════════════════════════════════
function openSalesmanOutletDrill(program, analysis, salesmanName, diagnosis) {
  openModal(`
    <div class="modal-h"><h3 style="font-size:15px; margin:0;">🏪 Outlet: ${esc(salesmanName)}</h3><button class="x">×</button></div>
    <div class="modal-b" style="padding:16px; max-height:82vh; overflow-y:auto;">
      <div style="padding:10px; background:#F8FAFC; border-radius:6px; margin-bottom:12px; font-size:11px;">
        <b>Program:</b> ${esc(program.name)}<br>
        <span style="color:#64748B;">Total ${diagnosis.topFailedOutlets.length} outlet gagal</span>
      </div>

      ${diagnosis.topFailedOutlets.map((o, i) => {
        const colorMap = {
          no_tx: { bg: '#FEF2F2', border: '#DC2626', label: 'Belum transaksi' },
          below_min: { bg: '#FFFBEB', border: '#F59E0B', label: 'Di bawah min' },
          missing_key: { bg: '#FEF2F2', border: '#DC2626', label: 'Produk kunci hilang' },
          below_strata: { bg: '#FFFBEB', border: '#F59E0B', label: 'Di bawah strata' },
          other: { bg: '#F8FAFC', border: '#94A3B8', label: 'Lainnya' },
        };
        const style = colorMap[o.category] || colorMap.other;
        return `
          <div style="padding:10px; background:${style.bg}; border-left:3px solid ${style.border}; border-radius:6px; margin-bottom:6px;">
            <div style="font-size:11px; font-weight:800; color:#0F172A;">${o.icon} ${i + 1}. ${esc(o.outlet)}</div>
            <div style="font-size:10px; color:${style.border}; font-weight:700; margin-top:2px;">${style.label}</div>
            <div style="font-size:9px; color:#64748B; margin-top:2px;">${esc(o.reason)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `);
}

// ═══════════════════════════════════════════════════════════════
// ⚡ BULK BROADCAST (module scope)
// ═══════════════════════════════════════════════════════════════
function openBulkBroadcast(program, analysis) {
  const result = detectAlerts(program, analysis);
  if (result.notStarted) { toast('Program belum dimulai'); return; }

  const belowTarget = result.alerts.filter(a => a.severity <= 1);
  if (belowTarget.length === 0) { toast('Semua salesman on-track!'); return; }

  const contacts = belowTarget.map(a => {
    const diag = diagnoseSalesman(a.stat, program, analysis, result.progress);
    const waMsg = generateWhatsAppMessage(a.stat, diag, program, result.progress);
    return { name: a.salesman, icon: a.icon, msg: waMsg, diagnosis: diag, stat: a.stat };
  });

  openModal(`
    <div class="modal-h"><h3 style="font-size:15px; margin:0;">📱 Broadcast ke ${contacts.length} Salesman</h3><button class="x">×</button></div>
    <div class="modal-b" style="padding:16px; max-height:82vh; overflow-y:auto;">
      <div style="padding:10px; background:#FFFBEB; border-left:3px solid #F59E0B; border-radius:6px; margin-bottom:12px; font-size:11px; color:#92400E;">
        ⚠️ WhatsApp tidak support bulk-message otomatis. Klik satu per satu untuk buka WA dengan pesan yang sudah terisi.
      </div>

      ${contacts.map((c, i) => `
        <div style="padding:12px; background:#fff; border:1px solid #E2E8F0; border-radius:6px; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
            <div style="flex:1;">
              <div style="font-size:12px; font-weight:800; color:#0F172A;">${c.icon} ${esc(c.name)}</div>
              <div style="font-size:9px; color:#64748B; margin-top:2px;">
                ${c.stat.participation.toFixed(0)}% · ${c.stat.qualifiedOutlets}/${c.stat.targetOutlets} outlet
              </div>
            </div>
            <button data-bulk-send="${i}" style="padding:8px 12px; background:#25D366; color:#fff; border:none; border-radius:6px; font-weight:800; font-size:10px; cursor:pointer; white-space:nowrap;">
              💬 Kirim
            </button>
          </div>
          <div style="padding:8px; background:#F8FAFC; border-radius:4px; font-size:9px; color:#64748B; font-family:monospace; max-height:60px; overflow:hidden;">
            ${esc(c.msg.substring(0, 150))}...
          </div>
        </div>
      `).join('')}
    </div>
  `);

  setTimeout(() => {
    document.querySelectorAll('[data-bulk-send]').forEach(btn => {
      btn.onclick = () => {
        const idx = +btn.dataset.bulkSend;
        const c = contacts[idx];
        const url = 'https://wa.me/?text=' + encodeURIComponent(c.msg);
        window.location.href = url;
        btn.innerHTML = '✅ Terkirim';
        btn.disabled = true;
        btn.style.opacity = '0.5';
      };
    });
  }, 50);
}

// ═══════════════════════════════════════════════════════════════
// RULE EDITOR UI
// ═══════════════════════════════════════════════════════════════
function renderRuleEditor(rule, idx, rows, state) {
  const meta = RULE_TYPES[rule.type];
  if (!meta) return '';
  let body = '';

  if (meta.kind === 'multiselect') {
    const values = getUniqueValues(rows, meta.source, state);
    const fromDMP = DMP_SCOPE_SOURCES.includes(meta.source) && state?.outletMaster?.size > 0;
    body = `
      <div style="max-height:100px;overflow-y:auto;border:1px solid #E2E8F0;border-radius:4px;padding:6px;background:#F8FAFC;margin-top:4px;">
        ${fromDMP ? '<div style="font-size:8px;color:#1D4ED8;font-weight:800;margin-bottom:4px;">📋 Dari DMP + LBP</div>' : ''}
        ${values.map(v => `
          <label style="display:flex;align-items:center;gap:6px;padding:3px;font-size:10px;cursor:pointer;">
            <input type="checkbox" data-rule-val="${idx}" value="${esc(v)}" ${(rule.values || []).includes(v) ? 'checked' : ''} style="accent-color:#1D4ED8;">
            <span>${esc(v)}</span>
          </label>
        `).join('')}
        ${values.length === 0 ? '<div style="font-size:9px;color:#DC2626;text-align:center;padding:6px;">⚠️ Tidak ada data</div>' : ''}
      </div>`;
  } else if (meta.kind === 'number') {
    body = `<div style="display:flex;gap:6px;margin-top:4px;"><input type="number" data-rule-num="${idx}" value="${rule.value || ''}" placeholder="0" style="flex:1;${S.smallInput}text-align:right;"><span style="padding:6px;font-size:10px;color:#64748B;font-weight:800;">${meta.unit}</span></div>`;
  } else if (meta.kind === 'productConfig') {
    body = renderProductConfigEditor(rule, idx, rows, state);
  }

  return `
    <div style="padding:10px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <div style="font-size:11px;font-weight:800;color:#0F172A;">${meta.icon} ${meta.label}</div>
        <button data-rule-remove="${idx}" style="background:#FEE2E2;color:#991B1B;border:none;border-radius:3px;padding:2px 6px;font-size:10px;font-weight:800;cursor:pointer;">✕ Hapus</button>
      </div>
      ${body}
    </div>`;
}

function renderProductConfigEditor(rule, idx, rows, state) {
  const products = getUniqueValues(rows, 'product', state);
  const configs = rule.productConfig || [];
  return `
    <div style="margin-top:4px;">
      ${configs.map((cfg, ci) => `
        <div style="padding:6px;background:#fff;border:1px solid #E2E8F0;border-radius:4px;margin-bottom:4px;">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">
            <span style="font-size:10px;font-weight:800;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(cfg.product)}</span>
            <label style="display:flex;align-items:center;gap:2px;font-size:8px;">
              <input type="checkbox" data-pc-key="${idx}:${ci}" ${cfg.isKey ? 'checked' : ''} style="accent-color:#F59E0B;width:10px;height:10px;">⭐
            </label>
            <button data-pc-remove="${idx}:${ci}" style="background:#FEE2E2;color:#991B1B;border:none;border-radius:3px;padding:1px 5px;font-size:9px;cursor:pointer;">✕</button>
          </div>
          <div style="display:flex;gap:3px;">
            <input type="number" data-pc-min="${idx}:${ci}" value="${cfg.minValue || ''}" placeholder="Min" style="flex:1;padding:3px;border:1px solid #E2E8F0;border-radius:3px;font-size:10px;text-align:right;">
            <select data-pc-unit="${idx}:${ci}" style="flex:1;padding:3px;border:1px solid #E2E8F0;border-radius:3px;font-size:10px;">
              <option value="rcg" ${cfg.unit === 'rcg' ? 'selected' : ''}>RCG</option>
              <option value="crtn" ${cfg.unit === 'crtn' ? 'selected' : ''}>CTN</option>
              <option value="pcs" ${cfg.unit === 'pcs' ? 'selected' : ''}>PCS</option>
            </select>
          </div>
        </div>
      `).join('')}
      <select data-pc-add-prod="${idx}" style="width:100%;padding:5px;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;margin-top:4px;">
        <option value="">+ Tambah produk...</option>
        ${products.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
      </select>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// SCHEME EDITOR UI
// ═══════════════════════════════════════════════════════════════
function renderSchemeEditor(scheme, sIdx, rows, state) {
  const rw = scheme.reward || migrateReward({});
  return `
    <div style="${S.card}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <input type="text" data-scheme-name="${sIdx}" value="${esc(scheme.name)}" placeholder="Nama Scheme" style="flex:1;padding:8px;border:1px solid #E2E8F0;border-radius:6px;font-size:12px;font-weight:800;">
        <button data-scheme-remove="${sIdx}" style="margin-left:8px;background:#FEE2E2;color:#991B1B;border:none;border-radius:6px;padding:6px 10px;font-size:11px;font-weight:800;cursor:pointer;">🗑️</button>
      </div>
      ${renderFormRow('📐 Basis Penilaian', renderEvalModeSelector(scheme, sIdx))}
      ${renderFormRow('📋 Aturan', renderRulesList(scheme, sIdx, rows, state))}
      ${renderFormRow('🎁 Reward', renderRewardEditor(scheme, sIdx, rw))}
      ${renderMaxCapEditor(scheme, sIdx, rw)}
    </div>`;
}

function renderEvalModeSelector(scheme, sIdx) {
  const isPerInvoice = (scheme.evaluationMode || 'per_invoice') === 'per_invoice';
  return `
    <div style="display:flex;gap:6px;">
      <label style="flex:1;padding:8px;border:1px solid ${isPerInvoice ? '#1D4ED8' : '#E2E8F0'};background:${isPerInvoice ? '#EFF6FF' : '#fff'};border-radius:6px;cursor:pointer;font-size:10px;font-weight:700;text-align:center;">
        <input type="radio" name="eval-${sIdx}" value="per_invoice" data-eval-mode="${sIdx}" ${isPerInvoice ? 'checked' : ''} style="display:none;">🧾 Per Faktur
      </label>
      <label style="flex:1;padding:8px;border:1px solid ${!isPerInvoice ? '#8B5CF6' : '#E2E8F0'};background:${!isPerInvoice ? '#F5F3FF' : '#fff'};border-radius:6px;cursor:pointer;font-size:10px;font-weight:700;text-align:center;">
        <input type="radio" name="eval-${sIdx}" value="aggregate" data-eval-mode="${sIdx}" ${!isPerInvoice ? 'checked' : ''} style="display:none;">📊 Akumulasi
      </label>
    </div>`;
}

function renderRulesList(scheme, sIdx, rows, state) {
  return `
    <div>
      ${(scheme.rules || []).map((rule, rIdx) => renderRuleEditor(rule, `${sIdx}:${rIdx}`, rows, state)).join('')}
      ${(scheme.rules || []).length === 0 ? '<div style="text-align:center;padding:8px;font-size:10px;color:#94A3B8;background:#fff;border-radius:4px;">Belum ada aturan</div>' : ''}
      <select data-add-rule="${sIdx}" style="width:100%;padding:6px;border:1px solid #E2E8F0;border-radius:4px;font-size:11px;margin-top:6px;">
        <option value="">+ Tambah Aturan...</option>
        ${Object.entries(RULE_TYPES).map(([k, m]) => `<option value="${k}">${m.icon} ${m.label}</option>`).join('')}
      </select>
    </div>`;
}

function renderRewardEditor(scheme, sIdx, rw) {
  const isDiscount = rw.type === 'discount';
  const isPoint = rw.type === 'point';
  return `
    <div>
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        <label style="flex:1;padding:8px;border:1px solid ${isDiscount ? '#1D4ED8' : '#E2E8F0'};background:${isDiscount ? '#EFF6FF' : '#fff'};border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;text-align:center;">
          <input type="radio" name="reward-${sIdx}" value="discount" data-reward-type="${sIdx}" ${isDiscount ? 'checked' : ''} style="display:none;">💰 Diskon
        </label>
        <label style="flex:1;padding:8px;border:1px solid ${isPoint ? '#8B5CF6' : '#E2E8F0'};background:${isPoint ? '#F5F3FF' : '#fff'};border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;text-align:center;">
          <input type="radio" name="reward-${sIdx}" value="point" data-reward-type="${sIdx}" ${isPoint ? 'checked' : ''} style="display:none;">⭐ Point
        </label>
      </div>
      ${isDiscount ? renderDiscountEditor(scheme, sIdx, rw) : ''}
      ${isPoint ? renderPointEditor(scheme, sIdx, rw) : ''}
    </div>`;
}

function renderDiscountEditor(scheme, sIdx, rw) {
  const isFixed = (rw.discountMode || 'fixed') === 'fixed';
  const isStrata = !isFixed;
  return `
    <div style="padding:8px;background:#fff;border-radius:4px;">
      <div class="tiny" style="color:#64748B;margin-bottom:6px;font-size:9px;">ℹ️ Diskon otomatis DSA. Pilih mode reward.</div>
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        <label style="flex:1;padding:8px;border:1px solid ${isFixed ? '#1D4ED8' : '#E2E8F0'};background:${isFixed ? '#EFF6FF' : '#fff'};border-radius:6px;cursor:pointer;font-size:10px;font-weight:700;text-align:center;">
          <input type="radio" name="discmode-${sIdx}" value="fixed" data-discount-mode="${sIdx}" ${isFixed ? 'checked' : ''} style="display:none;">💰 Tetap
        </label>
        <label style="flex:1;padding:8px;border:1px solid ${isStrata ? '#F59E0B' : '#E2E8F0'};background:${isStrata ? '#FFFBEB' : '#fff'};border-radius:6px;cursor:pointer;font-size:10px;font-weight:700;text-align:center;">
          <input type="radio" name="discmode-${sIdx}" value="strata" data-discount-mode="${sIdx}" ${isStrata ? 'checked' : ''} style="display:none;">📊 Strata
        </label>
      </div>
      ${isFixed ? renderFixedDiscount(sIdx, rw) : renderStrataDiscount(sIdx, rw)}
    </div>`;
}

function renderFixedDiscount(sIdx, rw) {
  return `
    <div style="display:flex;gap:4px;margin-top:6px;">
      <select data-disc-type="${sIdx}" style="flex:1;${S.smallInput}">
        <option value="percent" ${rw.discountType === 'percent' ? 'selected' : ''}>Persen (%)</option>
        <option value="amount" ${rw.discountType === 'amount' ? 'selected' : ''}>Rupiah</option>
      </select>
      <input type="number" data-disc-value="${sIdx}" value="${rw.discountValue || ''}" placeholder="0" style="flex:1;${S.smallInput}text-align:right;">
    </div>`;
}

function renderStrataDiscount(sIdx, rw) {
  const strataTiers = rw.strataTiers || [];
  return `
    <div style="margin-top:6px;">
      <div style="display:flex;gap:4px;margin-bottom:6px;align-items:center;">
        <span style="font-size:10px;color:#64748B;">Ukur berdasarkan</span>
        <select data-strata-unit="${sIdx}" style="flex:1;${S.smallInput}">
          <option value="crtn" ${rw.strataUnit === 'crtn' ? 'selected' : ''}>Karton (CTN)</option>
          <option value="rcg" ${rw.strataUnit === 'rcg' ? 'selected' : ''}>Renceng (RCG)</option>
          <option value="pcs" ${rw.strataUnit === 'pcs' ? 'selected' : ''}>Pcs</option>
        </select>
      </div>
      <div style="padding:6px;background:#FFFBEB;border-radius:4px;">
        ${strataTiers.map((t, ti) => {
          const isPercent = (t.type || 'percent') === 'percent';
          const val = isPercent ? (t.rate || '') : (t.amountValue || '');
          return `
            <div style="display:flex;gap:3px;margin-bottom:4px;align-items:center;flex-wrap:wrap;">
              <input type="number" data-tier-min="${sIdx}:${ti}" value="${t.min || ''}" placeholder="Min" style="width:50px;padding:4px;border:1px solid #E2E8F0;border-radius:3px;font-size:10px;text-align:right;">
              <span style="font-size:10px;color:#64748B;">-</span>
              <input type="number" data-tier-max="${sIdx}:${ti}" value="${t.max || ''}" placeholder="∞" style="width:50px;padding:4px;border:1px solid #E2E8F0;border-radius:3px;font-size:10px;text-align:right;">
              <span style="font-size:10px;color:#64748B;">=</span>
              <select data-tier-type="${sIdx}:${ti}" style="width:48px;padding:4px;border:1px solid #E2E8F0;border-radius:3px;font-size:10px;font-weight:800;">
                <option value="percent" ${isPercent ? 'selected' : ''}>%</option>
                <option value="amount" ${!isPercent ? 'selected' : ''}>Rp</option>
              </select>
              <input type="number" data-tier-value="${sIdx}:${ti}" value="${val}" placeholder="0" style="width:70px;padding:4px;border:1px solid #E2E8F0;border-radius:3px;font-size:10px;text-align:right;">
              <button data-tier-remove="${sIdx}:${ti}" style="background:#FEE2E2;color:#991B1B;border:none;border-radius:3px;padding:2px 5px;font-size:9px;cursor:pointer;">✕</button>
            </div>
          `;
        }).join('')}
        <button data-add-tier="${sIdx}" style="width:100%;padding:5px;background:#FDE68A;color:#92400E;border:1px solid #F59E0B;border-radius:4px;font-size:9px;font-weight:800;cursor:pointer;margin-top:4px;">+ Tambah Strata</button>
        <div class="tiny" style="color:#92400E;margin-top:4px;font-size:8px;">Contoh: 5-10 = 3%, 11-20 = Rp 1500, 21+ = Rp 2000</div>
      </div>
    </div>`;
}

function renderPointEditor(scheme, sIdx, rw) {
  const isByAmount = rw.pointBase === 'amount';
  return `
    <div style="padding:8px;background:#fff;border-radius:4px;">
      <select data-point-base="${sIdx}" style="width:100%;${S.smallInput}margin-bottom:6px;">
        <option value="amount" ${isByAmount ? 'selected' : ''}>Per Rupiah</option>
        <option value="unit" ${!isByAmount ? 'selected' : ''}>Per Unit</option>
      </select>
      <div style="display:${isByAmount ? 'flex' : 'none'};gap:4px;align-items:center;font-size:10px;margin-bottom:6px;">
        <span style="color:#64748B;">1 poin per Rp</span>
        <input type="number" data-point-rate="${sIdx}" value="${rw.pointRate || 10000}" style="flex:1;padding:5px;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;text-align:right;">
      </div>
      <div style="display:${!isByAmount ? 'flex' : 'none'};gap:4px;align-items:center;font-size:10px;margin-bottom:6px;">
        <span>1</span>
        <select data-point-unit="${sIdx}" style="flex:1;padding:5px;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;">
          <option value="rcg" ${rw.pointUnit === 'rcg' ? 'selected' : ''}>RCG</option>
          <option value="crtn" ${rw.pointUnit === 'crtn' ? 'selected' : ''}>CTN</option>
          <option value="pcs" ${rw.pointUnit === 'pcs' ? 'selected' : ''}>PCS</option>
        </select>
        <span>=</span>
        <input type="number" data-point-per-unit="${sIdx}" value="${rw.pointPerUnit || 1}" style="width:50px;padding:5px;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;text-align:right;">
        <span>poin</span>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #E2E8F0;">
        <div style="font-size:10px;font-weight:800;color:#5B21B6;margin-bottom:4px;">🎁 Hadiah</div>
        ${(rw.prizes || []).map((pz, pi) => `
          <div style="display:flex;gap:4px;margin-bottom:4px;">
            <input type="text" data-prize-name="${sIdx}:${pi}" value="${esc(pz.name || '')}" placeholder="Nama hadiah" style="flex:2;padding:5px;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;">
            <input type="number" data-prize-pts="${sIdx}:${pi}" value="${pz.points || ''}" placeholder="Poin" style="flex:1;padding:5px;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;text-align:right;">
            <button data-prize-remove="${sIdx}:${pi}" style="background:#FEE2E2;color:#991B1B;border:none;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer;">✕</button>
          </div>
        `).join('')}
        <button data-add-prize="${sIdx}" style="width:100%;padding:6px;background:#F5F3FF;color:#5B21B6;border:1px solid #DDD6FE;border-radius:4px;font-size:10px;font-weight:800;cursor:pointer;margin-top:4px;">+ Tambah Hadiah</button>
      </div>
    </div>`;
}

function renderMaxCapEditor(scheme, sIdx, rw) {
  const enabled = rw.maxEnabled;
  const isStrata = rw.discountMode === 'strata';
  return `
    <div style="padding:10px;background:${enabled ? '#FEF2F2' : '#F8FAFC'};border:1px solid ${enabled ? '#FECACA' : '#E2E8F0'};border-radius:6px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" data-max-enabled="${sIdx}" ${enabled ? 'checked' : ''} style="accent-color:#DC2626;width:16px;height:16px;">
        <span style="font-size:11px;font-weight:800;color:${enabled ? '#991B1B' : '#475569'};">🛑 Batas Maksimal Potongan</span>
      </label>
      <div class="tiny" style="color:#64748B;margin-top:4px;margin-left:24px;font-size:9px;">Nilai 0 / kosong = tanpa batasan</div>
      ${enabled ? (isStrata ? `
        <div style="margin-top:8px;margin-left:24px;display:flex;gap:6px;align-items:center;font-size:10px;">
          <span style="color:#475569;">Max</span>
          <input type="number" data-max-value="${sIdx}" value="${rw.maxValue || ''}" placeholder="0" min="0" style="width:60px;padding:5px;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;text-align:right;">
          <span style="color:#475569;">${getUnitLabel(rw.strataUnit || 'crtn')}</span>
        </div>
      ` : `
        <div style="margin-top:8px;margin-left:24px;display:flex;gap:6px;align-items:center;font-size:10px;">
          <select data-max-unit-type="${sIdx}" style="padding:5px;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;">
            <option value="invoice" ${rw.maxUnitType === 'invoice' ? 'selected' : ''}>Faktur</option>
            <option value="package" ${rw.maxUnitType === 'package' ? 'selected' : ''}>Paket</option>
          </select>
          <span style="color:#475569;">Max</span>
          <input type="number" data-max-value="${sIdx}" value="${rw.maxValue || ''}" placeholder="0" min="0" style="width:60px;padding:5px;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;text-align:right;">
          <span style="color:#475569;">${rw.maxUnitType === 'package' ? 'paket' : 'faktur'}</span>
        </div>
      `) : ''}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// PROGRAM EDITOR (Modal)
// ═══════════════════════════════════════════════════════════════
function openProgramEditor(existingProgram, state) {
  const p = existingProgram ? migrateProgram(existingProgram) : migrateProgram({});
  if (p.schemes.length === 0) p.schemes.push(migrateScheme({ name: 'Scheme 1' }));
  const rows = state.rows || [];
  const schemesState = JSON.parse(JSON.stringify(p.schemes));

  openModal(`
    <div class="modal-h"><h3 style="font-size:16px;margin:0;">${existingProgram ? '✏️ Edit Program' : '➕ Program Baru'}</h3><button class="x">×</button></div>
    <div class="modal-b" style="padding:16px;max-height:82vh;overflow-y:auto;">
      <div style="margin-bottom:12px;">
        <label style="${S.label}">Nama Program *</label>
        <input id="prog-name" type="text" value="${esc(p.name)}" placeholder="Cth: Promo Retail Migelas" style="width:100%;padding:10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;margin-top:4px;">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <div><label style="${S.label}">Mulai *</label><input id="prog-start" type="date" value="${p.startDate}" style="width:100%;padding:10px;border:1px solid #E2E8F0;border-radius:6px;font-size:12px;margin-top:4px;"></div>
        <div><label style="${S.label}">Selesai *</label><input id="prog-end" type="date" value="${p.endDate}" style="width:100%;padding:10px;border:1px solid #E2E8F0;border-radius:6px;font-size:12px;margin-top:4px;"></div>
      </div>
      <div style="margin-bottom:12px;">
        <label style="${S.label}">Catatan (opsional)</label>
        <textarea id="prog-notes" rows="2" style="width:100%;padding:10px;border:1px solid #E2E8F0;border-radius:6px;font-size:12px;margin-top:4px;resize:vertical;">${esc(p.schemeNotes || '')}</textarea>
      </div>
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:11px;font-weight:900;color:#0F172A;text-transform:uppercase;">🎯 Scheme Program</div>
          <button id="prog-add-scheme" style="padding:6px 12px;background:#1D4ED8;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;">+ Tambah Scheme</button>
        </div>
        <div id="schemes-container">${schemesState.map((s, idx) => renderSchemeEditor(s, idx, rows, state)).join('')}</div>
      </div>
      <button id="prog-save" style="width:100%;padding:14px;background:#1D4ED8;color:#fff;border:none;border-radius:8px;font-weight:800;font-size:14px;cursor:pointer;margin-top:8px;">💾 Simpan Program</button>
    </div>
  `);

  const rerender = () => {
    document.getElementById('schemes-container').innerHTML = schemesState.map((s, idx) => renderSchemeEditor(s, idx, rows, state)).join('');
    attachEditorHandlers(schemesState, rerender);
  };

  attachEditorHandlers(schemesState, rerender);

  document.getElementById('prog-add-scheme').onclick = () => {
    schemesState.push(migrateScheme({ name: `Scheme ${schemesState.length + 1}` }));
    rerender();
  };

  document.getElementById('prog-save').onclick = () => saveProgramHandler(p, schemesState);
}

function attachEditorHandlers(schemesState, rerender) {
  document.querySelectorAll('[data-scheme-remove]').forEach(el => {
    el.onclick = () => { schemesState.splice(+el.dataset.schemeRemove, 1); rerender(); };
  });
  document.querySelectorAll('[data-scheme-name]').forEach(el => {
    el.onchange = () => { schemesState[+el.dataset.schemeName].name = el.value; };
  });
  document.querySelectorAll('[data-eval-mode]').forEach(el => {
    el.onchange = () => { schemesState[+el.dataset.evalMode].evaluationMode = el.value; rerender(); };
  });
  document.querySelectorAll('[data-add-rule]').forEach(el => {
    el.onchange = () => {
      if (!el.value) return;
      const s = +el.dataset.addRule;
      schemesState[s].rules.push(migrateRule({ type: el.value }));
      el.value = '';
      rerender();
    };
  });
  document.querySelectorAll('[data-rule-remove]').forEach(el => {
    el.onclick = () => {
      const [s, r] = el.dataset.ruleRemove.split(':').map(Number);
      schemesState[s].rules.splice(r, 1);
      rerender();
    };
  });
  document.querySelectorAll('[data-rule-val]').forEach(el => {
    el.onchange = () => {
      const [s, r] = el.dataset.ruleVal.split(':').map(Number);
      const rule = schemesState[s].rules[r];
      if (!rule.values) rule.values = [];
      if (el.checked) { if (!rule.values.includes(el.value)) rule.values.push(el.value); }
      else rule.values = rule.values.filter(v => v !== el.value);
    };
  });
  document.querySelectorAll('[data-rule-num]').forEach(el => {
    el.onchange = () => {
      const [s, r] = el.dataset.ruleNum.split(':').map(Number);
      schemesState[s].rules[r].value = +el.value || 0;
    };
  });
  document.querySelectorAll('[data-pc-add-prod]').forEach(el => {
    el.onchange = () => {
      if (!el.value) return;
      const [s, r] = el.dataset.pcAddProd.split(':').map(Number);
      const rule = schemesState[s].rules[r];
      if (!rule.productConfig) rule.productConfig = [];
      if (rule.productConfig.some(c => c.product === el.value)) { toast('Sudah ada'); el.value = ''; return; }
      rule.productConfig.push({ product: el.value, enabled: true, isKey: false, minValue: 0, unit: 'rcg' });
      el.value = '';
      rerender();
    };
  });
  document.querySelectorAll('[data-pc-remove]').forEach(el => {
    el.onclick = () => {
      const [s, r, c] = el.dataset.pcRemove.split(':').map(Number);
      schemesState[s].rules[r].productConfig.splice(c, 1);
      rerender();
    };
  });
  document.querySelectorAll('[data-pc-key]').forEach(el => {
    el.onchange = () => {
      const [s, r, c] = el.dataset.pcKey.split(':').map(Number);
      schemesState[s].rules[r].productConfig[c].isKey = el.checked;
    };
  });
  document.querySelectorAll('[data-pc-min]').forEach(el => {
    el.onchange = () => {
      const [s, r, c] = el.dataset.pcMin.split(':').map(Number);
      schemesState[s].rules[r].productConfig[c].minValue = +el.value || 0;
    };
  });
  document.querySelectorAll('[data-pc-unit]').forEach(el => {
    el.onchange = () => {
      const [s, r, c] = el.dataset.pcUnit.split(':').map(Number);
      schemesState[s].rules[r].productConfig[c].unit = el.value;
    };
  });
  document.querySelectorAll('[data-reward-type]').forEach(el => {
    el.onchange = () => { schemesState[+el.dataset.rewardType].reward.type = el.value; rerender(); };
  });
  document.querySelectorAll('[data-discount-mode]').forEach(el => {
    el.onchange = () => { schemesState[+el.dataset.discountMode].reward.discountMode = el.value; rerender(); };
  });
  document.querySelectorAll('[data-disc-type]').forEach(el => {
    el.onchange = () => { schemesState[+el.dataset.discType].reward.discountType = el.value; };
  });
  document.querySelectorAll('[data-disc-value]').forEach(el => {
    el.onchange = () => { schemesState[+el.dataset.discValue].reward.discountValue = +el.value || 0; };
  });
  document.querySelectorAll('[data-strata-unit]').forEach(el => {
    el.onchange = () => { schemesState[+el.dataset.strataUnit].reward.strataUnit = el.value; rerender(); };
  });
  document.querySelectorAll('[data-add-tier]').forEach(el => {
    el.onclick = () => {
      const s = +el.dataset.addTier;
      if (!schemesState[s].reward.strataTiers) schemesState[s].reward.strataTiers = [];
      schemesState[s].reward.strataTiers.push({ min: 0, max: null, type: 'percent', rate: 0, amountValue: 0 });
      rerender();
    };
  });
  document.querySelectorAll('[data-tier-remove]').forEach(el => {
    el.onclick = () => {
      const [s, t] = el.dataset.tierRemove.split(':').map(Number);
      schemesState[s].reward.strataTiers.splice(t, 1);
      rerender();
    };
  });
  document.querySelectorAll('[data-tier-min]').forEach(el => {
    el.onchange = () => {
      const [s, t] = el.dataset.tierMin.split(':').map(Number);
      schemesState[s].reward.strataTiers[t].min = +el.value || 0;
    };
  });
  document.querySelectorAll('[data-tier-max]').forEach(el => {
    el.onchange = () => {
      const [s, t] = el.dataset.tierMax.split(':').map(Number);
      schemesState[s].reward.strataTiers[t].max = el.value ? +el.value : null;
    };
  });
  document.querySelectorAll('[data-tier-type]').forEach(el => {
    el.onchange = () => {
      const [s, t] = el.dataset.tierType.split(':').map(Number);
      schemesState[s].reward.strataTiers[t].type = el.value;
      rerender();
    };
  });
  document.querySelectorAll('[data-tier-value]').forEach(el => {
    el.onchange = () => {
      const [s, t] = el.dataset.tierValue.split(':').map(Number);
      const tier = schemesState[s].reward.strataTiers[t];
      if (tier.type === 'amount') tier.amountValue = +el.value || 0;
      else tier.rate = +el.value || 0;
    };
  });
  document.querySelectorAll('[data-point-base]').forEach(el => {
    el.onchange = () => { schemesState[+el.dataset.pointBase].reward.pointBase = el.value; rerender(); };
  });
  document.querySelectorAll('[data-point-rate]').forEach(el => {
    el.onchange = () => { schemesState[+el.dataset.pointRate].reward.pointRate = +el.value || 10000; };
  });
  document.querySelectorAll('[data-point-unit]').forEach(el => {
    el.onchange = () => { schemesState[+el.dataset.pointUnit].reward.pointUnit = el.value; };
  });
  document.querySelectorAll('[data-point-per-unit]').forEach(el => {
    el.onchange = () => { schemesState[+el.dataset.pointPerUnit].reward.pointPerUnit = +el.value || 1; };
  });
  document.querySelectorAll('[data-add-prize]').forEach(el => {
    el.onclick = () => {
      const s = +el.dataset.addPrize;
      if (!schemesState[s].reward.prizes) schemesState[s].reward.prizes = [];
      schemesState[s].reward.prizes.push({ name: '', points: 0 });
      rerender();
    };
  });
  document.querySelectorAll('[data-prize-remove]').forEach(el => {
    el.onclick = () => {
      const [s, p] = el.dataset.prizeRemove.split(':').map(Number);
      schemesState[s].reward.prizes.splice(p, 1);
      rerender();
    };
  });
  document.querySelectorAll('[data-prize-name]').forEach(el => {
    el.onchange = () => {
      const [s, p] = el.dataset.prizeName.split(':').map(Number);
      schemesState[s].reward.prizes[p].name = el.value;
    };
  });
  document.querySelectorAll('[data-prize-pts]').forEach(el => {
    el.onchange = () => {
      const [s, p] = el.dataset.prizePts.split(':').map(Number);
      schemesState[s].reward.prizes[p].points = +el.value || 0;
    };
  });
  document.querySelectorAll('[data-max-enabled]').forEach(el => {
    el.onchange = () => { schemesState[+el.dataset.maxEnabled].reward.maxEnabled = el.checked; rerender(); };
  });
  document.querySelectorAll('[data-max-unit-type]').forEach(el => {
    el.onchange = () => { schemesState[+el.dataset.maxUnitType].reward.maxUnitType = el.value; rerender(); };
  });
  document.querySelectorAll('[data-max-value]').forEach(el => {
    el.onchange = () => { schemesState[+el.dataset.maxValue].reward.maxValue = +el.value || 0; };
  });
}

function saveProgramHandler(p, schemesState) {
  try {
    const name = document.getElementById('prog-name').value.trim();
    if (!name) { toast('Nama wajib'); return; }
    const startDate = document.getElementById('prog-start').value;
    const endDate = document.getElementById('prog-end').value;
    if (!startDate || !endDate) { toast('Tanggal wajib'); return; }
    if (startDate > endDate) { toast('Tanggal selesai harus setelah mulai'); return; }
    const newProgram = {
      id: p.id, name, startDate, endDate,
      schemeNotes: document.getElementById('prog-notes').value.trim(),
      schemes: schemesState,
      createdAt: p.createdAt,
    };
    const programs = loadPrograms();
    const idx = programs.findIndex(x => x.id === p.id);
    if (idx >= 0) programs[idx] = newProgram;
    else programs.push(newProgram);
    savePrograms(programs);
    document.getElementById('modalScrim').classList.remove('on');
    document.getElementById('modal').innerHTML = '';
    toast('Program tersimpan!');
    store.emit();
  } catch (err) {
    console.error('[save]', err);
    toast('Error: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// PROGRAM DETAIL
// ═══════════════════════════════════════════════════════════════
function openProgramDetail(program, state) {
  try {
    const analysis = analyzeProgram(program, selectFiltered(state), state);
    const status = getProgramStatus(program);

    openModal(`
      <div class="modal-h"><h3 style="font-size:15px;margin:0;">${esc(program.name)}</h3><button class="x">×</button></div>
      <div class="modal-b" style="padding:16px;max-height:82vh;overflow-y:auto;">
        <div style="padding:12px;background:${status.bg};border-radius:8px;margin-bottom:12px;text-align:center;">
          <div style="font-size:13px;font-weight:900;color:${status.color};">${status.label}</div>
          <div style="font-size:10px;color:#64748B;margin-top:4px;">${fmtDateID(program.startDate)} — ${fmtDateID(program.endDate)}</div>
        </div>
        ${renderAlertDashboard(program, analysis)}
        ${program.schemeNotes ? `<div style="padding:10px;background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:6px;margin-bottom:12px;font-size:11px;color:#78350F;">${esc(program.schemeNotes)}</div>` : ''}
        ${analysis.schemes.map((sr, idx) => renderSchemeDetail(sr, idx)).join('')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px;">
                    <button id="prog-detail-edit" style="padding:10px;background:#F59E0B;color:#fff;border:none;border-radius:6px;font-weight:800;font-size:11px;cursor:pointer;">✏️ Edit</button>
          <button id="prog-detail-delete" style="padding:10px;background:#DC2626;color:#fff;border:none;border-radius:6px;font-weight:800;font-size:11px;cursor:pointer;">🗑️ Hapus</button>
        </div>
      </div>
    `);

    setTimeout(() => attachDetailHandlers(program, analysis), 50);
  } catch (err) {
    console.error('[detail]', err);
    toast('Error: ' + err.message);
  }
}

function renderSchemeDetail(sr, srIdx) {
  const sch = sr.scheme;
  const rw = sch.reward || {};
  const isPerInvoice = sch.evaluationMode === 'per_invoice';
  const isStrata = rw.discountMode === 'strata';
  const noTxCount = sr.notQualified.filter(o => o.rows.length === 0).length;

  let rewardLabel = '';
  if (rw.type === 'discount') {
    rewardLabel = isStrata
      ? `📊 Strata ${(rw.strataTiers || []).length} tier (${getUnitLabel(rw.strataUnit || 'crtn')})`
      : (rw.discountType === 'percent' ? `💰 Diskon ${rw.discountValue}%` : `💰 Diskon ${compactRp(rw.discountValue)}`);
  } else if (rw.type === 'point') rewardLabel = '⭐ Point program';

  return `
    <div style="margin-bottom:20px;padding:12px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;">
      <div style="margin-bottom:8px;">
        <div style="font-size:13px;font-weight:900;color:#9A3412;">🎯 ${esc(sch.name)}</div>
        <div style="font-size:10px;color:#9A3412;margin-top:2px;">${rewardLabel} · ${sch.rules.length} aturan · ${isPerInvoice ? '🧾 Per Faktur' : '📊 Akumulasi'}</div>
      </div>
      ${renderRulesSummary(sch)}
      ${isStrata ? renderStrataSummary(rw) : ''}
      ${sr.usingDmp ? `<div style="background:#EFF6FF;padding:6px 8px;border-radius:6px;margin-bottom:8px;font-size:10px;color:#1E40AF;font-weight:700;">🎯 Basis DMP: ${sr.totalOutlets} outlet sesuai scope</div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
        <div style="padding:8px;background:#F0FDF4;border-radius:6px;text-align:center;">
          <div style="font-size:9px;color:#166534;font-weight:800;text-transform:uppercase;">Lolos</div>
          <div style="font-size:16px;font-weight:900;color:#10B981;">${sr.totalQualified}</div>
          <div style="font-size:9px;color:#64748B;">/ ${sr.totalOutlets} target</div>
        </div>
        <div style="padding:8px;background:#EFF6FF;border-radius:6px;text-align:center;">
          <div style="font-size:9px;color:#1E40AF;font-weight:800;text-transform:uppercase;">Omset</div>
          <div style="font-size:11px;font-weight:900;color:#1D4ED8;">${compactRp(sr.totalOmset)}</div>
        </div>
      </div>
      ${rw.type === 'discount' ? renderDiscountSummary(sr, rw) : ''}
      ${rw.type === 'point' ? renderPointSummary(sr) : ''}
      ${renderOutletList('qualified', sr, srIdx, isPerInvoice)}
      ${renderOutletList('notQualified', sr, srIdx, isPerInvoice, noTxCount)}
    </div>`;
}

function renderRulesSummary(sch) {
  if (sch.rules.length === 0) return '<div style="background:#fff;padding:8px;border-radius:6px;margin-bottom:8px;font-size:10px;color:#94A3B8;">Tidak ada aturan</div>';
  return `
    <div style="background:#fff;padding:8px;border-radius:6px;margin-bottom:8px;">
      <div style="font-size:9px;font-weight:800;color:#64748B;text-transform:uppercase;margin-bottom:4px;">Aturan:</div>
      ${sch.rules.map(rule => {
        const meta = RULE_TYPES[rule.type];
        if (!meta) return '';
        let detail = '';
        if (meta.kind === 'multiselect') detail = (rule.values || []).slice(0, 3).join(', ') + ((rule.values || []).length > 3 ? '...' : '');
        if (meta.kind === 'number') detail = `${meta.unit} ${NF1.format(rule.value || 0)}`;
        if (meta.kind === 'productConfig') detail = `${(rule.productConfig || []).length} produk`;
        return `<div style="font-size:10px;color:#334155;padding:3px 0;border-bottom:1px solid #F1F5F9;"><b>${meta.icon} ${meta.label}:</b> ${esc(detail)}</div>`;
      }).join('')}
    </div>`;
}

function renderStrataSummary(rw) {
  return `
    <div style="background:#FFFBEB;padding:8px;border-radius:6px;margin-bottom:8px;">
      <div style="font-size:9px;font-weight:800;color:#92400E;text-transform:uppercase;margin-bottom:4px;">📊 Strata Tier (${getUnitLabel(rw.strataUnit || 'crtn')}):</div>
      ${(rw.strataTiers || []).sort((a, b) => a.min - b.min).map(t => {
        const isPercent = (t.type || 'percent') === 'percent';
        const label = isPercent ? `${t.rate}%` : compactRp(t.amountValue || 0);
        const typeIcon = isPercent ? '📈' : '💵';
        return `
          <div style="display:flex;justify-content:space-between;font-size:10px;padding:3px 0;border-bottom:1px solid #FDE68A;">
            <span style="color:#78350F;">${t.min} - ${t.max || '∞'}</span>
            <span style="font-weight:800;color:#92400E;">${typeIcon} ${label}</span>
          </div>
        `;
      }).join('')}
    </div>`;
}

function renderDiscountSummary(sr, rw) {
  const overDiscount = sr.overDiscount > 0;
  return `
    <div style="display:grid;grid-template-columns:1fr ${rw.maxEnabled || rw.discountMode === 'strata' ? '1fr' : ''};gap:6px;margin-bottom:8px;">
      <div style="padding:8px;background:#FEF2F2;border-radius:6px;text-align:center;">
        <div style="font-size:9px;color:#991B1B;font-weight:800;text-transform:uppercase;">Diskon Aktual</div>
        <div style="font-size:11px;font-weight:900;color:#DC2626;">${compactRp(sr.totalDiscount)}</div>
      </div>
      ${rw.maxEnabled || rw.discountMode === 'strata' ? `
        <div style="padding:8px;background:#F0F9FF;border-radius:6px;text-align:center;">
          <div style="font-size:9px;color:#0369A1;font-weight:800;text-transform:uppercase;">Seharusnya</div>
          <div style="font-size:11px;font-weight:900;color:#0284C7;">${compactRp(sr.expectedDiscount)}</div>
        </div>
      ` : ''}
    </div>
    ${overDiscount ? `<div style="padding:8px;background:#FEF2F2;border-left:3px solid #DC2626;border-radius:4px;margin-bottom:8px;font-size:10px;"><b>⚠️ Over-discont: ${compactRp(sr.overDiscount)}</b></div>` : ''}`;
}

function renderPointSummary(sr) {
  return `
    <div style="padding:8px;background:#F5F3FF;border-radius:6px;text-align:center;margin-bottom:8px;">
      <div style="font-size:9px;color:#5B21B6;font-weight:800;text-transform:uppercase;">Total Point</div>
      <div style="font-size:14px;font-weight:900;color:#8B5CF6;">${NF1.format(sr.expectedPoints || sr.totalPoints)}</div>
    </div>`;
}

function renderOutletList(type, sr, srIdx, isPerInvoice, noTxCount = 0) {
  const isQualified = type === 'qualified';
  const outlets = isQualified ? sr.qualified : sr.notQualified;
  const bg = isQualified ? '#F0FDF4' : '#FEF2F2';
  const border = isQualified ? '#BBF7D0' : '#FECACA';
  const textColor = isQualified ? '#166534' : '#991B1B';
  const toggleKey = isQualified ? srIdx : `notq-${srIdx}`;
  const dataAttr = isQualified ? 'data-outlet-detail' : 'data-notq-detail';

  const header = isQualified
    ? `✅ Sudah Dapat (${outlets.length})`
    : `❌ Belum Dapat (${outlets.length})${noTxCount > 0 ? ` · ${noTxCount} tanpa transaksi` : ''}`;

  return `
    <div style="${!isQualified ? 'margin-top:0;' : 'margin-bottom:6px;'}">
      <button data-scheme-toggle="${toggleKey}" style="width:100%;padding:8px;background:${bg};border:1px solid ${border};border-radius:6px;cursor:pointer;text-align:left;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:11px;font-weight:800;color:${textColor};">${header}</span>
        <span style="font-size:10px;">▼</span>
      </button>
      <div data-scheme-content="${toggleKey}" style="display:none;max-height:200px;overflow-y:auto;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 6px 6px;">
        ${outlets.length === 0
          ? `<div style="text-align:center;padding:12px;font-size:10px;color:${isQualified ? '#94A3B8' : '#10B981'};">${isQualified ? 'Belum ada' : '🎉 Semua lolos!'}</div>`
          : outlets.slice(0, 50).map((o, i) => renderOutletRow(o, i, srIdx, isQualified, isPerInvoice, dataAttr)).join('')
        }
      </div>
    </div>`;
}

function renderOutletRow(o, i, srIdx, isQualified, isPerInvoice, dataAttr) {
  if (!isQualified) {
    const noTx = o.rows.length === 0;
    return `
      <div style="padding:8px;border-bottom:1px solid #F1F5F9;font-size:11px;cursor:pointer;" ${dataAttr}="${srIdx}:${i}">
        <div style="font-weight:800;color:#0F172A;">${i + 1}. ${esc(o.outlet)} ${noTx ? '<span style="font-size:8px;color:#94A3B8;font-weight:600;">(no tx)</span>' : ''}</div>
        <div style="font-size:9px;color:#64748B;margin-top:2px;">${esc(o.salesman)} · ${compactRp(o.omset)}</div>
        ${o.evaluation.failures.length > 0 ? `<div style="font-size:9px;color:#DC2626;font-weight:700;margin-top:2px;">❌ ${o.evaluation.failures.slice(0, 2).join(' • ')}</div>` : ''}
      </div>`;
  }
  const reward = o.reward || {};
  return `
    <div style="padding:8px;border-bottom:1px solid #F1F5F9;cursor:pointer;font-size:11px;" ${dataAttr}="${srIdx}:${i}">
      <div style="display:flex;justify-content:space-between;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;color:#0F172A;">${i + 1}. ${esc(o.outlet)}</div>
          <div style="font-size:9px;color:#64748B;">${esc(o.salesman)} · ${o.invoiceCount || o.txCount} ${isPerInvoice ? 'faktur' : 'baris'}</div>
          ${reward.isStrata ? `<div style="font-size:9px;color:#92400E;font-weight:700;margin-top:2px;">📊 ${NF1.format(reward.totalQty)} ${getUnitLabel(reward.strataUnit)} → ${reward.tierType === 'amount' ? compactRp(reward.amountValue) : reward.rate + '%'}</div>` : ''}
          ${reward.type === 'discount' ? `<div style="font-size:9px;margin-top:2px;"><span style="color:#DC2626;font-weight:700;">LBP: ${compactRp(reward.totalDiscount)}</span>${reward.capped || reward.isStrata ? `<span style="color:#0284C7;font-weight:700;margin-left:6px;">Exp: ${compactRp(reward.expectedDiscount)}</span>` : ''}</div>` : ''}
          ${reward.type === 'point' ? `<div style="font-size:9px;color:#8B5CF6;font-weight:700;">${NF1.format(reward.expectedPoints || reward.totalPoints)} poin</div>` : ''}
        </div>
        <div style="font-weight:800;color:#10B981;flex-shrink:0;">${compactRp(o.omset)}</div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// ⚡ DETAIL HANDLERS — FIXED with coaching & broadcast handlers
// ═══════════════════════════════════════════════════════════════
function attachDetailHandlers(program, analysis) {
  document.querySelectorAll('[data-scheme-toggle]').forEach(el => {
    el.onclick = () => {
      const content = document.querySelector(`[data-scheme-content="${el.dataset.schemeToggle}"]`);
      if (content) content.style.display = content.style.display === 'none' ? 'block' : 'none';
    };
  });

  document.querySelectorAll('[data-view-scorecard]').forEach(btn => {
    btn.onclick = () => showSalesmanScorecard(program, analysis);
  });

  // ⚡ NEW: Coaching handler
  document.querySelectorAll('[data-coaching]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      openCoachingPlaybook(program, analysis, el.dataset.coaching);
    };
  });

  // ⚡ NEW: Bulk broadcast handler
  document.querySelectorAll('[data-bulk-broadcast]').forEach(btn => {
    btn.onclick = () => openBulkBroadcast(program, analysis);
  });

  document.querySelectorAll('[data-outlet-detail]').forEach(el => {
    el.onclick = () => {
      const [s, o] = el.dataset.outletDetail.split(':').map(Number);
      const outlet = analysis.schemes[s].qualified[o];
      if (outlet) showOutletDetail(outlet, analysis.schemes[s].scheme, 'qualified');
    };
  });

  document.querySelectorAll('[data-notq-detail]').forEach(el => {
    el.onclick = () => {
      const [s, o] = el.dataset.notqDetail.split(':').map(Number);
      const outlet = analysis.schemes[s].notQualified[o];
      if (outlet) showOutletDetail(outlet, analysis.schemes[s].scheme, 'notQualified');
    };
  });

  const editBtn = document.getElementById('prog-detail-edit');
  if (editBtn) editBtn.onclick = () => {
    document.getElementById('modalScrim').classList.remove('on');
    document.getElementById('modal').innerHTML = '';
    openProgramEditor(program, store.state);
  };

  const deleteBtn = document.getElementById('prog-detail-delete');
  if (deleteBtn) deleteBtn.onclick = () => {
    if (!confirm('Hapus program "' + program.name + '"?')) return;
    savePrograms(loadPrograms().filter(p => p.id !== program.id));
    document.getElementById('modalScrim').classList.remove('on');
    document.getElementById('modal').innerHTML = '';
    toast('Program dihapus');
    store.emit();
  };
}

// ═══════════════════════════════════════════════════════════════
// OUTLET DETAIL
// ═══════════════════════════════════════════════════════════════
function showOutletDetail(outlet, scheme, category) {
  try {
    const evaluation = outlet.evaluation || {};
    const isQualified = category === 'qualified';
    const allRows = outlet.rows || [];
    const scopedRows = getScopedRows(scheme, allRows);
    const displayRows = isQualified
      ? (evaluation.matchingRows && evaluation.matchingRows.length > 0 ? evaluation.matchingRows : scopedRows)
      : scopedRows;
    const hiddenCount = allRows.length - scopedRows.length;
    const isPerInvoice = scheme.evaluationMode === 'per_invoice';
    const reward = outlet.reward || {};
    const noTransaction = allRows.length === 0;
    const noScopedProduct = allRows.length > 0 && scopedRows.length === 0;

    openModal(`
      <div class="modal-h"><h3 style="font-size:14px;margin:0;">🏪 ${esc(outlet.outlet)}</h3><button class="x">×</button></div>
      <div class="modal-b" style="padding:16px;max-height:75vh;overflow-y:auto;">
        <div style="padding:10px;background:#F8FAFC;border-radius:6px;margin-bottom:12px;font-size:11px;">
          <div><b>Salesman:</b> ${esc(outlet.salesman)}</div>
          <div><b>Channel:</b> ${esc(outlet.channel || '-')}</div>
          <div><b>Kabupaten:</b> ${esc(outlet.kabupaten || '-')}</div>
          <div><b>Total Faktur:</b> ${evaluation.totalInvoices || new Set(allRows.map(r => r.invoice)).size}</div>
          <div><b>Basis:</b> ${isPerInvoice ? '🧾 Per Faktur' : '📊 Akumulasi'}</div>
          ${outlet.fromDMP ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #E2E8F0;color:#1E40AF;font-weight:700;">🎯 Dari Master DMP</div>` : ''}
          ${hiddenCount > 0 ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #E2E8F0;color:#F59E0B;font-weight:700;">⚡ ${hiddenCount} baris non-target disembunyikan</div>` : ''}
        </div>
        ${renderRewardBox(reward, isQualified)}
        ${isPerInvoice ? renderInvoiceBreakdown(evaluation) : ''}
        ${noTransaction
          ? `<div style="padding:16px;background:#FEF2F2;border-radius:6px;text-align:center;font-size:11px;color:#991B1B;font-weight:700;">⚠️ Tidak ada transaksi di periode ini</div>`
          : noScopedProduct
            ? `<div style="padding:16px;background:#FFFBEB;border-radius:6px;text-align:center;font-size:11px;color:#92400E;font-weight:700;">⚠️ Outlet memiliki ${allRows.length} transaksi, tapi <b>tidak ada produk target</b>.</div>`
            : renderTransactionList(displayRows, isQualified)
        }
      </div>
    `);
  } catch (err) {
    console.error('[outlet detail]', err);
    toast('Error: ' + err.message);
  }
}

function renderRewardBox(reward, isQualified) {
  if (!isQualified || reward.type === 'none') return '';
  if (reward.isStrata) {
    const tierLabel = reward.tierType === 'amount'
      ? `💵 ${compactRp(reward.amountValue)} / ${getUnitLabel(reward.strataUnit)}`
      : `📈 ${reward.rate}%`;
    return `
      <div style="padding:12px;background:#FFFBEB;border-radius:6px;margin-bottom:12px;">
        <div style="font-size:10px;color:#92400E;font-weight:800;text-transform:uppercase;">📊 Strata Terdeteksi</div>
        <div style="font-size:16px;font-weight:900;color:#92400E;margin-top:4px;">${NF1.format(reward.totalQty)} ${getUnitLabel(reward.strataUnit)} → ${tierLabel}</div>
        ${reward.applicableTier ? `<div style="font-size:10px;color:#78350F;margin-top:2px;">Tier ${reward.applicableTier.min}-${reward.applicableTier.max || '∞'} = ${tierLabel}</div>` : ''}
        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #FDE68A;">
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;"><span style="color:#78350F;">Diskon Aktual LBP:</span><span style="font-weight:800;color:#DC2626;">${compactRp(reward.totalDiscount || 0)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:11px;"><span style="color:#78350F;">Diskon Seharusnya:</span><span style="font-weight:800;color:#0284C7;">${compactRp(reward.expectedDiscount || 0)}</span></div>
        </div>
      </div>`;
  }
  if (reward.type === 'discount') {
    return `
      <div style="padding:12px;background:#FEF2F2;border-radius:6px;margin-bottom:12px;">
        <div style="font-size:10px;color:#991B1B;font-weight:800;text-transform:uppercase;">Total Diskon Aktual LBP</div>
        <div style="font-size:20px;font-weight:900;color:#DC2626;margin-top:4px;">${compactRp(reward.totalDiscount || 0)}</div>
        ${reward.capped ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #FECACA;"><div style="font-size:10px;color:#0284C7;font-weight:800;">Diskon Seharusnya (Capped)</div><div style="font-size:16px;font-weight:900;color:#0284C7;">${compactRp(reward.expectedDiscount)}</div></div>` : ''}
      </div>`;
  }
  if (reward.type === 'point') {
    return `
      <div style="padding:12px;background:#F5F3FF;border-radius:6px;margin-bottom:12px;">
        <div style="font-size:10px;color:#5B21B6;font-weight:800;text-transform:uppercase;">Point Diperoleh</div>
        <div style="font-size:20px;font-weight:900;color:#8B5CF6;margin-top:4px;">${NF1.format(reward.expectedPoints || reward.totalPoints)} poin</div>
        ${reward.eligiblePrizes?.length > 0 ? `<div style="margin-top:8px;padding:8px;background:#fff;border-radius:4px;"><div style="font-size:9px;color:#5B21B6;font-weight:800;margin-bottom:4px;">🎁 HADIAH:</div>${reward.eligiblePrizes.map(p => `<div style="font-size:11px;color:#0F172A;font-weight:700;">• ${esc(p.name)} (${p.points} poin)</div>`).join('')}</div>` : ''}
      </div>`;
  }
  return '';
}

function renderInvoiceBreakdown(evaluation) {
  if (!evaluation.invoiceResults || evaluation.invoiceResults.length === 0) return '';
  return `
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;font-weight:900;color:#0F172A;text-transform:uppercase;margin-bottom:6px;">📋 Status per Faktur (${evaluation.passingCount || 0}/${evaluation.totalInvoices})</div>
      ${evaluation.invoiceResults.map((ir, i) => {
        const isPassing = ir.passed;
        const rowDisc = (ir.matchingRows || []).reduce((s, r) => s + getRowDiscount(r), 0);
        return `
          <div style="padding:8px;background:${isPassing ? '#F0FDF4' : '#FEF2F2'};border-left:3px solid ${isPassing ? '#10B981' : '#DC2626'};border-radius:6px;margin-bottom:6px;font-size:10px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
              <span style="font-weight:800;color:#0F172A;">${i + 1}. ${esc(ir.invoice || '-')}</span>
              <span style="font-size:9px;color:${isPassing ? '#10B981' : '#DC2626'};font-weight:800;">${isPassing ? '✅ LOLOS' : '❌ GAGAL'}</span>
            </div>
            ${!isPassing && ir.failures?.length > 0 ? `<div style="font-size:9px;color:#DC2626;margin-top:2px;">${esc(ir.failures.slice(0, 2).join(' • '))}</div>` : ''}
            ${isPassing ? `<div style="font-size:9px;color:#166534;margin-top:2px;">Diskon: ${compactRp(rowDisc)}</div>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}

function renderTransactionList(rows, isQualified) {
  return `
    <div style="font-size:11px;font-weight:900;color:#0F172A;margin-bottom:8px;">
      ${isQualified ? '✅ Transaksi Target (Lolos)' : '📋 Transaksi Produk Target'} (${rows.length}):
    </div>
    ${rows.map((r, i) => `
      <div style="padding:8px;background:#fff;border:1px solid #E2E8F0;border-radius:6px;margin-bottom:6px;font-size:10px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="font-weight:800;">${i + 1}. ${esc(r.invoice || '-')}</span>
          <span style="color:#64748B;">${fmtDateID(r.day)}</span>
        </div>
        <div style="color:#64748B;margin-bottom:3px;">${esc(r.product || '-')}</div>
        <div style="display:flex;justify-content:space-between;font-size:9px;">
          <span>Qty: <b>${NF1.format(getPcs(r))} pcs</b>${getRcg(r) > 0 ? ` (${NF1.format(getRcg(r))} rcg)` : ''}</span>
          <span>Amount: <b>${compactRp(r.amount)}</b></span>
          <span style="color:#DC2626;">Disc: <b>${compactRp(getRowDiscount(r))}</b></span>
        </div>
      </div>
    `).join('')}`;
}

// ═══════════════════════════════════════════════════════════════
// MAIN VIEW
// ═══════════════════════════════════════════════════════════════
function shell() { return `<div id="prog-content"></div>`; }

function update(container, state) {
  try {
    const programs = loadPrograms();
    const expiringSoon = programs.filter(p => {
      const s = getProgramStatus(p);
      return s.status === 'critical' || s.status === 'warning';
    });
    const statusOrder = { critical: 0, warning: 1, active: 2, upcoming: 3, expired: 4 };
    programs.sort((a, b) => (statusOrder[getProgramStatus(a).status] || 9) - (statusOrder[getProgramStatus(b).status] || 9));

    patchHTML('#prog-content', `
      ${renderHeader(programs)}
      ${renderExpiringAlert(expiringSoon)}
      <button id="prog-add" style="width:100%;padding:14px;background:#1D4ED8;color:#fff;border:none;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;margin-bottom:12px;">➕ Tambah Program Baru</button>
      ${programs.length === 0 ? renderEmpty() : programs.map(p => renderProgramCard(p)).join('')}
    `);

    document.getElementById('prog-add').onclick = () => openProgramEditor(null, state);
    document.querySelectorAll('[data-program-id]').forEach(card => {
      card.onclick = () => {
        const program = programs.find(p => p.id === card.dataset.programId);
        if (program) openProgramDetail(program, state);
      };
    });
  } catch (err) {
    console.error('[programs update]', err);
    patchHTML('#prog-content', `<div class="card" style="padding:24px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;"><div style="font-size:15px;font-weight:800;color:#991B1B;margin-bottom:8px;">⚠️ Error</div><div style="font-size:12px;color:#7F1D1D;">${esc(err.message)}</div></div>`);
  }
}

function renderHeader(programs) {
  const counts = {
    total: programs.length,
    active: programs.filter(p => getProgramStatus(p).status === 'active').length,
    upcoming: programs.filter(p => getProgramStatus(p).status === 'upcoming').length,
    expired: programs.filter(p => getProgramStatus(p).status === 'expired').length,
  };
  return `
    <div class="card mb12" style="background:linear-gradient(135deg,#0F172A 0%,#7F1D1D 100%);color:#fff;padding:20px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        <div style="font-size:32px;">📢</div>
        <div>
          <div style="font-size:16px;font-weight:900;">Program Berjalan</div>
          <div style="font-size:11px;color:#FCA5A5;">Rule-based · Strata (% / Rp) · DMP Target</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:8px;">
        <div style="background:rgba(255,255,255,0.1);padding:10px;border-radius:6px;text-align:center;">
          <div style="font-size:20px;font-weight:900;">${counts.total}</div>
          <div style="font-size:9px;color:#FCA5A5;text-transform:uppercase;font-weight:800;">Total</div>
        </div>
        <div style="background:rgba(16,185,129,0.3);padding:10px;border-radius:6px;text-align:center;border:1px solid rgba(16,185,129,0.5);">
          <div style="font-size:20px;font-weight:900;">${counts.active}</div>
          <div style="font-size:9px;color:#86EFAC;text-transform:uppercase;font-weight:800;">Aktif</div>
        </div>
        <div style="background:rgba(59,130,246,0.3);padding:10px;border-radius:6px;text-align:center;border:1px solid rgba(59,130,246,0.5);">
          <div style="font-size:20px;font-weight:900;">${counts.upcoming}</div>
          <div style="font-size:9px;color:#93C5FD;text-transform:uppercase;font-weight:800;">Akan Datang</div>
        </div>
        <div style="background:rgba(148,163,184,0.3);padding:10px;border-radius:6px;text-align:center;border:1px solid rgba(148,163,184,0.5);">
          <div style="font-size:20px;font-weight:900;">${counts.expired}</div>
          <div style="font-size:9px;color:#CBD5E1;text-transform:uppercase;font-weight:800;">Expired</div>
        </div>
      </div>
    </div>`;
}

function renderExpiringAlert(programs) {
  if (programs.length === 0) return '';
  return `
    <div class="card mb12" style="background:#FEF2F2;border-left:4px solid #DC2626;padding:14px;">
      <div style="font-size:12px;font-weight:900;color:#991B1B;margin-bottom:8px;">🚨 ${programs.length} Program Hampir Berakhir</div>
      ${programs.map(p => `<div style="font-size:11px;color:#7F1D1D;padding:6px 0;border-bottom:1px solid #FECACA;"><b>${esc(p.name)}</b> — ${getProgramStatus(p).label}</div>`).join('')}
    </div>`;
}

function renderEmpty() {
  return `
    <div class="card" style="text-align:center;padding:40px;">
      <div style="font-size:48px;margin-bottom:12px;">📢</div>
      <div style="font-size:15px;font-weight:800;color:#64748B;">Belum Ada Program</div>
    </div>`;
}

function renderProgramCard(p) {
  const status = getProgramStatus(p);
  const hasMaxCap = p.schemes.some(s => s.reward?.maxEnabled);
  const hasPerInvoice = p.schemes.some(s => s.evaluationMode === 'per_invoice');
  const hasStrata = p.schemes.some(s => s.reward?.discountMode === 'strata');
  const totalRules = p.schemes.reduce((s, sch) => s + (sch.rules?.length || 0), 0);

  return `
    <div class="card mb12" data-program-id="${p.id}" style="border-left:4px solid ${status.color};cursor:pointer;padding:14px;">
      <div style="font-size:14px;font-weight:900;color:#0F172A;margin-bottom:2px;">${esc(p.name)}</div>
      <div style="font-size:10px;color:#64748B;margin-bottom:6px;">${p.schemes.length} scheme · ${totalRules} aturan</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">
        ${hasPerInvoice ? `<span style="${S.chip('#1D4ED8')}">🧾 Per Faktur</span>` : ''}
        ${hasStrata ? `<span style="${S.chip('#F59E0B')}">📊 Strata</span>` : ''}
        ${hasMaxCap ? `<span style="${S.chip('#DC2626')}">🛑 Max Cap</span>` : ''}
      </div>
      <div style="padding:8px;background:${status.bg};border-radius:6px;font-size:11px;font-weight:800;color:${status.color};text-align:center;">${status.label}</div>
      <div style="font-size:10px;color:#64748B;margin-top:8px;text-align:center;">${fmtDateID(p.startDate)} — ${fmtDateID(p.endDate)}</div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════════════════════════════
registerView('programs', {
  label: 'Program Berjalan',
  title: 'Program Berjalan',
  sub: 'Rule-based · Strata · DMP Target',
  shell,
  update,
});