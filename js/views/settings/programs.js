/* SETTINGS → Tab "Program" — EDITOR ORCHESTRATOR */

import { esc } from '../../core/utils.js';
import { store } from '../../core/store.js';
import { selectFiltered } from '../../core/selectors.js';
import { toast, openModal } from '../../ui/feedback.js';
import * as C from '../../core/programs.js';
import * as E from '../../ui/programs/editor.js';
import * as M from '../../ui/programs/modals.js';
import * as Svc from '../../sync/programs.js';

// ═══════════════════════════════════════════════════════════════
// PUBLIC — dipanggil oleh views/settings/index.js
// ═══════════════════════════════════════════════════════════════
export function renderProgramSettingsView(state) {
  try {
    const programs = C.loadPrograms();
    const statusOrder = { critical: 0, warning: 1, active: 2, upcoming: 3, expired: 4 };
    programs.sort((a, b) => (statusOrder[C.getProgramStatus(a).status] || 9) - (statusOrder[C.getProgramStatus(b).status] || 9));

    return `
      <div style="padding: 0 4px;">
        <div style="background:linear-gradient(135deg,#800000 0%,#B71C1C 100%);color:#fff;padding:16px;border-radius:16px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="font-size:24px;">📢</div>
            <div>
              <div style="font-size:15px;font-weight:900;">Kelola Program</div>
              <div style="font-size:11px;color:#FFCDD2;">Buat, edit, dan atur program berjalan</div>
            </div>
          </div>
          <div style="font-size:11px;color:#FFCDD2;">${programs.length} program terdaftar · auto-sync ke cloud</div>
        </div>

        <button id="prog-add" style="width:100%;padding:14px;background:#800000;color:#fff;border:none;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;margin-bottom:12px;">➕ Tambah Program Baru</button>

        ${programs.length === 0 ? E.renderEditorEmpty() : programs.map(p => E.renderEditorProgramCard(p)).join('')}
      </div>`;
  } catch (err) {
    console.error('[settings/programs]', err);
    return `<div style="padding:24px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;">
      <div style="font-size:15px;font-weight:800;color:#991B1B;">⚠️ Error</div>
      <div style="font-size:12px;color:#7F1D1D;">${esc(err.message)}</div>
    </div>`;
  }
}

export function attachProgramSettingsHandlers(state) {
  document.getElementById('prog-add')?.addEventListener('click', () => openEditor(null, state));

  document.querySelectorAll('[data-program-id]').forEach(card => {
    card.onclick = () => {
      const program = C.loadPrograms().find(p => p.id === card.dataset.programId);
      if (program) openDetailEditor(program, state);
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// EDITOR: PROGRAM FORM (ADD / EDIT)
// ═══════════════════════════════════════════════════════════════
function openEditor(existingProgram, state) {
  const p = existingProgram ? C.migrateProgram(existingProgram) : C.migrateProgram({});
  if (!p.schemes.length) p.schemes.push(C.migrateScheme({ name: 'Scheme 1' }));
  const rows = state.rows || [];
  const schemesState = JSON.parse(JSON.stringify(p.schemes));

  openModal(E.renderProgramForm(p, schemesState, rows, state, !!existingProgram));

  const rerender = () => {
    document.getElementById('schemes-container').innerHTML = E.renderSchemesContainer(schemesState, rows, state);
    bindEditorHandlers(schemesState, rerender);
  };

  bindEditorHandlers(schemesState, rerender);

  document.getElementById('prog-add-scheme').onclick = () => {
    schemesState.push(C.migrateScheme({ name: `Scheme ${schemesState.length + 1}` }));
    rerender();
  };

  document.getElementById('prog-save').onclick = () => saveHandler(p, schemesState);
}

async function saveHandler(p, schemesState) {
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

    await Svc.upsertProgram(newProgram);

    closeModal();
    toast('Program tersimpan!');
  } catch (err) {
    console.error('[save]', err);
    toast('Error: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// EDITOR HANDLERS
// ═══════════════════════════════════════════════════════════════
function bindEditorHandlers(schemesState, rerender) {
  const on = (sel, ev, fn) => document.querySelectorAll(sel).forEach(el => el[ev] = () => fn(el));

  on('[data-scheme-remove]', 'onclick', el => {
    schemesState.splice(+el.dataset.schemeRemove, 1);
    rerender();
  });
  on('[data-scheme-name]', 'onchange', el => {
    schemesState[+el.dataset.schemeName].name = el.value;
  });
  on('[data-eval-mode]', 'onchange', el => {
    schemesState[+el.dataset.evalMode].evaluationMode = el.value;
    rerender();
  });
  on('[data-add-rule]', 'onchange', el => {
    if (!el.value) return;
    schemesState[+el.dataset.addRule].rules.push(C.migrateRule({ type: el.value }));
    el.value = '';
    rerender();
  });
  on('[data-rule-remove]', 'onclick', el => {
    const [s, r] = el.dataset.ruleRemove.split(':').map(Number);
    schemesState[s].rules.splice(r, 1);
    rerender();
  });
  on('[data-rule-val]', 'onchange', el => {
    const [s, r] = el.dataset.ruleVal.split(':').map(Number);
    const rule = schemesState[s].rules[r];
    if (!rule.values) rule.values = [];
    if (el.checked) { if (!rule.values.includes(el.value)) rule.values.push(el.value); }
    else rule.values = rule.values.filter(v => v !== el.value);
  });
  on('[data-rule-num]', 'onchange', el => {
    const [s, r] = el.dataset.ruleNum.split(':').map(Number);
    schemesState[s].rules[r].value = +el.value || 0;
  });
  on('[data-pc-add-prod]', 'onchange', el => {
    if (!el.value) return;
    const [s, r] = el.dataset.pcAddProd.split(':').map(Number);
    const rule = schemesState[s].rules[r];
    if (!rule.productConfig) rule.productConfig = [];
    if (rule.productConfig.some(c => c.product === el.value)) { toast('Sudah ada'); el.value = ''; return; }
    rule.productConfig.push({ product: el.value, enabled: true, isKey: false, minValue: 0, unit: 'rcg' });
    el.value = '';
    rerender();
  });
  on('[data-pc-remove]', 'onclick', el => {
    const [s, r, c] = el.dataset.pcRemove.split(':').map(Number);
    schemesState[s].rules[r].productConfig.splice(c, 1);
    rerender();
  });
  on('[data-pc-key]', 'onchange', el => {
    const [s, r, c] = el.dataset.pcKey.split(':').map(Number);
    schemesState[s].rules[r].productConfig[c].isKey = el.checked;
  });
  on('[data-pc-min]', 'onchange', el => {
    const [s, r, c] = el.dataset.pcMin.split(':').map(Number);
    schemesState[s].rules[r].productConfig[c].minValue = +el.value || 0;
  });
  on('[data-pc-unit]', 'onchange', el => {
    const [s, r, c] = el.dataset.pcUnit.split(':').map(Number);
    schemesState[s].rules[r].productConfig[c].unit = el.value;
  });
  on('[data-reward-type]', 'onchange', el => {
    schemesState[+el.dataset.rewardType].reward.type = el.value;
    rerender();
  });
  on('[data-discount-mode]', 'onchange', el => {
    schemesState[+el.dataset.discountMode].reward.discountMode = el.value;
    rerender();
  });
  on('[data-disc-type]', 'onchange', el => {
    schemesState[+el.dataset.discType].reward.discountType = el.value;
  });
  on('[data-disc-value]', 'onchange', el => {
    schemesState[+el.dataset.discValue].reward.discountValue = +el.value || 0;
  });
  on('[data-strata-unit]', 'onchange', el => {
    schemesState[+el.dataset.strataUnit].reward.strataUnit = el.value;
    rerender();
  });
  on('[data-add-tier]', 'onclick', el => {
    const s = +el.dataset.addTier;
    if (!schemesState[s].reward.strataTiers) schemesState[s].reward.strataTiers = [];
    schemesState[s].reward.strataTiers.push({ min: 0, max: null, type: 'percent', rate: 0, amountValue: 0 });
    rerender();
  });
  on('[data-tier-remove]', 'onclick', el => {
    const [s, t] = el.dataset.tierRemove.split(':').map(Number);
    schemesState[s].reward.strataTiers.splice(t, 1);
    rerender();
  });
  on('[data-tier-min]', 'onchange', el => {
    const [s, t] = el.dataset.tierMin.split(':').map(Number);
    schemesState[s].reward.strataTiers[t].min = +el.value || 0;
  });
  on('[data-tier-max]', 'onchange', el => {
    const [s, t] = el.dataset.tierMax.split(':').map(Number);
    schemesState[s].reward.strataTiers[t].max = el.value ? +el.value : null;
  });
  on('[data-tier-type]', 'onchange', el => {
    const [s, t] = el.dataset.tierType.split(':').map(Number);
    schemesState[s].reward.strataTiers[t].type = el.value;
    rerender();
  });
  on('[data-tier-value]', 'onchange', el => {
    const [s, t] = el.dataset.tierValue.split(':').map(Number);
    const tier = schemesState[s].reward.strataTiers[t];
    if (tier.type === 'amount') tier.amountValue = +el.value || 0;
    else tier.rate = +el.value || 0;
  });
  on('[data-point-base]', 'onchange', el => {
    schemesState[+el.dataset.pointBase].reward.pointBase = el.value;
    rerender();
  });
  on('[data-point-rate]', 'onchange', el => {
    schemesState[+el.dataset.pointRate].reward.pointRate = +el.value || 10000;
  });
  on('[data-point-unit]', 'onchange', el => {
    schemesState[+el.dataset.pointUnit].reward.pointUnit = el.value;
  });
  on('[data-point-per-unit]', 'onchange', el => {
    schemesState[+el.dataset.pointPerUnit].reward.pointPerUnit = +el.value || 1;
  });
  on('[data-add-prize]', 'onclick', el => {
    const s = +el.dataset.addPrize;
    if (!schemesState[s].reward.prizes) schemesState[s].reward.prizes = [];
    schemesState[s].reward.prizes.push({ name: '', points: 0 });
    rerender();
  });
  on('[data-prize-remove]', 'onclick', el => {
    const [s, p] = el.dataset.prizeRemove.split(':').map(Number);
    schemesState[s].reward.prizes.splice(p, 1);
    rerender();
  });
  on('[data-prize-name]', 'onchange', el => {
    const [s, p] = el.dataset.prizeName.split(':').map(Number);
    schemesState[s].reward.prizes[p].name = el.value;
  });
  on('[data-prize-pts]', 'onchange', el => {
    const [s, p] = el.dataset.prizePts.split(':').map(Number);
    schemesState[s].reward.prizes[p].points = +el.value || 0;
  });
  on('[data-max-enabled]', 'onchange', el => {
    schemesState[+el.dataset.maxEnabled].reward.maxEnabled = el.checked;
    rerender();
  });
  on('[data-max-unit-type]', 'onchange', el => {
    schemesState[+el.dataset.maxUnitType].reward.maxUnitType = el.value;
    rerender();
  });
  on('[data-max-value]', 'onchange', el => {
    schemesState[+el.dataset.maxValue].reward.maxValue = +el.value || 0;
  });
}

// ═══════════════════════════════════════════════════════════════
// DETAIL MODAL (dengan Edit/Delete)
// ═══════════════════════════════════════════════════════════════
function openDetailEditor(program, state) {
  try {
    const analysis = C.analyzeProgram(program, selectFiltered(state), state);
    const status = C.getProgramStatus(program);

    openModal(M.renderProgramDetailEditor(program, analysis, status));

    setTimeout(() => {
      document.querySelectorAll('[data-scheme-toggle]').forEach(el => {
        el.onclick = () => {
          const c = document.querySelector(`[data-scheme-content="${el.dataset.schemeToggle}"]`);
          if (c) c.style.display = c.style.display === 'none' ? 'block' : 'none';
        };
      });

      const editBtn = document.getElementById('prog-detail-edit');
      if (editBtn) editBtn.onclick = () => {
        closeModal();
        openEditor(program, state);
      };

      const delBtn = document.getElementById('prog-detail-delete');
      if (delBtn) delBtn.onclick = async () => {
        if (!confirm('Hapus program "' + program.name + '"?')) return;
        try {
          await Svc.deleteProgram(program.id);
          closeModal();
          toast('Program dihapus');
        } catch (err) {
          toast('Gagal hapus: ' + err.message);
        }
      };
    }, 50);
  } catch (err) {
    console.error('[detail editor]', err);
    toast('Error: ' + err.message);
  }
}

function closeModal() {
  const scrim = document.getElementById('modalScrim');
  const modal = document.getElementById('modal');
  if (scrim) scrim.classList.remove('on');
  if (modal) modal.innerHTML = '';
}