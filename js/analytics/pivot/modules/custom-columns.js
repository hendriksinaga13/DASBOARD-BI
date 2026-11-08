// analytics/pivot/modules/custom-columns.js

/* ═══════════════════════════════════════════════════════════════
   CUSTOM COLUMNS MODULE — Calculated Columns for Pivot Table
   Self-contained: Engine + CRUD + UI Modal + Module Hooks
   ═══════════════════════════════════════════════════════════════ */

import { esc } from '../../../core/utils.js';
import { store } from '../../../core/store.js';
import { openModal, toast } from '../../../ui/feedback.js';
import { scheduleSave } from '../storage.js';

/* ══════════════════════════════════════════════════════════════
   HELPER: Ambil pivot list dari store (hindari circular import)
   ══════════════════════════════════════════════════════════════ */
function _getPivotListLocal() {
  if (!store.state.ui.pivotList) store.state.ui.pivotList = [];
  return store.state.ui.pivotList;
}

/* ══════════════════════════════════════════════════════════════
   PART 1: SAFE FORMULA ENGINE
   ══════════════════════════════════════════════════════════════ */
const ALLOWED_FUNCS = {
  round: (v, n = 0) => { const f = Math.pow(10, n); return Math.round(v * f) / f; },
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  ceil: Math.ceil,
  sqrt: Math.sqrt,
  ifnull: (v, fb = 0) => (v == null || !isFinite(v)) ? fb : v,
  coalesce: (...args) => args.find(v => v != null && isFinite(v)) ?? 0,
  pct: (num, den) => (den === 0 || !isFinite(den)) ? 0 : (num / den) * 100,
  safeDiv: (num, den) => (den === 0 || !isFinite(den)) ? 0 : num / den,
};

const SAFE_CHAR_RE = /^[\d\s+\-*/().,a-zA-Z_]+$/;
const FUNC_CALL_RE = new RegExp(`\\b(${Object.keys(ALLOWED_FUNCS).join('|')})\\b`, 'g');
const VAR_RE = /\{([\w.]+)\}/g;
const BLOCKED_WORDS = /\b(constructor|prototype|__proto__|__defineGetter__|__defineSetter__|valueOf|toString|window|document|global|process|this)\b/i;

export function evaluateFormula(formula, context = {}) {
  if (!formula || typeof formula !== 'string') return 0;
  try {
    let expr = formula.replace(VAR_RE, (_, key) => {
      const v = context[key];
      return (v == null || !isFinite(v)) ? '0' : String(Number(v));
    });
    if (!SAFE_CHAR_RE.test(expr)) return 0;
    if (BLOCKED_WORDS.test(expr)) return 0;
    expr = expr.replace(FUNC_CALL_RE, '__FN__.$1');
    if (/__FN__\.\w+\s*\.\s*\w+/.test(expr)) return 0;
    if (/__FN__\s*\[/.test(expr)) return 0;
    const fn = new Function('__FN__', `"use strict"; return (${expr});`);
    const result = fn(ALLOWED_FUNCS);
    return isFinite(result) ? Number(result) : 0;
  } catch (e) {
    console.warn('[CustomColumn] Formula error:', formula, '→', e.message);
    return 0;
  }
}

export function formatCustomValue(value, format = 'num') {
  if (value == null || !isFinite(value)) return '—';
  switch (format) {
    case 'rp': {
      const abs = Math.abs(value);
      const s = value < 0 ? '-' : '';
      if (abs >= 1e12) return `${s}Rp ${(abs/1e12).toFixed(1)} T`;
      if (abs >= 1e9)  return `${s}Rp ${(abs/1e9).toFixed(1)} M`;
      if (abs >= 1e6)  return `${s}Rp ${(abs/1e6).toFixed(1)} Jt`;
      if (abs >= 1e3)  return `${s}Rp ${(abs/1e3).toFixed(1)} Rb`;
      return `${s}Rp ${abs.toLocaleString('id-ID')}`;
    }
    case 'pct': return Number(value).toFixed(2) + '%';
    case 'dec': return Number(value).toFixed(2);
    case 'int': return Math.round(value).toLocaleString('id-ID');
    default:    return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 });
  }
}

/* ══════════════════════════════════════════════════════════════
   PART 2: CONFIG CRUD
   ══════════════════════════════════════════════════════════════ */
export function getCustomColumns(cfg) {
  if (!cfg) return [];
  if (!Array.isArray(cfg.customColumns)) cfg.customColumns = [];
  return cfg.customColumns;
}

export function addCustomColumn(cfg, col) {
  if (!cfg) return null;
  if (!Array.isArray(cfg.customColumns)) cfg.customColumns = [];
  const newCol = {
    id: 'cc_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    name: String(col.name || 'Custom').trim(),
    formula: String(col.formula || '').trim(),
    format: col.format || 'num',
  };
  cfg.customColumns.push(newCol);
  return newCol;
}

export function updateCustomColumn(cfg, id, updates) {
  const col = getCustomColumns(cfg).find(c => c.id === id);
  if (!col) return false;
  Object.assign(col, updates);
  return true;
}

export function deleteCustomColumn(cfg, id) {
  if (!cfg || !Array.isArray(cfg.customColumns)) return false;
  cfg.customColumns = cfg.customColumns.filter(c => c.id !== id);
  return true;
}

/* ══════════════════════════════════════════════════════════════
   PART 3: COMPUTE
   ══════════════════════════════════════════════════════════════ */
export function extractVariables(formula) {
  if (!formula) return [];
  const vars = [];
  let m;
  const re = new RegExp(VAR_RE.source, 'g');
  while ((m = re.exec(formula)) !== null) {
    if (!vars.includes(m[1])) vars.push(m[1]);
  }
  return vars;
}

export function validateFormula(formula, availableVars = []) {
  if (!formula || !formula.trim()) return { valid: false, error: 'Formula kosong' };
  const vars = extractVariables(formula);
  if (vars.length === 0) return { valid: false, error: 'Minimal 1 variabel {xxx}' };
  const systemVars = ['__rowlabel', '__colkey', '__total_omset'];
  const realVars = vars.filter(v => !systemVars.includes(v) && !v.startsWith('cc_'));
  const missing = realVars.filter(v => !availableVars.includes(v));
  if (missing.length > 0) {
    return { valid: false, error: `Variabel tidak dikenal: ${missing.map(v => '{' + v + '}').join(', ')}`, missing };
  }
  const dummy = {};
  vars.forEach(v => dummy[v] = 100);
  evaluateFormula(formula, dummy);
  return { valid: true };
}

export function computeCustomRowValues(rowData, customColumns) {
  if (!Array.isArray(customColumns) || customColumns.length === 0) return rowData;
  if (!Array.isArray(rowData)) return rowData;

  const grandTotalOmset = rowData
    .filter(r => r._type !== 'child')
    .reduce((s, r) => s + (Number(r.measures?.omset) || 0), 0);

  for (const row of rowData) {
    row._custom = row._custom || {};
    const context = { __total_omset: grandTotalOmset, __rowlabel: row.label };
    if (row.measures) {
      for (const [k, v] of Object.entries(row.measures)) {
        context[k] = Number(v) || 0;
      }
    }
    for (const col of customColumns) {
      const value = evaluateFormula(col.formula, context);
      row._custom[col.id] = value;
      context[col.id] = value;
    }
  }
  return rowData;
}

/* ══════════════════════════════════════════════════════════════
   PART 4: TEMPLATES
   ══════════════════════════════════════════════════════════════ */
export const COLUMN_TEMPLATES = [
  { id: 'avg_invoice',    name: 'Avg / Faktur',   formula: 'safeDiv({omset}, {invoice})',   format: 'rp' },
  { id: 'avg_outlet',     name: 'Omset / Outlet', formula: 'safeDiv({omset}, {outlet})',    format: 'rp' },
  { id: 'avg_sku',        name: 'Omset / SKU',    formula: 'safeDiv({omset}, {sku})',       format: 'rp' },
  { id: 'item_per_trx',   name: 'Item / Trx',     formula: 'safeDiv({qty}, {invoice})',     format: 'dec' },
  { id: 'karton_per_trx', name: 'Karton / Trx',   formula: 'safeDiv({carton}, {invoice})',  format: 'dec' },
  { id: 'omset_per_ktn',  name: 'Omset / Karton', formula: 'safeDiv({omset}, {carton})',    format: 'rp' },
  { id: 'pct_total',      name: '% dari Total',   formula: 'pct({omset}, {__total_omset})', format: 'pct' },
  { id: 'komisi_5pct',    name: 'Komisi 5%',      formula: '{omset} * 0.05',                format: 'rp' },
];

export function getAvailableMeasures(cfg) {
  const base = ['omset', 'qty', 'carton', 'invoice', 'outlet', 'sku'];
  const measures = Array.isArray(cfg && cfg.measures) ? cfg.measures : [];
  return Array.from(new Set([...base, ...measures]));
}

/* ══════════════════════════════════════════════════════════════
   PART 5: MODAL UI
   ══════════════════════════════════════════════════════════════ */
function _persistAndRefresh() {
  try { scheduleSave(); } catch (e) { console.warn('[CustomColumn] scheduleSave failed', e); }
  try { store.emit(); } catch (e) { console.warn('[CustomColumn] store.emit failed', e); }
}

export function openCustomColumnsModal(cfg) {
  const cols = getCustomColumns(cfg);
  const availMeasures = getAvailableMeasures(cfg);
  const customIds = cols.map(c => c.id);
  const allVars = [...availMeasures, '__total_omset', ...customIds];

  const measureHintBtns = availMeasures
    .map(m => `<button type="button" class="cc-var-insert" data-var="{${m}}" style="padding:3px 8px; background:#EFF6FF; color:#1E40AF; border:1px solid #BFDBFE; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; font-family:monospace;">{${esc(m)}}</button>`)
    .join(' ');

  const totalHintBtn = `<button type="button" class="cc-var-insert" data-var="{__total_omset}" style="padding:3px 8px; background:#F3E8FF; color:#6B21A8; border:1px solid #DDD6FE; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; font-family:monospace;">{__total_omset}</button>`;

  const customHintBtns = customIds.length > 0 
    ? customIds.map(id => {
        const c = cols.find(x => x.id === id);
        return `<button type="button" class="cc-var-insert" data-var="{${id}}" style="padding:3px 8px; background:#FEF3C7; color:#92400E; border:1px solid #FDE68A; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; font-family:monospace;">{${esc(c?.name || id)}}</button>`;
      }).join(' ')
    : '';

  const listHtml = cols.map(col => `
    <div style="padding:10px; background:#F0FDF4; border:1px solid #BBF7D0; border-radius:6px; margin-bottom:6px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:800; font-size:12px; color:#166534;">${esc(col.name)}</div>
          <div style="font-size:10px; color:#64748B; margin-top:2px; font-family:monospace; word-break:break-all;">= ${esc(col.formula)}</div>
          <div style="font-size:9px; color:#94A3B8; margin-top:2px;">Format: ${col.format}</div>
        </div>
        <div style="display:flex; gap:4px;">
          <button class="cc-edit" data-id="${esc(col.id)}" style="padding:4px 8px; background:#fff; border:1px solid #CBD5E1; border-radius:4px; font-size:10px; cursor:pointer;">✏️</button>
          <button class="cc-delete" data-id="${esc(col.id)}" style="padding:4px 8px; background:#FEE2E2; border:1px solid #FECACA; border-radius:4px; color:#991B1B; font-size:10px; cursor:pointer;">✕</button>
        </div>
      </div>
    </div>
  `).join('') || `<div style="text-align:center; padding:16px; color:#94A3B8; font-size:12px;">Belum ada kolom kustom.</div>`;

  const templateBtns = COLUMN_TEMPLATES.map(t => 
    `<button type="button" class="cc-tpl" data-tpl="${t.id}" style="padding:5px 10px; background:#fff; border:1px solid #CBD5E1; border-radius:5px; font-size:10.5px; font-weight:600; cursor:pointer;">${esc(t.name)}</button>`
  ).join(' ');

  openModal(`
    <div class="modal-h">
      <h3>Σ Kolom Kustom — ${esc(cfg.title || 'Pivot')}</h3>
      <button class="x" onclick="window.__pivotCloseModal && window.__pivotCloseModal()">×</button>
    </div>
    <div class="modal-b" style="max-height:72vh; overflow-y:auto;">
      
      <div style="margin-bottom:20px;">
        <div style="font-size:11px; font-weight:800; color:#475569; margin-bottom:8px; text-transform:uppercase;">Kolom Terpasang (${cols.length})</div>
        ${listHtml}
      </div>
      
      <div style="border-top:2px solid #E2E8F0; padding-top:16px;">
        <div style="font-size:11px; font-weight:800; color:#475569; margin-bottom:8px; text-transform:uppercase;">Tambah Kolom Baru</div>
        
        <label style="display:block; font-size:11px; color:#64748B; font-weight:700; margin-bottom:4px;">Nama Kolom</label>
        <input type="text" id="ccName" placeholder="Cth: Avg/Outlet" style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:6px; font-size:12px; margin-bottom:12px; box-sizing:border-box;">
        
        <label style="display:block; font-size:11px; color:#64748B; font-weight:700; margin-bottom:4px;">Template Cepat</label>
        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px;">${templateBtns}</div>
        
        <label style="display:block; font-size:11px; color:#64748B; font-weight:700; margin-bottom:4px;">Formula (klik variabel untuk insert)</label>
        <div style="margin-bottom:6px; display:flex; flex-wrap:wrap; gap:4px;">
          ${measureHintBtns}
          ${customHintBtns}
          ${totalHintBtn}
        </div>
        <input type="text" id="ccFormula" placeholder="Cth: safeDiv({omset}, {invoice})" 
               style="width:100%; padding:10px; border:1px solid #CBD5E1; border-radius:6px; font-size:13px; font-family:monospace; margin-bottom:6px; box-sizing:border-box;">
        <div style="font-size:10px; color:#94A3B8; margin-bottom:12px; line-height:1.5;">
          Fungsi: <code>round()</code>, <code>abs()</code>, <code>min()</code>, <code>max()</code>, <code>sqrt()</code>, <code>safeDiv(a,b)</code>, <code>pct(a,b)</code>, <code>ifnull()</code>
        </div>
        
        <label style="display:block; font-size:11px; color:#64748B; font-weight:700; margin-bottom:4px;">Format Tampilan</label>
        <select id="ccFormat" style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:6px; font-size:12px; margin-bottom:12px; box-sizing:border-box;">
          <option value="num">Angka (1.234)</option>
          <option value="rp">Rupiah (Rp 1,2 Jt)</option>
          <option value="dec">Desimal (1.23)</option>
          <option value="pct">Persen (45.5%)</option>
          <option value="int">Integer (1.234)</option>
        </select>
        
        <button id="ccSubmitBtn" style="width:100%; padding:12px; background:#1D4ED8; color:#fff; border:none; border-radius:6px; font-weight:800; font-size:13px; cursor:pointer;">+ Tambah Kolom</button>
        <div id="ccError" style="display:none; margin-top:8px; padding:8px; background:#FEF2F2; border:1px solid #FECACA; border-radius:6px; color:#991B1B; font-size:11px;"></div>
      </div>
    </div>
  `);

  let editingId = null;

  const showError = (msg) => {
    const el = document.getElementById('ccError');
    if (!el) return;
    if (msg) { el.textContent = '⚠️ ' + msg; el.style.display = 'block'; }
    else { el.style.display = 'none'; }
  };

  document.querySelectorAll('.cc-var-insert').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('ccFormula');
      const varStr = btn.getAttribute('data-var');
      input.value = (input.value || '') + varStr;
      input.focus();
    });
  });

  document.querySelectorAll('.cc-tpl').forEach(btn => {
    btn.addEventListener('click', () => {
      const tpl = COLUMN_TEMPLATES.find(t => t.id === btn.getAttribute('data-tpl'));
      if (!tpl) return;
      document.getElementById('ccName').value = tpl.name;
      document.getElementById('ccFormula').value = tpl.formula;
      document.getElementById('ccFormat').value = tpl.format;
      showError(null);
    });
  });

  document.querySelectorAll('.cc-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Hapus kolom ini?')) return;
      deleteCustomColumn(cfg, btn.getAttribute('data-id'));
      _persistAndRefresh();
      toast('Kolom dihapus');
      openCustomColumnsModal(cfg);
    });
  });

  document.querySelectorAll('.cc-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const col = cols.find(c => c.id === id);
      if (!col) return;
      document.getElementById('ccName').value = col.name;
      document.getElementById('ccFormula').value = col.formula;
      document.getElementById('ccFormat').value = col.format;
      editingId = id;
      document.getElementById('ccSubmitBtn').textContent = '💾 Simpan Perubahan';
      document.getElementById('ccName').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  document.getElementById('ccSubmitBtn').addEventListener('click', () => {
    const name = document.getElementById('ccName').value.trim();
    const formula = document.getElementById('ccFormula').value.trim();
    const format = document.getElementById('ccFormat').value;

    if (!name) { showError('Nama kolom wajib diisi'); return; }
    if (!formula) { showError('Formula wajib diisi'); return; }

    const validation = validateFormula(formula, allVars);
    if (!validation.valid) { showError(validation.error); return; }

    if (editingId) {
      updateCustomColumn(cfg, editingId, { name, formula, format });
      toast('Kolom diperbarui: ' + name);
    } else {
      addCustomColumn(cfg, { name, formula, format });
      toast('Kolom ditambahkan: ' + name);
    }

    editingId = null;
    _persistAndRefresh();
    openCustomColumnsModal(cfg);
  });
}

/* ══════════════════════════════════════════════════════════════
   PART 6: EVENT LISTENER (install once)
   ══════════════════════════════════════════════════════════════ */
let _installed = false;
function _ensureInstalled() {
  if (_installed) return;
  _installed = true;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cc-manage]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const cfgId = btn.getAttribute('data-cc-manage');
    const cfg = _getPivotListLocal().find(c => c.id === cfgId);
    if (cfg) openCustomColumnsModal(cfg);
  });
}

/* ══════════════════════════════════════════════════════════════
   PART 7: MODULE EXPORT
   ══════════════════════════════════════════════════════════════ */
const CustomColumnsModule = {
  id: 'custom-columns',
  label: 'Kolom Kustom',

  install() {
    _ensureInstalled();
  },

  transformRows(rowData, config) {
    _ensureInstalled();
    const cols = getCustomColumns(config);
    if (!cols.length) return rowData;
    return computeCustomRowValues(rowData, cols);
  },

  renderExtraHeader(config) {
    const cols = getCustomColumns(config);
    if (!cols.length) return '';
    return cols.map(col => `
      <th class="pc-header"
          style="text-align:right; background:#FEF3C7; color:#92400E; border-left:1px solid #E2E8F0; border-bottom:1px solid #E2E8F0; padding:6px 8px; font-size:11px; font-weight:800; white-space:nowrap;"
          title="= ${esc(col.formula)}">
        ${esc(col.name)}
      </th>
    `).join('');
  },

  renderExtraCell(measures, _unused, config, row) {
    const cols = getCustomColumns(config);
    if (!cols.length) return '';
    return cols.map(col => {
      const val = row._custom?.[col.id] ?? 0;
      const txt = formatCustomValue(val, col.format);
      return `<td class="num"
                  style="background:#FEF9C3; border-bottom:1px solid #E2E8F0; padding:6px 8px; font-size:11px; font-weight:700; color:#78350F; text-align:right; white-space:nowrap;">
        ${txt}
      </td>`;
    }).join('');
  },

  renderToolbar(config) {
    _ensureInstalled();
    const count = getCustomColumns(config).length;
    return `<button class="btn sm" data-cc-manage="${esc(config.id)}" 
              style="padding:0px 8px; font-size:11px; height:24px; background:#FEF3C7; color:#92400E; border:1px solid #FDE68A; font-weight:700; border-radius:4px; cursor:pointer;"
              title="Kelola kolom kustom">
      Σ Kolom${count > 0 ? ` (${count})` : ''}
    </button>`;
  },
};

export default CustomColumnsModule;