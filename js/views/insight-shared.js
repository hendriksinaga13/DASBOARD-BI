/* ================================================================== */
/* INSIGHT SHARED — config + utilities                                */
/* Self-contained, no imports.                                        */
/* ================================================================== */

/* ══════════════════════════════════════════════════════════════════ */
/* CONFIG                                                             */
/* ══════════════════════════════════════════════════════════════════ */
export const PREFERRED_MODELS = [
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
];

export const MODELS_CACHE_KEY = 'gemini_active_model';

export const BENCHMARKS = {
  targetGrowth: 5,
  returnRateGood: 2, returnRateBad: 5,
  ecMin: 12, ecGood: 20,
  iptMin: 3, iptGood: 6,
  coverageGood: 80, coverageMin: 60,
  concentrationDanger: 40,
  salesmanDropThreshold: -30,
  zScoreThreshold: 2,
  zScoreHighThreshold: 3,
  r2Min: 0.5,
  dayCoverageMin: 60,
  dayStaleMax: 7,
  cohortChurnMin: 5,
};

/* ══════════════════════════════════════════════════════════════════ */
/* CACHED MODEL                                                       */
/* ══════════════════════════════════════════════════════════════════ */
let cachedModel = null;
export function getCachedModel() { return cachedModel; }
export function setCachedModel(m) { cachedModel = m; }
export function resetCachedModel() { cachedModel = null; }

/* ══════════════════════════════════════════════════════════════════ */
/* ERROR DETECT                                                       */
/* ══════════════════════════════════════════════════════════════════ */
export function isQuotaError(err) {
  if (!err) return false;
  if (err.code === 'QUOTA_EXCEEDED') return true;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('quota') || msg.includes('kuota') || msg.includes('rate limit') || msg.includes('429');
}

/* ══════════════════════════════════════════════════════════════════ */
/* PARSE NUMBER                                                       */
/* ══════════════════════════════════════════════════════════════════ */
export function parseNumber(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v !== 'string') return 0;
  let s = v.replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastDot !== -1) {
    const parts = s.split('.');
    if (!(parts.length === 2 && parts[1].length <= 2)) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/* ══════════════════════════════════════════════════════════════════ */
/* FORMAT                                                             */
/* ══════════════════════════════════════════════════════════════════ */
export function formatIDR(n) {
  if (!isFinite(n)) return 'Rp 0';
  const abs = Math.abs(n), sign = n < 0 ? '-' : '';
  const fmt = (x, d = 2) => Math.abs(x).toFixed(d).replace('.', ',');
  if (abs >= 1e12) return `${sign}Rp ${fmt(n / 1e12)} triliun`;
  if (abs >= 1e9) return `${sign}Rp ${fmt(n / 1e9)} miliar`;
  if (abs >= 1e6) return `${sign}Rp ${fmt(n / 1e6)} juta`;
  if (abs >= 1e3) return `${sign}Rp ${fmt(n / 1e3, 1)} ribu`;
  return `${sign}Rp ${Math.abs(n).toLocaleString('id-ID')}`;
}

export function formatSignedPercent(v, digits = 2) {
  if (v == null || !isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}