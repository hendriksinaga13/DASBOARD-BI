/* ================================================================== */
/* INSIGHT PLAYBOOKS — Library pembelajaran dari insight masa lalu    */
/* Pure logic, localStorage-backed                                    */
/* ================================================================== */
const PLAYBOOK_STORE_KEY = 'ai_playbook_v1';
const MAX_PLAYBOOKS = 200;

/**
 * Signature problem — karakteristik unik problem pack.
 * Dipakai untuk match playbook relevan di masa depan.
 */
export function computeProblemSignature(pack) {
  const sigs = [];
  if (pack.retRate > 5) sigs.push('high-return');
  if (pack.coverage != null && pack.coverage < 60) sigs.push('low-coverage');
  if (pack.concentration > 40) sigs.push('high-concentration');
  if (pack.growth.lm != null && pack.growth.lm < -10) sigs.push('growth-decline');
  if (pack.cohort && pack.cohort.churning >= 5) sigs.push('cohort-churn');
  if (pack.zScoreOutliers && pack.zScoreOutliers.length > 0) sigs.push('z-outlier');
  if (pack.dataQuality && pack.dataQuality.qualityScore < 60) sigs.push('low-data-quality');
  if (pack.trend && pack.trend.momentum != null && pack.trend.momentum < -15) sigs.push('momentum-down');
  return sigs;
}

/**
 * Simpan playbook — problem, action, outcome.
 * Return record yang disimpan.
 */
export function savePlaybook(entry) {
  const list = loadPlaybooks();
  const record = {
    id: 'pb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    createdAt: Date.now(),
    problem: String(entry.problem || '').trim().slice(0, 500),
    action: String(entry.action || '').trim().slice(0, 1000),
    outcome: String(entry.outcome || '').trim().slice(0, 500),
    signatures: Array.isArray(entry.signatures) ? entry.signatures.slice(0, 10) : [],
    source: entry.source || 'manual',
    insightId: entry.insightId || null,
  };
  list.push(record);
  const trimmed = list.slice(-MAX_PLAYBOOKS);
  try {
    localStorage.setItem(PLAYBOOK_STORE_KEY, JSON.stringify(trimmed));
  } catch {
    // quota exceeded → drop half
    localStorage.setItem(PLAYBOOK_STORE_KEY, JSON.stringify(trimmed.slice(-50)));
  }
  return record;
}

/**
 * Load semua playbook dari localStorage.
 */
export function loadPlaybooks() {
  try { return JSON.parse(localStorage.getItem(PLAYBOOK_STORE_KEY)) || []; }
  catch { return []; }
}

/**
 * Cari playbook yang relevan dengan problem pack saat ini.
 * Scoring: match signature count + recency.
 */
export function findSimilarPlaybooks(pack, limit = 3) {
  const currentSigs = computeProblemSignature(pack);
  if (currentSigs.length === 0) return [];
  const list = loadPlaybooks();
  if (list.length === 0) return [];
  const scored = list
    .map(pb => {
      const matchCount = (pb.signatures || []).filter(s => currentSigs.includes(s)).length;
      return { ...pb, matchCount };
    })
    .filter(pb => pb.matchCount > 0);
  scored.sort((a, b) => {
    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
    return b.createdAt - a.createdAt;
  });
  return scored.slice(0, limit);
}

export function clearPlaybooks() {
  localStorage.removeItem(PLAYBOOK_STORE_KEY);
}

export function getPlaybookCount() {
  return loadPlaybooks().length;
}