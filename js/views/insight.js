import { esc } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { store } from '../core/store.js';
import { selectFiltered } from '../core/selectors.js';
import { registerView } from './registry.js';
import { openModal, toast } from '../ui/feedback.js';

/* ================================================================== */
/* KONFIGURASI                                                         */
/* ================================================================== */
const PREFERRED_MODELS = [
  'gemini-3.6-flash', 'gemini-3.1-flash', 'gemini-3.1-flash-lite',
  'gemini-3-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
];
const MODELS_CACHE_KEY = 'gemini_active_model';
const API_KEY_STORAGE = 'gemini_api_key';

let cachedModel = localStorage.getItem(MODELS_CACHE_KEY) || PREFERRED_MODELS[0];
let isAnalyzing = false;
let aiResult = null;
let aiMeta = null;
let loadingInterval = null;

/* ================================================================== */
/* NUMBER PARSING & FORMATTING (KUNCI FIX)                             */
/* ================================================================== */
/**
 * Parse angka dari berbagai format: number, "200000000",
 * "Rp 200.000.000", "200,000,000", "200.000.000,50", "200,000,000.50"
 */
function parseNumber(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v !== 'string') return 0;
  let s = v.replace(/[^\d,.-]/g, '');
  if (!s) return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    // Ada dua separator — yang terakhir adalah desimal
    if (lastComma > lastDot) {
      // Indonesian: 1.234.567,89
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // English: 1,234,567.89
      s = s.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    // Hanya koma — cek apakah desimal (1-2 digit) atau ribuan
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastDot !== -1) {
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length <= 2) { /* desimal */ }
    else s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function formatIDR(n) {
  const abs = Math.abs(n);
  const fmt = (x, d=2) => x.toFixed(d).replace('.', ',');
  if (abs >= 1e12) return `Rp ${fmt(n/1e12)} triliun`;
  if (abs >= 1e9)  return `Rp ${fmt(n/1e9)} miliar`;
  if (abs >= 1e6)  return `Rp ${fmt(n/1e6)} juta`;
  if (abs >= 1e3)  return `Rp ${fmt(n/1e3,1)} ribu`;
  return `Rp ${n.toLocaleString('id-ID')}`;
}

function formatNumber(n) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n/1e9).toFixed(2).replace('.', ',')} M`;
  if (abs >= 1e6) return `${(n/1e6).toFixed(2).replace('.', ',')} jt`;
  if (abs >= 1e3) return `${(n/1e3).toFixed(1).replace('.', ',')} rb`;
  return n.toLocaleString('id-ID');
}

function detectFieldUnit(fieldName, sampleValues) {
  const name = String(fieldName || '').toLowerCase();
  if (/omset|revenue|penjualan|sales|nilai|amount|total|harga|rp|rupiah|gmv/i.test(name)) return 'currency';
  if (/persen|percent|rate|ratio|margin|growth/i.test(name)) return 'percent';
  if (/qty|quantity|jumlah|unit|pcs|karton|box|pax|volume|ekor|ton|kg/i.test(name)) return 'quantity';
  // Fallback by magnitude: kalau angka rata-rata > 100.000 → kemungkinan besar currency
  const nums = sampleValues.filter(v => typeof v === 'number' && v > 0);
  if (nums.length > 0) {
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    if (avg > 1e5) return 'currency';
    if (avg > 1e3) return 'quantity';
  }
  return 'count';
}

function formatByUnit(n, unit) {
  if (unit === 'currency') return formatIDR(n);
  if (unit === 'percent') return `${n.toFixed(2).replace('.', ',')}%`;
  if (unit === 'quantity') return `${formatNumber(n)} unit`;
  return formatNumber(n);
}

/* ================================================================== */
/* API KEY                                                             */
/* ================================================================== */
const getApiKey = () => localStorage.getItem(API_KEY_STORAGE) || '';
const setApiKey = (k) => localStorage.setItem(API_KEY_STORAGE, k.trim());

function promptApiKey(onSuccess) {
  const html = `
    <div class="modal-h" style="background:#0F172A; color:#fff; padding:20px;">
      <h3 style="font-size:16px; margin:0;">🔑 Konfigurasi Gemini API</h3>
      <button class="x" style="color:#fff;">×</button>
    </div>
    <div class="modal-b" style="padding:20px;">
      <p style="font-size:13px; color:#475569; line-height:1.7; margin-bottom:16px;">
        Masukkan <b>API Key Google Gemini</b>. Dapatkan gratis di
        <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#1D4ED8; font-weight:700;">Google AI Studio</a>.
      </p>
      <input type="password" id="geminiApiKeyInput" placeholder="AIza..."
        value="${esc(getApiKey())}"
        style="width:100%; padding:12px; border:1px solid #CBD5E1; border-radius:8px; font-family:monospace; font-size:13px; margin-bottom:12px; box-sizing:border-box;" />
      <label style="display:flex; align-items:center; gap:8px; font-size:12px; color:#64748B; margin-bottom:16px;">
        <input type="checkbox" id="showApiKeyChk" /> Tampilkan key
      </label>
      <button id="saveApiKeyBtn" style="width:100%; padding:12px; background:#1D4ED8; color:#fff; border:none; border-radius:8px; font-weight:800; cursor:pointer;">Simpan & Lanjutkan</button>
    </div>`;
  openModal(html);
  const inp = document.getElementById('geminiApiKeyInput');
  document.getElementById('showApiKeyChk').onchange = (e) => { inp.type = e.target.checked ? 'text' : 'password'; };
  document.getElementById('saveApiKeyBtn').onclick = () => {
    const key = inp.value.trim();
    if (!key || key.length < 20) { toast('API key tidak valid'); return; }
    setApiKey(key);
    localStorage.removeItem(MODELS_CACHE_KEY);
    cachedModel = null;
    document.getElementById('modalScrim').classList.remove('on');
    toast('API key tersimpan!');
    onSuccess && onSuccess();
  };
}

/* ================================================================== */
/* AUTO-DETECT MODEL                                                   */
/* ================================================================== */
async function listAvailableModels(apiKey) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200`);
  if (!res.ok) return null;
  const data = await res.json();
  return (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''));
}

async function resolveModel(apiKey) {
  if (cachedModel) return cachedModel;
  const available = await listAvailableModels(apiKey);
  if (!available || available.length === 0) { cachedModel = PREFERRED_MODELS[0]; return cachedModel; }
  for (const pref of PREFERRED_MODELS) {
    const found = available.find(m => m === pref || m.startsWith(pref + '-'));
    if (found) { cachedModel = found; localStorage.setItem(MODELS_CACHE_KEY, found); return found; }
  }
  const flashModels = available
    .filter(m => /flash/i.test(m) && !/vision|embed/i.test(m))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (flashModels.length) { cachedModel = flashModels[0]; localStorage.setItem(MODELS_CACHE_KEY, cachedModel); return cachedModel; }
  cachedModel = available[0];
  localStorage.setItem(MODELS_CACHE_KEY, cachedModel);
  return cachedModel;
}

/* ================================================================== */
/* NAME MATCHING                                                       */
/* ================================================================== */
function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchValidName(input, whitelist) {
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

/* ================================================================== */
/* DATA AGGREGATION (REWRITTEN DENGAN PRE-FORMAT)                      */
/* ================================================================== */
const TYPE_FIELD_PATTERNS = {
  salesman: /salesman|sales|spg|nama.?sales|nama.?spg/i,
  product:  /produk|product|item|barang|sku/i,
  outlet:   /outlet|toko|store|customer|pelanggan/i,
};
function detectFieldForType(fields, type) {
  const rx = TYPE_FIELD_PATTERNS[type];
  return rx ? fields.find(f => rx.test(f)) || null : null;
}

function buildDataSummary(rows, filters) {
  if (!rows || rows.length === 0) return { error: 'no_data' };
  const sample = rows[0];
  const fields = Object.keys(sample);

  // Deteksi field numerik termasuk yang berbentuk string angka
  const numericFields = fields.filter(f => {
    if (typeof sample[f] === 'number') return true;
    if (typeof sample[f] === 'string') {
      const n = parseNumber(sample[f]);
      return n !== 0 || /rp|rupiah/i.test(f);
    }
    return false;
  });

  // Hitung total per field numerik
  const sums = {};
  const units = {};
  const totalsFormatted = {};
  numericFields.forEach(f => {
    const vals = rows.map(r => parseNumber(r[f]));
    const total = vals.reduce((a, b) => a + b, 0);
    sums[f] = Math.round(total * 100) / 100;
    units[f] = detectFieldUnit(f, vals);
    totalsFormatted[f] = formatByUnit(sums[f], units[f]);
  });

  // Breakdown per field string (untuk Pareto)
  const breakdown = {};
  const validNamesByField = {};
  fields.forEach(f => {
    if (typeof sample[f] !== 'string' || f.startsWith('_')) return;
    const unique = new Set(rows.map(r => r[f]).filter(Boolean));
    if (unique.size < 2 || unique.size > 500) return;

    const map = {};
    rows.forEach(r => {
      const k = r[f] || '(kosong)';
      if (!map[k]) { map[k] = { count: 0 }; numericFields.forEach(nf => map[k][nf] = 0); }
      map[k].count++;
      numericFields.forEach(nf => map[k][nf] += parseNumber(r[nf]));
    });

    const primaryNumeric = numericFields[0];
    const sorted = Object.entries(map).map(([k, v]) => ({ name: k, ...v }))
      .sort((a, b) => primaryNumeric ? (b[primaryNumeric] - a[primaryNumeric]) : (b.count - a.count));

    // Pre-format top contributors untuk FACTS
    const topFormatted = sorted.slice(0, 5).map(item => ({
      name: item.name,
      count: item.count,
      value: primaryNumeric ? item[primaryNumeric] : item.count,
      formatted: primaryNumeric
        ? formatByUnit(item[primaryNumeric], units[primaryNumeric])
        : `${item.count} baris`,
      share: primaryNumeric && sums[primaryNumeric] > 0
        ? `${(item[primaryNumeric] / sums[primaryNumeric] * 100).toFixed(2)}%`
        : null,
    }));

    breakdown[f] = {
      uniqueCount: unique.size,
      top: sorted.slice(0, 12),
      bottom: sorted.slice(-5).reverse(),
      topFormatted,
    };
    validNamesByField[f] = Array.from(unique);
  });

  const typeToField = {};
  for (const type of ['salesman', 'product', 'outlet']) {
    const fld = detectFieldForType(fields, type);
    if (fld && validNamesByField[fld]) typeToField[type] = fld;
  }

  return {
    totalRows: rows.length,
    activeFilters: {
      periode: { from: filters.from || null, to: filters.to || null },
      salesman: filters.salesman ? Array.from(filters.salesman) : [],
      divisi: filters.divisi ? Array.from(filters.divisi) : [],
      produk: filters.produk ? Array.from(filters.produk) : [],
      outlet: filters.outlet ? Array.from(filters.outlet) : [],
    },
    numericFields,
    units,
    numericTotals: sums,
    numericTotalsFormatted: totalsFormatted,
    breakdown,
    _validNamesByField: validNamesByField,
    _typeToField: typeToField,
  };
}

/* ================================================================== */
/* FACTS BLOCK (INTI FIX)                                              */
/* ================================================================== */
function buildFactsBlock(summaryData) {
  const { numericFields, units, numericTotalsFormatted, breakdown } = summaryData;
  let facts = '\n=== FAKTA MUTLAK (COPY-PASTE PERSIS, DILARANG UBAH) ===\n';
  facts += `Total baris data: ${summaryData.totalRows}\n\n`;

  facts += '— TOTAL AGREGAT —\n';
  numericFields.forEach(f => {
    facts += `• [${f}] = ${numericTotalsFormatted[f]}  ← (raw: ${summaryData.numericTotals[f]})\n`;
  });
  facts += '\n';

  // Top performer per dimensi (untuk referensi nominal saat menyebut nama)
  Object.keys(breakdown).forEach(f => {
    const bd = breakdown[f];
    if (!bd.topFormatted || bd.topFormatted.length === 0) return;
    facts += `— TOP ${bd.topFormatted.length} pada field "${f}" —\n`;
    bd.topFormatted.forEach((t, i) => {
      facts += `${i + 1}. "${t.name}"${t.share ? ` → ${t.formatted} (${t.share} dari total)` : ` → ${t.formatted}`}\n`;
    });
    facts += '\n';
  });

  facts += '=== END FAKTA MUTLAK ===\n';
  return facts;
}

/* ================================================================== */
/* RESPONSE SCHEMA                                                     */
/* ================================================================== */
const ACTION_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string' }, owner: { type: 'string' },
    deadline: { type: 'string' }, kpi: { type: 'string' },
  },
  required: ['action', 'owner', 'deadline', 'kpi'],
};

const RESPONSE_SCHEMA = {
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
      required: ['salesPerformance','productMix','outletCoverage','salesmanProductivity','operationalEfficiency'],
    },
    summary: { type: 'string' },
    keyMetrics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' }, value: { type: 'string' },
          trend: { type: 'string', enum: ['up','down','flat'] }, insight: { type: 'string' },
        },
        required: ['label','value','trend','insight'],
      },
    },
    forecast: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up','down','flat'] },
        confidence: { type: 'string', enum: ['low','medium','high'] },
        reasoning: { type: 'string' },
      },
      required: ['direction','confidence','reasoning'],
    },
    riskAssessment: {
      type: 'object',
      properties: {
        overallLevel: { type: 'string', enum: ['low','medium','high','critical'] },
        concentrationRisk: { type: 'string' },
        topRisks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              risk: { type: 'string' },
              impact: { type: 'string', enum: ['low','medium','high'] },
              likelihood: { type: 'string', enum: ['low','medium','high'] },
              mitigation: { type: 'string' },
            },
            required: ['risk','impact','likelihood','mitigation'],
          },
        },
      },
      required: ['overallLevel','concentrationRisk','topRisks'],
    },
    swot: {
      type: 'object',
      properties: {
        strengths: { type: 'array', items: { type: 'string' } },
        weaknesses: { type: 'array', items: { type: 'string' } },
        opportunities: { type: 'array', items: { type: 'string' } },
        threats: { type: 'array', items: { type: 'string' } },
      },
      required: ['strengths','weaknesses','opportunities','threats'],
    },
    opportunities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' }, description: { type: 'string' },
          potentialImpact: { type: 'string', enum: ['low','medium','high'] },
          effort: { type: 'string', enum: ['low','medium','high'] },
          timeframe: { type: 'string' },
        },
        required: ['title','description','potentialImpact','effort','timeframe'],
      },
    },
    insights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          severity: { type: 'string', enum: ['critical','high','growth','info'] },
          category: { type: 'string' }, title: { type: 'string' }, desc: { type: 'string' },
          expectedImpact: { type: 'string' }, priority: { type: 'integer' },
          techActions: { type: 'array', items: { type: 'string' } },
          nonTechnicalActions: { type: 'array', items: { type: 'string' } },
          actionData: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['salesman','product','outlet'] },
              keys: { type: 'array', items: { type: 'string' } },
            },
            required: ['type','keys'],
          },
        },
        required: ['severity','category','title','desc','techActions','nonTechnicalActions'],
      },
    },
    quickWins: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' }, expectedOutcome: { type: 'string' },
          effort: { type: 'string', enum: ['low','medium','high'] }, owner: { type: 'string' },
        },
        required: ['action','expectedOutcome','effort','owner'],
      },
    },
    actionPlan: {
      type: 'object',
      properties: {
        shortTerm: { type: 'array', items: ACTION_ITEM_SCHEMA },
        midTerm: { type: 'array', items: ACTION_ITEM_SCHEMA },
        longTerm: { type: 'array', items: ACTION_ITEM_SCHEMA },
      },
      required: ['shortTerm','midTerm','longTerm'],
    },
    kpisToMonitor: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          metric: { type: 'string' }, current: { type: 'string' },
          target: { type: 'string' }, frequency: { type: 'string' },
        },
        required: ['metric','current','target','frequency'],
      },
    },
  },
  required: [
    'healthScore','healthBreakdown','summary','keyMetrics','forecast',
    'riskAssessment','swot','opportunities','insights','quickWins',
    'actionPlan','kpisToMonitor',
  ],
};

/* ================================================================== */
/* PROMPT                                                              */
/* ================================================================== */
function buildValidNamesBlock(summaryData) {
  const vn = summaryData._validNamesByField || {};
  const map = summaryData._typeToField || {};
  const label = { salesman: 'SALESMAN', product: 'PRODUK', outlet: 'OUTLET' };
  let out = '\n=== DAFTAR NAMA VALID (WAJIB COPY PERSIS) ===\n';
  let hasAny = false;
  for (const type of ['salesman', 'product', 'outlet']) {
    const fld = map[type];
    if (!fld) continue;
    hasAny = true;
    const names = vn[fld] || [];
    out += `\n[${label[type]}] field "${fld}" (${names.length} nama):\n`;
    out += names.slice(0, 80).map(n => `- ${n}`).join('\n');
    if (names.length > 80) out += `\n- ... dan ${names.length - 80} lainnya`;
    out += '\n';
  }
  if (!hasAny) out += '\n(Tidak ada field terdeteksi — JANGAN pakai actionData.)\n';
  return out + '=== END ===\n';
}

function buildPrompt(summaryData) {
  const factsBlock = buildFactsBlock(summaryData);
  const namesBlock = buildValidNamesBlock(summaryData);

  // Kirim struktur data ter-agregasi (bukan raw rows) untuk hindari re-kalkulasi
  const cleanData = {
    totalRows: summaryData.totalRows,
    activeFilters: summaryData.activeFilters,
    numericFields: summaryData.numericFields,
    units: summaryData.units,
    numericTotalsFormatted: summaryData.numericTotalsFormatted,
    breakdown: Object.fromEntries(Object.entries(summaryData.breakdown).map(([k, v]) => [k, {
      uniqueCount: v.uniqueCount,
      topFormatted: v.topFormatted,
    }])),
  };

  return `Anda adalah Konsultan Bisnis Senior & Data Analyst Expert untuk perusahaan distribusi FMCG di Indonesia.

TUGAS: Analisis data terfilter berikut dan berikan LAPORAN KONSULTAN 12-MODUL.

=== DATA AGREGAT (JSON) ===
${JSON.stringify(cleanData, null, 2)}
=== END DATA ===
${factsBlock}
${namesBlock}

⚠️ ATURAN ANGKA (SANGAT KETAT — PELANGGARAN = LAPORAN SALAH):
1. Semua nominal WAJIB di-COPY PERSIS dari blok [FAKTA MUTLAK] di atas.
2. DILARANG KERAS: mengubah magnitude (juta↔miliar↔triliun), membulatkan berbeda, atau menghitung ulang dari raw.
3. Jika FAKTA MUTLAK menulis "Rp 200,50 juta", tulis apa adanya. JANGAN tulis "Rp 2 miliar" atau "Rp 0,2 miliar".
4. Untuk persentase atau rasio yang tidak ada di FAKTA, hitung dari formatted value lalu tulis 1-2 desimal.
5. Setiap kali menyebut nama performer, SALIN format nominal yang ada di "TOP N pada field" — jangan hitung sendiri.
6. Jika ragu, gunakan angka yang ada di FAKTA MUTLAK saja.

INSTRUKSI OUTPUT (12 MODUL):

1. **healthScore** (0-100) keseluruhan.
2. **healthBreakdown**: sub-skor 0-100 per dimensi.
3. **summary**: 2-3 paragraf. Sebut nama spesifik + nominal DARI FAKTA (bold dengan **).
4. **keyMetrics**: 4-6 KPI. Value HARUS string yang ada di FAKTA (mis. "Rp 200,50 juta").
5. **forecast**: direction/confidence/reasoning berbasis tren.
6. **riskAssessment**: overallLevel + concentrationRisk (sebut nama & % dari FAKTA) + topRisks.
7. **swot**: 3-5 poin per kuadran, nama dari DAFTAR NAMA VALID.
8. **opportunities**: 2-4 peluang (impact/effort/timeframe).
9. **insights**: 3-7 rekomendasi. severity/category/title/desc/expectedImpact/priority/techActions/nonTechnicalActions/actionData.
   - actionData HANYA jika menyebut nama spesifik dari DAFTAR NAMA VALID. Format { type, keys: [nama persis] }.
10. **quickWins**: 3-5 aksi cepat (action/expectedOutcome/effort/owner).
11. **actionPlan**: shortTerm/midTerm/longTerm — item { action, owner, deadline, kpi }.
12. **kpisToMonitor**: 4-6 KPI { metric, current (dari FAKTA), target, frequency }.

Bahasa Indonesia profesional. Jangan mengarang. Fokus dampak bisnis terbesar.`;
}

/* ================================================================== */
/* GEMINI CALL                                                         */
/* ================================================================== */
async function callGeminiRaw(apiKey, model, prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4, // ← diturunkan dari 0.55 → lebih patuh FAKTA
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
  if (res.status === 404) { const e = new Error('MODEL_NOT_FOUND'); e.code = 'MODEL_NOT_FOUND'; throw e; }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (res.status === 400 || res.status === 403) throw new Error('API Key tidak valid atau tidak memiliki akses.');
    if (res.status === 429) throw new Error('Kuota API habis. Coba lagi nanti.');
    throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
  }
  const payload = await res.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Respons AI kosong.');
  return text;
}

async function callGemini(apiKey, prompt) {
  const model = await resolveModel(apiKey);
  let text;
  try { text = await callGeminiRaw(apiKey, model, prompt); }
  catch (err) {
    if (err.code === 'MODEL_NOT_FOUND') {
      cachedModel = null;
      localStorage.removeItem(MODELS_CACHE_KEY);
      const newModel = await resolveModel(apiKey);
      text = await callGeminiRaw(apiKey, newModel, prompt);
    } else { throw err; }
  }
  try { return JSON.parse(text); } catch { throw new Error('Format respons AI tidak valid.'); }
}

/* ================================================================== */
/* NUMBER AUDIT (POST-CHECK)                                           */
/* ================================================================== */
/**
 * Bandingkan angka "Rp X miliar/juta" di output AI dengan FAKTA.
 * Jika magnitude menyimpang > 3x, log warning (tidak crash).
 */
function auditAiNumbers(result, summaryData) {
  const facts = summaryData.numericTotals || {};
  const factValues = Object.values(facts).filter(v => v > 0);
  if (factValues.length === 0) return;

  const allText = [
    result.summary || '',
    ...(result.keyMetrics || []).map(m => `${m.value} ${m.insight}`),
    result.riskAssessment?.concentrationRisk || '',
    ...(result.insights || []).map(i => `${i.desc} ${i.expectedImpact || ''}`),
  ].join(' ');

  // Extract "Rp X miliar/juta/triliun/ribu"
  const rx = /Rp\s*([\d.,]+)\s*(triliun|miliar|juta|ribu|M|jt|rb)?/gi;
  const warnings = [];
  let m;
  while ((m = rx.exec(allText)) !== null) {
    const num = parseNumber(m[1]);
    const unit = (m[2] || '').toLowerCase();
    if (num === 0) continue;

    let multiplier = 1;
    if (unit === 'triliun' || unit === 't') multiplier = 1e12;
    else if (unit === 'miliar' || unit === 'm') multiplier = 1e9;
    else if (unit === 'juta' || unit === 'jt') multiplier = 1e6;
    else if (unit === 'ribu' || unit === 'rb') multiplier = 1e3;

    const aiValue = num * multiplier;
    // Cari fakta terdekat magnitude-nya
    const closest = factValues.reduce((best, v) => Math.abs(v - aiValue) < Math.abs(best - aiValue) ? v : best, factValues[0]);
    const ratio = aiValue / closest;

    if (ratio > 3 || ratio < 0.33) {
      warnings.push({
        aiText: m[0],
        aiValue,
        closestFact: closest,
        closestFormatted: formatIDR(closest),
        ratio: ratio.toFixed(2),
      });
    }
  }

  if (warnings.length > 0) {
    console.warn('[AI Number Audit] ⚠️ Kemungkinan salah magnitude:', warnings);
  }
  return warnings;
}

/* ================================================================== */
/* VALIDATION                                                          */
/* ================================================================== */
function sanitizeActionData(actionData, summaryData) {
  if (!actionData?.type || !Array.isArray(actionData.keys)) return null;
  const { type } = actionData;
  if (!['salesman', 'product', 'outlet'].includes(type)) return null;
  const field = summaryData._typeToField?.[type];
  if (!field) return null;
  const whitelist = summaryData._validNamesByField?.[field] || [];
  if (whitelist.length === 0) return null;

  const matched = [], seen = new Set(), rejected = [];
  for (const k of actionData.keys) {
    const m = matchValidName(k, whitelist);
    if (m) { if (!seen.has(m)) { seen.add(m); matched.push(m); } }
    else rejected.push(k);
  }
  if (rejected.length) console.warn(`[AI] actionData.${type} rejected:`, rejected);
  return matched.length > 0 ? { type, keys: matched.slice(0, 10) } : null;
}

function validateResult(r, summaryData) {
  if (!r || typeof r !== 'object') throw new Error('Struktur AI tidak dikenali.');
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const safeStr = (s) => typeof s === 'string' ? s : '';
  const safeArr = (a) => Array.isArray(a) ? a : [];
  const oneOf = (v, o, d) => o.includes(v) ? v : d;
  const bd = r.healthBreakdown || {};
  const fc = r.forecast || {};
  const rk = r.riskAssessment || {};
  const sw = r.swot || {};
  const pl = r.actionPlan || {};
  const valAI = (a) => ({ action: safeStr(a?.action), owner: safeStr(a?.owner), deadline: safeStr(a?.deadline), kpi: safeStr(a?.kpi) });

  return {
    healthScore: clamp(r.healthScore),
    healthBreakdown: {
      salesPerformance: clamp(bd.salesPerformance), productMix: clamp(bd.productMix),
      outletCoverage: clamp(bd.outletCoverage), salesmanProductivity: clamp(bd.salesmanProductivity),
      operationalEfficiency: clamp(bd.operationalEfficiency),
    },
    summary: safeStr(r.summary),
    keyMetrics: safeArr(r.keyMetrics).map(m => ({
      label: safeStr(m?.label), value: safeStr(m?.value),
      trend: oneOf(m?.trend, ['up','down','flat'], 'flat'), insight: safeStr(m?.insight),
    })),
    forecast: {
      direction: oneOf(fc.direction, ['up','down','flat'], 'flat'),
      confidence: oneOf(fc.confidence, ['low','medium','high'], 'medium'),
      reasoning: safeStr(fc.reasoning),
    },
    riskAssessment: {
      overallLevel: oneOf(rk.overallLevel, ['low','medium','high','critical'], 'medium'),
      concentrationRisk: safeStr(rk.concentrationRisk),
      topRisks: safeArr(rk.topRisks).map(x => ({
        risk: safeStr(x?.risk),
        impact: oneOf(x?.impact, ['low','medium','high'], 'medium'),
        likelihood: oneOf(x?.likelihood, ['low','medium','high'], 'medium'),
        mitigation: safeStr(x?.mitigation),
      })),
    },
    swot: {
      strengths: safeArr(sw.strengths).map(String), weaknesses: safeArr(sw.weaknesses).map(String),
      opportunities: safeArr(sw.opportunities).map(String), threats: safeArr(sw.threats).map(String),
    },
    opportunities: safeArr(r.opportunities).map(o => ({
      title: safeStr(o?.title), description: safeStr(o?.description),
      potentialImpact: oneOf(o?.potentialImpact, ['low','medium','high'], 'medium'),
      effort: oneOf(o?.effort, ['low','medium','high'], 'medium'),
      timeframe: safeStr(o?.timeframe),
    })),
    insights: safeArr(r.insights).map((i, idx) => {
      const out = {
        id: i.id || `insight-${idx}`,
        severity: oneOf(i.severity, ['critical','high','growth','info'], 'info'),
        category: safeStr(i.category) || 'General',
        title: safeStr(i.title), desc: safeStr(i.desc),
        expectedImpact: safeStr(i.expectedImpact),
        priority: Number(i.priority) || 5,
        techActions: safeArr(i.techActions).map(String),
        nonTechnicalActions: safeArr(i.nonTechnicalActions).map(String),
      };
      if (i.actionData) {
        const clean = sanitizeActionData(i.actionData, summaryData);
        if (clean) out.actionData = clean;
      }
      return out;
    }),
    quickWins: safeArr(r.quickWins).map(w => ({
      action: safeStr(w?.action), expectedOutcome: safeStr(w?.expectedOutcome),
      effort: oneOf(w?.effort, ['low','medium','high'], 'medium'), owner: safeStr(w?.owner),
    })),
    actionPlan: {
      shortTerm: safeArr(pl.shortTerm).map(valAI),
      midTerm: safeArr(pl.midTerm).map(valAI),
      longTerm: safeArr(pl.longTerm).map(valAI),
    },
    kpisToMonitor: safeArr(r.kpisToMonitor).map(k => ({
      metric: safeStr(k?.metric), current: safeStr(k?.current),
      target: safeStr(k?.target), frequency: safeStr(k?.frequency),
    })),
  };
}

/* ================================================================== */
/* UI HELPERS & SECTIONS (RINGKAS — sama seperti versi sebelumnya)     */
/* ================================================================== */
function scoreColor(s) { return s >= 80 ? '#10B981' : s >= 60 ? '#3B82F6' : s >= 40 ? '#F59E0B' : '#EF4444'; }
function sectionHeader(num, title, subtitle) {
  return `<div style="display:flex; align-items:baseline; gap:12px; margin:28px 0 14px 0;">
    <div style="font-size:11px; font-weight:900; color:#94A3B8; letter-spacing:2px;">${num}</div>
    <div>
      <div style="font-size:17px; font-weight:900; color:#0F172A; letter-spacing:-0.3px;">${esc(title)}</div>
      ${subtitle ? `<div style="font-size:11px; color:#64748B; margin-top:2px;">${esc(subtitle)}</div>` : ''}
    </div>
  </div>`;
}
function pill(t, bg, fg) { return `<span style="display:inline-block; padding:3px 10px; background:${bg}; color:${fg}; border-radius:99px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">${esc(t)}</span>`; }

function renderHeroBreakdown(r) {
  const dims = [
    { key: 'salesPerformance', label: 'Sales Performance' }, { key: 'productMix', label: 'Product Mix' },
    { key: 'outletCoverage', label: 'Outlet Coverage' }, { key: 'salesmanProductivity', label: 'Salesman Productivity' },
    { key: 'operationalEfficiency', label: 'Operational Efficiency' },
  ];
  return `<div style="padding:20px 24px; background:#fff; border-bottom:1px solid #E2E8F0;">
    <div style="font-size:11px; font-weight:900; color:#64748B; letter-spacing:2px; margin-bottom:14px;">HEALTH BREAKDOWN</div>
    ${dims.map(d => {
      const v = r.healthBreakdown[d.key], c = scoreColor(v);
      return `<div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
          <span style="color:#475569; font-weight:600;">${d.label}</span>
          <span style="color:${c}; font-weight:800;">${v}/100</span>
        </div>
        <div style="height:6px; background:#F1F5F9; border-radius:3px; overflow:hidden;">
          <div style="height:100%; width:${v}%; background:${c}; transition:width 0.8s;"></div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderKeyMetrics(metrics) {
  if (!metrics.length) return '';
  const ti = { up: '📈', down: '📉', flat: '➖' }, tc = { up: '#10B981', down: '#EF4444', flat: '#64748B' };
  return sectionHeader('04', 'Key Metrics Dashboard', 'KPI paling penting') + `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
      ${metrics.map(m => `<div style="background:#fff; border:1px solid #E2E8F0; border-radius:10px; padding:14px;">
        <div style="font-size:10px; font-weight:800; color:#64748B; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">${esc(m.label)}</div>
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <div style="font-size:20px; font-weight:900; color:#0F172A;">${esc(m.value)}</div>
          <div style="color:${tc[m.trend]}; font-size:16px;">${ti[m.trend]}</div>
        </div>
        <div style="font-size:11px; color:#64748B; margin-top:6px; line-height:1.4;">${esc(m.insight)}</div>
      </div>`).join('')}
    </div>`;
}

function renderForecast(f) {
  const dm = {
    up: { icon: '📈', label: 'Membaik', color: '#10B981', bg: '#F0FDF4' },
    down: { icon: '📉', label: 'Menurun', color: '#EF4444', bg: '#FEF2F2' },
    flat: { icon: '➖', label: 'Stabil', color: '#64748B', bg: '#F8FAFC' },
  };
  const d = dm[f.direction];
  const cc = { low: '#EF4444', medium: '#F59E0B', high: '#10B981' }[f.confidence];
  return sectionHeader('05', 'Forecast & Prediksi', 'Estimasi arah bisnis') + `
    <div style="background:${d.bg}; border:1px solid ${d.color}30; border-left:5px solid ${d.color}; border-radius:10px; padding:18px;">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
        <div style="font-size:28px;">${d.icon}</div>
        <div>
          <div style="font-size:16px; font-weight:900; color:${d.color};">Arah: ${d.label}</div>
          <div style="font-size:11px; color:#64748B; margin-top:2px;">Confidence: <b style="color:${cc}; text-transform:uppercase;">${f.confidence}</b></div>
        </div>
      </div>
      <div style="font-size:13px; color:#334155; line-height:1.6;">${esc(f.reasoning)}</div>
    </div>`;
}

function renderRiskAssessment(risk) {
  const lm = { low: ['#10B981','#F0FDF4'], medium: ['#F59E0B','#FFFBEB'], high: ['#F97316','#FFF7ED'], critical: ['#EF4444','#FEF2F2'] };
  const [c, bg] = lm[risk.overallLevel] || lm.medium;
  return sectionHeader('06', 'Risk Assessment', 'Risiko & mitigasi') + `
    <div style="background:${bg}; border:1px solid ${c}40; border-radius:10px; padding:16px; margin-bottom:14px;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <div style="width:10px; height:10px; border-radius:50%; background:${c}; animation:pulse 2s infinite;"></div>
        <div style="font-size:13px; font-weight:900; color:${c}; text-transform:uppercase; letter-spacing:1px;">Level: ${risk.overallLevel}</div>
      </div>
      <div style="font-size:13px; color:#334155; line-height:1.6;">${esc(risk.concentrationRisk)}</div>
    </div>
    ${risk.topRisks.map(r => `<div style="background:#fff; border:1px solid #E2E8F0; border-radius:8px; padding:14px; margin-bottom:10px;">
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        ${pill('Impact: ' + r.impact, r.impact === 'high' ? '#FEE2E2' : '#F1F5F9', r.impact === 'high' ? '#991B1B' : '#475569')}
        ${pill('Likelihood: ' + r.likelihood, r.likelihood === 'high' ? '#FEF3C7' : '#F1F5F9', r.likelihood === 'high' ? '#92400E' : '#475569')}
      </div>
      <div style="font-size:13px; font-weight:800; color:#0F172A; margin-bottom:6px;">${esc(r.risk)}</div>
      <div style="font-size:12px; color:#475569; line-height:1.5;"><b style="color:#166534;">Mitigasi:</b> ${esc(r.mitigation)}</div>
    </div>`).join('')}`;
}

function renderSwot(s) {
  const quad = (label, items, bg, bd, fg) => `<div style="background:${bg}; border:1px solid ${bd}; border-radius:10px; padding:14px;">
    <div style="font-size:11px; font-weight:900; color:${fg}; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px;">${label}</div>
    <ul style="margin:0; padding-left:18px; font-size:12px; color:#334155; line-height:1.7;">
      ${items.length ? items.map(i => `<li>${esc(i)}</li>`).join('') : '<li style="color:#94A3B8; font-style:italic;">—</li>'}
    </ul></div>`;
  return sectionHeader('07', 'SWOT Analysis', '') + `<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
    ${quad('💪 Strengths', s.strengths, '#F0FDF4', '#BBF7D0', '#166534')}
    ${quad('⚠️ Weaknesses', s.weaknesses, '#FEF2F2', '#FECACA', '#991B1B')}
    ${quad('🚀 Opportunities', s.opportunities, '#EFF6FF', '#BFDBFE', '#1E40AF')}
    ${quad('🔥 Threats', s.threats, '#FFF7ED', '#FED7AA', '#9A3412')}
  </div>`;
}

function renderOpportunities(opps) {
  if (!opps.length) return '';
  return sectionHeader('08', 'Peluang Pertumbuhan', 'Impact vs Effort') + `<div style="display:grid; gap:12px;">
    ${opps.map(o => `<div style="background:#fff; border:1px solid #E2E8F0; border-radius:10px; padding:16px;">
      <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:8px;">
        <div style="font-size:14px; font-weight:800; color:#0F172A; flex:1;">${esc(o.title)}</div>
        <div style="display:flex; gap:6px;">
          ${pill('Impact: ' + o.potentialImpact, o.potentialImpact === 'high' ? '#DBEAFE' : '#F1F5F9', o.potentialImpact === 'high' ? '#1E40AF' : '#475569')}
          ${pill('Effort: ' + o.effort, o.effort === 'low' ? '#DCFCE7' : '#F1F5F9', o.effort === 'low' ? '#166534' : '#475569')}
        </div>
      </div>
      <div style="font-size:12px; color:#475569; line-height:1.6;">${esc(o.description)}</div>
      <div style="font-size:11px; color:#94A3B8; margin-top:8px;">⏱ ${esc(o.timeframe)}</div>
    </div>`).join('')}
  </div>`;
}

function renderInsights(insights) {
  return sectionHeader('09', `Rekomendasi Strategis (${insights.length})`, 'Urut prioritas') + `<div style="display:grid; gap:12px;">
    ${insights.map((i, idx) => {
      let bg, bd, ic, tx;
      if (i.severity === 'critical') { bg = '#FEF2F2'; bd = '#EF4444'; ic = '🚨'; tx = '#991B1B'; }
      else if (i.severity === 'high') { bg = '#FFF7ED'; bd = '#F97316'; ic = '⚠️'; tx = '#9A3412'; }
      else if (i.severity === 'growth') { bg = '#F0FDF4'; bd = '#22C55E'; ic = '🚀'; tx = '#166534'; }
      else { bg = '#F8FAFC'; bd = '#64748B'; ic = '💡'; tx = '#334155'; }
      const fb = i.actionData
        ? `<div style="font-size:11px; color:#1E3A8A; background:#DBEAFE; display:inline-block; padding:4px 10px; border-radius:6px; font-weight:800; margin-bottom:10px;">🔎 Filter siap: ${esc(i.actionData.type)} = ${i.actionData.keys.map(k => `<b>${esc(k)}</b>`).join(', ')}</div><br>` : '';
      return `<div style="background:${bg}; border:1px solid ${bd}30; border-left:6px solid ${bd}; padding:18px; border-radius:10px;">
        <div style="display:flex; align-items:flex-start; gap:12px;">
          <div style="font-size:22px;">${ic}</div>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
              <div style="font-size:10px; font-weight:800; color:${tx}; text-transform:uppercase; letter-spacing:0.5px;">${esc(i.category)}</div>
              <div style="font-size:10px; font-weight:800; color:#94A3B8;">PRIORITAS #${i.priority}</div>
            </div>
            <div style="font-size:15px; font-weight:800; color:#0F172A; margin-bottom:6px;">${esc(i.title)}</div>
            <div class="ai-desc">${esc(i.desc)}</div>
            ${i.expectedImpact ? `<div style="font-size:11px; color:#166534; background:#DCFCE7; display:inline-block; padding:4px 10px; border-radius:6px; font-weight:800; margin-bottom:10px;">🎯 ${esc(i.expectedImpact)}</div><br>` : ''}
            ${fb}
            <button class="ai-action-btn" data-action-idx="${idx}" style="background:#0F172A; padding:8px 16px; border-radius:6px; font-weight:700; font-size:12px; color:#fff; border:none; cursor:pointer;">Lihat Solusi & Playbook →</button>
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderQuickWins(wins) {
  if (!wins.length) return '';
  return sectionHeader('10', `Quick Wins (${wins.length})`, 'Eksekusi minggu ini') + `<div style="display:grid; gap:10px;">
    ${wins.map(w => `<div style="background:#fff; border:1px solid #BBF7D0; border-left:5px solid #22C55E; border-radius:8px; padding:14px; display:flex; gap:12px; align-items:flex-start;">
      <div style="font-size:20px;">⚡</div>
      <div style="flex:1;">
        <div style="font-size:13px; font-weight:800; color:#0F172A; margin-bottom:4px;">${esc(w.action)}</div>
        <div style="font-size:12px; color:#166534; margin-bottom:6px;">✅ ${esc(w.expectedOutcome)}</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${pill('Effort: ' + w.effort, w.effort === 'low' ? '#DCFCE7' : '#FEF3C7', w.effort === 'low' ? '#166534' : '#92400E')}
          ${pill('Owner: ' + w.owner, '#F1F5F9', '#475569')}
        </div>
      </div>
    </div>`).join('')}
  </div>`;
}

function renderActionPlan(plan) {
  const col = (t, s, items, c) => `<div style="background:#fff; border:1px solid #E2E8F0; border-radius:10px; padding:14px; border-top:4px solid ${c};">
    <div style="font-size:11px; font-weight:900; color:${c}; letter-spacing:1px; text-transform:uppercase;">${t}</div>
    <div style="font-size:10px; color:#94A3B8; margin-bottom:10px;">${s}</div>
    ${items.length === 0 ? '<div style="font-size:12px; color:#94A3B8; font-style:italic;">Tidak ada.</div>' : items.map(it => `<div style="border-left:2px solid ${c}30; padding:8px 10px; margin-bottom:8px; background:#F8FAFC; border-radius:4px;">
      <div style="font-size:12px; font-weight:700; color:#0F172A; line-height:1.4; margin-bottom:4px;">${esc(it.action)}</div>
      <div style="font-size:10px; color:#64748B; margin-bottom:2px;">👤 ${esc(it.owner)} · ⏱ ${esc(it.deadline)}</div>
      <div style="font-size:10px; color:#166534;">📊 ${esc(it.kpi)}</div>
    </div>`).join('')}
  </div>`;
  return sectionHeader('11', 'Action Plan 30/60/90', 'Roadmap eksekusi') + `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
    ${col('Short Term', '0–30 hari', plan.shortTerm, '#EF4444')}
    ${col('Mid Term', '30–60 hari', plan.midTerm, '#F59E0B')}
    ${col('Long Term', '60–90 hari', plan.longTerm, '#3B82F6')}
  </div>`;
}

function renderKpis(kpis) {
  if (!kpis.length) return '';
  return sectionHeader('12', 'KPI Monitoring', '') + `<div style="background:#fff; border:1px solid #E2E8F0; border-radius:10px; overflow:hidden;">
    <table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead><tr style="background:#F8FAFC;">
        <th style="text-align:left; padding:10px 12px; color:#475569; font-weight:800; font-size:10px; text-transform:uppercase;">Metric</th>
        <th style="text-align:left; padding:10px 12px; color:#475569; font-weight:800; font-size:10px; text-transform:uppercase;">Current</th>
        <th style="text-align:left; padding:10px 12px; color:#475569; font-weight:800; font-size:10px; text-transform:uppercase;">Target</th>
        <th style="text-align:left; padding:10px 12px; color:#475569; font-weight:800; font-size:10px; text-transform:uppercase;">Frequency</th>
      </tr></thead>
      <tbody>${kpis.map((k, i) => `<tr style="border-top:1px solid #E2E8F0; ${i % 2 ? 'background:#FAFBFC;' : ''}">
        <td style="padding:10px 12px; color:#0F172A; font-weight:700;">${esc(k.metric)}</td>
        <td style="padding:10px 12px; color:#334155;">${esc(k.current)}</td>
        <td style="padding:10px 12px; color:#166534; font-weight:700;">${esc(k.target)}</td>
        <td style="padding:10px 12px; color:#64748B;">${esc(k.frequency)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
}

/* ================================================================== */
/* SHELL & RENDER OUTPUT                                               */
/* ================================================================== */
function getFilterSummary(state) {
  const f = state.filters, meta = [];
  if (f.from) meta.push(f.from);
  if (f.to) meta.push(f.to);
  if (f.salesman && f.salesman.size > 0) meta.push(`Salesman: ${Array.from(f.salesman).join(', ')}`);
  if (f.divisi && f.divisi.size > 0) meta.push(`Divisi: ${Array.from(f.divisi).join(', ')}`);
  if (f.produk && f.produk.size > 0) meta.push(`Produk: ${Array.from(f.produk).join(', ')}`);
  if (f.outlet && f.outlet.size > 0) meta.push(`Outlet: ${Array.from(f.outlet).join(', ')}`);
  return meta.length > 0 ? meta.join(' · ') : 'Semua Data (Tanpa Filter)';
}

function shell() {
  const filterInfo = getFilterSummary(store.state);
  const hasKey = !!getApiKey();
  const modelLabel = cachedModel || PREFERRED_MODELS[0];
  return `
    <div class="card mb12" id="ai-hero" style="text-align:center; padding:40px 20px; background:linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%); border-radius:16px; box-shadow:0 10px 25px rgba(29,78,216,0.3); position:relative; overflow:hidden;">
      <div style="position:absolute; top:-50px; right:-50px; width:200px; height:200px; background:rgba(255,255,255,0.1); border-radius:50%;"></div>
      <div style="position:absolute; bottom:-30px; left:-30px; width:150px; height:150px; background:rgba(255,255,255,0.1); border-radius:50%;"></div>
      <div style="font-size:48px; margin-bottom:12px; text-shadow:0 4px 10px rgba(0,0,0,0.2);">🧠</div>
      <div style="font-size:24px; font-weight:900; color:#fff; margin-bottom:8px; letter-spacing:-0.5px;">Expert AI Board</div>
      <div style="font-size:14px; color:#BFDBFE; margin-bottom:24px; max-width:460px; margin-left:auto; margin-right:auto; line-height:1.5;">Laporan 12-modul · angka terverifikasi · powered by Gemini.</div>
      <div style="display:inline-block; background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); padding:8px 16px; border-radius:8px; margin-bottom:20px; max-width:90%;">
        <div style="font-size:10px; color:#93C5FD; font-weight:700; margin-bottom:2px; letter-spacing:1px;">DATA YANG DIANALISIS</div>
        <div style="font-size:12px; color:#fff; font-weight:600; word-break:break-word;">${esc(filterInfo)}</div>
      </div>
      <br>
      <button class="btn" id="btnRunAI" style="padding:14px 32px; font-weight:800; border-radius:99px; background:#fff; color:#1D4ED8; font-size:14px; box-shadow:0 4px 15px rgba(0,0,0,0.2); border:none; cursor:pointer;">✨ Generate Laporan Konsultan</button>
      <div style="margin-top:14px; display:flex; gap:16px; justify-content:center; flex-wrap:wrap;">
        <button id="btnApiKeyCfg" style="background:transparent; border:none; color:rgba(255,255,255,0.75); font-size:11px; text-decoration:underline; cursor:pointer;">
          ${hasKey ? '⚙️ Ubah API Key' : '🔑 Konfigurasi API Key'}
        </button>
        <span style="font-size:11px; color:rgba(255,255,255,0.55);">Model: <b style="color:rgba(255,255,255,0.85);">${esc(modelLabel)}</b></span>
      </div>
    </div>
    <div id="ai-output" style="animation: fadeIn 0.5s ease;"></div>
    <style>
      @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.6; } 100% { transform: scale(1); opacity: 1; } }
      .ai-loading-text { animation: pulse 1.5s infinite; font-weight: 700; color: #1D4ED8; font-size: 15px; margin-top: 12px; }
      .ai-desc { white-space: pre-line; font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 10px; }
    </style>`;
}

function renderOutput() {
  const out = document.getElementById('ai-output');
  if (!out) return;
  if (isAnalyzing) {
    out.innerHTML = `<div class="card" style="text-align:center; padding:40px; background:#F8FAFC; border:1px solid #E2E8F0;">
      <div style="font-size:32px;">🤖</div>
      <div class="ai-loading-text" id="ai-loading-txt">Menghubungi AI Consultant...</div>
      <div style="height:6px; width:100%; max-width:300px; background:#E2E8F0; border-radius:3px; margin:20px auto; overflow:hidden;">
        <div id="ai-loading-bar" style="height:100%; width:0%; background:#1D4ED8; transition: width 0.4s;"></div>
      </div>
      <div style="font-size:11px; color:#94A3B8; margin-top:8px;">Powered by Gemini · 12 modul</div>
    </div>`;
    const texts = [
      'Menghubungi AI Consultant...', 'Mem-parse & format angka...',
      'Membangun FAKTA MUTLAK...', 'Verifikasi nama performer...',
      'Menyusun action plan...', 'Finalisasi laporan...',
    ];
    let step = 0, bar = 0;
    clearInterval(loadingInterval);
    loadingInterval = setInterval(() => {
      const t = document.getElementById('ai-loading-txt'), b = document.getElementById('ai-loading-bar');
      if (!t || !b) { clearInterval(loadingInterval); return; }
      step = (step + 1) % texts.length;
      if (bar < 90) bar += 3;
      t.textContent = texts[step]; b.style.width = bar + '%';
    }, 550);
    return;
  }
  clearInterval(loadingInterval);
  if (!aiResult) { out.innerHTML = ''; return; }
  const r = aiResult;
  if (!r.insights || r.insights.length === 0) {
    out.innerHTML = `<div class="card" style="text-align:center; padding:32px; background:#FEF2F2; border:1px solid #FECACA; margin-top:12px;"><div style="font-size:40px; margin-bottom:8px;">📭</div><div style="font-weight:800; color:#991B1B; font-size:16px;">AI tidak menemukan insight</div></div>`;
    return;
  }
  const sc = scoreColor(r.healthScore);
  const summarySafe = esc(r.summary).replace(/\*\*(.*?)\*\*/g, '<b style="color:#0F172A;">$1</b>');
  out.innerHTML = `
    <div id="ai-report-card" style="background:#fff; border-radius:14px; box-shadow:0 6px 24px rgba(0,0,0,0.08); overflow:hidden; margin-bottom:20px;">
      <div style="background:#0F172A; padding:24px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:16px; align-items:center;">
        <div>
          <div style="font-size:11px; font-weight:800; color:#94A3B8; letter-spacing:2px;">EXECUTIVE REPORT</div>
          <div style="font-size:22px; font-weight:900; color:#fff; margin-top:4px; letter-spacing:-0.5px;">Laporan Konsultan Bisnis</div>
          <div style="font-size:11px; color:#94A3B8; margin-top:4px;">12 modul · angka dari FAKTA MUTLAK</div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <button class="btn sm" data-quick-export="#ai-report-card" data-title="Laporan AI Analyst" data-filename="ai_insight_report" style="background:#334155; color:#fff; border:none; cursor:pointer;">📥 Ekspor</button>
          <div style="background:${sc}; color:#fff; padding:12px 20px; border-radius:10px; font-weight:900; font-size:26px; line-height:1;">${r.healthScore}<span style="font-size:11px; opacity:0.85;"> /100</span></div>
        </div>
      </div>
      ${renderHeroBreakdown(r)}
      <div style="padding:24px 24px 0 24px;">
        <div style="font-size:14px; line-height:1.7; color:#334155; background:#F8FAFC; padding:20px; border-radius:12px; border-left:4px solid ${sc};">${summarySafe}</div>
      </div>
      <div style="padding:0 24px 24px 24px;">
        ${renderKeyMetrics(r.keyMetrics)} ${renderForecast(r.forecast)} ${renderRiskAssessment(r.riskAssessment)}
        ${renderSwot(r.swot)} ${renderOpportunities(r.opportunities)} ${renderInsights(r.insights)}
        ${renderQuickWins(r.quickWins)} ${renderActionPlan(r.actionPlan)} ${renderKpis(r.kpisToMonitor)}
      </div>
    </div>`;
}

/* ================================================================== */
/* ACTION MODAL & FILTER APPLY                                         */
/* ================================================================== */
function handleAction(idx) {
  const insight = aiResult.insights[idx];
  if (!insight) return;
  const techList = (insight.techActions || []).map(a => `<li style="margin-bottom:6px;">${esc(a)}</li>`).join('');
  const nonTechList = (insight.nonTechnicalActions || []).map(a => `<li style="margin-bottom:6px;">${esc(a)}</li>`).join('');
  let filterPreview = '';
  if (insight.actionData) {
    const { type, keys } = insight.actionData;
    filterPreview = `<div style="background:#DBEAFE; border:1px solid #BFDBFE; padding:16px; border-radius:8px; margin-bottom:20px;">
      <div style="font-size:12px; color:#1E3A8A; font-weight:800; margin-bottom:8px;">🔎 Akan Menyaring (${keys.length} nama terverifikasi)</div>
      <div style="font-size:12px; color:#1E3A8A; margin-bottom:12px; line-height:1.6;">
        <b>Tipe:</b> ${esc(type)}<br><b>Nama:</b> ${keys.map(k => `<code style="background:#fff; padding:1px 6px; border-radius:4px;">${esc(k)}</code>`).join(', ')}
      </div>
      <button class="btn-action-exec" id="btnApplyAction" style="width:100%; padding:12px; font-weight:800; border-radius:6px; background:#1D4ED8; color:#fff; border:none; cursor:pointer;">✅ Terapkan Filter & Buka Data</button>
    </div>`;
  }
  const html = `
    <div class="modal-h" style="background:#0F172A; color:#fff; padding:20px;">
      <h3 style="font-size:16px; margin:0;">Executive Playbook</h3>
      <button class="x" style="color:#fff;">×</button>
    </div>
    <div class="modal-b" style="padding:20px; max-height:80vh; overflow-y:auto;">
      <div style="font-size:18px; font-weight:900; color:#0F172A; margin-bottom:8px;">${esc(insight.title)}</div>
      ${insight.expectedImpact ? `<div style="font-size:12px; color:#166534; background:#DCFCE7; display:inline-block; padding:4px 10px; border-radius:6px; font-weight:800; margin-bottom:16px;">🎯 ${esc(insight.expectedImpact)}</div>` : ''}
      <div style="margin-bottom:20px;">
        <div style="font-size:13px; font-weight:800; color:#166534; margin-bottom:8px;">🤝 Tindakan Bisnis & Lapangan</div>
        <ul style="margin:0; padding:16px 16px 16px 36px; font-size:13px; color:#334155; line-height:1.6; background:#F0FDF4; border-radius:8px; border:1px solid #BBF7D0;">${nonTechList || '<li>Tidak ada.</li>'}</ul>
      </div>
      <div style="margin-bottom:20px;">
        <div style="font-size:13px; font-weight:800; color:#475569; margin-bottom:8px;">⚙️ Tindakan Sistem</div>
        <ul style="margin:0; padding:16px 16px 16px 36px; font-size:13px; color:#334155; line-height:1.6; background:#F8FAFC; border-radius:8px; border:1px solid #E2E8F0;">${techList || '<li>Tidak ada.</li>'}</ul>
      </div>
      ${filterPreview || `<button class="btn" style="width:100%; padding:14px; font-weight:800; border-radius:8px; background:#F1F5F9; color:#475569; border:1px solid #CBD5E1; cursor:pointer;" onclick="document.getElementById('modalScrim').classList.remove('on')">Tutup</button>`}
    </div>`;
  openModal(html);
  if (insight.actionData) document.getElementById('btnApplyAction').onclick = () => applyInsightFilter(insight);
}

function applyInsightFilter(insight) {
  if (!insight.actionData) return;
  const { type, keys } = insight.actionData;
  if (!aiMeta?.validNamesByField) { toast('Data referensi hilang — jalankan analisis ulang.'); return; }
  const field = aiMeta.typeToField?.[type];
  if (!field) { toast('Tipe filter tidak dikenali.'); return; }
  const whitelist = aiMeta.validNamesByField[field] || [];
  const verified = keys.map(k => matchValidName(k, whitelist)).filter(Boolean);
  if (verified.length === 0) { toast('Nama tidak lagi valid.'); return; }

  store.state.filters.salesman = new Set();
  store.state.filters.produk = new Set();
  store.state.filters.divisi = new Set();
  store.state.filters.outlet = new Set();

  if (type === 'salesman') { store.state.filters.salesman = new Set(verified); store.set({ view: 'salesman' }); }
  else if (type === 'product') { store.state.filters.produk = new Set(verified); store.set({ view: 'product' }); }
  else if (type === 'outlet') { store.state.filters.outlet = new Set(verified); store.set({ view: 'outlet' }); }
  else { store.set({ view: 'overview' }); }

  document.getElementById('modalScrim').classList.remove('on');
  if (typeof store.emit === 'function') store.emit();
  toast(`Filter diterapkan: ${verified.length} ${type}`);
}

/* ================================================================== */
/* RUN                                                                 */
/* ================================================================== */
async function runAIAnalysis(state) {
  const filteredData = selectFiltered(state);
  if (!filteredData || filteredData.length === 0) { toast('Data kosong.'); return; }
  const apiKey = getApiKey();
  if (!apiKey) { promptApiKey(() => runAIAnalysis(state)); return; }

  isAnalyzing = true; aiResult = null; aiMeta = null;
  renderOutput();

  try {
    const summaryData = buildDataSummary(filteredData, state.filters);
    const prompt = buildPrompt(summaryData);
    const raw = await callGemini(apiKey, prompt);

    aiMeta = {
      validNamesByField: summaryData._validNamesByField,
      typeToField: summaryData._typeToField,
      filterSummary: getFilterSummary(state),
      numericTotals: summaryData.numericTotals,
      numericTotalsFormatted: summaryData.numericTotalsFormatted,
    };

    const result = validateResult(raw, summaryData);
    auditAiNumbers(result, summaryData); // log warning jika mismatch
    aiResult = result;

    // Tampilkan format total di console untuk verifikasi manual
    console.info('[FACTS] Total terverifikasi:',
      Object.fromEntries(Object.entries(summaryData.numericTotalsFormatted)));

    const actionCount = result.insights.filter(i => i.actionData).length;
    toast(`Laporan selesai! ${result.insights.length} insight, ${actionCount} siap difilter.`);
  } catch (err) {
    console.error('[Gemini Error]', err);
    toast('AI Error: ' + err.message);
    if (String(err.message).toLowerCase().includes('api key')) {
      localStorage.removeItem(API_KEY_STORAGE);
      localStorage.removeItem(MODELS_CACHE_KEY);
      cachedModel = null;
    }
  } finally {
    isAnalyzing = false;
    renderOutput();
  }
}

function update(container, state) {
  patchHTML('#insight-ai-container', shell());
  document.getElementById('btnRunAI').onclick = () => runAIAnalysis(state);
  document.getElementById('btnApiKeyCfg').onclick = () => promptApiKey(() => update(container, state));
  if (aiResult) renderOutput();
}

registerView('insight', {
  label: 'AI Insight',
  title: 'Expert AI Analyst',
  sub: 'Diagnosis · Forecast · Action Plan — Gemini',
  shell() { return `<div id="insight-ai-container"></div>`; },
  update,
  mount() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action-idx]');
      if (btn) handleAction(+btn.dataset.actionIdx);
    });
  },
});