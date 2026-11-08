/* ================================================================== */
/* INSIGHT FEEDBACK — Learning loop dari feedback user                */
/* Priority adaptif berdasarkan 👍/👎 historis                         */
/* ================================================================== */
const FEEDBACK_STORE_KEY = 'ai_feedback_v1';
const MAX_FEEDBACK = 500;
const MIN_VOTES_FOR_ADAPTATION = 5;
const NOT_USEFUL_THRESHOLD = 0.6;

/**
 * Rekam feedback untuk satu insight.
 */
export function recordFeedback(insightId, useful, reason) {
  const list = loadFeedback();
  list.push({
    insightId: String(insightId || '').trim(),
    useful: !!useful,
    reason: String(reason || '').trim().slice(0, 300),
    ts: Date.now(),
  });
  const trimmed = list.slice(-MAX_FEEDBACK);
  try {
    localStorage.setItem(FEEDBACK_STORE_KEY, JSON.stringify(trimmed));
  } catch {
    localStorage.setItem(FEEDBACK_STORE_KEY, JSON.stringify(trimmed.slice(-100)));
  }
  return true;
}

export function loadFeedback() {
  try { return JSON.parse(localStorage.getItem(FEEDBACK_STORE_KEY)) || []; }
  catch { return []; }
}

/**
 * Statistik per insightId: { useful, notUseful, total }.
 */
export function getInsightStats() {
  const list = loadFeedback();
  const stats = {};
  for (const fb of list) {
    if (!stats[fb.insightId]) stats[fb.insightId] = { useful: 0, notUseful: 0, total: 0 };
    if (fb.useful) stats[fb.insightId].useful++;
    else stats[fb.insightId].notUseful++;
    stats[fb.insightId].total++;
  }
  return stats;
}

/**
 * Hitung adjustment priority per insightId berdasarkan feedback historis.
 * - Total feedback >= MIN_VOTES_FOR_ADAPTATION
 * - Not-useful rate >= 60% → turunkan priority (+2)
 * - Not-useful rate <= 20% → naikkan priority (-1)
 */
export function computePriorityAdjustments(seedIds) {
  const stats = getInsightStats();
  const adjustments = {};
  for (const id of seedIds) {
    const s = stats[id];
    if (!s || s.total < MIN_VOTES_FOR_ADAPTATION) continue;
    const notUsefulRate = s.notUseful / s.total;
    if (notUsefulRate >= NOT_USEFUL_THRESHOLD) {
      adjustments[id] = { delta: +2, reason: `${s.notUseful}/${s.total} feedback negatif` };
    } else if (notUsefulRate <= 0.2) {
      adjustments[id] = { delta: -1, reason: `${s.useful}/${s.total} feedback positif` };
    }
  }
  return adjustments;
}

/**
 * Terapkan adjustment ke seed insights.
 * Priority range: 1-9 (1 = paling tinggi).
 */
export function applyFeedbackAdaptation(seeds) {
  if (!Array.isArray(seeds) || seeds.length === 0) return seeds;
  const adjustments = computePriorityAdjustments(seeds.map(s => s.id));
  for (const s of seeds) {
    const adj = adjustments[s.id];
    if (adj) {
      s.priority = Math.max(1, Math.min(9, (s.priority || 5) + adj.delta));
      s.feedbackAdaptation = adj;
    }
  }
  return seeds;
}

export function clearFeedback() {
  localStorage.removeItem(FEEDBACK_STORE_KEY);
}

export function getFeedbackSummary() {
  const list = loadFeedback();
  const useful = list.filter(f => f.useful).length;
  const notUseful = list.length - useful;
  const rate = list.length > 0 ? (useful / list.length) * 100 : 0;
  return { total: list.length, useful, notUseful, usefulRate: rate };
}