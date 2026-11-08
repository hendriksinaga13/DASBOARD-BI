// js/ui/musthave/config.js
import { esc } from '../../core/utils.js';
import { cleanStr } from '../../core/musthave.js';

export function renderConfigUI(config, computedData, selectedItems, localExcludedMap, localMergedMap, localValuesMap, editingIndex) {
  const { productsArr, subrandsArr, allOutletsArr, typesArr, configuredTypes, activeRules, minToPass, subrandToPcodes, pcodeToProduct } = computedData;

  const chipsHtml = configuredTypes.map(t => `
    <button class="btn sm" data-switch-type="${esc(t)}" style="padding:4px 10px; font-size:11px; border-radius:20px; background:${config.outletType === t && config.targetMode === 'byType' && !config.evaluateAllTypes ? '#1D4ED8' : '#F1F5F9'}; color:${config.outletType === t && config.targetMode === 'byType' && !config.evaluateAllTypes ? '#fff' : '#475569'}; border:1px solid ${config.outletType === t && config.targetMode === 'byType' && !config.evaluateAllTypes ? '#1D4ED8' : '#CBD5E1'};">
      ${esc(t)} (${config.rulesByType[t].length})
    </button>
  `).join('');

  let outletTargetUI = '';
  if (config.targetMode === 'byType') {
    outletTargetUI = `
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <label style="font-size:12px; font-weight:700; color:#64748B;">Tipe Outlet (DMP)</label>
          <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:#1D4ED8; cursor:pointer;">
            <input type="checkbox" id="mhEvalAll" ${config.evaluateAllTypes ? 'checked' : ''} style="width:16px; height:16px;">
            Evaluasi Semua Tipe
          </label>
        </div>
        
        ${!config.evaluateAllTypes ? `
          <div style="display:flex; gap:6px; align-items:stretch; margin-bottom:8px;">
            <input type="text" id="mhOutletTypeInput" value="${esc(config.outletType)}" list="mhTypeList" placeholder="Pilih atau ketik Tipe" style="flex:1; padding:10px; border:1px solid #CBD5E1; border-radius:6px; font-size:14px; min-width:0;">
            <button class="btn sm primary" id="btnSaveType" style="padding:0 16px; font-size:18px;">+</button>
          </div>
          <datalist id="mhTypeList">
            ${typesArr.map(t => `<option value="${esc(t)}"></option>`).join('')}
          </datalist>
          ${chipsHtml ? `<div style="display:flex; flex-wrap:wrap; gap:6px;">${chipsHtml}</div>` : ''}
        ` : `
          <div style="background:#EFF6FF; border:1px solid #BFDBFE; padding:10px; border-radius:6px; font-size:12px; color:#1E3A8A; margin-bottom:8px;">
            Mode ini mengevaluasi <b>semua toko</b> dari tipe yang sudah diberi syarat (${configuredTypes.join(', ')}).
          </div>
        `}
      </div>
    `;
  } else {
    const outletCheckboxes = allOutletsArr.map(o => {
      const isChecked = config.selectedOutlets.includes(o.key);
      return `
        <label class="mh-out-opt" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid #F1F5F9; font-size:12px; cursor:pointer;" data-name="${esc(o.name).toLowerCase()}">
          <input type="checkbox" class="mh-out-chk" value="${esc(o.key)}" ${isChecked ? 'checked' : ''} style="width:16px; height:16px;">
          <span style="flex:1;">${esc(o.name)} <span style="font-size:10px; color:#64748B;">(${esc(o.tipe)})</span></span>
        </label>
      `;
    }).join('');

    outletTargetUI = `
      <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <label style="font-size:12px; font-weight:700; color:#64748B;">Pilih Toko Spesifik</label>
          <span style="font-size:11px; color:#1D4ED8; font-weight:700;" id="outSelectedCount">${config.selectedOutlets.length} Terpilih</span>
        </div>
        <input type="text" id="mhOutSearch" placeholder="Cari nama toko..." style="width:100%; padding:8px 10px; border:1px solid #CBD5E1; border-radius:6px; font-size:13px; margin-bottom:6px;">
        <div style="max-height:180px; overflow-y:auto; border:1px solid #CBD5E1; border-radius:6px; background:#fff;" id="mhOutList">
          ${outletCheckboxes}
        </div>
      </div>
    `;
  }

  const subrandsHtml = subrandsArr.map(sub => {
    const isExisting = activeRules.some((r, i) => r.type === 'subrand' && r.subbrandName === sub.name && i !== editingIndex);
    const isChecked = selectedItems.has('SUB:' + sub.name);
    return `
      <label class="mh-prod-opt" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid #F1F5F9; font-size:12px; cursor:pointer; ${isExisting ? 'opacity:0.5; cursor:not-allowed;' : ''}" data-name="${esc(sub.name).toLowerCase()}">
        <input type="checkbox" class="mh-chk" value="SUB:${esc(sub.name)}" data-type="subrand" data-skucount="${sub.skuCount}" ${(isChecked || isExisting) ? 'checked' : ''} ${isExisting ? 'disabled' : ''} style="width:16px; height:16px;">
        <span style="flex:1; font-weight:700;">📦 ${esc(sub.name)} <span style="font-size:10px; font-weight:normal; color:#64748B;">(${sub.skuCount} SKU)</span></span>
        ${isExisting ? '<span style="font-size:10px; color:#10B981; font-weight:700;">✓ Ada</span>' : ''}
      </label>
    `;
  }).join('');

  const productsHtml = productsArr.map(([code, name]) => {
    const isExisting = activeRules.some((r, i) => r.type === 'sku' && r.pcode === code && i !== editingIndex);
    const isChecked = selectedItems.has('SKU:' + code);
    return `
      <label class="mh-prod-opt" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid #F1F5F9; font-size:12px; cursor:pointer; ${isExisting ? 'opacity:0.5; cursor:not-allowed;' : ''}" data-name="${esc(name).toLowerCase()}">
        <input type="checkbox" class="mh-chk" value="SKU:${esc(code)}" data-type="sku" ${(isChecked || isExisting) ? 'checked' : ''} ${isExisting ? 'disabled' : ''} style="width:16px; height:16px;">
        <span style="flex:1;">🏷️ ${esc(name)}</span>
        ${isExisting ? '<span style="font-size:10px; color:#10B981; font-weight:700;">✓ Ada</span>' : ''}
      </label>
    `;
  }).join('');

  let selectedConfigsHtml = '';
  if (selectedItems.size > 0) {
    selectedConfigsHtml = Array.from(selectedItems).map(key => {
      const [type, val] = key.split(':');
      let defaultSku = 1;
      let labelStr = val;
      
      if (type === 'SUB') {
        const subObj = subrandsArr.find(s => s.name === val);
        if (subObj) { defaultSku = subObj.skuCount; labelStr = '📦 ' + val; }
      } else {
        labelStr = '🏷️ ' + val;
      }

      const valData = localValuesMap[key] || { minSkus: defaultSku, minQty: 1, unit: 'carton' };

      let excHtml = '';
      let mergeHtml = '';

      if (type === 'SUB') {
        const subPcodes = Array.from(subrandToPcodes.get(val) || []);
        const excPcodes = localExcludedMap[val] || [];
        const mergedGroups = localMergedMap[val] || [];

        // Render Exclude
        const excludedChips = excPcodes.map(pc => {
          const pName = pcodeToProduct.get(pc) || pc;
          return `<span style="background:#FEE2E2; color:#991B1B; padding:2px 6px; border-radius:4px; font-size:10px; display:inline-flex; align-items:center; gap:4px; margin-bottom:4px;">
            ${esc(pName)}
            <span class="rm-exc" data-sub="${esc(val)}" data-pc="${esc(pc)}" style="cursor:pointer; font-weight:bold;">✕</span>
          </span>`;
        }).join('');

        const availPcodes = subPcodes.filter(pc => !excPcodes.includes(pc));
        const opts = availPcodes.map(pc => {
          const pName = pcodeToProduct.get(pc) || pc;
          return `<option value="${esc(pc)}">${esc(pName)}</option>`;
        }).join('');

        excHtml = `
          <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #CBD5E1;">
            <div style="font-size:10px; color:#64748B; margin-bottom:4px;">Pengecualian Produk:</div>
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:4px;">
              ${excludedChips || '<span style="font-size:10px; color:#94A3B8;">Tidak ada</span>'}
            </div>
            ${availPcodes.length > 0 ? `
              <div style="display:flex; gap:4px;">
                <select class="inp-exc-sel" data-sub="${esc(val)}" style="flex:1; padding:4px; font-size:11px; border:1px solid #CBD5E1; border-radius:4px; min-width:0;">
                  <option value="">+ Kecualikan Produk...</option>
                  ${opts}
                </select>
              </div>
            ` : ''}
          </div>
        `;

        // Render Merge (Gabung SKU Multi-Baris)
        const mergedChips = mergedGroups.map((grp, grpIdx) => {
          const grpPcodes = Array.isArray(grp) ? grp : grp.pcodes;
          const customName = (!Array.isArray(grp) && grp.name) ? grp.name : '';
          const autoNames = grpPcodes.map(pc => pcodeToProduct.get(pc) || pc).join(' + ');
          const displayName = customName ? `[${customName}] ${autoNames}` : autoNames;
          
          return `<span style="background:#E0E7FF; color:#3730A3; padding:4px 8px; border-radius:4px; font-size:10px; display:inline-flex; align-items:center; gap:6px; margin-bottom:4px; width:100%;">
            <span style="flex:1; word-break:break-word;">${esc(displayName)}</span>
            <span class="rm-merge" data-sub="${esc(val)}" data-grpidx="${grpIdx}" style="cursor:pointer; font-weight:bold; color:#DC2626; font-size:12px;">✕</span>
          </span>`;
        }).join('');

        const unmergedPcodes = availPcodes.filter(pc => !mergedGroups.some(g => {
           const gp = Array.isArray(g) ? g : g.pcodes;
           return gp && gp.includes(pc);
        }));
        
        const mergeCheckboxes = unmergedPcodes.map(pc => {
          const pName = pcodeToProduct.get(pc) || pc;
          return `<label style="display:flex; align-items:center; gap:6px; font-size:11px; padding:4px; cursor:pointer; border-bottom:1px solid #F1F5F9;">
            <input type="checkbox" class="merge-chk" value="${esc(pc)}" data-sub="${esc(val)}" style="width:14px; height:14px; margin:0;">
            <span style="flex:1; word-break:break-word;">${esc(pName)}</span>
          </label>`;
        }).join('');

        mergeHtml = `
          <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #CBD5E1;">
            <div style="font-size:10px; color:#64748B; margin-bottom:4px;">Gabung SKU (Beda kode, produk sama):</div>
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px;">
              ${mergedChips || '<span style="font-size:10px; color:#94A3B8;">Belum ada grup gabungan</span>'}
            </div>
            ${unmergedPcodes.length >= 2 ? `
              <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:4px; padding:4px; margin-bottom:4px;">
                <input type="text" class="inp-merge-name" data-sub="${esc(val)}" placeholder="Nama kustom (Opsional)" style="width:100%; padding:6px; border:1px solid #CBD5E1; border-radius:4px; font-size:11px; margin-bottom:6px;">
                <div style="max-height:120px; overflow-y:auto; margin-bottom:6px;">
                  ${mergeCheckboxes}
                </div>
                <button class="btn sm primary btn-merge-multi" data-sub="${esc(val)}" style="width:100%; padding:6px; font-size:11px;">Gabungkan SKU Terpilih</button>
              </div>
            ` : ''}
          </div>
        `;
      }
      
      return `
        <div class="mh-config-row" data-val="${esc(key)}" data-type="${type}" style="background:#fff; border:1px solid #E2E8F0; border-radius:6px; padding:10px; margin-bottom:8px;">
          <div style="font-weight:700; font-size:12px; color:#1E293B; margin-bottom:6px; border-bottom:1px dashed #CBD5E1; padding-bottom:4px; word-break:break-word;">
            ${esc(labelStr)}
          </div>
          
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(80px, 1fr)); gap:6px;">
            ${type === 'SUB' ? `
              <div>
                <label style="font-size:10px; color:#64748B;">Min SKU (Grup)</label>
                <input type="number" class="inp-minsku" value="${valData.minSkus}" min="1" step="1" style="width:100%; padding:6px; border:1px solid #CBD5E1; border-radius:4px; font-size:12px; text-align:right;">
              </div>
            ` : ''}
            <div>
              <label style="font-size:10px; color:#64748B;">Min Qty</label>
              <input type="number" class="inp-minqty" value="${valData.minQty}" min="0.1" step="0.1" style="width:100%; padding:6px; border:1px solid #CBD5E1; border-radius:4px; font-size:12px; text-align:right;">
            </div>
            <div>
              <label style="font-size:10px; color:#64748B;">Satuan</label>
              <select class="inp-unit" style="width:100%; padding:6px; border:1px solid #CBD5E1; border-radius:4px; font-size:12px;">
                <option value="carton" ${valData.unit === 'carton' ? 'selected' : ''}>CRT</option>
                <option value="rcg" ${valData.unit === 'rcg' ? 'selected' : ''}>RCG</option>
                <option value="pcs" ${valData.unit === 'pcs' ? 'selected' : ''}>PCS</option>
              </select>
            </div>
          </div>
          ${excHtml}
          ${mergeHtml}
        </div>
      `;
    }).join('');
  } else {
    selectedConfigsHtml = `<div style="text-align:center; padding:12px; font-size:12px; color:#94A3B8; border:1px dashed #CBD5E1; border-radius:6px;">Centang Subrand atau SKU di atas untuk mengatur target.</div>`;
  }

  const btnSaveText = editingIndex !== null ? '🔄 Update Syarat' : 'Tambah Syarat';
  const btnCancelStyle = editingIndex !== null ? 'display:block' : 'display:none';

  return `
    <div class="card mb12">
      <div class="card-h">
        <div><div class="card-t">Konfigurasi Must-Have</div></div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn sm primary" id="btnSaveMh" style="padding:6px 10px; font-size:11px;">☁️ Simpan ke Cloud</button>
        </div>
      </div>
      
      <div style="display:grid; gap:16px; margin-bottom:16px;">
        
        <!-- PERIODE FILTER -->
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; padding:10px; display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div>
            <label style="font-size:11px; font-weight:700; color:#64748B;">Dari Tanggal</label>
            <input type="date" id="mhStartDate" value="${config.startDate || ''}" style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:4px; font-size:12px;">
          </div>
          <div>
            <label style="font-size:11px; font-weight:700; color:#64748B;">Sampai Tanggal</label>
            <input type="date" id="mhEndDate" value="${config.endDate || ''}" style="width:100%; padding:8px; border:1px solid #CBD5E1; border-radius:4px; font-size:12px;">
          </div>
        </div>

        <div style="display:flex; background:#E2E8F0; padding:4px; border-radius:6px;">
          <button class="btn sm" id="modeTargetType" style="flex:1; border:none; background:${config.targetMode === 'byType' ? '#fff' : 'transparent'}; color:${config.targetMode === 'byType' ? '#1E293B' : '#64748B'}; box-shadow:${config.targetMode === 'byType' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'}; font-weight:700;">By Tipe (DMP)</button>
          <button class="btn sm" id="modeTargetOutlet" style="flex:1; border:none; background:${config.targetMode === 'byOutlet' ? '#fff' : 'transparent'}; color:${config.targetMode === 'byOutlet' ? '#1E293B' : '#64748B'}; box-shadow:${config.targetMode === 'byOutlet' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'}; font-weight:700;">Pilih Outlet</button>
        </div>

        ${outletTargetUI}

        ${!config.evaluateAllTypes ? `
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#64748B; margin-bottom:4px;">Minimal Syarat Lulus (Toleransi)</label>
            <input type="number" id="mhMinPass" value="${minToPass}" min="1" max="${Math.max(1, activeRules.length)}" style="width:100%; padding:10px; border:1px solid #CBD5E1; border-radius:6px; font-size:14px;">
          </div>
        ` : ''}
      </div>

      ${!config.evaluateAllTypes ? `
        <div style="overflow-x:auto; border:1px solid #E2E8F0; border-radius:6px; margin-bottom:12px;">
          <table style="width:100%; border-collapse:collapse; min-width:400px;">
            <thead style="background:#F8FAFC;"><tr><th style="padding:10px; text-align:left;">Syarat Dievaluasi</th><th class="num" style="padding:10px;">Target</th><th style="width:100px;"></th></tr></thead>
            <tbody>
              ${activeRules.length === 0 ? '<tr><td colspan="3" class="empty" style="text-align:center; padding:16px;">Belum ada syarat.</td></tr>' : ''}
              ${activeRules.map((r, i) => `
                <tr style="background:${editingIndex === i ? '#FEF2F2' : 'transparent'};">
                  <td style="padding:10px; border-bottom:1px solid #F1F5F9;">
                    ${r.type === 'subrand' 
                      ? `<div><span style="background:#E0E7FF; color:#3730A3; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; margin-right:6px;">SUBRAND</span> ${esc(r.subbrandName)}</div>
                         ${r.excludedPcodes?.length ? `<div style="font-size:10px; color:#DC2626; margin-top:4px;">Exc: ${r.excludedPcodes.map(pc => esc(pcodeToProduct.get(pc) || pc)).join(', ')}</div>` : ''}
                         ${r.mergedPcodes?.length ? `<div style="font-size:10px; color:#4338CA; margin-top:4px;">Merge: ${r.mergedPcodes.map(g => {
                           const gp = Array.isArray(g) ? g : g.pcodes;
                           const cn = (!Array.isArray(g) && g.name) ? g.name : '';
                           const an = gp.map(pc => esc(pcodeToProduct.get(pc) || pc)).join('+');
                           return cn ? `[${cn}]` : an;
                         }).join(', ')}</div>` : ''}`
                      : `<span style="background:#F1F5F9; color:#475569; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; margin-right:6px;">SKU</span> ${esc(r.skuName)}`}
                  </td>
                  <td class="num" style="padding:10px; border-bottom:1px solid #F1F5F9; font-size:12px;">
                    ${r.type === 'subrand' 
                      ? `<b>${r.minSkus}</b> SKU & <b>${r.minQty}</b> ${r.unit.toUpperCase()}`
                      : `<b>${r.minQty}</b> ${r.unit.toUpperCase()}`}
                  </td>
                  <td style="padding:10px; border-bottom:1px solid #F1F5F9; text-align:center;">
                    <button class="btn sm" data-edit-mh="${i}" style="padding:4px 8px; font-size:11px; background:#F59E0B; color:#fff; border:none; margin-right:4px;">Edit</button>
                    <button class="btn sm neg" data-del-mh="${i}" style="padding:4px 8px; font-size:11px;">Hapus</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="background:#F8FAFC; padding:12px; border-radius:6px; display:grid; gap:10px;">
          
          <div>
            <input type="text" id="mhProdSearch" placeholder="Cari Subrand / SKU..." style="width:100%; padding:8px 10px; border:1px solid #CBD5E1; border-radius:6px; font-size:13px; margin-bottom:6px;">
            <div style="max-height:250px; overflow-y:auto; border:1px solid #CBD5E1; border-radius:6px; background:#fff;">
              <div style="padding:8px 10px; background:#F1F5F9; border-bottom:1px solid #E2E8F0; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:11px; font-weight:700; color:#475569;">Daftar</span>
                <button type="button" id="mhToggleAll" class="btn sm" style="padding:2px 8px; font-size:10px;">Pilih Semua</button>
              </div>
              <div id="mhProdList">
                <div style="background:#E2E8F0; padding:4px 10px; font-size:10px; font-weight:800; color:#475569; text-transform:uppercase;">Subrand</div>
                ${subrandsHtml}
                <div style="background:#E2E8F0; padding:4px 10px; font-size:10px; font-weight:800; color:#475569; text-transform:uppercase;">Produk (SKU)</div>
                ${productsHtml}
              </div>
            </div>
          </div>
          
          <div style="margin-top:4px;">
            <label style="display:block; font-size:11px; font-weight:700; color:#64748B; margin-bottom:6px;">Atur Syarat Terpilih:</label>
            <div style="max-height:400px; overflow-y:auto; padding-right:4px;">
              ${selectedConfigsHtml}
            </div>
          </div>
          
          <div style="display:flex; gap:6px; margin-top:4px;">
            <button class="btn primary" id="btnAddMh" style="flex:1; padding:12px;">
              ${btnSaveText} (<span id="mhSelectedCount">${selectedItems.size}</span>)
            </button>
            <button class="btn" id="btnCancelEdit" style="padding:12px; background:#E2E8F0; color:#475569; ${btnCancelStyle}">Batal</button>
          </div>
        </div>
      ` : `
        <div style="background:#F8FAFC; padding:16px; border-radius:6px; text-align:center; color:#64748B; font-size:13px; border:1px dashed #CBD5E1;">
          Form input syarat disembunyikan saat Mode "Evaluasi Semua Tipe" aktif.<br>
          Matikan centang di atas jika ingin menambah/mengubah syarat.
        </div>
      `}
    </div>
  `;
}