// js/ui/settings/hk.js
export function renderHkForm(hkValue) {
  return `
    <style>
      .form-card { background: #fff; border-radius: 16px; margin: 0 4px 16px 4px; border: 1px solid #FFCDD2; box-shadow: 0 4px 12px rgba(0,0,0,0.03); overflow: hidden; }
      .form-header { background: #FFF8F8; padding: 16px; border-bottom: 1px solid #FFCDD2; }
      .form-title { font-weight: 900; color: #800000; font-size: 15px; }
      .form-row { display: flex; justify-content: space-between; align-items: center; padding: 16px; }
      .form-label { font-weight: 700; color: #424242; font-size: 13px; flex: 1; }
      .form-input { width: 140px; padding: 12px; text-align: right; border: 1px solid #E0E0E0; background: #FAFAFA; font-family: 'Roboto Mono', monospace; font-weight: 800; color: #800000; border-radius: 8px; font-size: 15px; outline: none; box-sizing: border-box; }
      .form-input:focus { border-color: #B71C1C; background: #fff; box-shadow: 0 0 0 3px rgba(183,28,28,0.15); }
      .form-btn { width: 100%; padding: 16px; border-radius: 8px; border: none; background: #800000; color: #fff; font-size: 15px; font-weight: 800; cursor: pointer; margin-top: 16px; }
    </style>

    <div class="form-card">
      <div class="form-header"><div class="form-title">Hari Kerja (HK) Global</div></div>
      <div style="padding: 16px;">
        <div style="font-size: 13px; color: #64748b; margin-bottom: 16px; line-height: 1.5;">Angka ini digunakan sebagai pembagi untuk menghitung Target Harian dan Pace di seluruh modul.</div>
        <div class="form-row" style="padding: 0;">
          <div class="form-label">Jumlah HK Bulanan</div>
          <input type="number" id="setHkInput" class="form-input" value="${hkValue}" min="1" max="31">
        </div>
        <button class="form-btn" id="btnSaveHk">Simpan HK</button>
      </div>
    </div>
  `;
}