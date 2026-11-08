/* ================================================================== */
/* INSIGHT VIEW — UI + Orkestrasi (dengan color-coded status)          */
/* ================================================================== */
import { esc } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { store } from '../core/store.js';
import { selectFiltered } from '../core/selectors.js';
import { registerView } from './registry.js';
import { openModal, toast } from '../ui/feedback.js';
import {
  parseNumber, formatIDR,
  normalizeName, matchValidName, buildValidNamesMap,
  buildFactPack, computeHealthScore, seedInsights,
  buildPrompt, callGemini, callGeminiMultiPass, resetCachedModel, getCachedModel,
  enforceNumbersInResult, validateCitations, validateResult,
  generateDeterministicMetrics, isQuotaError, PREFERRED_MODELS, BENCHMARKS,
} from './insight-engine.js';
import {
  savePlaybook, findSimilarPlaybooks, computeProblemSignature,
} from './insight-playbooks.js';
import {
  recordFeedback, applyFeedbackAdaptation, getInsightStats,
} from './insight-feedback.js';

const API_KEY_STORAGE = 'gemini_api_key';
const INSIGHT_CACHE_KEY = 'ai_insight_cache_v2';
const CACHE_TTL_MS = 60 * 60 * 1000;

let isAnalyzing = false;
let aiResult = null;
let aiMeta = null;
let loadingInterval = null;

/* ================================================================== */
/* TONE SYSTEM — HIJAU / KUNING / MERAH / BIRU                         */
/* ================================================================== */
function statusTone(status) {
  return {
    good:    { color: '#10B981', bg: '#F0FDF4', border: '#BBF7D0', label: 'BAIK' },
    warn:    { color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', label: 'WASPADA' },
    bad:     { color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', label: 'KRITIS' },
    neutral: { color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', label: 'INFO' },
  }[status] || { color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', label: '' };
}

function toneByValue(value, good, warn, reverse = false) {
  if (value == null || !isFinite(value)) return 'neutral';
  if (reverse) {
    if (value <= good) return 'good';
    if (value <= warn) return 'warn';
    return 'bad';
  }
  if (value >= good) return 'good';
  if (value >= warn) return 'warn';
  return 'bad';
}

function healthTone(s) { return s >= 75 ? 'good' : s >= 55 ? 'warn' : 'bad'; }
function severityTone(sev) {
  if (sev === 'critical') return 'bad';
  if (sev === 'high') return 'warn';
  if (sev === 'growth') return 'good';
  return 'neutral';
}
function priorityTone(p) {
  if (p <= 1) return 'bad';
  if (p <= 3) return 'warn';
  if (p <= 6) return 'neutral';
  return 'good';
}
function effortTone(effort) {
  if (effort === 'low') return 'good';
  if (effort === 'medium') return 'warn';
  return 'bad';
}
function impactTone(impact) {
  if (impact === 'high') return 'bad';
  if (impact === 'medium') return 'warn';
  return 'good';
}
function riskLevelTone(lvl) {
  if (lvl === 'critical') return 'bad';
  if (lvl === 'high') return 'bad';
  if (lvl === 'medium') return 'warn';
  return 'good';
}
function trendTone(trend) {
  if (trend === 'up') return 'good';
  if (trend === 'down') return 'bad';
  return 'neutral';
}

function detectMetricTone(m) {
  const label = String(m.label || '').toLowerCase();
  const fid = String(m.factId || '').toUpperCase();
  const rawVal = parseNumber(m.value);

  if (/return.*rate|ret.*rate/.test(label) || fid === 'P_RET_RATE') return toneByValue(rawVal, 2, 5, true);
  if (/coverage|cover/.test(label) || fid === 'P_COVERAGE') return toneByValue(rawVal, 80, 60);
  if (/item.*trx|ipt/.test(label) || fid === 'P_IPT') return toneByValue(rawVal, 6, 3);
  if (/efektif|call/.test(label) || fid === 'P_EC') return toneByValue(rawVal, 20, 12);
  if (/growth|vs\s*lm|vs\s*bulan|vs\s*tahun|wow|swly/.test(label) || /G_GROWTH|G_WOW/.test(fid)) return toneByValue(rawVal, 5, 0);
  if (/quality|fresh/.test(label) || fid === 'Q_SCORE') return toneByValue(rawVal, 80, 60);
  if (/health/i.test(label) || fid === 'HEALTH_SCORE') return toneByValue(rawVal, 75, 55);
  if (/not.?yet|belum/.test(label) || fid === 'P_NOT_YET') return rawVal === 0 ? 'good' : rawVal <= 5 ? 'warn' : 'bad';
  return trendTone(m.trend);
}

/* ================================================================== */
/* ★ AUTO-HIGHLIGHT TEKS (hijau/kuning/merah)                          */
/* ================================================================== */
function highlightSafe(html, pattern, replacement) {
  // Split by HTML tag — hanya proses text nodes, tag di-skip
  return html.split(/(<[^>]+>)/).map(part => {
    if (part.startsWith('<')) return part;
    return part.replace(pattern, replacement);
  }).join('');
}

/**
 * autoHighlightSummary — parse teks, wrap:
 *  - "turun 12%", "rugi 5%" → background merah
 *  - "naik 20%", "growth +15%" → background hijau
 *  - "-5%", "+15%" standalone → background sesuai tanda
 *  - kata kunci negatif → teks merah bold
 *  - kata kunci positif → teks hijau bold
 */
function autoHighlightSummary(text) {
  if (!text) return '';
  let html = esc(text);

  /* Bold markdown **...** → <b> */
  html = html.replace(/\*\*(.*?)\*\*/g, '<b style="color:#0F172A;">$1</b>');

  /* Placeholder agar tidak double-wrap */
  const wrapped = [];
  const tag = (inner, style) => {
    wrapped.push('<span style="' + style + '">' + inner + '</span>');
    return '\u0000P' + (wrapped.length - 1) + '\u0000';
  };

  /* 1. Kata negatif + NUM% */
  html = highlightSafe(html,
    /\b(turun|menurun|merosot|anjlok|rugi|defisit|minus|kalah|gagal)\s+([\d.,]+\s*%)/gi,
    (m) => tag(m, 'background:#FEE2E2; color:#B91C1C; padding:1px 6px; border-radius:4px; font-weight:800;'));

  /* 2. Kata positif + NUM% */
  html = highlightSafe(html,
    /\b(naik|tumbuh|meningkat|unggul|growth|positif|melampaui|sukses)\s+([\d.,]+\s*%)/gi,
    (m) => tag(m, 'background:#DCFCE7; color:#15803D; padding:1px 6px; border-radius:4px; font-weight:800;'));

  /* 3. Standalone +/- NUM% */
  html = highlightSafe(html, /([+-]\d+[,.]?\d*\s*%)/g, (m) => {
    const style = m.startsWith('-')
      ? 'background:#FEE2E2; color:#B91C1C; padding:1px 6px; border-radius:4px; font-weight:800;'
      : 'background:#DCFCE7; color:#15803D; padding:1px 6px; border-radius:4px; font-weight:800;';
    return tag(m, style);
  });

  /* 4. Kata kunci negatif standalone */
  html = highlightSafe(html,
    /\b(turun|menurun|merosot|anjlok|rugi|defisit|minus|kalah|gagal|stagnan|rendah|kurang|kritis|waspada|warning)\b/gi,
    (m) => tag(m, 'color:#B91C1C; font-weight:800;'));

  /* 5. Kata kunci positif standalone */
  html = highlightSafe(html,
    /\b(naik|tumbuh|meningkat|unggul|growth|positif|tertinggi|terbaik|kuat|sehat|optimal|melampaui|sukses|solid|cemerlang)\b/gi,
    (m) => tag(m, 'color:#15803D; font-weight:800;'));

  /* Restore placeholder */
  return html.replace(/\u0000P(\d+)\u0000/g, (_, i) => wrapped[+i]);
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
    resetCachedModel();
    localStorage.removeItem(INSIGHT_CACHE_KEY);
    document.getElementById('modalScrim').classList.remove('on');
    toast('API key tersimpan!');
    onSuccess && onSuccess();
  };
}

/* ================================================================== */
/* UI HELPERS                                                          */
/* ================================================================== */
function scoreColor(s) { return statusTone(healthTone(s)).color; }

function sectionHeader(num, title, subtitle) {
  return `<div style="display:flex; align-items:baseline; gap:12px; margin:28px 0 14px 0;">
    <div style="font-size:11px; font-weight:900; color:#94A3B8; letter-spacing:2px;">${num}</div>
    <div>
      <div style="font-size:17px; font-weight:900; color:#0F172A; letter-spacing:-0.3px;">${esc(title)}</div>
      ${subtitle ? `<div style="font-size:11px; color:#64748B; margin-top:2px;">${esc(subtitle)}</div>` : ''}
    </div>
  </div>`;
}

function pill(t, bg, fg) {
  return `<span style="display:inline-block; padding:3px 10px; background:${bg}; color:${fg}; border-radius:99px; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">${esc(t)}</span>`;
}

function tonePill(text, status) {
  const t = statusTone(status);
  return pill(text, t.bg, t.color);
}

function citeBadge(citedFacts) {
  if (!citedFacts || citedFacts.length === 0) return '';
  return `<div style="font-size:10px; color:#64748B; margin-bottom:8px; line-height:1.5;">📎 Berdasarkan fakta: ${citedFacts.map(id => `<code style="background:#F1F5F9; padding:1px 5px; border-radius:3px; margin:0 2px; font-family:monospace;">${esc(id)}</code>`).join(' ')}</div>`;
}

function sourceBadge(source) {
  return source === 'seed'
    ? `<span style="font-size:9px; background:#DCFCE7; color:#166534; padding:2px 8px; border-radius:999px; font-weight:800; letter-spacing:0.5px; margin-left:8px;">AUTO-DETECTED</span>`
    : `<span style="font-size:9px; background:#DBEAFE; color:#1E40AF; padding:2px 8px; border-radius:999px; font-weight:800; letter-spacing:0.5px; margin-left:8px;">AI INSIGHT</span>`;
}

/* ================================================================== */
/* RENDERERS                                                           */
/* ================================================================== */
function renderHeroBreakdown(r) {
  const dims = [
    { key: 'salesPerformance', label: 'Sales Performance' },
    { key: 'productMix', label: 'Product Mix' },
    { key: 'outletCoverage', label: 'Outlet Coverage' },
    { key: 'salesmanProductivity', label: 'Salesman Productivity' },
    { key: 'operationalEfficiency', label: 'Operational Efficiency' },
  ];
  return `<div style="padding:20px 24px; background:#fff; border-bottom:1px solid #E2E8F0;">
    <div style="font-size:11px; font-weight:900; color:#64748B; letter-spacing:2px; margin-bottom:14px;">HEALTH BREAKDOWN</div>
    ${dims.map(d => {
      const v = r.healthBreakdown[d.key] ?? 0;
      const t = statusTone(healthTone(v));
      return `<div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
          <span style="color:#475569; font-weight:600;">${d.label}</span>
          <span style="color:${t.color}; font-weight:800;">${v}<span style="opacity:.6;font-weight:600;">/100</span></span>
        </div>
        <div style="height:8px; background:#F1F5F9; border-radius:4px; overflow:hidden;">
          <div style="height:100%; width:${v}%; background:${t.color}; transition:width 0.8s;"></div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderKeyMetrics(metrics) {
  if (!metrics.length) return '';
  const ti = { up: '📈', down: '📉', flat: '➖' };
  return sectionHeader('04', 'Key Metrics Dashboard', 'Warna otomatis: 🟢 baik · 🟡 waspada · 🔴 kritis') + `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
      ${metrics.map(m => {
        const tone = detectMetricTone(m);
        const t = statusTone(tone);
        const icon = tone === 'good' ? '🟢' : tone === 'warn' ? '🟡' : tone === 'bad' ? '🔴' : '🔵';
        const insightHtml = autoHighlightSummary(m.insight || '');
        return `<div style="background:${t.bg}; border:1.5px solid ${t.border}; border-left:5px solid ${t.color}; border-radius:10px; padding:14px; position:relative;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div style="font-size:10px; font-weight:800; color:#64748B; text-transform:uppercase; letter-spacing:0.5px;">${esc(m.label)}</div>
            <span style="font-size:14px;">${icon}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px;">
            <div style="font-size:21px; font-weight:900; color:${t.color}; line-height:1.1;">${esc(m.value)}</div>
            <div style="color:${statusTone(trendTone(m.trend)).color}; font-size:16px; flex-shrink:0;">${ti[m.trend] || '➖'}</div>
          </div>
          <div style="font-size:11px; color:#475569; margin-top:8px; line-height:1.5;">${insightHtml}</div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderForecast(f) {
  const t = statusTone(f.direction === 'up' ? 'good' : f.direction === 'down' ? 'bad' : 'neutral');
  const icon = f.direction === 'up' ? '📈' : f.direction === 'down' ? '📉' : '➖';
  const label = f.direction === 'up' ? 'Membaik' : f.direction === 'down' ? 'Menurun' : 'Stabil';
  const cc = { low: statusTone('bad').color, medium: statusTone('warn').color, high: statusTone('good').color }[f.confidence] || '#64748B';
  return sectionHeader('05', 'Forecast & Prediksi', 'Estimasi arah bisnis') + `
    <div style="background:${t.bg}; border:1px solid ${t.border}; border-left:5px solid ${t.color}; border-radius:10px; padding:18px;">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
        <div style="font-size:28px;">${icon}</div>
        <div>
          <div style="font-size:16px; font-weight:900; color:${t.color};">Arah: ${label}</div>
          <div style="font-size:11px; color:#64748B; margin-top:2px;">Confidence: <b style="color:${cc}; text-transform:uppercase;">${f.confidence}</b></div>
        </div>
      </div>
      <div style="font-size:13px; color:#334155; line-height:1.6;">${autoHighlightSummary(f.reasoning)}</div>
    </div>`;
}

function renderRiskAssessment(risk) {
  const t = statusTone(riskLevelTone(risk.overallLevel));
  return sectionHeader('06', 'Risk Assessment', 'Risiko & mitigasi') + `
    <div style="background:${t.bg}; border:1px solid ${t.border}; border-left:5px solid ${t.color}; border-radius:10px; padding:16px; margin-bottom:14px;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <div style="width:10px; height:10px; border-radius:50%; background:${t.color}; animation:pulse 2s infinite;"></div>
        <div style="font-size:13px; font-weight:900; color:${t.color}; text-transform:uppercase; letter-spacing:1px;">Level: ${risk.overallLevel}</div>
      </div>
      <div style="font-size:13px; color:#334155; line-height:1.6;">${autoHighlightSummary(risk.concentrationRisk)}</div>
    </div>
    ${risk.topRisks.map(r => {
      const it = statusTone(impactTone(r.impact));
      return `<div style="background:#fff; border:1px solid #E2E8F0; border-left:3px solid ${it.color}; border-radius:8px; padding:14px; margin-bottom:10px;">
        <div style="display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap;">
          ${tonePill('Impact: ' + r.impact, impactTone(r.impact))}
          ${tonePill('Likelihood: ' + r.likelihood, impactTone(r.likelihood))}
        </div>
        <div style="font-size:13px; font-weight:800; color:#0F172A; margin-bottom:6px;">${autoHighlightSummary(r.risk)}</div>
        <div style="font-size:12px; color:#475569; line-height:1.5;"><b style="color:${statusTone('good').color};">Mitigasi:</b> ${autoHighlightSummary(r.mitigation)}</div>
      </div>`;
    }).join('')}`;
}

function renderSwot(s) {
  const quad = (label, items, tone, icon) => {
    const t = statusTone(tone);
    return `<div style="background:${t.bg}; border:1px solid ${t.border}; border-radius:10px; padding:14px;">
      <div style="font-size:11px; font-weight:900; color:${t.color}; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px;">${icon} ${label}</div>
      <ul style="margin:0; padding-left:18px; font-size:12px; color:#334155; line-height:1.7;">
        ${items.length ? items.map(i => `<li>${autoHighlightSummary(i)}</li>`).join('') : '<li style="color:#94A3B8; font-style:italic;">—</li>'}
      </ul></div>`;
  };
  return sectionHeader('07', 'SWOT Analysis', '') + `<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
    ${quad('Strengths', s.strengths, 'good', '💪')}
    ${quad('Weaknesses', s.weaknesses, 'bad', '⚠️')}
    ${quad('Opportunities', s.opportunities, 'neutral', '🚀')}
    ${quad('Threats', s.threats, 'warn', '🔥')}
  </div>`;
}

function renderOpportunities(opps) {
  if (!opps.length) return '';
  return sectionHeader('08', 'Peluang Pertumbuhan', 'Impact vs Effort') + `<div style="display:grid; gap:12px;">
    ${opps.map(o => {
      const it = statusTone(impactTone(o.potentialImpact));
      return `<div style="background:#fff; border:1px solid #E2E8F0; border-left:3px solid ${it.color}; border-radius:10px; padding:16px;">
        <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:8px;">
          <div style="font-size:14px; font-weight:800; color:#0F172A; flex:1;">${autoHighlightSummary(o.title)}</div>
          <div style="display:flex; gap:6px;">
            ${tonePill('Impact: ' + o.potentialImpact, impactTone(o.potentialImpact))}
            ${tonePill('Effort: ' + o.effort, effortTone(o.effort))}
          </div>
        </div>
        <div style="font-size:12px; color:#475569; line-height:1.6;">${autoHighlightSummary(o.description)}</div>
        <div style="font-size:11px; color:#94A3B8; margin-top:8px;">⏱ ${esc(o.timeframe)}</div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderInsights(insights) {
  return sectionHeader('09', `Rekomendasi Strategis (${insights.length})`, 'Urut prioritas · 🟢 sedang · 🟡 penting · 🔴 kritis') + `<div style="display:grid; gap:12px;">
    ${insights.map((i, idx) => {
      const tone = severityTone(i.severity);
      const t = statusTone(tone);
      const icon = i.severity === 'critical' ? '🚨' : i.severity === 'high' ? '⚠️' : i.severity === 'growth' ? '🚀' : '💡';
      const pt = statusTone(priorityTone(i.priority));
      const filterBadge = i.actionData
        ? `<div style="font-size:11px; color:#1E3A8A; background:#DBEAFE; display:inline-block; padding:4px 10px; border-radius:6px; font-weight:800; margin-bottom:10px;">🔎 Filter siap: ${esc(i.actionData.type)} = ${i.actionData.keys.map(k => `<b>${esc(k)}</b>`).join(', ')}</div><br>` : '';
      const unverifiedBadge = i.unverified
        ? `<span style="font-size:9px; background:${statusTone('warn').bg}; color:${statusTone('warn').color}; padding:2px 8px; border-radius:999px; font-weight:800; margin-left:8px;">UNVERIFIED</span>` : '';
      const feedbackAdaptBadge = i.feedbackAdaptation
        ? `<span style="font-size:9px; background:#FCE7F3; color:#9D174D; padding:2px 8px; border-radius:999px; font-weight:800; margin-left:8px;">ADAPTED: ${esc(i.feedbackAdaptation.reason)}</span>` : '';
      return `<div style="background:${t.bg}; border:1px solid ${t.border}; border-left:6px solid ${t.color}; padding:18px; border-radius:10px;">
        <div style="display:flex; align-items:flex-start; gap:12px;">
          <div style="font-size:22px;">${icon}</div>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                <div style="font-size:10px; font-weight:800; color:${t.color}; text-transform:uppercase; letter-spacing:0.5px;">${esc(i.category)}</div>
                ${sourceBadge(i.source)}${unverifiedBadge}${feedbackAdaptBadge}
              </div>
              <div style="font-size:10px; font-weight:800; color:${pt.color}; background:${pt.bg}; padding:3px 8px; border-radius:99px; border:1px solid ${pt.border};">PRIORITAS #${i.priority}</div>
            </div>
            <div style="font-size:15px; font-weight:800; color:#0F172A; margin-bottom:6px;">${autoHighlightSummary(i.title)}</div>
            <div class="ai-desc" style="white-space:pre-line; font-size:13px; color:#475569; line-height:1.6; margin-bottom:10px;">${autoHighlightSummary(i.desc)}</div>
            ${citeBadge(i.citedFacts)}
            ${i.expectedImpact ? `<div style="font-size:11px; color:${statusTone('good').color}; background:${statusTone('good').bg}; display:inline-block; padding:4px 10px; border-radius:6px; font-weight:800; margin-bottom:10px;">🎯 ${autoHighlightSummary(i.expectedImpact)}</div><br>` : ''}
            ${filterBadge}
            <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; align-items:center;">
              <button class="ai-action-btn" data-action-idx="${idx}" style="background:#0F172A; padding:8px 16px; border-radius:6px; font-weight:700; font-size:12px; color:#fff; border:none; cursor:pointer;">Lihat Solusi →</button>
              <button class="ai-feedback-btn" data-feedback-idx="${idx}" data-useful="1" style="background:${statusTone('good').bg}; color:${statusTone('good').color}; padding:6px 12px; border-radius:6px; border:1px solid ${statusTone('good').border}; font-size:11px; cursor:pointer; font-weight:700;">👍 Berguna</button>
              <button class="ai-feedback-btn" data-feedback-idx="${idx}" data-useful="0" style="background:${statusTone('bad').bg}; color:${statusTone('bad').color}; padding:6px 12px; border-radius:6px; border:1px solid ${statusTone('bad').border}; font-size:11px; cursor:pointer; font-weight:700;">👎 Kurang</button>
              <button class="ai-playbook-btn" data-playbook-idx="${idx}" style="background:${statusTone('neutral').bg}; color:${statusTone('neutral').color}; padding:6px 12px; border-radius:6px; border:1px solid ${statusTone('neutral').border}; font-size:11px; cursor:pointer; font-weight:700;">📌 Simpan</button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderQuickWins(wins) {
  if (!wins.length) return '';
  return sectionHeader('10', `Quick Wins (${wins.length})`, 'Eksekusi minggu ini') + `<div style="display:grid; gap:10px;">
    ${wins.map(w => {
      return `<div style="background:#fff; border:1px solid ${statusTone('good').border}; border-left:5px solid ${statusTone('good').color}; border-radius:8px; padding:14px; display:flex; gap:12px; align-items:flex-start;">
        <div style="font-size:20px;">⚡</div>
        <div style="flex:1;">
          <div style="font-size:13px; font-weight:800; color:#0F172A; margin-bottom:4px;">${autoHighlightSummary(w.action)}</div>
          <div style="font-size:12px; color:${statusTone('good').color}; margin-bottom:6px;">✅ ${autoHighlightSummary(w.expectedOutcome)}</div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${tonePill('Effort: ' + w.effort, effortTone(w.effort))}
            ${pill('Owner: ' + w.owner, '#F1F5F9', '#475569')}
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderActionPlan(plan) {
  const col = (t, s, items, tone) => {
    const tt = statusTone(tone);
    return `<div style="background:#fff; border:1px solid #E2E8F0; border-radius:10px; padding:14px; border-top:4px solid ${tt.color};">
      <div style="font-size:11px; font-weight:900; color:${tt.color}; letter-spacing:1px; text-transform:uppercase;">${t}</div>
      <div style="font-size:10px; color:#94A3B8; margin-bottom:10px;">${s}</div>
      ${items.length === 0 ? '<div style="font-size:12px; color:#94A3B8; font-style:italic;">Tidak ada.</div>' : items.map(it => `<div style="border-left:2px solid ${tt.color}40; padding:8px 10px; margin-bottom:8px; background:${tt.bg}; border-radius:4px;">
        <div style="font-size:12px; font-weight:700; color:#0F172A; line-height:1.4; margin-bottom:4px;">${autoHighlightSummary(it.action)}</div>
        <div style="font-size:10px; color:#64748B; margin-bottom:2px;">👤 ${esc(it.owner)} · ⏱ ${esc(it.deadline)}</div>
        <div style="font-size:10px; color:${statusTone('good').color}; font-weight:600;">📊 ${esc(it.kpi)}</div>
      </div>`).join('')}
    </div>`;
  };
  return sectionHeader('11', 'Action Plan 30/60/90', 'Roadmap eksekusi') + `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
    ${col('Short Term', '0–30 hari', plan.shortTerm, 'bad')}
    ${col('Mid Term', '30–60 hari', plan.midTerm, 'warn')}
    ${col('Long Term', '60–90 hari', plan.longTerm, 'neutral')}
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
        <td style="padding:10px 12px; color:#334155;">${autoHighlightSummary(k.current)}</td>
        <td style="padding:10px 12px; color:${statusTone('good').color}; font-weight:700;">${esc(k.target)}</td>
        <td style="padding:10px 12px; color:#64748B;">${esc(k.frequency)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
}

/* ================================================================== */
/* SHELL                                                               */
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
  const modelLabel = getCachedModel() || PREFERRED_MODELS[0];
  return `
    <div class="card mb12" id="ai-hero" style="text-align:center; padding:40px 20px; background:linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%); border-radius:16px; box-shadow:0 10px 25px rgba(29,78,216,0.3); position:relative; overflow:hidden;">
      <div style="position:absolute; top:-50px; right:-50px; width:200px; height:200px; background:rgba(255,255,255,0.1); border-radius:50%;"></div>
      <div style="position:absolute; bottom:-30px; left:-30px; width:150px; height:150px; background:rgba(255,255,255,0.1); border-radius:50%;"></div>
      <div style="font-size:48px; margin-bottom:12px; text-shadow:0 4px 10px rgba(0,0,0,0.2);">🧠</div>
      <div style="font-size:24px; font-weight:900; color:#fff; margin-bottom:8px; letter-spacing:-0.5px;">Expert AI Board</div>
      <div style="font-size:14px; color:#BFDBFE; margin-bottom:24px; max-width:460px; margin-left:auto; margin-right:auto; line-height:1.5;">Laporan 12-modul · status warna otomatis · powered by Gemini.</div>
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
        <button id="btnRefreshAI" style="background:transparent; border:none; color:rgba(255,255,255,0.75); font-size:11px; text-decoration:underline; cursor:pointer;">
          🔄 Refresh (bypass cache)
        </button>
        <span style="font-size:11px; color:rgba(255,255,255,0.55);">Model: <b style="color:rgba(255,255,255,0.85);">${esc(modelLabel)}</b></span>
      </div>
    </div>
    <div id="ai-output" style="animation: fadeIn 0.5s ease;"></div>
    <style>
      @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.6; } 100% { transform: scale(1); opacity: 1; } }
      .ai-loading-text { animation: pulse 1.5s infinite; font-weight: 700; color: #1D4ED8; font-size: 15px; margin-top: 12px; }
    </style>`;
}

/* ================================================================== */
/* CACHE                                                               */
/* ================================================================== */
function getFilterHash(state) {
  const f = state.filters;
  const parts = [];
  for (const k of Object.keys(f).sort()) {
    const v = f[k];
    if (v instanceof Set) parts.push(`${k}=${Array.from(v).sort().join(',')}`);
    else if (v != null && v !== '') parts.push(`${k}=${v}`);
  }
  const rows = selectFiltered(state);
  let sum = 0;
  for (const r of rows) { const amt = Number(r.amount) || 0; sum += r.tt === 'F' ? amt : -amt; }
  parts.push(`n=${rows.length}`);
  parts.push(`sum=${Math.round(sum)}`);
  return parts.join('|');
}

function loadCache(hash) {
  try {
    const raw = localStorage.getItem(INSIGHT_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.hash !== hash) return null;
    if (Date.now() - data.ts > CACHE_TTL_MS) { localStorage.removeItem(INSIGHT_CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}

function saveCache(hash, payload) {
  try { localStorage.setItem(INSIGHT_CACHE_KEY, JSON.stringify({ hash, ts: Date.now(), ...payload })); }
  catch { localStorage.removeItem(INSIGHT_CACHE_KEY); }
}

/* ================================================================== */
/* RENDER OUTPUT                                                       */
/* ================================================================== */
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
      'Menghitung FACT PACK...',
      'Menyusun health score...',
      'Menjalankan seed insights...',
      'Memuat playbook relevan...',
      '✨ Pass 1/3: AI drafting laporan...',
      '🔍 Pass 2/3: AI mengaudit draft...',
      '✅ Pass 3/3: Refine berdasarkan audit...',
      'Validasi sitasi fakta...',
      'Enforce angka (anti-hallucination)...',
      'Finalisasi laporan...',
    ];
    let step = 0, bar = 0;
    clearInterval(loadingInterval);
    loadingInterval = setInterval(() => {
      const t = document.getElementById('ai-loading-txt'), b = document.getElementById('ai-loading-bar');
      if (!t || !b) { clearInterval(loadingInterval); return; }
      step = (step + 1) % texts.length;
      if (bar < 90) bar += 3;
      t.textContent = texts[step];
      b.style.width = bar + '%';
    }, 550);
    return;
  }

  clearInterval(loadingInterval);
  if (!aiResult) { out.innerHTML = ''; return; }

  const r = aiResult;
  if (!r.insights || r.insights.length === 0) {
    out.innerHTML = `<div class="card" style="text-align:center; padding:32px; background:${statusTone('bad').bg}; border:1px solid ${statusTone('bad').border}; margin-top:12px;">
      <div style="font-size:40px; margin-bottom:8px;">📭</div>
      <div style="font-weight:800; color:${statusTone('bad').color}; font-size:16px;">AI tidak menemukan insight</div>
    </div>`;
    return;
  }

  const ht = statusTone(healthTone(r.healthScore));
  const summaryHtml = autoHighlightSummary(r.summary);
  const seedCount = r.insights.filter(i => i.source === 'seed').length;
  const aiCount = r.insights.filter(i => i.source === 'ai').length;
  const mpMeta = aiMeta?.multiPassMeta;
  const passLabel = mpMeta ? `${mpMeta.passes} pass${mpMeta.critique ? `, quality ${mpMeta.critique.qualityScore ?? '?'}/100` : ''}` : '';
  const pbCount = aiMeta?.playbooks?.length || 0;

  const sevCounts = { critical: 0, high: 0, growth: 0, info: 0 };
  for (const i of r.insights) sevCounts[i.severity] = (sevCounts[i.severity] || 0) + 1;

  const statusStrip = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px; padding:16px 24px; background:#F8FAFC; border-bottom:1px solid #E2E8F0;">
      <div style="background:${statusTone('bad').bg}; border:1px solid ${statusTone('bad').border}; border-radius:8px; padding:10px 14px; text-align:center;">
        <div style="font-size:10px; font-weight:800; color:${statusTone('bad').color}; letter-spacing:1px;">🚨 KRITIS</div>
        <div style="font-size:22px; font-weight:900; color:${statusTone('bad').color};">${sevCounts.critical}</div>
      </div>
      <div style="background:${statusTone('warn').bg}; border:1px solid ${statusTone('warn').border}; border-radius:8px; padding:10px 14px; text-align:center;">
        <div style="font-size:10px; font-weight:800; color:${statusTone('warn').color}; letter-spacing:1px;">⚠️ WASPADA</div>
        <div style="font-size:22px; font-weight:900; color:${statusTone('warn').color};">${sevCounts.high}</div>
      </div>
      <div style="background:${statusTone('good').bg}; border:1px solid ${statusTone('good').border}; border-radius:8px; padding:10px 14px; text-align:center;">
        <div style="font-size:10px; font-weight:800; color:${statusTone('good').color}; letter-spacing:1px;">🚀 PELUANG</div>
        <div style="font-size:22px; font-weight:900; color:${statusTone('good').color};">${sevCounts.growth}</div>
      </div>
      <div style="background:${statusTone('neutral').bg}; border:1px solid ${statusTone('neutral').border}; border-radius:8px; padding:10px 14px; text-align:center;">
        <div style="font-size:10px; font-weight:800; color:${statusTone('neutral').color}; letter-spacing:1px;">💡 INFO</div>
        <div style="font-size:22px; font-weight:900; color:${statusTone('neutral').color};">${sevCounts.info}</div>
      </div>
    </div>`;

  out.innerHTML = `
    <div id="ai-report-card" style="background:#fff; border-radius:14px; box-shadow:0 6px 24px rgba(0,0,0,0.08); overflow:hidden; margin-bottom:20px;">
      <div style="background:#0F172A; padding:24px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:16px; align-items:center;">
        <div>
          <div style="font-size:11px; font-weight:800; color:#94A3B8; letter-spacing:2px;">EXECUTIVE REPORT</div>
          <div style="font-size:22px; font-weight:900; color:#fff; margin-top:4px; letter-spacing:-0.5px;">Laporan Konsultan Bisnis</div>
          <div style="font-size:11px; color:#94A3B8; margin-top:4px;">12 modul · ${seedCount} auto-detected + ${aiCount} AI · ${passLabel}${pbCount > 0 ? ` · ${pbCount} playbook` : ''}</div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <button class="btn sm" data-quick-export="#ai-report-card" data-title="Laporan AI Analyst" data-filename="ai_insight_report" style="background:#334155; color:#fff; border:none; cursor:pointer;">📥 Ekspor</button>
          <div style="background:${ht.color}; color:#fff; padding:12px 20px; border-radius:10px; font-weight:900; font-size:26px; line-height:1; box-shadow:0 0 0 3px ${ht.color}33;">
            ${r.healthScore}<span style="font-size:11px; opacity:0.85;"> /100</span>
            <div style="font-size:9px; font-weight:800; letter-spacing:1px; opacity:.9; margin-top:2px;">${ht.label}</div>
          </div>
        </div>
      </div>
      ${statusStrip}
      <div style="padding:14px 24px; background:#FFF; border-bottom:1px solid #E2E8F0; display:flex; gap:16px; flex-wrap:wrap; font-size:11px; color:#475569;">
        <span style="font-weight:800; color:#94A3B8; letter-spacing:1px;">LEGENDA:</span>
        <span><span style="display:inline-block; width:10px; height:10px; background:#10B981; border-radius:2px; vertical-align:middle; margin-right:4px;"></span> Baik / Naik</span>
        <span><span style="display:inline-block; width:10px; height:10px; background:#F59E0B; border-radius:2px; vertical-align:middle; margin-right:4px;"></span> Waspada / Sedang</span>
        <span><span style="display:inline-block; width:10px; height:10px; background:#EF4444; border-radius:2px; vertical-align:middle; margin-right:4px;"></span> Kritis / Turun</span>
        <span><span style="display:inline-block; width:10px; height:10px; background:#3B82F6; border-radius:2px; vertical-align:middle; margin-right:4px;"></span> Informasi</span>
      </div>
      ${renderHeroBreakdown(r)}
      <div style="padding:24px 24px 0 24px;">
        <div style="font-size:14px; line-height:1.7; color:#334155; background:${ht.bg}; padding:20px; border-radius:12px; border-left:4px solid ${ht.color};">${summaryHtml}</div>
      </div>
      <div style="padding:0 24px 24px 24px;">
        ${renderKeyMetrics(r.keyMetrics)}
        ${renderForecast(r.forecast)}
        ${renderRiskAssessment(r.riskAssessment)}
        ${renderSwot(r.swot)}
        ${renderOpportunities(r.opportunities)}
        ${renderInsights(r.insights)}
        ${renderQuickWins(r.quickWins)}
        ${renderActionPlan(r.actionPlan)}
        ${renderKpis(r.kpisToMonitor)}
      </div>
    </div>`;
}

/* ================================================================== */
/* ACTION MODAL                                                        */
/* ================================================================== */
function handleAction(idx) {
  const insight = aiResult.insights[idx];
  if (!insight) return;

  const tone = severityTone(insight.severity);
  const t = statusTone(tone);

  const techList = (insight.techActions || []).map(a => `<li style="margin-bottom:6px;">${autoHighlightSummary(a)}</li>`).join('');
  const nonTechList = (insight.nonTechnicalActions || []).map(a => `<li style="margin-bottom:6px;">${autoHighlightSummary(a)}</li>`).join('');

  let filterPreview = '';
  if (insight.actionData) {
    const { type, keys } = insight.actionData;
    filterPreview = `<div style="background:${statusTone('neutral').bg}; border:1px solid ${statusTone('neutral').border}; padding:16px; border-radius:8px; margin-bottom:20px;">
      <div style="font-size:12px; color:${statusTone('neutral').color}; font-weight:800; margin-bottom:8px;">🔎 Akan Menyaring (${keys.length} nama terverifikasi)</div>
      <div style="font-size:12px; color:${statusTone('neutral').color}; margin-bottom:12px; line-height:1.6;">
        <b>Tipe:</b> ${esc(type)}<br><b>Nama:</b> ${keys.map(k => `<code style="background:#fff; padding:1px 6px; border-radius:4px;">${esc(k)}</code>`).join(', ')}
      </div>
      <button class="btn-action-exec" id="btnApplyAction" style="width:100%; padding:12px; font-weight:800; border-radius:6px; background:${statusTone('neutral').color}; color:#fff; border:none; cursor:pointer;">✅ Terapkan Filter & Buka Data</button>
    </div>`;
  }

  const citationBlock = insight.citedFacts && insight.citedFacts.length > 0
    ? `<div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:12px 14px; border-radius:8px; margin-bottom:16px;">
        <div style="font-size:11px; font-weight:800; color:#475569; margin-bottom:6px;">📎 FAKTA YANG MENDASARI</div>
        <div style="font-size:11px; color:#475569; line-height:1.6; font-family:monospace;">
          ${insight.citedFacts.map(id => {
            const fact = aiMeta?.pack?.facts?.find(f => f.id === id);
            return `<div style="margin-bottom:3px;"><code style="background:${statusTone('neutral').bg}; color:${statusTone('neutral').color}; padding:1px 5px; border-radius:3px;">${esc(id)}</code> → ${fact ? esc(fact.formatted) : '—'}</div>`;
          }).join('')}
        </div>
      </div>` : '';

  const html = `
    <div class="modal-h" style="background:${t.color}; color:#fff; padding:20px;">
      <h3 style="font-size:16px; margin:0;">${insight.severity === 'critical' ? '🚨' : insight.severity === 'high' ? '⚠️' : insight.severity === 'growth' ? '🚀' : '💡'} Executive Playbook</h3>
      <button class="x" style="color:#fff;">×</button>
    </div>
    <div class="modal-b" style="padding:20px; max-height:80vh; overflow-y:auto;">
      <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
        ${sourceBadge(insight.source)}
        ${tonePill(t.label, tone)}
      </div>
      <div style="font-size:18px; font-weight:900; color:#0F172A; margin-bottom:8px;">${autoHighlightSummary(insight.title)}</div>
      ${insight.expectedImpact ? `<div style="font-size:12px; color:${statusTone('good').color}; background:${statusTone('good').bg}; display:inline-block; padding:4px 10px; border-radius:6px; font-weight:800; margin-bottom:16px;">🎯 ${autoHighlightSummary(insight.expectedImpact)}</div>` : ''}
      ${citationBlock}
      <div style="margin-bottom:20px;">
        <div style="font-size:13px; font-weight:800; color:${statusTone('good').color}; margin-bottom:8px;">🤝 Tindakan Bisnis & Lapangan</div>
        <ul style="margin:0; padding:16px 16px 16px 36px; font-size:13px; color:#334155; line-height:1.6; background:${statusTone('good').bg}; border-radius:8px; border:1px solid ${statusTone('good').border};">${nonTechList || '<li>Tidak ada.</li>'}</ul>
      </div>
      <div style="margin-bottom:20px;">
        <div style="font-size:13px; font-weight:800; color:#475569; margin-bottom:8px;">⚙️ Tindakan Sistem</div>
        <ul style="margin:0; padding:16px 16px 16px 36px; font-size:13px; color:#334155; line-height:1.6; background:#F8FAFC; border-radius:8px; border:1px solid #E2E8F0;">${techList || '<li>Tidak ada.</li>'}</ul>
      </div>
      ${filterPreview || `<button class="btn" style="width:100%; padding:14px; font-weight:800; border-radius:8px; background:#F1F5F9; color:#475569; border:1px solid #CBD5E1; cursor:pointer;" onclick="document.getElementById('modalScrim').classList.remove('on')">Tutup</button>`}
    </div>`;
  openModal(html);
  if (insight.actionData) {
    const btn = document.getElementById('btnApplyAction');
    if (btn) btn.onclick = () => applyInsightFilter(insight);
  }
}

function applyInsightFilter(insight) {
  if (!insight.actionData) return;
  const { type, keys } = insight.actionData;
  if (!aiMeta?.ctx?.validNamesByField) {
    toast('Data referensi hilang — jalankan analisis ulang.');
    return;
  }
  const field = aiMeta.ctx.typeToField?.[type];
  if (!field) { toast('Tipe filter tidak dikenali.'); return; }
  const whitelist = aiMeta.ctx.validNamesByField[field] || [];
  const verified = keys.map(k => matchValidName(k, whitelist)).filter(Boolean);
  if (verified.length === 0) { toast('Nama tidak lagi valid.'); return; }

  store.state.filters.salesman = new Set();
  store.state.filters.produk = new Set();
  store.state.filters.divisi = new Set();
  store.state.filters.outlet = new Set();

  if (type === 'salesman')      { store.state.filters.salesman = new Set(verified); store.set({ view: 'salesman' }); }
  else if (type === 'product')  { store.state.filters.produk = new Set(verified);   store.set({ view: 'product' }); }
  else if (type === 'outlet')   { store.state.filters.outlet = new Set(verified);   store.set({ view: 'outlet' }); }
  else                          { store.set({ view: 'overview' }); }

  document.getElementById('modalScrim').classList.remove('on');
  toast(`Filter diterapkan: ${verified.length} ${type}`);
}

/* ================================================================== */
/* FASE 3: FEEDBACK & PLAYBOOK HANDLERS                                */
/* ================================================================== */
function handleFeedback(idx, useful) {
  const insight = aiResult?.insights?.[idx];
  if (!insight) return;
  recordFeedback(insight.id, useful, '');
  toast(useful
    ? '👍 Feedback tercatat — insight serupa akan diprioritaskan'
    : '👎 Feedback tercatat — insight serupa akan diturunkan prioritasnya');
}

function handleSavePlaybook(idx) {
  const insight = aiResult?.insights?.[idx];
  if (!insight) { toast('Insight tidak ditemukan'); return; }
  if (!aiMeta?.pack) { toast('Data referensi hilang — jalankan ulang'); return; }

  const signatures = computeProblemSignature(aiMeta.pack);
  savePlaybook({
    problem: insight.title || '',
    action: (insight.nonTechnicalActions || []).join('; ') || insight.desc || '',
    outcome: insight.expectedImpact || '',
    signatures,
    source: 'manual',
    insightId: insight.id,
  });

  toast(`📌 Playbook tersimpan (${signatures.length} signature) — akan dipakai analisis berikutnya`);
}

/* ================================================================== */
/* ORKESTRATOR UTAMA                                                   */
/* ================================================================== */
async function runAIAnalysis(state, forceRefresh = false) {
  const filteredData = selectFiltered(state);
  if (!filteredData || filteredData.length === 0) {
    toast('Data kosong.');
    return;
  }
  const apiKey = getApiKey();
  if (!apiKey) { promptApiKey(() => runAIAnalysis(state, forceRefresh)); return; }

  const hash = getFilterHash(state);
  if (!forceRefresh) {
    const cached = loadCache(hash);
    if (cached && cached.result) {
      aiResult = cached.result;
      aiMeta = cached.meta;
      toast('⚡ Menggunakan cache (klik "Refresh" untuk analisis ulang)');
      renderOutput();
      return;
    }
  }

  isAnalyzing = true;
  aiResult = null;
  aiMeta = null;
  renderOutput();

  try {
    const pack = buildFactPack(state);
    if (pack.error) { toast('Gagal build fact pack.'); return; }

    const health = computeHealthScore(pack);

    let seeds = seedInsights(pack);
    seeds = applyFeedbackAdaptation(seeds);

    const playbooks = findSimilarPlaybooks(pack, 3);
    if (playbooks.length > 0) {
      console.info(`[Playbook] ${playbooks.length} playbook relevan ditemukan:`, playbooks.map(p => p.problem.slice(0, 40)));
    }

    let raw;
    let multiPassMeta = null;
    try {
      const mp = await callGeminiMultiPass(apiKey, pack, health, seeds, state, {
        enableCritique: true,
        playbooks,
        onProgress: (stage, msg) => {
          const el = document.getElementById('ai-loading-txt');
          if (el) el.textContent = msg;
        },
      });
      raw = mp.result;
      multiPassMeta = mp.meta;
      console.info(`[Multi-pass] ${multiPassMeta.passes} pass · critique:`, multiPassMeta.critique);
    } catch (mpErr) {
      const errMsg = String(mpErr.message || '');
      if (errMsg.includes('MODEL_NOT_FOUND') || errMsg.includes('tidak tersedia untuk API key')) {
        console.error('[Model Error]', errMsg);
        isAnalyzing = false;
        renderOutput();
        toast('❌ Model Gemini tidak tersedia untuk API key Anda. Buka ⚙️ untuk ganti key.');
        return;
      }
      if (isQuotaError(mpErr)) {
        console.warn('[Multi-pass] Quota habis — coba tampilkan cache lama');
        const cached = loadCache(hash);
        if (cached && cached.result) {
          aiResult = cached.result;
          aiMeta = cached.meta;
          isAnalyzing = false;
          renderOutput();
          toast('⚠️ Kuota API habis — menampilkan cache terakhir. Coba lagi setelah reset (besok) atau ganti API key.');
          return;
        }
        isAnalyzing = false;
        renderOutput();
        toast('❌ Kuota API habis. Solusi: (1) tunggu reset harian, (2) ganti API key di ⚙️, (3) coba besok');
        return;
      }
      console.warn('[Multi-pass] Gagal, fallback ke single-pass:', mpErr.message);
      const prompt = buildPrompt(pack, health, seeds, state, playbooks);
      raw = await callGemini(apiKey, prompt);
      multiPassMeta = { passes: 1, critique: null, error: mpErr.message };
    }

    const ctx = buildValidNamesMap(pack.rows);

    aiMeta = {
      ctx, pack, health, seeds, playbooks, multiPassMeta,
      filterSummary: getFilterSummary(state),
    };

    let result = validateResult(raw, ctx);

    result.healthScore = health.overall;
    result.healthBreakdown = {
      salesPerformance: health.salesPerformance,
      productMix: health.productMix,
      outletCoverage: health.outletCoverage,
      salesmanProductivity: health.salesmanProductivity,
      operationalEfficiency: health.operationalEfficiency,
    };

    if (!result.keyMetrics || result.keyMetrics.length < 3) {
      result.keyMetrics = generateDeterministicMetrics(pack, health);
    }

    result = enforceNumbersInResult(result, pack);
    result = validateCitations(result, pack);

    const seedTitles = new Set(seeds.map(s => normalizeName(s.title)));
    const filteredAI = (result.insights || []).filter(i => !seedTitles.has(normalizeName(i.title)));
    result.insights = [...seeds, ...filteredAI]
      .sort((a, b) => (a.priority || 5) - (b.priority || 5));

    aiResult = result;

    saveCache(hash, { result, meta: aiMeta });

    const total = result.insights.length;
    toast(`✅ Laporan selesai! ${total} insight (${seeds.length} auto-detect, ${filteredAI.length} AI, ${multiPassMeta.passes} pass).`);
  } catch (err) {
    console.error('[Gemini Error]', err);
    toast('AI Error: ' + err.message);
    if (String(err.message).toLowerCase().includes('api key')) {
      localStorage.removeItem(API_KEY_STORAGE);
      resetCachedModel();
    }
  } finally {
    isAnalyzing = false;
    renderOutput();
  }
}

/* ================================================================== */
/* UPDATE & REGISTER                                                   */
/* ================================================================== */
function update(container, state) {
  clearInterval(loadingInterval);
  patchHTML('#insight-ai-container', shell());

  const btnRun = document.getElementById('btnRunAI');
  if (btnRun) btnRun.onclick = () => runAIAnalysis(state, false);

  const btnKey = document.getElementById('btnApiKeyCfg');
  if (btnKey) btnKey.onclick = () => promptApiKey(() => update(container, state));

  const btnRefresh = document.getElementById('btnRefreshAI');
  if (btnRefresh) btnRefresh.onclick = () => {
    localStorage.removeItem(INSIGHT_CACHE_KEY);
    runAIAnalysis(state, true);
  };

  if (aiResult) renderOutput();
}

registerView('insight', {
  label: 'AI Insight',
  title: 'Expert AI Analyst',
  sub: 'Fact-driven · Color-coded · Auditable — Gemini',
  shell() { return `<div id="insight-ai-container"></div>`; },
  update,
  mount() {
    document.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action-idx]');
      if (actionBtn) { handleAction(+actionBtn.dataset.actionIdx); return; }

      const fbBtn = e.target.closest('[data-feedback-idx]');
      if (fbBtn) { handleFeedback(+fbBtn.dataset.feedbackIdx, fbBtn.dataset.useful === '1'); return; }

      const pbBtn = e.target.closest('[data-playbook-idx]');
      if (pbBtn) { handleSavePlaybook(+pbBtn.dataset.playbookIdx); return; }
    });
  },
});