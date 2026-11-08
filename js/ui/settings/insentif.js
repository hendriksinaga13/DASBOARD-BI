// js/ui/settings/insentif.js
import { esc } from '../../core/utils.js';

export function renderInsentifForms({ targetOptions, currentTarget, kpiList, tiersHtml }) {
  return `
    <style>
      .form-card { background: #fff; border-radius: 16px; margin: 0 4px 16px 4px; border: 1px solid #FFCDD2; box-shadow: 0 4px 12px rgba(0,0,0,0.03); overflow: hidden; }
      .form-header { background: #FFF8F8; padding: 16px; border-bottom: 1px solid #FFCDD2; display: flex; justify-content: space-between; align-items: center; }
      .form-title { font-weight: 900; color: #800000; font-size: 15px; }
      .form-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid #F5F5F5; }
      .form-label { font-weight: 700; color: #424242; font-size: 13px; flex: 1; }
      .form-input { width: 120px; padding: 10px; text-align: right; border: 1px solid #E0E0E0; background: #FAFAFA; font-family: 'Roboto Mono', monospace; font-weight: 800; color: #800000; border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; }
      .form-select { padding: 10px; font-weight: 800; border-radius: 8px; border: 1px solid #FFCDD2; background: #FFF8F8; color: #800000; outline: none; width: 100%; }
      .tier-box { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
      .tier-row { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
      .tier-input { padding: 8px; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 13px; text-align: right; width: 100%; }
      .btn-add { background: #800000; color: #fff; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; width: 100%; margin-top: 8px; }
    </style>

    <div class="form-card" style="padding: 16px; background: #FFF8F8;">
      <div class="form-label" style="margin-bottom: 8px;">Pilih Skema Insentif Untuk:</div>
      <select id="insTargetSel" class="form-select">
        ${targetOptions.map(opt => `<option value="${esc(opt.value)}" ${opt.value === currentTarget ? 'selected' : ''}>${esc(opt.label)}</option>`).join('')}
      </select>
    </div>

    <div class="form-card">
      <div class="form-header">
        <div class="form-title">Daftar KPI Insentif</div>
      </div>
      <div style="padding: 16px;">
        <div id="insKpiContainer">${kpiList}</div>
        <button id="btnAddKpiRow" class="btn-add">+ Tambah KPI Baru</button>
      </div>
    </div>

    <button id="btnSaveInsentif" class="btn primary" style="width: calc(100% - 8px); margin: 0 4px; padding: 16px; border-radius: 12px; background: #800000; border: none; color: white; font-weight: 900; font-size: 15px;">💾 Simpan Skema Insentif</button>
  `;
}