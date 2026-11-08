/* ================================================================== */
/* INSIGHT PROMPT BUILDER — self-contained                            */
/* ================================================================== */

/* ══════════════════════════════════════════════════════════════════ */
/* FORMAT HELPERS                                                     */
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

/* ══════════════════════════════════════════════════════════════════ */
/* NAME MATCHING                                                      */
/* ══════════════════════════════════════════════════════════════════ */
const TYPE_FIELD_MAP = {
  salesman: ['salesman', 'sales', 'spg'],
  product: ['product', 'produk', 'item', 'sku'],
  outlet: ['outlet', 'toko', 'store'],
};

export function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function matchValidName(input, whitelist) {
  if (!input || !whitelist || whitelist.length === 0) return null;
  const normInput = normalizeName(input);
  if (!normInput) return null;
  for (const w of whitelist) if (normalizeName(w) === normInput) return w;
  const subMatches = whitelist.filter(w => {
    const nw = normalizeName(w);
    return nw.startsWith(normInput) || normInput.startsWith(nw) || nw.includes(normInput) || normInput.includes(nw);
  });
  if (subMatches.length === 1) return subMatches[0];
  if (subMatches.length > 1) {
    return subMatches.reduce((best, w) =>
      Math.abs(w.length - input.length) < Math.abs(best.length - input.length) ? w : best, subMatches[0]);
  }
  const inputTokens = normInput.split(' ').filter(t => t.length >= 3);
  if (inputTokens.length === 0) return null;
  let best = null, bestScore = 0, bestCount = 0;
  for (const w of whitelist) {
    const wTokens = normalizeName(w).split(' ');
    const common = inputTokens.filter(t => wTokens.some(wt => wt === t || wt.startsWith(t) || t.startsWith(wt))).length;
    if (common > bestScore) { bestScore = common; best = w; bestCount = 1; }
    else if (common === bestScore && common > 0) { bestCount++; }
  }
  return (bestScore > 0 && bestCount === 1) ? best : null;
}

export function buildValidNamesMap(rows) {
  const sample = rows[0] || {};
  const fields = Object.keys(sample);
  const validNamesByField = {};
  const typeToField = {};
  for (const type in TYPE_FIELD_MAP) {
    const field = fields.find(f => TYPE_FIELD_MAP[type].some(c => f.toLowerCase() === c));
    if (!field) continue;
    const set = new Set();
    for (const r of rows) { const v = r[field]; if (v != null && v !== '') set.add(String(v)); }
    if (set.size === 0) continue;
    validNamesByField[field] = Array.from(set).sort();
    typeToField[type] = field;
  }
  return { validNamesByField, typeToField };
}

/* ══════════════════════════════════════════════════════════════════ */
/* RESPONSE SCHEMA                                                    */
/* ══════════════════════════════════════════════════════════════════ */
const ACTION_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string' }, owner: { type: 'string' },
    deadline: { type: 'string' }, kpi: { type: 'string' },
  },
  required: ['action', 'owner', 'deadline', 'kpi'],
};

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    healthScore: { type: 'integer' },
    healthBreakdown: {
      type: 'object',
      properties: {
        salesPerformance: { type: 'integer' }, productMix: { type: 'integer' },
        outletCoverage: { type: 'integer' }, salesmanProductivity: { type: 'integer' },
        operationalEfficiency: { type: 'integer' },
      },
      required: ['salesPerformance', 'productMix', 'outletCoverage', 'salesmanProductivity', 'operationalEfficiency'],
    },
    summary: { type: 'string' },
    keyMetrics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' }, value: { type: 'string' },
          trend: { type: 'string', enum: ['up', 'down', 'flat'] },
          insight: { type: 'string' }, factId: { type: 'string' },
        },
        required: ['label', 'value', 'trend', 'insight'],
      },
    },
    forecast: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'flat'] },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        reasoning: { type: 'string' },
      },
      required: ['direction', 'confidence', 'reasoning'],
    },
    riskAssessment: {
      type: 'object',
      properties: {
        overallLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        concentrationRisk: { type: 'string' },
        topRisks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              risk: { type: 'string' },
              impact: { type: 'string', enum: ['low', 'medium', 'high'] },
              likelihood: { type: 'string', enum: ['low', 'medium', 'high'] },
              mitigation: { type: 'string' },
            },
            required: ['risk', 'impact', 'likelihood', 'mitigation'],
          },
        },
      },
      required: ['overallLevel', 'concentrationRisk', 'topRisks'],
    },
    swot: {
      type: 'object',
      properties: {
        strengths: { type: 'array', items: { type: 'string' } },
        weaknesses: { type: 'array', items: { type: 'string' } },
        opportunities: { type: 'array', items: { type: 'string' } },
        threats: { type: 'array', items: { type: 'string' } },
      },
      required: ['strengths', 'weaknesses', 'opportunities', 'threats'],
    },
    opportunities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' }, description: { type: 'string' },
          potentialImpact: { type: 'string', enum: ['low', 'medium', 'high'] },
          effort: { type: 'string', enum: ['low', 'medium', 'high'] },
          timeframe: { type: 'string' },
        },
        required: ['title', 'description', 'potentialImpact', 'effort', 'timeframe'],
      },
    },
    insights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'growth', 'info'] },
          category: { type: 'string' }, title: { type: 'string' }, desc: { type: 'string' },
          expectedImpact: { type: 'string' }, priority: { type: 'integer' },
          techActions: { type: 'array', items: { type: 'string' } },
          nonTechnicalActions: { type: 'array', items: { type: 'string' } },
          citedFacts: { type: 'array', items: { type: 'string' } },
          actionData: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['salesman', 'product', 'outlet'] },
              keys: { type: 'array', items: { type: 'string' } },
            },
            required: ['type', 'keys'],
          },
        },
        required: ['severity', 'category', 'title', 'desc', 'techActions', 'nonTechnicalActions', 'citedFacts'],
      },
    },
    quickWins: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' }, expectedOutcome: { type: 'string' },
          effort: { type: 'string', enum: ['low', 'medium', 'high'] }, owner: { type: 'string' },
        },
        required: ['action', 'expectedOutcome', 'effort', 'owner'],
      },
    },
    actionPlan: {
      type: 'object',
      properties: {
        shortTerm: { type: 'array', items: ACTION_ITEM_SCHEMA },
        midTerm: { type: 'array', items: ACTION_ITEM_SCHEMA },
        longTerm: { type: 'array', items: ACTION_ITEM_SCHEMA },
      },
      required: ['shortTerm', 'midTerm', 'longTerm'],
    },
    kpisToMonitor: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          metric: { type: 'string' }, current: { type: 'string' },
          target: { type: 'string' }, frequency: { type: 'string' },
        },
        required: ['metric', 'current', 'target', 'frequency'],
      },
    },
  },
  required: ['healthScore', 'healthBreakdown', 'summary', 'keyMetrics', 'forecast', 'riskAssessment', 'swot', 'opportunities', 'insights', 'quickWins', 'actionPlan', 'kpisToMonitor'],
};

/* ══════════════════════════════════════════════════════════════════ */
/* FACTS BLOCK                                                        */
/* ══════════════════════════════════════════════════════════════════ */
export function buildFactsBlock(pack, health, seeds) {
  let out = '\n=== FAKTA MUTLAK (WAJIB CITE PERSIS — JANGAN UBAH ANGKA) ===\n';
  out += 'Setiap baris punya ID. Saat menulis insight, WAJIB isi "citedFacts" dengan ID (min 1, max 3).\n';
  out += 'Saat menyebut nominal, COPY nilai dari [FORMATTED]. DILARANG hitung ulang.\n\n';

  const dump = (label, section) => {
    const items = pack.sections[section] || [];
    if (items.length === 0) return;
    out += `── ${label} ──\n`;
    items.forEach(f => { out += `[${f.id}] ${f.label} = ${f.formatted}\n`; });
    out += '\n';
  };

  dump('PERIOD', 'period');
  dump('GROWTH vs LM/LY/WoW/SWLY', 'growth');
  dump('TREND & REGRESSION', 'trend');
  dump('CONCENTRATION / PARETO', 'concentration');
  dump('RANKING (Top-5 & Matrix)', 'ranking');
  dump('COHORT (New / Retained / Churning)', 'cohort');
  dump('DATA QUALITY', 'quality');
  dump('ANOMALY (statistical & bisnis)', 'anomaly');

  if (pack.targetFacts && pack.targetFacts.hasTarget) {
    const tf = pack.targetFacts;
    out += '── TARGET vs ACTUAL ──\n';
    out += `[TG_GLOBAL] Target omset global = ${formatIDR(tf.globalTarget)}\n`;
    out += `[TG_ACTUAL] Omset actual = ${formatIDR(tf.globalActual)}\n`;
    out += `[TG_PCT] Pencapaian = ${tf.globalPct.toFixed(1)}% (expected ${tf.paceExpected.toFixed(1)}% at this pace)\n`;
    out += `[TG_GAP] Gap ke target = ${formatIDR(tf.globalGap)}\n`;
    out += `[TG_PACE] Pace delta = ${tf.paceDelta >= 0 ? '+' : ''}${tf.paceDelta.toFixed(1)}% ${tf.paceDelta >= 5 ? '(ON TRACK)' : tf.paceDelta >= -5 ? '(AT RISK)' : '(BEHIND)'}\n`;
    out += `[TG_PROJ] Projected omset end-of-month = ${formatIDR(tf.projectedOmset)}\n`;
    out += `[TG_SALESMAN] ${tf.total} salesman punya target, ${tf.achieving} achieve (>=100%), ${tf.critical} kritis (<75%)\n\n`;
  }

  if (pack.cohortDeepDive) {
    const cd = pack.cohortDeepDive;
    out += '── COHORT DEEP DIVE ──\n';
    out += `[CD_NEW] Outlet baru (30 hari) = ${cd.newCount} outlet (revenue ${formatIDR(cd.newRevenue)})\n`;
    out += `[CD_CHURN] Outlet churning = ${cd.churningCount} outlet (revenue hilang ${formatIDR(cd.lostRevenue)})\n`;
    out += `[CD_RETAINED] Outlet retained = ${cd.retainedCount} outlet\n`;
    out += `[CD_RETENTION] Retention rate = ${cd.retentionRate.toFixed(1)}% (churn ${cd.churnRate.toFixed(1)}%)\n`;
    out += `[CD_ACQ] Acquisition rate = ${cd.acquisitionRate.toFixed(1)}%\n`;
    out += `[CD_NET] Net change = ${cd.netChange >= 0 ? '+' : ''}${cd.netChange} outlet\n\n`;
  }

  if (pack.returnDeepDive && pack.returnDeepDive.hasReturns) {
    const rd = pack.returnDeepDive;
    out += '── RETURN DEEP DIVE ──\n';
    out += `[RD_TOTAL] Total return = ${formatIDR(rd.totalReturn)} dari gross ${formatIDR(rd.grossF)} (rate ${rd.retRate.toFixed(2)}%)\n`;
    out += `[RD_COUNT] Jumlah transaksi return = ${rd.returnCount} (di ${rd.uniqueOutlets} outlet)\n`;
    out += `[RD_PARETO] ${rd.pareto80Count} outlet (${rd.pareto80Rate.toFixed(1)}%) menyumbang 80% return\n`;
    if (rd.topProducts.length) {
      out += `[RD_TOP_PRODUCT] Top return by product: ${rd.topProducts.slice(0, 3).map(p => `${p.name} (${formatIDR(p.amount)})`).join(' | ')}\n`;
    }
    if (rd.topOutlets.length) {
      out += `[RD_TOP_OUTLET] Top return by outlet: ${rd.topOutlets.slice(0, 3).map(o => `${o.name} (${formatIDR(o.amount)})`).join(' | ')}\n`;
    }
    out += '\n';
  }

  out += '── HEALTH SCORE (DETERMINISTIK — JANGAN KARANG) ──\n';
  out += `[HEALTH_SCORE] Overall = ${health.overall}/100\n`;
  out += `  salesPerformance = ${health.salesPerformance}\n`;
  out += `  productMix = ${health.productMix}\n`;
  out += `  outletCoverage = ${health.outletCoverage}\n`;
  out += `  salesmanProductivity = ${health.salesmanProductivity}\n`;
  out += `  operationalEfficiency = ${health.operationalEfficiency}\n`;
  out += 'GUNAKAN ANGKA INI PERSIS untuk "healthScore" dan "healthBreakdown".\n\n';

  if (seeds && seeds.length) {
    out += '── SEED INSIGHTS (SUDAH DIHITUNG — boleh elaborasi / tidak duplikat) ──\n';
    seeds.forEach(s => { out += `[${s.id}] ${s.severity.toUpperCase()} · ${s.title}\n`; });
    out += '\n';
  }

  out += '=== END FAKTA MUTLAK ===\n';
  return out;
}

/* ══════════════════════════════════════════════════════════════════ */
/* VALID NAMES BLOCK                                                  */
/* ══════════════════════════════════════════════════════════════════ */
export function buildValidNamesBlock(pack) {
  const { validNamesByField, typeToField } = buildValidNamesMap(pack.rows);
  const label = { salesman: 'SALESMAN', product: 'PRODUK', outlet: 'OUTLET' };
  let out = '\n=== DAFTAR NAMA VALID (WAJIB COPY PERSIS jika menyebut) ===\n';
  let hasAny = false;
  for (const type of ['salesman', 'product', 'outlet']) {
    const fld = typeToField[type];
    if (!fld) continue;
    hasAny = true;
    const names = validNamesByField[fld] || [];
    out += `\n[${label[type]}] field "${fld}" (${names.length} nama):\n`;
    out += names.slice(0, 80).map(n => `- ${n}`).join('\n');
    if (names.length > 80) out += `\n- ... dan ${names.length - 80} lainnya`;
    out += '\n';
  }
  if (!hasAny) out += '\n(Tidak ada field terdeteksi — JANGAN pakai actionData.)\n';
  return out + '=== END ===\n';
}

/* ══════════════════════════════════════════════════════════════════ */
/* PLAYBOOK BLOCK                                                     */
/* ══════════════════════════════════════════════════════════════════ */
function buildPlaybookBlock(playbooks) {
  if (!playbooks || playbooks.length === 0) return '';
  let out = '\n=== PLAYBOOK TERBUKTI (dari periode lalu — adaptasi, JANGAN copy-paste mentah) ===\n';
  playbooks.forEach((pb, i) => {
    out += `\n[Playbook ${i + 1}] Problem: ${pb.problem}\n  Action: ${pb.action}\n  Outcome: ${pb.outcome}\n`;
  });
  out += '\n(Gunakan playbook di atas sebagai referensi. Sesuaikan dengan konteks periode ini.)\n';
  return out;
}

/* ══════════════════════════════════════════════════════════════════ */
/* MAIN PROMPT                                                        */
/* ══════════════════════════════════════════════════════════════════ */
export function buildPrompt(pack, health, seeds, state, playbooks = []) {
  const factsBlock = buildFactsBlock(pack, health, seeds);
  const namesBlock = buildValidNamesBlock(pack);
  const playbookBlock = buildPlaybookBlock(playbooks);

  const cleanData = {
    totalRows: pack.totalRows,
    activeFilters: {
      periode: { from: state.filters.from || null, to: state.filters.to || null },
      salesman: state.filters.salesman ? Array.from(state.filters.salesman) : [],
      divisi: state.filters.divisi ? Array.from(state.filters.divisi) : [],
      produk: state.filters.produk ? Array.from(state.filters.produk) : [],
      outlet: state.filters.outlet ? Array.from(state.filters.outlet) : [],
    },
    computedHealth: health,
  };

  return `Anda adalah Konsultan Bisnis Senior & Data Analyst Expert untuk distributor FMCG Indonesia.

TUGAS: Buat LAPORAN KONSULTAN 12-MODUL + insight target/cohort/return. Semua angka sudah dihitung deterministik — Anda HANYA menarasikan, memprioritaskan, dan mengusulkan aksi.

=== KONTEKS DATA ===
${JSON.stringify(cleanData, null, 2)}

${factsBlock}
${namesBlock}
${playbookBlock}

⚠️ ATURAN ANGKA (PELANGGARAN = LAPORAN SALAH):
1. Setiap nominal di output HARUS di-COPY dari kolom [FORMATTED] fakta dengan ID yang Anda rujuk.
2. DILARANG menghitung ulang, membulatkan berbeda, atau mengubah magnitude.
3. Jika butuh persentase yang tidak ada, hitung dari FAKTA ber-ID, bulatkan 1-2 desimal.
4. HEALTH SCORE & healthBreakdown WAJIB sama persis dengan [HEALTH_SCORE].
5. Untuk setiap insight, WAJIB isi "citedFacts" (minimal 1, maksimal 3).
6. keyMetrics: value = formatted dari FAKTA, isi "factId" dengan ID terkait.
7. Jangan sebut nama performer yang tidak ada di DAFTAR NAMA VALID.
8. Perbandingan TOTAL vs TOTAL: pakai [G_GROWTH_LM_TOTAL] / [G_GROWTH_LY_TOTAL].
   Perbandingan WEEKLY (per minggu): pakai [G_GROWTH_LM] / [G_GROWTH_LY].
   JANGAN mencampur — total current vs total LM WAJIB pakai growth-total.

⚠️ ATURAN UNIT — WAJIB DIBACA:

Field-field PER MINGGU (HANYA field ini yang boleh disebut dengan suffix "/minggu"):
- P_WEEKLY, P_QTY_KTN_WEEKLY
- G_CUR_WEEKLY, G_LM_WEEKLY, G_AVG5W, G_AVG13W
- C_TOP_PRODUCT_WEEKLY, C_TOP_OUTLET_WEEKLY, C_TOP_SALESMAN_WEEKLY, C_TOP_SUBBRAND_WEEKLY

Field-field TOTAL PERIODE (DILARANG KERAS menambahkan "/minggu" saat menyebutnya):
- P_OMSET, P_GROSS_F, P_GROSS_R, P_AVG_OA, P_QTY_KTN
- G_CUR, G_LM, G_LY
- C_TOP_PRODUCT, C_TOP_OUTLET, C_TOP_SALESMAN, C_TOP_SUBBRAND
- R_TOP_PRODUCT, R_TOP_OUTLET, R_TOP_SALESMAN, R_TOP_SUBBRAND

CONTOH BENAR:
- "Total omset Rp 44 juta (2 minggu), setara Rp 22 juta/minggu."
- "Torabika menyumbang Rp 7 juta total periode, atau Rp 3,5 juta/minggu."

CONTOH SALAH (magnitude salah 4x lipat):
- "Torabika menyumbang Rp 7 juta/minggu" (padahal 7 juta adalah TOTAL 2 minggu)

⚠️ CHECKLIST WAJIB (SETIAP ITEM HARUS MUNCUL di summary/forecast/keyMetrics):

1. TOTAL OMSET PERIODE + OMSET PER MINGGU (dari [P_OMSET] dan [P_WEEKLY]).
2. QTY KARTON total dan per minggu (dari [P_QTY_KTN] dan [P_QTY_KTN_WEEKLY]).
3. GROWTH — aturan naratif WAJIB:
   a. Selalu cek [G_PERIOD_CONTEXT] dulu. Jika current vs LM jumlah minggunya BERBEDA,
      JANGAN tulis "kontraksi/penurunan X%" secara mentah — pembaca akan salah paham.
      WAJIB tulis narasi seperti:
      "Perbandingan total X% perlu dibaca dengan konteks: current N minggu vs LM M minggu.
       Pada basis weekly, growth sebenarnya [+Y%/-Y%] ([G_GROWTH_LM])."
   b. Jika [G_GROWTH_LM_TOTAL] dan [G_GROWTH_LM] menunjukkan ARAH BERBEDA
      (satu + dan satu -), WAJIB sebut keduanya dan jelaskan penyebabnya
      (perbedaan jumlah minggu dalam periode).
   c. Jika weeks sama (tidak mismatch), pakai [G_GROWTH_LM_TOTAL] sebagai
      perbandingan utama — tidak perlu mention [G_GROWTH_LM] (weekly).
   d. Jika hanya salah satu tersedia, sebut yang tersedia saja.
4. GROWTH vs LY atau SWLY (dari [G_GROWTH_LY_TOTAL] / [G_GROWTH_LY] / [G_GROWTH_SWLY]).
5. AVG 5 & 13 MINGGU (dari [G_AVG5W] / [G_AVG13W]) di forecast.reasoning.
6. DATA QUALITY — WAJIB sebut KETIGA-nya sekaligus (jangan hanya 1 atau 2):
   - [Q_FRESHNESS]: jika "0 hari", tulis "data terbaru hari ini"; jika >0, tulis "X hari sejak data terakhir".
   - [Q_DAY_COVERAGE]: WAJIB sebutkan nilai + interpretasi (misal "71.4% (10/14 hari)" → "coverage hari cukup/rendah").
   - [Q_SCORE]: sebut score + label (100 = prima, 60-79 = waspada, <60 = kritis).
7. COHORT: retention rate, churn, new outlets (dari [CD_RETENTION], [CD_CHURN], [CD_NEW]).
8. RETURN: return rate + top outlet return (dari [RD_TOTAL], [RD_TOP_OUTLET]).
9. TARGET: jika [TG_GLOBAL] ada, sebut pencapaian target, pace delta, dan projected omset.
10. STATISTICAL ANOMALY (dari [A_SM_Z_*]) jika ada.
11. REGRESSION ([T_REGRESSION]) jika tersedia.
12. keyMetrics HARUS memuat minimal 5 KPI: Omset, Qty Karton, Return Rate, Coverage, Growth vs LM/LY.

INSTRUKSI OUTPUT (12 MODUL):

1. healthScore: integer = HEALTH_SCORE.overall (JANGAN dihitung ulang).
2. healthBreakdown: 5 sub-skor = HEALTH_SCORE values persis.
3. summary: 2-3 paragraf. Sebut angka spesifik dengan bold **. WAJIB sebut total periode, per minggu, dan data quality signal.
4. keyMetrics: 5-7 KPI. value = formatted dari FAKTA. Set factId = ID fakta.
5. forecast: direction/confidence/reasoning. Rujuk [T_MOMENTUM], [T_REGRESSION], [G_GROWTH_LM_TOTAL], [G_AVG5W], [G_AVG13W], [TG_PACE].
6. riskAssessment: overallLevel + concentrationRisk + topRisks. Sertakan cohort churn dan return rate sebagai risiko.
7. swot: 3-5 poin per kuadran berbasis angka dari FAKTA.
8. opportunities: 2-4 peluang (impact/effort/timeframe).
9. insights: 3-7 rekomendasi. Seed insights di atas SUDAH ADA — boleh sempurnakan atau tambah insight baru yang TIDAK duplikat.
10. quickWins: 3-5 aksi cepat.
11. actionPlan: shortTerm/midTerm/longTerm — { action, owner, deadline, kpi }.
12. kpisToMonitor: 4-6 KPI { metric, current, target, frequency }. current dari FAKTA.

Bahasa Indonesia profesional. Tanpa mengarang. Fokus dampak bisnis terbesar.`;
}

/* ══════════════════════════════════════════════════════════════════ */
/* CRITIQUE PROMPT (Multi-pass Pass 2)                                */
/* ══════════════════════════════════════════════════════════════════ */
export function buildCritiquePrompt(draft, pack) {
  const zeroHealth = { overall: 0, salesPerformance: 0, productMix: 0, outletCoverage: 0, salesmanProductivity: 0, operationalEfficiency: 0 };
  const factsBlock = buildFactsBlock(pack, zeroHealth, []);
  return `Anda adalah Quality Auditor Senior. Kritik laporan konsultan berikut dengan TAJAM.

LAPORAN DRAFT:
${JSON.stringify(draft, null, 2)}

FAKTA MUTLAK (untuk verifikasi):
${factsBlock}

TUGAS: Cari masalah:
1. HALLUCINATION — angka yang tidak ada di FAKTA MUTLAK
2. UNSUPPORTED — klaim tanpa citedFacts
3. GENERIC — insight klise
4. UNIT_ERROR — nominal total disebut "/minggu"
5. CONTRADICTION
6. COVERAGE_GAP — checklist wajib tidak muncul (Qty Karton, cohort, data quality, return, target, regression, z-score)
7. GROWTH_MISMATCH:
   a. Total omset [P_OMSET] dipasangkan dengan growth weekly [G_GROWTH_LM] (salah ID).
   b. Kalau [G_PERIOD_CONTEXT] menunjukkan weeks_mismatch = true, tapi narasi summary
      hanya menulis "kontraksi X%" tanpa menjelaskan perbedaan minggu → flag sebagai issue.
   c. Kalau total & weekly growth arahnya berbeda tapi AI hanya sebut salah satu → flag.
8. COVERAGE_GAP_KETAT — summary TIDAK menyebut salah satu dari [Q_FRESHNESS], [Q_DAY_COVERAGE],
   [Q_SCORE] secara eksplisit → flag sebagai coverage_gap.

Output JSON:
{
  "issues": [{"severity": "high|medium|low", "type": "hallucination|unsupported|generic|unit_error|contradiction|coverage_gap|growth_mismatch", "location": "...", "detail": "...", "suggestion": "..."}],
  "qualityScore": 0-100,
  "needsRefine": boolean
}

needsRefine = true jika ada minimal 1 issue severity "high" ATAU >2 issue severity "medium".
Jika laporan baik, set needsRefine = false dan qualityScore >= 80.`;
}

/* ══════════════════════════════════════════════════════════════════ */
/* REFINE PROMPT (Multi-pass Pass 3)                                  */
/* ══════════════════════════════════════════════════════════════════ */
export function buildRefinePrompt(draft, critique, pack, playbooks = []) {
  const zeroHealth = { overall: 0, salesPerformance: 0, productMix: 0, outletCoverage: 0, salesmanProductivity: 0, operationalEfficiency: 0 };
  const factsBlock = buildFactsBlock(pack, zeroHealth, []);
  let pbBlock = '';
  if (playbooks.length > 0) {
    pbBlock = '\n=== PLAYBOOK TERBUKTI ===\n';
    playbooks.forEach((pb, i) => {
      pbBlock += `\n[Playbook ${i + 1}] Problem: ${pb.problem}\n  Action: ${pb.action}\n  Outcome: ${pb.outcome}\n`;
    });
  }
  return `Perbaiki laporan konsultan berikut berdasarkan audit.

LAPORAN DRAFT:
${JSON.stringify(draft, null, 2)}

HASIL AUDIT:
${JSON.stringify(critique.issues, null, 2)}
${pbBlock}

FAKTA MUTLAK:
${factsBlock}

ATURAN PERBAIKAN:
1. Semua angka WAJIB dari FAKTA MUTLAK
2. Setiap insight WAJIB punya citedFacts valid
3. Hapus insight generik — ganti SPESIFIK
4. Perbaiki suffix "/minggu"
5. Lengkapi checklist (Qty Karton, cohort, data quality, return, target)
6. Growth total: pakai [G_GROWTH_LM_TOTAL] untuk perbandingan total vs total.
   Jika [G_PERIOD_CONTEXT] menunjukkan weeks mismatch, WAJIB jelaskan konteksnya.
7. WAJIB sebut KETIGA data quality: [Q_FRESHNESS], [Q_DAY_COVERAGE], [Q_SCORE].
8. Jangan hapus insight bagus — hanya perbaiki yang bermasalah
9. Integrasikan playbook jika relevan

Output: JSON schema SAMA seperti draft, sudah diperbaiki.`;
}