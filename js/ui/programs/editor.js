// js/ui/programs/editor.js — pure form HTML
import { esc, compactRp, NF1, fmtDateID } from '../../core/utils.js';
import * as C from '../../core/programs.js';

const S = {
  card: 'padding:12px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;margin-bottom:12px;',
  sectionTitle: 'font-size:10px;font-weight:800;color:#9A3412;text-transform:uppercase;margin-bottom:6px;',
  label: 'font-size:10px;font-weight:800;color:#475569;text-transform:uppercase;',
  smallInput: 'padding:6px;border:1px solid #E2E8F0;border-radius:4px;font-size:11px;',
};

export function renderEditorEmpty() {
  return `<div style="text-align:center;padding:40px;background:#fff;border-radius:12px;border:1px solid #FFCDD2;">
    <div style="font-size:48px;margin-bottom:12px;">📢</div>
    <div style="font-size:15px;font-weight:800;color:#64748B;">Belum Ada Program</div>
    <div style="font-size:11px;color:#94A3B8;margin-top:6px;">Klik tombol di atas untuk membuat program pertama.</div>
  </div>`;
}

export function renderEditorProgramCard(p) {
  const s = C.getProgramStatus(p);
  const hasCap = p.schemes.some(x => x.reward?.maxEnabled);
  const hasPI  = p.schemes.some(x => x.evaluationMode === 'per_invoice');
  const hasStr = p.schemes.some(x => x.reward?.discountMode === 'strata');
  const totR   = p.schemes.reduce((sum, x) => sum + (x.rules?.length || 0), 0);

  return `<div data-program-id="${p.id}" style="background:#fff;border:1px solid #FFCDD2;border-left:4px solid ${s.color};border-radius:12px;padding:14px;margin-bottom:10px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
    <div style="font-size:14px;font-weight:900;color:#0F172A;margin-bottom:2px;">${esc(p.name)}</div>
    <div style="font-size:10px;color:#64748B;margin-bottom:6px;">${p.schemes.length} scheme · ${totR} aturan</div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">
      ${hasPI ? `<span style="font-size:9px;color:#1D4ED8;font-weight:800;padding:2px 6px;background:#1D4ED815;border-radius:3px;">🧾 Per Faktur</span>` : ''}
      ${hasStr ? `<span style="font-size:9px;color:#F59E0B;font-weight:800;padding:2px 6px;background:#F59E0B15;border-radius:3px;">📊 Strata</span>` : ''}
      ${hasCap ? `<span style="font-size:9px;color:#DC2626;font-weight:800;padding:2px 6px;background:#DC262615;border-radius:3px;">🛑 Max Cap</span>` : ''}
    </div>
    <div style="padding:8px;background:${s.bg};border-radius:6px;font-size:11px;font-weight:800;color:${s.color};text-align:center;">${s.label}</div>
    <div style="font-size:10px;color:#64748B;margin-top:8px;text-align:center;">${fmtDateID(p.startDate)} — ${fmtDateID(p.endDate)}</div>
  </div>`;
}

export function renderProgramForm(program, schemesState, rows, state, isEdit) {
  return `
    <div class="modal-h"><h3 style="font-size:16px;margin:0;">${isEdit ? '✏️ Edit Program' : '➕ Program Baru'}</h3><button class="x">×</button></div>
    <div class="modal-b" style="padding:16px;max-height:82vh;overflow-y:auto;">
      <div style="margin-bottom:12px;">
        <label style="${S.label}">Nama Program *</label>
        <input id="prog-name" type="text" value="${esc(program.name)}" placeholder="Cth: Promo Retail Migelas" style="width:100%;padding:10px;border:1px solid #E2E8F0;border-radius:6px;font-size:13px;margin-top:4px;">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <div><label style="${S.label}">Mulai *</label><input id="prog-start" type="date" value="${program.startDate}" style="width:100%;padding:10px;border:1px solid #E2E8F0;border-radius:6px;font-size:12px;margin-top:4px;"></div>
        <div><label style="${S.label}">Selesai *</label><input id="prog-end" type="date" value="${program.endDate}" style="width:100%;padding:10px;border:1px solid #E2E8F0;border-radius:6px;font-size:12px;margin-top:4px;"></div>
      </div>
      <div style="margin-bottom:12px;">
        <label style="${S.label}">Catatan (opsional)</label>
        <textarea id="prog-notes" rows="2" style="width:100%;padding:10px;border:1px solid #E2E8F0;border-radius:6px;font-size:12px;margin-top:4px;resize:vertical;">${esc(program.schemeNotes || '')}</textarea>
      </div>
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:11px;font-weight:900;color:#0F172A;text-transform:uppercase;">🎯 Scheme Program</div>
          <button id="prog-add-scheme" style="padding:6px 12px;background:#1D4ED8;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;">+ Tambah Scheme</button>
        </div>
        <div id="schemes-container">${schemesState.map((s, idx) => renderSchemeEditor(s, idx, rows, state)).join('')}</div>
      </div>
      <button id="prog-save" style="width:100%;padding:14px;background:#1D4ED8;color:#fff;border:none;border-radius:8px;font-weight:800;font-size:14px;cursor:pointer;margin-top:8px;">💾 Simpan Program</button>
    </div>`;
}

export function renderSchemesContainer(schemesState, rows, state) {
  return schemesState.map((s, idx) => renderSchemeEditor(s, idx, rows, state)).join('');
}

function renderSchemeEditor(scheme, sIdx, rows, state) {
  const rw = scheme.reward || C.migrateReward({});
  return `
    <div style="${S.card}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <input type="text" data-scheme-name="${sIdx}" value="${esc(scheme.name)}" placeholder="Nama Scheme" style="flex:1;padding:8px;border:1px solid #E2E8F0;border-radius:6px;font-size:12px;font-weight:800;">
        <button data-scheme-remove="${sIdx}" style="margin-left:8px;background:#FEE2E2;color:#991B1B;border:none;border-radius:6px;padding:6px 10px;font-size:11px;font-weight:800;cursor:pointer;">🗑️</button>
      </div>
      ${formRow('📐 Basis Penilaian', renderEvalModeSelector(scheme, sIdx))}
      ${formRow('📋 Aturan', renderRulesList(scheme, sIdx, rows, state))}
      ${formRow('🎁 Reward', renderRewardEditor(scheme, sIdx, rw))}
      ${renderMaxCapEditor(scheme, sIdx, rw)}
    </div>`;
}

function formRow(label, content) {
  return `<div style="margin-bottom:10px;"><div style="${S.sectionTitle}">${label}</div>${content}</div>`;
}

function renderEvalModeSelector(scheme, sIdx) {
  const isPI = (scheme.evaluationMode || 'per_invoice') === 'per_invoice';
  return `<div style="display:flex;gap:6px;">
    <label style="flex:1;padding:8px;border:1px solid ${isPI ? '#1D4ED8' : '#E2E8F0'};background:${isPI ? '#EFF6FF' : '#fff'};border-radius:6px;cursor:pointer;font-size:10px;font-weight:700;text-align:center;">
      <input type="radio" name="eval-${sIdx}" value="per_invoice" data-eval-mode="${sIdx}" ${isPI ? 'checked' : ''} style="display:none;">🧾 Per Faktur
    </label>
    <label style="flex:1;padding:8px;border:1px solid ${!isPI ? '#8B5CF6' : '#E2E8F0'};background:${!isPI ? '#F5F3FF' : '#fff'};border-radius:6px;cursor:pointer;font-size:10px;font-weight:700;text-align:center;">
      <input type="radio" name="eval-${sIdx}" value="aggregate" data-eval-mode="${sIdx}" ${!isPI ? 'checked' : ''} style="display:none;">📊 Akumulasi
    </label>
  </div>`;
}

function renderRulesList(scheme, sIdx, rows, state) {
  return `<div>
    ${(scheme.rules || []).map((rule, rIdx) => renderRuleEditor(rule, `${sIdx}:${rIdx}`, rows, state)).join('')}
    ${(scheme.rules || []).length === 0 ? '<div style="text-align:center;padding:8px;font-size:10px;color:#94A3B8;background:#fff;border-radius:4px;">Belum ada aturan</div>' : ''}
    <select data-add-rule="${sIdx}" style="width:100%;padding:6px;border:1px solid #E2E8F0;border-radius:4px;font-size:11px;margin-top:6px;">
      <option value="">+ Tambah Aturan...</option>
      ${Object.entries(C.RULE_TYPES).map(([k, m]) => `<option value="${k}">${m.icon} ${m.label}</option>`).join('')}
    </select>
  </div>`;
}

function renderRuleEditor(rule, idx, rows, state) {
  const meta = C.RULE_TYPES[rule.type];
  if (!meta) return '';
  let body = '';

  if (meta.kind === 'multiselect') {
    const values = getUniqueValues(rows, meta.source, state);
    const fromDMP = C.DMP_SCOPE_SOURCES.includes(meta.source) && state?.outletMaster?.size > 0;
    body = `<div style="max-height:100px;overflow-y:auto;border:1px solid #E2E8F0;border-radius:4px;padding:6px;background:#F8FAFC;margin-top:4px;">
      ${fromDMP ? '<div style="font-size:8px;color:#1D4ED8;font-weight:800;margin-bottom:4px;">📋 Dari DMP + LBP</div>' : ''}
      ${values.map(v => `<label style="display:flex;align-items:center;gap:6px;padding:3px;font-size:10px;cursor:pointer;">
        <input type="checkbox" data-rule-val="${idx}" value="${esc(v)}" ${(rule.values || []).includes(v) ? 'checked' : ''} style="accent-color:#1D4ED8;">
        <span>${esc(v)}</span>
      </label>`).join('')}
      ${values.length === 0 ? '<div style="font-size:9px;color:#DC2626;text-align:center;padding:6px;">⚠️ Tidak ada data</div>' : ''}
    </div>`;
  } else if (meta.kind === 'number') {
    body = `<div style="display:flex;gap:6px;margin-top:4px;"><input type="number" data-rule-num="${idx}" value="${rule.value || ''}" placeholder="0" style="flex:1;${S.smallInput}text-align:right;"><span style="padding:6px;font-size:10px;color:#64748B;font-weight:800;">${meta.unit}</span></div>`;
  } else if (meta.kind === 'productConfig') {
    body = renderProductConfigEditor(rule, idx, rows, state);
  }

  return `<div style="padding:10px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;margin-bottom:6px;">
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
  return `<div style="margin-top:4px;">
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
      </div>`).join('')}
    <select data-pc-add-prod="${idx}" style="width:100%;padding:5px;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;margin-top:4px;">
      <option value="">+ Tambah produk...</option>
      ${products.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
    </select>
  </div>`;
}

function renderRewardEditor(scheme, sIdx, rw) {
  const isD = rw.type === 'discount';
  const isP = rw.type === 'point';
  return `<div>
    <div style="display:flex;gap:6px;margin-bottom:8px;">
      <label style="flex:1;padding:8px;border:1px solid ${isD ? '#1D4ED8' : '#E2E8F0'};background:${isD ? '#EFF6FF' : '#fff'};border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;text-align:center;">
        <input type="radio" name="reward-${sIdx}" value="discount" data-reward-type="${sIdx}" ${isD ? 'checked' : ''} style="display:none;">💰 Diskon
      </label>
      <label style="flex:1;padding:8px;border:1px solid ${isP ? '#8B5CF6' : '#E2E8F0'};background:${isP ? '#F5F3FF' : '#fff'};border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;text-align:center;">
        <input type="radio" name="reward-${sIdx}" value="point" data-reward-type="${sIdx}" ${isP ? 'checked' : ''} style="display:none;">⭐ Point
      </label>
    </div>
    ${isD ? renderDiscountEditor(scheme, sIdx, rw) : ''}
    ${isP ? renderPointEditor(scheme, sIdx, rw) : ''}
  </div>`;
}

function renderDiscountEditor(scheme, sIdx, rw) {
  const isF = (rw.discountMode || 'fixed') === 'fixed';
  const isS = !isF;
  return `<div style="padding:8px;background:#fff;border-radius:4px;">
    <div style="color:#64748B;margin-bottom:6px;font-size:9px;">ℹ️ Diskon otomatis DSA. Pilih mode reward.</div>
    <div style="display:flex;gap:6px;margin-bottom:8px;">
      <label style="flex:1;padding:8px;border:1px solid ${isF ? '#1D4ED8' : '#E2E8F0'};background:${isF ? '#EFF6FF' : '#fff'};border-radius:6px;cursor:pointer;font-size:10px;font-weight:700;text-align:center;">
        <input type="radio" name="discmode-${sIdx}" value="fixed" data-discount-mode="${sIdx}" ${isF ? 'checked' : ''} style="display:none;">💰 Tetap
      </label>
      <label style="flex:1;padding:8px;border:1px solid ${isS ? '#F59E0B' : '#E2E8F0'};background:${isS ? '#FFFBEB' : '#fff'};border-radius:6px;cursor:pointer;font-size:10px;font-weight:700;text-align:center;">
        <input type="radio" name="discmode-${sIdx}" value="strata" data-discount-mode="${sIdx}" ${isS ? 'checked' : ''} style="display:none;">📊 Strata
      </label>
    </div>
    ${isF ? renderFixedDiscount(sIdx, rw) : renderStrataDiscount(sIdx, rw)}
  </div>`;
}

function renderFixedDiscount(sIdx, rw) {
  return `<div style="display:flex;gap:4px;margin-top:6px;">
    <select data-disc-type="${sIdx}" style="flex:1;${S.smallInput}">
      <option value="percent" ${rw.discountType === 'percent' ? 'selected' : ''}>Persen (%)</option>
      <option value="amount" ${rw.discountType === 'amount' ? 'selected' : ''}>Rupiah</option>
    </select>
    <input type="number" data-disc-value="${sIdx}" value="${rw.discountValue || ''}" placeholder="0" style="flex:1;${S.smallInput}text-align:right;">
  </div>`;
}

function renderStrataDiscount(sIdx, rw) {
  const tiers = rw.strataTiers || [];
  return `<div style="margin-top:6px;">
    <div style="display:flex;gap:4px;margin-bottom:6px;align-items:center;">
      <span style="font-size:10px;color:#64748B;">Ukur berdasarkan</span>
      <select data-strata-unit="${sIdx}" style="flex:1;${S.smallInput}">
        <option value="crtn" ${rw.strataUnit === 'crtn' ? 'selected' : ''}>Karton (CTN)</option>
        <option value="rcg" ${rw.strataUnit === 'rcg' ? 'selected' : ''}>Renceng (RCG)</option>
        <option value="pcs" ${rw.strataUnit === 'pcs' ? 'selected' : ''}>Pcs</option>
      </select>
    </div>
    <div style="padding:6px;background:#FFFBEB;border-radius:4px;">
      ${tiers.map((t, ti) => {
        const isP = (t.type || 'percent') === 'percent';
        const val = isP ? (t.rate || '') : (t.amountValue || '');
        return `<div style="display:flex;gap:3px;margin-bottom:4px;align-items:center;flex-wrap:wrap;">
          <input type="number" data-tier-min="${sIdx}:${ti}" value="${t.min || ''}" placeholder="Min" style="width:50px;padding:4px;border:1px solid #E2E8F0;border-radius:3px;font-size:10px;text-align:right;">
          <span style="font-size:10px;color:#64748B;">-</span>
          <input type="number" data-tier-max="${sIdx}:${ti}" value="${t.max || ''}" placeholder="∞" style="width:50px;padding:4px;border:1px solid #E2E8F0;border-radius:3px;font-size:10px;text-align:right;">
          <span style="font-size:10px;color:#64748B;">=</span>
          <select data-tier-type="${sIdx}:${ti}" style="width:48px;padding:4px;border:1px solid #E2E8F0;border-radius:3px;font-size:10px;font-weight:800;">
            <option value="percent" ${isP ? 'selected' : ''}>%</option>
            <option value="amount" ${!isP ? 'selected' : ''}>Rp</option>
          </select>
          <input type="number" data-tier-value="${sIdx}:${ti}" value="${val}" placeholder="0" style="width:70px;padding:4px;border:1px solid #E2E8F0;border-radius:3px;font-size:10px;text-align:right;">
          <button data-tier-remove="${sIdx}:${ti}" style="background:#FEE2E2;color:#991B1B;border:none;border-radius:3px;padding:2px 5px;font-size:9px;cursor:pointer;">✕</button>
        </div>`;
      }).join('')}
      <button data-add-tier="${sIdx}" style="width:100%;padding:5px;background:#FDE68A;color:#92400E;border:1px solid #F59E0B;border-radius:4px;font-size:9px;font-weight:800;cursor:pointer;margin-top:4px;">+ Tambah Strata</button>
    </div>
  </div>`;
}

function renderPointEditor(scheme, sIdx, rw) {
  const isAmt = rw.pointBase === 'amount';
  return `<div style="padding:8px;background:#fff;border-radius:4px;">
    <select data-point-base="${sIdx}" style="width:100%;${S.smallInput}margin-bottom:6px;">
      <option value="amount" ${isAmt ? 'selected' : ''}>Per Rupiah</option>
      <option value="unit" ${!isAmt ? 'selected' : ''}>Per Unit</option>
    </select>
    <div style="display:${isAmt ? 'flex' : 'none'};gap:4px;align-items:center;font-size:10px;margin-bottom:6px;">
      <span style="color:#64748B;">1 poin per Rp</span>
      <input type="number" data-point-rate="${sIdx}" value="${rw.pointRate || 10000}" style="flex:1;padding:5px;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;text-align:right;">
    </div>
    <div style="display:${!isAmt ? 'flex' : 'none'};gap:4px;align-items:center;font-size:10px;margin-bottom:6px;">
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
      ${(rw.prizes || []).map((pz, pi) => `<div style="display:flex;gap:4px;margin-bottom:4px;">
        <input type="text" data-prize-name="${sIdx}:${pi}" value="${esc(pz.name || '')}" placeholder="Nama hadiah" style="flex:2;padding:5px;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;">
        <input type="number" data-prize-pts="${sIdx}:${pi}" value="${pz.points || ''}" placeholder="Poin" style="flex:1;padding:5px;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;text-align:right;">
        <button data-prize-remove="${sIdx}:${pi}" style="background:#FEE2E2;color:#991B1B;border:none;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer;">✕</button>
      </div>`).join('')}
      <button data-add-prize="${sIdx}" style="width:100%;padding:6px;background:#F5F3FF;color:#5B21B6;border:1px solid #DDD6FE;border-radius:4px;font-size:10px;font-weight:800;cursor:pointer;margin-top:4px;">+ Tambah Hadiah</button>
    </div>
  </div>`;
}

function renderMaxCapEditor(scheme, sIdx, rw) {
  const enabled = rw.maxEnabled;
  const isStrata = rw.discountMode === 'strata';
  return `<div style="padding:10px;background:${enabled ? '#FEF2F2' : '#F8FAFC'};border:1px solid ${enabled ? '#FECACA' : '#E2E8F0'};border-radius:6px;">
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
      <input type="checkbox" data-max-enabled="${sIdx}" ${enabled ? 'checked' : ''} style="accent-color:#DC2626;width:16px;height:16px;">
      <span style="font-size:11px;font-weight:800;color:${enabled ? '#991B1B' : '#475569'};">🛑 Batas Maksimal Potongan</span>
    </label>
    <div style="font-size:9px;color:#64748B;margin-top:4px;margin-left:24px;">Nilai 0 / kosong = tanpa batasan</div>
    ${enabled ? (isStrata ? `
      <div style="margin-top:8px;margin-left:24px;display:flex;gap:6px;align-items:center;font-size:10px;">
        <span style="color:#475569;">Max</span>
        <input type="number" data-max-value="${sIdx}" value="${rw.maxValue || ''}" placeholder="0" min="0" style="width:60px;padding:5px;border:1px solid #E2E8F0;border-radius:4px;font-size:10px;text-align:right;">
        <span style="color:#475569;">${C.getUnitLabel(rw.strataUnit || 'crtn')}</span>
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

function getUniqueValues(rows, source, state) {
  const values = new Set();
  if (C.DMP_SCOPE_SOURCES.includes(source) && state?.outletMaster?.size > 0) {
    const cache = (source === 'channel') ? C.buildChannelCache(rows) : null;
    for (const o of state.outletMaster.values()) {
      if (source === 'channel') { const ch = C.getOutletChannel(o, cache); if (ch) values.add(ch); }
      else { const k = source === 'outlet' ? 'outlet' : source; const v = C.normStr(o[k]); if (v) values.add(v); }
    }
  }
  const getter = {
    divisi: r => r.divisi,
    subbrand: r => r.subbrand,  // ✅ DIPERBAIKI: Menggunakan 'subbrand' agar sesuai dengan meta.source
    product: r => r.product,
    salesman: r => r.salesman,
    channel: r => r.channel,
    outlet: r => r.outlet
  }[source];
  if (getter) {
    for (const r of rows) {
      if (r.tt !== 'F') continue;
      const v = C.normStr(getter(r));
      if (v) values.add(v);
    }
  }
  return Array.from(values).sort();
}