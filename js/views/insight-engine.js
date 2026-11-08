/* ================================================================== */
/* INSIGHT ENGINE — slim orchestrator                                  */
/* - Prompt & schema  → insight-prompt.js                              */
/* - Compute facts    → insight-facts.js                               */
/* - Config & utils   → insight-shared.js                              */
/* ================================================================== */
import {
  PREFERRED_MODELS, BENCHMARKS,
  getCachedModel, setCachedModel, resetCachedModel,
  isQuotaError, parseNumber, formatIDR, formatSignedPercent,
} from './insight-shared.js';

import {
  normalizeName, matchValidName, buildValidNamesMap,
  RESPONSE_SCHEMA,
  buildPrompt, buildCritiquePrompt, buildRefinePrompt,
} from './insight-prompt.js';

/* ══════════════════════════════════════════════════════════════════ */
/* RE-EXPORT — backward compat untuk insight.js view                 */
/* ══════════════════════════════════════════════════════════════════ */
export {
  PREFERRED_MODELS, BENCHMARKS,
  getCachedModel, resetCachedModel, isQuotaError,
  parseNumber, formatIDR, formatSignedPercent,
  normalizeName, matchValidName, buildValidNamesMap,
  buildPrompt,
};

export { buildFactPack } from './insight-facts.js';

/* ══════════════════════════════════════════════════════════════════ */
/* HEALTH SCORE                                                       */
/* ══════════════════════════════════════════════════════════════════ */
export function computeHealthScore(pack) {
  const clamp = n => Math.max(0, Math.min(100, n));
  const gLM = pack.growth.lm;
  const sp = gLM != null ? clamp(50 + gLM * 2) : 55;
  const conc = pack.concentration || 0;
  const pm = conc > BENCHMARKS.concentrationDanger
    ? clamp(100 - (conc - BENCHMARKS.concentrationDanger) * 2)
    : clamp(100 - conc * 0.5);
  const oc = pack.coverage != null ? clamp(pack.coverage) : 55;
  const ecScore = clamp((pack.ec / BENCHMARKS.ecGood) * 100);
  const iptScore = clamp((pack.ipt / BENCHMARKS.iptGood) * 100);
  const smp = ecScore * 0.5 + iptScore * 0.5;
  const rr = pack.retRate;
  const oe = rr <= BENCHMARKS.returnRateGood
    ? 100
    : rr >= BENCHMARKS.returnRateBad * 2
      ? 25
      : clamp(100 - (rr - BENCHMARKS.returnRateGood) * 13);

  let overall = Math.round(sp * 0.30 + pm * 0.15 + oc * 0.20 + smp * 0.20 + oe * 0.15);
  if (pack.dataQuality) {
    if (pack.dataQuality.qualityScore < 60) overall = Math.round(overall * 0.85);
    else if (pack.dataQuality.qualityScore < 80) overall = Math.round(overall * 0.95);
  }

  return {
    overall: clamp(overall),
    salesPerformance: Math.round(sp),
    productMix: Math.round(pm),
    outletCoverage: Math.round(oc),
    salesmanProductivity: Math.round(smp),
    operationalEfficiency: Math.round(oe),
  };
}

/* ══════════════════════════════════════════════════════════════════ */
/* SEED INSIGHTS                                                      */
/* ══════════════════════════════════════════════════════════════════ */
export function seedInsights(pack) {
  const seeds = [];
  const add = obj => seeds.push({
    id: obj.id, source: 'seed',
    severity: obj.severity, category: obj.category,
    title: obj.title, desc: obj.desc,
    expectedImpact: obj.expectedImpact || '',
    priority: obj.severity === 'critical' ? 1
      : obj.severity === 'high' ? 2
      : obj.severity === 'growth' ? 4 : 5,
    techActions: obj.techActions || [],
    nonTechnicalActions: obj.nonTechnicalActions || [],
    actionData: obj.actionData || null,
    citedFacts: obj.citedFacts || [],
  });

  if (pack.growth.lm != null && pack.growth.lm < -10) {
    add({
      id: 'seed-growth-down',
      severity: pack.growth.lm < -25 ? 'critical' : 'high',
      category: 'Sales Performance',
      title: `Omset turun ${Math.abs(pack.growth.lm).toFixed(1)}% vs bulan lalu`,
      desc: `Omset ${formatIDR(pack.growth.cur)} vs LM ${formatIDR(pack.growth.lastMonth)}, turun ${pack.growth.lm.toFixed(2)}%.`,
      expectedImpact: `Potensi recovery hingga ${Math.abs(pack.growth.lm).toFixed(1)}%`,
      citedFacts: ['G_GROWTH_LM', 'G_CUR', 'G_LM'],
      nonTechnicalActions: ['Meeting darurat tim sales', 'Root cause analysis', 'Recovery plan mingguan'],
    });
  }

  if (pack.growth.lm != null && pack.growth.lm > 15) {
    add({
      id: 'seed-growth-up', severity: 'growth', category: 'Momentum Positif',
      title: `Omset naik ${pack.growth.lm.toFixed(1)}% vs bulan lalu`,
      desc: `Pertumbuhan signifikan (+${pack.growth.lm.toFixed(2)}%).`,
      expectedImpact: 'Dokumentasikan playbook',
      citedFacts: ['G_GROWTH_LM', 'G_CUR', 'G_LM'],
    });
  }

  if (pack.retRate > BENCHMARKS.returnRateBad) {
    add({
      id: 'seed-ret-high', severity: 'high', category: 'Operational Risk',
      title: `Return rate ${pack.retRate.toFixed(2)}% melebihi batas sehat`,
      desc: `Threshold <${BENCHMARKS.returnRateGood}%. Menggerus omset bersih.`,
      expectedImpact: 'Setiap 1% penurunan = tambahan omset bersih',
      citedFacts: ['P_RET_RATE', 'P_GROSS_R', 'P_GROSS_F', 'RD_TOTAL'],
      nonTechnicalActions: ['Audit outlet return terbesar', 'Review SOP kirim', 'Cek stok aging'],
    });
  }

  if (pack.concentration > BENCHMARKS.concentrationDanger) {
    const topProd = pack.paretoByDim.product?.list?.[0];
    add({
      id: 'seed-conc-high', severity: 'high', category: 'Concentration Risk',
      title: `Konsentrasi produk ${pack.concentration.toFixed(1)}%`,
      desc: `Top produk menyumbang ${pack.concentration.toFixed(1)}% total omset.`,
      expectedImpact: `Target turun ke <${BENCHMARKS.concentrationDanger}% dalam 2 kuartal`,
      citedFacts: ['C_TOP_PRODUCT', 'R_TOP_PRODUCT'],
      actionData: topProd ? { type: 'product', keys: [topProd.key] } : null,
      nonTechnicalActions: ['Cross-selling', 'Bundling', 'NPD / substitusi'],
    });
  }

  if (pack.coverage != null && pack.coverage < BENCHMARKS.coverageMin) {
    add({
      id: 'seed-coverage-low', severity: 'high', category: 'Outlet Coverage',
      title: `Coverage outlet ${pack.coverage.toFixed(1)}%`,
      desc: `${pack.oa} aktif dari ${pack.masterCount} master. ${pack.notYet} belum transaksi.`,
      expectedImpact: 'Setiap +10% coverage = potensi omset signifikan',
      citedFacts: ['P_OA', 'P_MASTER', 'A_NOT_YET', 'A_COVERAGE_LOW'],
      nonTechnicalActions: ['Mapping territory ulang', 'Kunjungan outlet belum transaksi', 'Insentif akuisisi'],
    });
  }

  if (pack.trend.momentum != null && pack.trend.momentum < -15) {
    add({
      id: 'seed-momentum-down', severity: 'high', category: 'Trend Alert',
      title: `Momentum turun ${Math.abs(pack.trend.momentum).toFixed(1)}%`,
      desc: `Omset paruh terakhir lebih rendah.`,
      expectedImpact: 'Deteksi dini cegah penurunan lebih dalam',
      citedFacts: ['T_MOMENTUM', 'T_SERIES'],
    });
  }

  if (pack.salesmanDrops.length > 0) {
    add({
      id: 'seed-salesman-drop', severity: 'high', category: 'Sales Performance',
      title: `${pack.salesmanDrops.length} salesman turun >30%`,
      desc: `Terbesar: ${pack.salesmanDrops.slice(0, 3).map(s => `${s.salesman} (${s.delta.toFixed(1)}%)`).join(', ')}.`,
      expectedImpact: 'Recovery 5-15% omset',
      citedFacts: ['A_SALESMAN_DROP', 'G_LM'],
      actionData: { type: 'salesman', keys: pack.salesmanDrops.slice(0, 3).map(s => s.salesman) },
      nonTechnicalActions: ['Coaching 1-on-1', 'Review territory', 'Cek aktivitas'],
    });
  }

  if (pack.zScoreOutliers && pack.zScoreOutliers.length > 0) {
    const worst = [...pack.zScoreOutliers].sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))[0];
    const direction = worst.zScore > 0 ? 'lonjakan' : 'penurunan';
    const sev = Math.abs(worst.zScore) >= BENCHMARKS.zScoreHighThreshold ? 'critical' : 'high';
    add({
      id: 'seed-z-outlier', severity: sev, category: 'Statistical Anomaly',
      title: `Outlier ${worst.salesman} ${direction} ${Math.abs(worst.zScore).toFixed(1)}σ`,
      desc: `${formatIDR(worst.last)} vs avg ${formatIDR(worst.mean)}. Bukan noise.`,
      expectedImpact: direction === 'penurunan' ? 'Investigasi cepat' : 'Replikasi ke salesman lain',
      citedFacts: pack.zScoreOutliers
        .filter(z => Math.abs(z.zScore) >= BENCHMARKS.zScoreThreshold)
        .map((z, i) => `A_SM_Z_${i}`),
      actionData: { type: 'salesman', keys: [worst.salesman] },
      nonTechnicalActions: direction === 'penurunan'
        ? ['Coaching mendalam', 'Cek call plan', 'Review territory']
        : ['Interview salesman', 'Dokumentasikan', 'Replikasi'],
    });
  }

  if (pack.cohort && pack.cohort.churning >= BENCHMARKS.cohortChurnMin) {
    const totalBase = pack.cohort.retained + pack.cohort.churning;
    const churnRate = totalBase > 0 ? (pack.cohort.churning / totalBase) * 100 : 0;
    add({
      id: 'seed-cohort-churn',
      severity: churnRate > 15 ? 'critical' : 'high',
      category: 'Customer Retention',
      title: `${pack.cohort.churning} outlet churning (${churnRate.toFixed(1)}%)`,
      desc: `${pack.cohort.new} outlet baru masuk, net ${pack.cohort.new - pack.cohort.churning >= 0 ? '+' : ''}${pack.cohort.new - pack.cohort.churning}.`,
      expectedImpact: churnRate > 15 ? 'Prioritas tinggi' : 'Stabilkan base',
      citedFacts: ['A_COHORT_CHURN', 'P_COHORT_CHURN', 'P_COHORT_NEW', 'CD_CHURN'],
      nonTechnicalActions: ['Telpon outlet churning', 'Win-back khusus', 'Review layanan'],
    });
  }

  if (pack.dataQuality) {
    const dq = pack.dataQuality;
    if (dq.qualityScore < 60) {
      add({
        id: 'seed-data-quality-low', severity: 'high', category: 'Data Quality',
        title: `Kualitas data rendah (${dq.qualityScore}/100)`,
        desc: `Data ${dq.daysStale}h stale, coverage ${dq.dayCoverage.toFixed(0)}%.`,
        expectedImpact: 'Validasi data',
        citedFacts: ['Q_FRESHNESS', 'Q_DAY_COVERAGE', 'Q_SCORE'],
        nonTechnicalActions: ['Konfirmasi gap ke tim data', 'Update data'],
      });
    } else if (dq.daysStale > BENCHMARKS.dayStaleMax) {
      add({
        id: 'seed-data-stale', severity: 'info', category: 'Data Quality',
        title: `Data ${dq.daysStale} hari stale`,
        desc: `Terakhir ${dq.daysStale} hari lalu.`,
        citedFacts: ['Q_FRESHNESS'],
      });
    }
  }

  if (pack.notYet > 0 && (pack.notYet / (pack.oa + pack.notYet)) > 0.2) {
    add({
      id: 'seed-notyet', severity: 'growth', category: 'Growth Opportunity',
      title: `${pack.notYet} outlet belum transaksi`,
      desc: `Revenue bisa diaktifkan.`,
      expectedImpact: 'Aktivasi 50% = revenue langsung',
      citedFacts: ['P_NOT_YET', 'A_NOT_YET'],
      nonTechnicalActions: ['Assign kunjungan', 'Penawaran khusus', 'Analisis alasan'],
    });
  }

  if (pack.growth.lm == null) {
    add({
      id: 'seed-no-comparison', severity: 'info', category: 'Data Quality',
      title: 'Data pembanding LM tidak tersedia',
      desc: 'Perluas filter tanggal.',
      citedFacts: [],
      nonTechnicalActions: ['Perluas filter'],
    });
  }

  return seeds;
}

/* ══════════════════════════════════════════════════════════════════ */
/* GEMINI — MODEL LIST & CALL                                         */
/* ══════════════════════════════════════════════════════════════════ */
async function listAvailableModels(apiKey) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''));
  } catch (err) {
    console.error('[listAvailableModels]', err);
    return null;
  }
}

async function callGeminiRaw(apiKey, model, prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        topP: 0.9,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      ],
    }),
  });

  if (res.status === 404) {
    const e = new Error('MODEL_NOT_FOUND');
    e.code = 'MODEL_NOT_FOUND';
    throw e;
  }
  if (res.status === 429) {
    const e = new Error('QUOTA_EXCEEDED');
    e.code = 'QUOTA_EXCEEDED';
    throw e;
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (res.status === 400 || res.status === 403) {
      const e = new Error('API Key tidak valid.');
      e.code = 'AUTH_ERROR';
      throw e;
    }
    const e = new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
    e.code = 'HTTP_' + res.status;
    throw e;
  }

  const payload = await res.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const e = new Error('Respons kosong.');
    e.code = 'EMPTY_RESPONSE';
    throw e;
  }
  return text;
}

export async function callGemini(apiKey, prompt) {
  const available = await listAvailableModels(apiKey);
  if (!available || available.length === 0) {
    throw new Error('Tidak bisa ambil daftar model. Cek API key atau koneksi.');
  }

  const tryOrder = [];
  const seen = new Set();

  for (const pref of PREFERRED_MODELS) {
    if (seen.has(pref)) continue;
    const found = available.find(m => m === pref || m.startsWith(pref + '-'));
    if (found && !seen.has(found)) { tryOrder.push(found); seen.add(found); }
  }
  for (const m of available) {
    if (seen.has(m)) continue;
    if (!/flash|pro/i.test(m)) continue;
    if (/vision|embed|tts|image|exp|thinking|audio|lyria|banana|deep-research|antigravity|robotics|computer-use/i.test(m)) continue;
    tryOrder.push(m);
    seen.add(m);
  }

  if (tryOrder.length === 0) throw new Error('Tidak ada model text-generation tersedia.');

  console.info('Model akan dicoba: ' + tryOrder.length + ' -> ' + tryOrder.join(', '));

  const errors = [];
  let quotaHit = 0;

  for (const model of tryOrder) {
    try {
      const text = await callGeminiRaw(apiKey, model, prompt);
      let parsed;
      try { parsed = JSON.parse(text); }
      catch { throw new Error('Respons bukan JSON valid.'); }
      setCachedModel(model);
      console.info('SUKSES pakai model: ' + model);
      return parsed;
    } catch (err) {
      errors.push({ model, code: err.code || 'UNKNOWN', msg: err.message });

      if (err.code === 'QUOTA_EXCEEDED') {
        quotaHit++;
        console.warn(model + ' kena QUOTA, lanjut...');
        continue;
      }
      if (err.code === 'HTTP_503') {
        console.warn(model + ' 503, retry 2 detik...');
        try {
          await new Promise(r => setTimeout(r, 2000));
          const text2 = await callGeminiRaw(apiKey, model, prompt);
          const parsed2 = JSON.parse(text2);
          setCachedModel(model);
          console.info('SUKSES: ' + model);
          return parsed2;
        } catch (retryErr) {
          console.warn('Retry gagal, lanjut');
          continue;
        }
      }
      if (err.code === 'MODEL_NOT_FOUND') {
        console.warn(model + ' 404, lanjut...');
        continue;
      }
      if (err.code === 'AUTH_ERROR') {
        console.error('AUTH error, berhenti');
        throw err;
      }
      console.warn(model + ' error ' + err.code + ', lanjut...');
    }
  }

  const summary = errors.map(e => '- ' + e.model + ': ' + e.code + ' (' + e.msg.slice(0, 80) + ')').join('\n');
  let hint = '';
  if (quotaHit === tryOrder.length) hint = '\n\n⚠️ SEMUA model kena quota. Tunggu reset atau ganti API key.';
  else if (quotaHit > 0) hint = '\n\n⚠️ ' + quotaHit + '/' + tryOrder.length + ' model kena quota.';
  throw new Error('Semua ' + tryOrder.length + ' model gagal:\n' + summary + hint);
}

/* ══════════════════════════════════════════════════════════════════ */
/* MULTI-PASS ORCHESTRATION                                           */
/* ══════════════════════════════════════════════════════════════════ */
export async function callGeminiMultiPass(apiKey, pack, health, seeds, state, options = {}) {
  const { enableCritique = true, playbooks = [], onProgress = null } = options;

  if (onProgress) onProgress('draft', '✨ Pass 1/3: AI drafting...');
  const draftPrompt = buildPrompt(pack, health, seeds, state, playbooks);
  const draft = await callGemini(apiKey, draftPrompt);

  if (!enableCritique) {
    return { result: draft, meta: { passes: 1, critique: null, playbooksUsed: playbooks.length } };
  }

  if (onProgress) onProgress('critique', '🔍 Pass 2/3: AI audit draft...');
  let critique = null;
  try {
    const critiquePrompt = buildCritiquePrompt(draft, pack);
    critique = await callGemini(apiKey, critiquePrompt);
  } catch (err) {
    console.warn('[Multi-pass] Critique gagal:', err.message);
    return {
      result: draft,
      meta: { passes: 1, critique: null, degraded: true, reason: err.message, playbooksUsed: playbooks.length },
    };
  }

  if (critique && critique.needsRefine && Array.isArray(critique.issues) && critique.issues.length > 0) {
    if (onProgress) onProgress('refine', `✅ Pass 3/3: Refine ${critique.issues.length} isu...`);
    try {
      const refinePrompt = buildRefinePrompt(draft, critique, pack, playbooks);
      const refined = await callGemini(apiKey, refinePrompt);
      return { result: refined, meta: { passes: 3, critique, playbooksUsed: playbooks.length } };
    } catch (err) {
      console.warn('[Multi-pass] Refine gagal:', err.message);
      return {
        result: draft,
        meta: { passes: 2, critique, degraded: true, reason: err.message, playbooksUsed: playbooks.length },
      };
    }
  }

  return { result: draft, meta: { passes: 2, critique, playbooksUsed: playbooks.length } };
}

/* ══════════════════════════════════════════════════════════════════ */
/* ENFORCE NUMBERS                                                    */
/* ══════════════════════════════════════════════════════════════════ */
function enforceNumbers(text, pack) {
  if (!text || typeof text !== 'string') return text;
  const currencyFacts = pack.facts.filter(f => f.meta?.type === 'currency' && typeof f.raw === 'number' && Math.abs(f.raw) > 0);
  if (!currencyFacts.length) return text;

  const rx = /Rp\s*([\d.,]+)\s*(triliun|miliar|juta|ribu|T|M|Jt|Rb)?/gi;
  return text.replace(rx, (match, numStr, unitStr) => {
    const num = parseNumber(numStr);
    if (!num) return match;
    let mult = 1;
    const u = (unitStr || '').toLowerCase();
    if (u === 'triliun' || u === 't') mult = 1e12;
    else if (u === 'miliar' || u === 'm') mult = 1e9;
    else if (u === 'juta' || u === 'jt') mult = 1e6;
    else if (u === 'ribu' || u === 'rb') mult = 1e3;
    const aiVal = num * mult;

    let best = null, bestRelErr = Infinity;
    for (const f of currencyFacts) {
      const relErr = Math.abs(f.raw - aiVal) / Math.abs(f.raw);
      if (relErr < bestRelErr) { bestRelErr = relErr; best = f; }
    }
    if (!best) return match;
    if (bestRelErr <= 0.10) return match;
    if (bestRelErr <= 0.30) {
      console.warn(`[AI Enforce] Rewrite "${match}" → "${best.formatted}"`);
      return best.formatted;
    }
    console.warn(`[AI Enforce] HALUSINASI: "${match}" → "${best.formatted}"`);
    return best.formatted;
  });
}

function stripInvalidWeeklySuffix(text, pack) {
  if (!text || typeof text !== 'string') return text;
  const weeklyFacts = pack.facts.filter(f => (f.formatted || '').includes('/minggu') && typeof f.raw === 'number' && f.raw !== 0);
  if (!weeklyFacts.length) return text;

  const rx = /(Rp\s*[\d.,]+\s*(?:triliun|miliar|juta|ribu|T|M|Jt|Rb))\s*\/\s*minggu/gi;
  return text.replace(rx, (match, amountStr) => {
    const m = amountStr.match(/Rp\s*([\d.,]+)\s*(triliun|miliar|juta|ribu|T|M|Jt|Rb)?/i);
    if (!m) return match;
    const n = parseNumber(m[1]);
    if (!n) return match;
    let mult = 1;
    const u = (m[2] || '').toLowerCase();
    if (u === 'triliun' || u === 't') mult = 1e12;
    else if (u === 'miliar' || u === 'm') mult = 1e9;
    else if (u === 'juta' || u === 'jt') mult = 1e6;
    else if (u === 'ribu' || u === 'rb') mult = 1e3;
    const val = n * mult;
    const isWeekly = weeklyFacts.some(f => Math.abs(f.raw - val) / Math.abs(f.raw) < 0.10);
    if (isWeekly) return match;
    console.warn(`[AI Enforce] Strip "/minggu" dari "${match}"`);
    return amountStr;
  });
}

export function enforceNumbersInResult(result, pack) {
  if (result.summary) result.summary = enforceNumbers(result.summary, pack);
  if (result.riskAssessment?.concentrationRisk) result.riskAssessment.concentrationRisk = enforceNumbers(result.riskAssessment.concentrationRisk, pack);
  if (result.forecast?.reasoning) result.forecast.reasoning = enforceNumbers(result.forecast.reasoning, pack);

  for (const k of result.keyMetrics || []) {
    k.value = enforceNumbers(k.value, pack);
    k.insight = enforceNumbers(k.insight, pack);
  }
  for (const i of result.insights || []) {
    i.desc = enforceNumbers(i.desc, pack);
    if (i.expectedImpact) i.expectedImpact = enforceNumbers(i.expectedImpact, pack);
  }
  for (const o of result.opportunities || []) {
    o.description = enforceNumbers(o.description, pack);
  }
  for (const w of result.quickWins || []) {
    w.action = enforceNumbers(w.action, pack);
    w.expectedOutcome = enforceNumbers(w.expectedOutcome, pack);
  }

  if (result.summary) result.summary = stripInvalidWeeklySuffix(result.summary, pack);
  if (result.riskAssessment?.concentrationRisk) result.riskAssessment.concentrationRisk = stripInvalidWeeklySuffix(result.riskAssessment.concentrationRisk, pack);
  if (result.forecast?.reasoning) result.forecast.reasoning = stripInvalidWeeklySuffix(result.forecast.reasoning, pack);

  for (const k of result.keyMetrics || []) {
    k.value = stripInvalidWeeklySuffix(k.value, pack);
    k.insight = stripInvalidWeeklySuffix(k.insight, pack);
  }
  for (const i of result.insights || []) {
    i.desc = stripInvalidWeeklySuffix(i.desc, pack);
    if (i.expectedImpact) i.expectedImpact = stripInvalidWeeklySuffix(i.expectedImpact, pack);
  }
  for (const o of result.opportunities || []) {
    o.description = stripInvalidWeeklySuffix(o.description, pack);
  }
  for (const w of result.quickWins || []) {
    w.action = stripInvalidWeeklySuffix(w.action, pack);
    w.expectedOutcome = stripInvalidWeeklySuffix(w.expectedOutcome, pack);
  }
  return result;
}

/* ══════════════════════════════════════════════════════════════════ */
/* VALIDATION                                                         */
/* ══════════════════════════════════════════════════════════════════ */
export function validateCitations(result, pack) {
  const factIds = new Set(pack.facts.map(f => f.id));
  const extraIds = [
    'TG_GLOBAL', 'TG_ACTUAL', 'TG_PCT', 'TG_GAP', 'TG_PACE', 'TG_PROJ', 'TG_SALESMAN',
    'CD_NEW', 'CD_CHURN', 'CD_RETAINED', 'CD_RETENTION', 'CD_ACQ', 'CD_NET',
    'RD_TOTAL', 'RD_COUNT', 'RD_PARETO', 'RD_TOP_PRODUCT', 'RD_TOP_OUTLET',
    'G_PERIOD_CONTEXT', 'G_GROWTH_LM_TOTAL', 'G_GROWTH_LY_TOTAL',
  ];
  for (const id of extraIds) factIds.add(id);

  for (const insight of result.insights || []) {
    const cited = Array.isArray(insight.citedFacts) ? insight.citedFacts : [];
    const valid = cited.filter(id => factIds.has(id));
    if (valid.length === 0 && insight.source !== 'seed') {
      insight.citedFacts = [];
      insight.unverified = true;
    } else {
      insight.citedFacts = valid;
    }
  }
  return result;
}

function sanitizeActionData(actionData, ctx) {
  if (!actionData?.type || !Array.isArray(actionData.keys)) return null;
  const { type } = actionData;
  if (!['salesman', 'product', 'outlet'].includes(type)) return null;
  const field = ctx.typeToField?.[type];
  if (!field) return null;
  const whitelist = ctx.validNamesByField?.[field] || [];
  if (whitelist.length === 0) return null;
  const matched = [], seen = new Set();
  for (const k of actionData.keys) {
    const m = matchValidName(k, whitelist);
    if (m && !seen.has(m)) { seen.add(m); matched.push(m); }
  }
  return matched.length > 0 ? { type, keys: matched.slice(0, 10) } : null;
}

export function validateResult(r, ctx) {
  if (!r || typeof r !== 'object') throw new Error('Struktur AI tidak dikenali.');
  const clamp = n => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const safeStr = s => typeof s === 'string' ? s : '';
  const safeArr = a => Array.isArray(a) ? a : [];
  const oneOf = (v, o, d) => o.includes(v) ? v : d;
  const bd = r.healthBreakdown || {};
  const fc = r.forecast || {};
  const rk = r.riskAssessment || {};
  const sw = r.swot || {};
  const pl = r.actionPlan || {};
  const valAI = a => ({
    action: safeStr(a?.action),
    owner: safeStr(a?.owner),
    deadline: safeStr(a?.deadline),
    kpi: safeStr(a?.kpi),
  });

  return {
    healthScore: clamp(r.healthScore),
    healthBreakdown: {
      salesPerformance: clamp(bd.salesPerformance),
      productMix: clamp(bd.productMix),
      outletCoverage: clamp(bd.outletCoverage),
      salesmanProductivity: clamp(bd.salesmanProductivity),
      operationalEfficiency: clamp(bd.operationalEfficiency),
    },
    summary: safeStr(r.summary),
    keyMetrics: safeArr(r.keyMetrics).map(m => ({
      label: safeStr(m?.label),
      value: safeStr(m?.value),
      trend: oneOf(m?.trend, ['up', 'down', 'flat'], 'flat'),
      insight: safeStr(m?.insight),
      factId: safeStr(m?.factId),
    })),
    forecast: {
      direction: oneOf(fc.direction, ['up', 'down', 'flat'], 'flat'),
      confidence: oneOf(fc.confidence, ['low', 'medium', 'high'], 'medium'),
      reasoning: safeStr(fc.reasoning),
    },
    riskAssessment: {
      overallLevel: oneOf(rk.overallLevel, ['low', 'medium', 'high', 'critical'], 'medium'),
      concentrationRisk: safeStr(rk.concentrationRisk),
      topRisks: safeArr(rk.topRisks).map(x => ({
        risk: safeStr(x?.risk),
        impact: oneOf(x?.impact, ['low', 'medium', 'high'], 'medium'),
        likelihood: oneOf(x?.likelihood, ['low', 'medium', 'high'], 'medium'),
        mitigation: safeStr(x?.mitigation),
      })),
    },
    swot: {
      strengths: safeArr(sw.strengths).map(String),
      weaknesses: safeArr(sw.weaknesses).map(String),
      opportunities: safeArr(sw.opportunities).map(String),
      threats: safeArr(sw.threats).map(String),
    },
    opportunities: safeArr(r.opportunities).map(o => ({
      title: safeStr(o?.title),
      description: safeStr(o?.description),
      potentialImpact: oneOf(o?.potentialImpact, ['low', 'medium', 'high'], 'medium'),
      effort: oneOf(o?.effort, ['low', 'medium', 'high'], 'medium'),
      timeframe: safeStr(o?.timeframe),
    })),
    insights: safeArr(r.insights).map((i, idx) => {
      const out = {
        id: i.id || `insight-${idx}`,
        source: 'ai',
        severity: oneOf(i.severity, ['critical', 'high', 'growth', 'info'], 'info'),
        category: safeStr(i.category) || 'General',
        title: safeStr(i.title),
        desc: safeStr(i.desc),
        expectedImpact: safeStr(i.expectedImpact),
        priority: Number(i.priority) || 5,
        techActions: safeArr(i.techActions).map(String),
        nonTechnicalActions: safeArr(i.nonTechnicalActions).map(String),
        citedFacts: safeArr(i.citedFacts).map(String),
      };
      if (i.actionData) {
        const clean = sanitizeActionData(i.actionData, ctx);
        if (clean) out.actionData = clean;
      }
      return out;
    }),
    quickWins: safeArr(r.quickWins).map(w => ({
      action: safeStr(w?.action),
      expectedOutcome: safeStr(w?.expectedOutcome),
      effort: oneOf(w?.effort, ['low', 'medium', 'high'], 'medium'),
      owner: safeStr(w?.owner),
    })),
    actionPlan: {
      shortTerm: safeArr(pl.shortTerm).map(valAI),
      midTerm: safeArr(pl.midTerm).map(valAI),
      longTerm: safeArr(pl.longTerm).map(valAI),
    },
    kpisToMonitor: safeArr(r.kpisToMonitor).map(k => ({
      metric: safeStr(k?.metric),
      current: safeStr(k?.current),
      target: safeStr(k?.target),
      frequency: safeStr(k?.frequency),
    })),
  };
}

/* ══════════════════════════════════════════════════════════════════ */
/* DETERMINISTIC METRICS FALLBACK                                     */
/* ══════════════════════════════════════════════════════════════════ */
export function generateDeterministicMetrics(pack, health) {
  const m = [];

  m.push({
    label: 'Omset Periode',
    value: formatIDR(pack.omset),
    trend: pack.growth.lm == null ? 'flat'
      : pack.growth.lm > 2 ? 'up'
      : pack.growth.lm < -2 ? 'down' : 'flat',
    insight: pack.growth.lm != null
      ? `${formatSignedPercent(pack.growth.lm, 1)} vs bulan lalu`
      : 'Tanpa pembanding',
    factId: 'P_OMSET',
  });

  if (pack.omset && pack.weeks) {
    m.push({
      label: 'Omset/Minggu',
      value: `${formatIDR(pack.omset / pack.weeks)}/mgg`,
      trend: 'flat',
      insight: `${pack.weeks} minggu`,
      factId: 'P_WEEKLY',
    });
  }

  if (pack.qtyCarton != null) {
    m.push({
      label: 'Qty Karton',
      value: `${pack.qtyCarton.toFixed(1)} ktn`,
      trend: 'flat',
      insight: pack.weeks ? `${(pack.qtyCarton / pack.weeks).toFixed(1)} ktn/mgg` : '',
      factId: 'P_QTY_KTN',
    });
  }

  m.push({
    label: 'Return Rate',
    value: pack.retRate.toFixed(2) + '%',
    trend: pack.retRate <= BENCHMARKS.returnRateGood
      ? 'up'
      : pack.retRate >= BENCHMARKS.returnRateBad
        ? 'down' : 'flat',
    insight: pack.retRate <= BENCHMARKS.returnRateGood
      ? 'Dalam batas sehat'
      : 'Perlu perhatian',
    factId: 'P_RET_RATE',
  });

  m.push({
    label: 'Coverage Outlet',
    value: pack.coverage != null ? pack.coverage.toFixed(1) + '%' : '—',
    trend: pack.coverage == null ? 'flat'
      : pack.coverage >= BENCHMARKS.coverageGood ? 'up'
      : pack.coverage < BENCHMARKS.coverageMin ? 'down' : 'flat',
    insight: `${pack.oa} dari ${pack.masterCount}`,
    factId: 'P_COVERAGE',
  });

  if (pack.dataQuality) {
    m.push({
      label: 'Data Quality',
      value: `${pack.dataQuality.qualityScore}/100`,
      trend: pack.dataQuality.qualityScore >= 80 ? 'up'
        : pack.dataQuality.qualityScore < 60 ? 'down' : 'flat',
      insight: `Fresh ${pack.dataQuality.daysStale}h · coverage ${pack.dataQuality.dayCoverage.toFixed(0)}%`,
      factId: 'Q_SCORE',
    });
  }

  m.push({
    label: 'Efektif Call',
    value: pack.ec.toFixed(1) + ' toko/HK',
    trend: pack.ec >= 15 ? 'up' : pack.ec < BENCHMARKS.ecMin ? 'down' : 'flat',
    insight: 'Kunjungan efektif/hari kerja',
    factId: 'P_EC',
  });

  m.push({
    label: 'Item/Transaksi',
    value: pack.ipt.toFixed(2),
    trend: pack.ipt >= 5 ? 'up' : pack.ipt < BENCHMARKS.iptMin ? 'down' : 'flat',
    insight: pack.ipt >= BENCHMARKS.iptGood ? 'Basket excellent' : 'Perlu upselling',
    factId: 'P_IPT',
  });

  return m;
}