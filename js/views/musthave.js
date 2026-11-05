import { esc, pct, NF1 } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { store } from '../core/store.js';
import { selectFiltered } from '../core/selectors.js';
import { toast, openModal } from '../ui/feedback.js';
import { registerView } from './registry.js';

let cachedResults = [];
let selectedItems = new Set(); 
let selectedOutlets = new Set(); 
let inputMode = 'sku'; 

function cleanStr(s) {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

// ==========================================
// 1. MANAJEMEN KONFIGURASI & FILE I/O
// ==========================================
function getConfig() {
  try {
    const c = localStorage.getItem('m245.musthave');
    if (c) {
      let parsed = JSON.parse(c);
      if (parsed.rules && !parsed.rulesByType) {
        parsed.rulesByType = { [parsed.outletType || 'DEFAULT']: parsed.rules };
        parsed.minPassByType = { [parsed.outletType || 'DEFAULT']: parsed.minSkusToPass || 1 };
        delete parsed.rules;
      }
      if (!parsed.rulesByType) parsed.rulesByType = {};
      if (!parsed.minPassByType) parsed.minPassByType = {};
      if (!parsed.customTypes) parsed.customTypes = [];
      if (!parsed.targetMode) parsed.targetMode = 'byType'; 
      if (!parsed.selectedOutlets) parsed.selectedOutlets = [];
      if (parsed.evaluateAllTypes === undefined) parsed.evaluateAllTypes = false;
      
      for (const t in parsed.rulesByType) {
        parsed.rulesByType[t].forEach(r => {
          if (!r.type) r.type = 'sku';
          if (r.type === 'subrand' && r.minSkus === undefined) {
            r.minSkus = r.minQty || 1; 
            r.minQty = 1;              
            if (!r.unit || r.unit === 'sku') r.unit = 'carton';
          }
        });
      }
      return parsed;
    }
  } catch(e) {}
  return { 
    targetMode: 'byType', outletType: '', selectedOutlets: [],
    rulesByType: {}, minPassByType: {}, customTypes: [], evaluateAllTypes: false
  };
}

function saveConfig(conf) { localStorage.setItem('m245.musthave', JSON.stringify(conf)); }

function exportConfig() {
  const config = getConfig();
  const jsonStr = JSON.stringify(config, null, 2);
  const blob = new Blob([jsonStr], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const d = new Date();
  const dateStr = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  a.download = `MustHave_Config_${dateStr}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importConfig(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.rulesByType && parsed.minPassByType) {
        localStorage.setItem('m245.musthave', JSON.stringify(parsed));
        selectedItems.clear();
        selectedOutlets.clear();
        toast('Konfigurasi berhasil diimpor!');
        store.emit();
      } else {
        toast('Format file .txt tidak dikenali.');
      }
    } catch (err) {
      toast('Gagal membaca file: format JSON tidak valid.');
    }
  };
  reader.readAsText(file);
}

function shell(){ return `<div id="mh-content"></div>`; }

function update(container, state){
  const config = getConfig();
  const filteredRows = selectFiltered(state);

  // 1. Kumpulkan Tipe Outlet dari DMP
  const detectedTypes = new Set();
  const outletTypeMap = new Map(); // Key: "No Outlet" atau "Nama Outlet" -> Value: "Namaclass"

  if (state.outletMaster) {
    state.outletMaster.forEach((o) => {
      const namaclass = cleanStr(o.tipe); 
      if (namaclass && namaclass !== '—') {
        detectedTypes.add(namaclass);
        if (o.outletNo) outletTypeMap.set(cleanStr(o.outletNo), namaclass);
        if (o.outlet) outletTypeMap.set(cleanStr(o.outlet), namaclass);
      }
    });
  }

  const allTypes = new Set([...detectedTypes, ...(config.customTypes || [])]);
  const typesArr = Array.from(allTypes).sort();

  const configuredTypes = Object.keys(config.rulesByType).filter(k => k !== 'MANUAL_CUSTOM' && config.rulesByType[k].length > 0);

  const activeKey = config.targetMode === 'byType' ? (config.outletType || 'DEFAULT') : 'MANUAL_CUSTOM';
  const activeRules = config.rulesByType[activeKey] || [];
  const minToPass = config.minPassByType[activeKey] || 1;

  // 2. Kumpulkan Produk & Subrand
  const products = new Map();
  const subrands = new Set();
  const pcodeToSubrand = new Map();
  const subrandToPcodes = new Map(); 

  state.rows.forEach(r => {
    if (r.pcode && !products.has(r.pcode)) products.set(r.pcode, r.product);
    if (r.subbrand && r.subbrand !== '—') {
      subrands.add(r.subbrand);
      if (r.pcode) {
        pcodeToSubrand.set(r.pcode, r.subbrand);
        if (!subrandToPcodes.has(r.subbrand)) subrandToPcodes.set(r.subbrand, new Set());
        subrandToPcodes.get(r.subbrand).add(r.pcode);
      }
    }
  });
  
  const productsArr = Array.from(products.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  const subrandsArr = Array.from(subrands).map(subName => {
    const skuCount = subrandToPcodes.get(subName)?.size || 0;
    return { name: subName, skuCount };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const allOutletsMap = new Map();
  if (state.outletMaster) {
    state.outletMaster.forEach((o, k) => {
      allOutletsMap.set(k, { key: k, name: o.outlet, no: o.outletNo, tipe: o.tipe });
    });
  }
  const allOutletsArr = Array.from(allOutletsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  // ==========================================
  // 3. LOGIKA PERHITUNGAN DATA
  // ==========================================
  const activeOutlets = new Map();
  const outletSkuQty = new Map();

  const validTypesSet = config.evaluateAllTypes ? new Set(configuredTypes) : new Set([cleanStr(config.outletType)]);

  filteredRows.forEach(r => {
    let isValidTarget = false;
    let tipe = '—';

    if (config.targetMode === 'byType') {
      const no = cleanStr(r.outletNo);
      const nm = cleanStr(r.outlet);
      
      if (no && outletTypeMap.has(no)) tipe = outletTypeMap.get(no);
      else if (nm && outletTypeMap.has(nm)) tipe = outletTypeMap.get(nm);
      else tipe = cleanStr(r.tipe);

      if (validTypesSet.has(tipe)) isValidTarget = true;
    } else {
      if (config.selectedOutlets.includes(r.outletKey)) isValidTarget = true;
      tipe = 'MANUAL';
    }

    if (!isValidTarget) return;

    if (!activeOutlets.has(r.outletKey)) {
      activeOutlets.set(r.outletKey, { 
        outletKey: r.outletKey, outlet: r.outlet || '(Tanpa Nama)', salesman: r.salesman || '—', tipe: tipe, details: [], metCount: 0 
      });
    }

    if (r.tt === 'F') {
      if (!outletSkuQty.has(r.outletKey)) outletSkuQty.set(r.outletKey, new Map());
      const skuMap = outletSkuQty.get(r.outletKey);
      const currentSku = skuMap.get(r.pcode) || { pcs: 0, carton: 0, rcg: 0 };
      
      const rcgMatch = String(r.kemasan || '').match(/RCG\s*\/\s*(\d+)/i);
      const rcgFactor = rcgMatch ? +rcgMatch[1] : NaN;
      
      currentSku.pcs += Math.abs(r.netQty || 0);
      currentSku.carton += Math.abs(r.netCarton || 0);
      if (isFinite(rcgFactor) && rcgFactor > 0) currentSku.rcg += Math.abs(r.netQty || 0) / rcgFactor;
      
      skuMap.set(r.pcode, currentSku);
    }
  });

  // 4. Evaluasi Syarat
  let totalOutlets = activeOutlets.size;
  let passedOutlets = 0;
  const results = [];

  activeOutlets.forEach((oData, oKey) => {
    const skuMap = outletSkuQty.get(oKey) || new Map();
    let metCount = 0;
    const details = [];

    const outletKeyRules = config.targetMode === 'byType' ? oData.tipe : 'MANUAL_CUSTOM';
    const rulesToApply = config.rulesByType[outletKeyRules] || [];
    const minToPassForOutlet = config.minPassByType[outletKeyRules] || 1;

    rulesToApply.forEach(rule => {
      let isMet = false;
      let label = '';
      let unboughtProds = [];
      let requiredStr = '';
      let actualStr = '';

      if (rule.type === 'subrand') {
        label = `Subrand: ${rule.subbrandName}`;
        const allPcodes = subrandToPcodes.get(rule.subbrandName) || new Set();
        let boughtSkuCount = 0;
        let totalQty = 0;
        
        allPcodes.forEach(pc => {
          const skuData = skuMap.get(pc) || { pcs: 0, carton: 0, rcg: 0 };
          const qtyInUnit = rule.unit === 'carton' ? skuData.carton : rule.unit === 'rcg' ? skuData.rcg : skuData.pcs;
          
          if (qtyInUnit > 0) { boughtSkuCount++; totalQty += qtyInUnit; } 
          else { unboughtProds.push(products.get(pc) || pc); }
        });

        const skuMet = boughtSkuCount >= (rule.minSkus || 1);
        const qtyMet = totalQty >= rule.minQty;
        isMet = skuMet && qtyMet;
        
        requiredStr = `${rule.minSkus} SKU & ${rule.minQty} ${rule.unit.toUpperCase()}`;
        actualStr = `${boughtSkuCount} SKU & ${totalQty.toFixed(1)} ${rule.unit.toUpperCase()}`;
        
      } else {
        label = rule.skuName;
        const skuData = skuMap.get(rule.pcode) || { pcs: 0, carton: 0, rcg: 0 };
        const qty = rule.unit === 'carton' ? skuData.carton : rule.unit === 'rcg' ? skuData.rcg : skuData.pcs;
        isMet = qty >= rule.minQty;
        
        if (qty === 0) unboughtProds.push(rule.skuName);
        requiredStr = `${rule.minQty} ${rule.unit.toUpperCase()}`;
        actualStr = `${qty.toFixed(1)} ${rule.unit.toUpperCase()}`;
      }

      if (isMet) metCount++;
      details.push({ label, requiredStr, actualStr, met: isMet, unboughtProds });
    });

    const isPassed = rulesToApply.length > 0 && metCount >= minToPassForOutlet;
    if (isPassed) passedOutlets++;
    results.push({ ...oData, metCount, totalRules: rulesToApply.length, isPassed, details });
  });

  cachedResults = results;
  results.sort((a, b) => a.metCount - b.metCount || a.outlet.localeCompare(b.outlet));

  // ==========================================
  // 5. RENDER UI
  // ==========================================
  if (!state.rows.length) {
    patchHTML('#mh-content', `<div class="empty" style="padding:32px; text-align:center;">Belum ada data. Silakan upload file LBP dan DMP.</div>`);
    return;
  }

  const chipsHtml = configuredTypes.map(t => `
    <button class="btn sm" data-switch-type="${esc(t)}" style="padding:4px 10px; font-size:11px; border-radius:20px; background:${config.outletType === t && config.targetMode === 'byType' && !config.evaluateAllTypes ? '#1D4ED8' : '#F1F5F9'}; color:${config.outletType === t && config.targetMode === 'byType' && !config.evaluateAllTypes ? '#fff' : '#475569'}; border:1px solid ${config.outletType === t && config.targetMode === 'byType' && !config.evaluateAllTypes ? '#1D4ED8' : '#CBD5E1'};">
      ${esc(t)} (${config.rulesByType[t].length})
    </button>
  `).join('');

  const kpiBlock = `
    <div class="grid kpis mb12">
      <div class="kpi purple">
        <div class="kpi-l">Toko Dievaluasi</div>
        <div class="kpi-v">${totalOutlets}</div>
        <div class="kpi-s">Target: ${config.evaluateAllTypes ? 'Semua Tipe' : (config.targetMode === 'byType' ? esc(config.outletType || '—') : 'Manual')}</div>
      </div>
      <div class="kpi pos">
        <div class="kpi-l">Lulus</div>
        <div class="kpi-v">${passedOutlets}</div>
        <div class="kpi-s">${totalOutlets > 0 ? pct((passedOutlets/totalOutlets)*100) : '0%'}</div>
      </div>
      <div class="kpi ${totalOutlets - passedOutlets > 0 ? 'neg' : 'pos'}">
        <div class="kpi-l">Belum Lulus</div>
        <div class="kpi-v">${totalOutlets - passedOutlets}</div>
      </div>
    </div>
  `;

  let outletTargetUI = '';
  if (config.targetMode === 'byType') {
    outletTargetUI = `
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <label style="font-size:12px; font-weight:700; color:#64748B;">Tipe Outlet (Berdasarkan Namaclass DMP)</label>
          <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:#1D4ED8; cursor:pointer;">
            <input type="checkbox" id="mhEvalAll" ${config.evaluateAllTypes ? 'checked' : ''} style="width:16px; height:16px;">
            Evaluasi Semua Tipe
          </label>
        </div>
        
        ${!config.evaluateAllTypes ? `
          <div style="display:flex; gap:6px; align-items:stretch; margin-bottom:8px;">
            <input type="text" id="mhOutletTypeInput" value="${esc(config.outletType)}" list="mhTypeList" placeholder="Pilih atau ketik Tipe" style="flex:1; padding:10px; border:1px solid #CBD5E1; border-radius:6px; font-size:14px;">
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

  let inputListHtml = '';
  if (inputMode === 'sku') {
    inputListHtml = productsArr.map(([code, name]) => {
      const isExisting = activeRules.some(r => r.type !== 'subrand' && r.pcode === code);
      const isChecked = selectedItems.has(code);
      return `
        <label class="mh-prod-opt" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid #F1F5F9; font-size:12px; cursor:pointer; ${isExisting ? 'opacity:0.5; cursor:not-allowed;' : ''}" data-name="${esc(name).toLowerCase()}">
          <input type="checkbox" class="mh-chk" value="${esc(code)}" ${(isChecked || isExisting) ? 'checked' : ''} ${isExisting ? 'disabled' : ''} style="width:16px; height:16px;">
          <span style="flex:1;">${esc(name)}</span>
          ${isExisting ? '<span style="font-size:10px; color:#10B981; font-weight:700;">✓ Ada</span>' : ''}
        </label>
      `;
    }).join('');
  } else {
    inputListHtml = subrandsArr.map(sub => {
      const isExisting = activeRules.some(r => r.type === 'subrand' && r.subbrandName === sub.name);
      const isChecked = selectedItems.has(sub.name);
      return `
        <label class="mh-prod-opt" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid #F1F5F9; font-size:12px; cursor:pointer; ${isExisting ? 'opacity:0.5; cursor:not-allowed;' : ''}" data-name="${esc(sub.name).toLowerCase()}">
          <input type="checkbox" class="mh-chk" value="${esc(sub.name)}" data-skucount="${sub.skuCount}" ${(isChecked || isExisting) ? 'checked' : ''} ${isExisting ? 'disabled' : ''} style="width:16px; height:16px;">
          <span style="flex:1; font-weight:700;">📦 ${esc(sub.name)} <span style="font-size:10px; font-weight:normal; color:#64748B;">(${sub.skuCount} SKU)</span></span>
          ${isExisting ? '<span style="font-size:10px; color:#10B981; font-weight:700;">✓ Ada</span>' : ''}
        </label>
      `;
    }).join('');
  }

  let selectedConfigsHtml = '';
  if (selectedItems.size > 0) {
    selectedConfigsHtml = Array.from(selectedItems).map(val => {
      let totalSku = 1;
      if (inputMode === 'subrand') {
        const subObj = subrandsArr.find(s => s.name === val);
        if (subObj) totalSku = subObj.skuCount;
      }
      
      return `
        <div class="mh-config-row" data-val="${esc(val)}" style="background:#fff; border:1px solid #E2E8F0; border-radius:6px; padding:10px; margin-bottom:8px;">
          <div style="font-weight:700; font-size:12px; color:#1E293B; margin-bottom:6px; border-bottom:1px dashed #CBD5E1; padding-bottom:4px;">
            ${inputMode === 'subrand' ? '📦' : '🏷️'} ${esc(val)}
          </div>
          <div style="display:flex; gap:6px;">
            ${inputMode === 'subrand' ? `
              <div style="flex:1;">
                <label style="font-size:10px; color:#64748B;">Min SKU</label>
                <input type="number" class="inp-minsku" value="${totalSku}" min="1" step="1" style="width:100%; padding:6px; border:1px solid #CBD5E1; border-radius:4px; font-size:12px; text-align:right;">
              </div>
            ` : ''}
            
            <div class="card mt12" id="ov-cmp">
  <div class="card-h">
    <div><div class="card-t">Perbandingan Omset</div></div>
    <div class="right">
      <button class="btn sm" 
              data-quick-export="#ov-cmp" 
              data-title="Laporan Perbandingan Omset">
        📥 Ekspor
      </button>
    </div>
  </div>
            <div style="flex:1;">
              <label style="font-size:10px; color:#64748B;">Min Qty</label>
              <input type="number" class="inp-minqty" value="1" min="0.1" step="0.1" style="width:100%; padding:6px; border:1px solid #CBD5E1; border-radius:4px; font-size:12px; text-align:right;">
            </div>
            <div style="flex:1;">
              <label style="font-size:10px; color:#64748B;">Satuan</label>
              <select class="inp-unit" style="width:100%; padding:6px; border:1px solid #CBD5E1; border-radius:4px; font-size:12px;">
                <option value="carton">CRT</option>
                <option value="rcg">RCG</option>
                <option value="pcs">PCS</option>
              </select>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } else {
    selectedConfigsHtml = `<div style="text-align:center; padding:12px; font-size:12px; color:#94A3B8; border:1px dashed #CBD5E1; border-radius:6px;">Pilih ${inputMode === 'subrand' ? 'Subrand' : 'SKU'} di atas untuk mengatur target.</div>`;
  }

  const configCard = `
    <div class="card mb12">
      <div class="card-h">
        <div><div class="card-t">Konfigurasi Must-Have</div></div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn sm primary" id="btnSaveMh" style="padding:6px 10px; font-size:11px;">💾 Simpan</button>
          <button class="btn sm" id="btnExportMh" style="padding:6px 10px; font-size:11px;">⬇ Ekspor</button>
          <button class="btn sm" id="btnImportMh" style="padding:6px 10px; font-size:11px;">⬆ Impor</button>
          <input type="file" id="mhFileInput" accept=".txt" style="display:none;">
        </div>
      </div>
      
      <div style="display:grid; gap:16px; margin-bottom:16px;">
        <div style="display:flex; background:#E2E8F0; padding:4px; border-radius:6px;">
          <button class="btn sm" id="modeTargetType" style="flex:1; border:none; background:${config.targetMode === 'byType' ? '#fff' : 'transparent'}; color:${config.targetMode === 'byType' ? '#1E293B' : '#64748B'}; box-shadow:${config.targetMode === 'byType' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'}; font-weight:700;">By Tipe Outlet (DMP)</button>
          <button class="btn sm" id="modeTargetOutlet" style="flex:1; border:none; background:${config.targetMode === 'byOutlet' ? '#fff' : 'transparent'}; color:${config.targetMode === 'byOutlet' ? '#1E293B' : '#64748B'}; box-shadow:${config.targetMode === 'byOutlet' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'}; font-weight:700;">Pilih Outlet Manual</button>
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
            <thead style="background:#F8FAFC;"><tr><th style="padding:10px;">Syarat Dievaluasi</th><th class="num" style="padding:10px;">Target</th><th style="width:50px;"></th></tr></thead>
            <tbody>
              ${activeRules.length === 0 ? '<tr><td colspan="3" class="empty" style="text-align:center; padding:16px;">Belum ada syarat.</td></tr>' : ''}
              ${activeRules.map((r, i) => `
                <tr>
                  <td style="padding:10px; border-bottom:1px solid #F1F5F9;">
                    ${r.type === 'subrand' 
                      ? `<span style="background:#E0E7FF; color:#3730A3; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; margin-right:6px;">SUBRAND</span> ${esc(r.subbrandName)}`
                      : `<span style="background:#F1F5F9; color:#475569; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; margin-right:6px;">SKU</span> ${esc(r.skuName)}`}
                  </td>
                  <td class="num" style="padding:10px; border-bottom:1px solid #F1F5F9; font-size:12px;">
                    ${r.type === 'subrand' 
                      ? `<b>${r.minSkus}</b> SKU & <b>${r.minQty}</b> ${r.unit.toUpperCase()}`
                      : `<b>${r.minQty}</b> ${r.unit.toUpperCase()}`}
                  </td>
                  <td style="padding:10px; border-bottom:1px solid #F1F5F9; text-align:center;">
                    <button class="btn sm neg" data-del-mh="${i}" style="padding:2px 8px; font-size:11px;">Hapus</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="background:#F8FAFC; padding:12px; border-radius:6px; display:grid; gap:10px;">
          <div style="display:flex; background:#E2E8F0; padding:4px; border-radius:6px;">
            <button class="btn sm" id="modeSku" style="flex:1; border:none; background:${inputMode === 'sku' ? '#fff' : 'transparent'}; color:${inputMode === 'sku' ? '#1E293B' : '#64748B'}; box-shadow:${inputMode === 'sku' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'};">Pilih SKU</button>
            <button class="btn sm" id="modeSubrand" style="flex:1; border:none; background:${inputMode === 'subrand' ? '#fff' : 'transparent'}; color:${inputMode === 'subrand' ? '#1E293B' : '#64748B'}; box-shadow:${inputMode === 'subrand' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'};">Pilih Subrand</button>
          </div>

          <div>
            <input type="text" id="mhProdSearch" placeholder="Cari..." style="width:100%; padding:8px 10px; border:1px solid #CBD5E1; border-radius:6px; font-size:13px; margin-bottom:6px;">
            <div style="max-height:150px; overflow-y:auto; border:1px solid #CBD5E1; border-radius:6px; background:#fff;">
              <div style="padding:8px 10px; background:#F1F5F9; border-bottom:1px solid #E2E8F0; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:11px; font-weight:700; color:#475569;">Daftar</span>
                <button type="button" id="mhToggleAll" class="btn sm" style="padding:2px 8px; font-size:10px;">Pilih Semua</button>
              </div>
              <div id="mhProdList">${inputListHtml}</div>
            </div>
          </div>
          
          <div style="margin-top:4px;">
            <label style="display:block; font-size:11px; font-weight:700; color:#64748B; margin-bottom:6px;">Atur Syarat Terpilih:</label>
            <div style="max-height:220px; overflow-y:auto; padding-right:4px;">
              ${selectedConfigsHtml}
            </div>
          </div>
          
          <button class="btn primary" id="btnAddMh" style="width:100%; padding:12px; margin-top:4px;">
            Tambah <span id="mhSelectedCount">0</span> Syarat
          </button>
        </div>
      ` : `
        <div style="background:#F8FAFC; padding:16px; border-radius:6px; text-align:center; color:#64748B; font-size:13px; border:1px dashed #CBD5E1;">
          Form input syarat disembunyikan saat Mode "Evaluasi Semua Tipe" aktif.<br>
          Matikan centang di atas jika ingin menambah/mengubah syarat.
        </div>
      `}
    </div>
  `;

  const resultTable = `
    <div class="card">
      <div class="card-h"><div><div class="card-t">Hasil Monitoring</div></div></div>
      <div class="tablewrap" style="max-height: 600px; overflow-x:auto;">
        <table style="min-width: 600px; width:100%; border-collapse:collapse;">
          <thead style="position:sticky; top:0; z-index:10; background:#fff; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
            <tr>
              <th style="padding:12px; text-align:left;">Toko</th>
              <th style="padding:12px; text-align:left;">Tipe</th>
              <th style="padding:12px; text-align:left;">Salesman</th>
              <th class="num" style="padding:12px;">Status</th>
              <th class="num" style="padding:12px;">Syarat</th>
              <th class="num" style="padding:12px;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${results.length === 0 ? `<tr><td colspan="6" class="empty" style="text-align:center; padding:20px;">Tidak ada data.</td></tr>` : ''}
            ${results.map(r => `
              <tr>
                <td style="padding:10px; border-bottom:1px solid #F1F5F9;" class="strong">${esc(r.outlet)}</td>
                <td style="padding:10px; border-bottom:1px solid #F1F5F9; font-size:11px; color:#475569;">${esc(r.tipe)}</td>
                <td style="padding:10px; border-bottom:1px solid #F1F5F9;">${esc(r.salesman)}</td>
                <td class="num" style="padding:10px; border-bottom:1px solid #F1F5F9;">
                  ${r.isPassed ? '<span class="delta up">✓ LULUS</span>' : '<span class="delta dn">✗ GAGAL</span>'}
                </td>
                <td class="num strong" style="padding:10px; border-bottom:1px solid #F1F5F9;">${r.metCount}/${r.totalRules}</td>
                <td class="num" style="padding:10px; border-bottom:1px solid #F1F5F9;">
                  <button class="btn sm" data-mh-detail="${esc(r.outletKey)}" style="padding:4px 8px; font-size:11px;">Detail</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  patchHTML('#mh-content', `
    ${kpiBlock}
    ${configCard}
    ${resultTable}
  `);

  setTimeout(() => {
    const cnt = document.getElementById('mhSelectedCount');
    if (cnt) cnt.textContent = selectedItems.size;
  }, 0);
}

// ==========================================
// 6. EVENT LISTENERS
// ==========================================
registerView('musthave', {
  label: 'Must-Have SKU', title: 'Monitoring Must-Have SKU', sub: 'Kelengkapan Produk per Toko', shell, update,
  mount(){
    document.addEventListener('input', e => {
      if (e.target.id === 'mhProdSearch') {
        const q = e.target.value.toLowerCase();
        const list = document.getElementById('mhProdList');
        if (list) {
          list.querySelectorAll('.mh-prod-opt').forEach(opt => {
            opt.style.display = opt.dataset.name.includes(q) ? 'flex' : 'none';
          });
        }
      }
      if (e.target.id === 'mhOutSearch') {
        const q = e.target.value.toLowerCase();
        const list = document.getElementById('mhOutList');
        if (list) {
          list.querySelectorAll('.mh-out-opt').forEach(opt => {
            opt.style.display = opt.dataset.name.includes(q) ? 'flex' : 'none';
          });
        }
      }
    });

    document.addEventListener('change', e => {
      if (e.target.id === 'mhFileInput') {
        if (e.target.files && e.target.files.length > 0) {
          importConfig(e.target.files[0]);
          e.target.value = '';
        }
        return;
      }

      if (e.target.id === 'mhEvalAll') {
        const config = getConfig();
        config.evaluateAllTypes = e.target.checked;
        saveConfig(config);
        store.emit();
        return;
      }

      if (e.target.classList.contains('mh-chk')) {
        if (e.target.checked) selectedItems.add(e.target.value);
        else selectedItems.delete(e.target.value);
        
        const cnt = document.getElementById('mhSelectedCount');
        if (cnt) cnt.textContent = selectedItems.size;
        store.emit(); 
      }

      if (e.target.classList.contains('mh-out-chk')) {
        const config = getConfig();
        if (e.target.checked) {
          if (!config.selectedOutlets.includes(e.target.value)) config.selectedOutlets.push(e.target.value);
        } else {
          config.selectedOutlets = config.selectedOutlets.filter(k => k !== e.target.value);
        }
        saveConfig(config);
        
        const cnt = document.getElementById('outSelectedCount');
        if (cnt) cnt.textContent = config.selectedOutlets.length + ' Terpilih';
        store.emit();
      }
      
      if(e.target.id === 'mhOutletTypeInput') {
        const config = getConfig();
        config.outletType = cleanStr(e.target.value);
        saveConfig(config);
        selectedItems.clear();
        store.emit();
      }
      if(e.target.id === 'mhMinPass') {
        const config = getConfig();
        const activeKey = config.targetMode === 'byType' ? (config.outletType || 'DEFAULT') : 'MANUAL_CUSTOM';
        config.minPassByType[activeKey] = Math.max(1, parseInt(e.target.value) || 1);
        saveConfig(config);
        store.emit();
      }
    });

    document.addEventListener('click', e => {
      if (e.target.id === 'btnSaveMh') {
        saveConfig(getConfig());
        toast('Pengaturan berhasil disimpan!');
        return;
      }
      if (e.target.id === 'btnExportMh') {
        exportConfig();
        return;
      }
      if (e.target.id === 'btnImportMh') {
        document.getElementById('mhFileInput').click();
        return;
      }

      if (e.target.hasAttribute('data-switch-type')) {
        const config = getConfig();
        config.outletType = e.target.getAttribute('data-switch-type');
        config.targetMode = 'byType';
        config.evaluateAllTypes = false;
        saveConfig(config);
        selectedItems.clear();
        store.emit();
        return;
      }

      if (e.target.id === 'modeTargetType') {
        const config = getConfig();
        config.targetMode = 'byType';
        saveConfig(config);
        store.emit();
        return;
      }
      if (e.target.id === 'modeTargetOutlet') {
        const config = getConfig();
        config.targetMode = 'byOutlet';
        saveConfig(config);
        store.emit();
        return;
      }

      if (e.target.id === 'modeSku') {
        inputMode = 'sku';
        selectedItems.clear();
        store.emit();
        return;
      }
      if (e.target.id === 'modeSubrand') {
        inputMode = 'subrand';
        selectedItems.clear();
        store.emit();
        return;
      }

      if (e.target.id === 'mhToggleAll') {
        const list = document.getElementById('mhProdList');
        if (!list) return;
        const visibleOpts = Array.from(list.querySelectorAll('.mh-prod-opt')).filter(o => o.style.display !== 'none');
        const allChks = visibleOpts.map(o => o.querySelector('input[type="checkbox"]')).filter(c => c && !c.disabled);
        
        const allChecked = allChks.length > 0 && allChks.every(c => c.checked);
        
        allChks.forEach(c => {
          c.checked = !allChecked;
          if (!allChecked) selectedItems.add(c.value);
          else selectedItems.delete(c.value);
        });
        
        const cnt = document.getElementById('mhSelectedCount');
        if (cnt) cnt.textContent = selectedItems.size;
        store.emit();
        return;
      }

      if(e.target.id === 'btnSaveType') {
        const inp = document.getElementById('mhOutletTypeInput');
        if(!inp) return;
        const val = cleanStr(inp.value);
        if (!val) { toast('Tipe tidak boleh kosong'); return; }
        
        const config = getConfig();
        config.outletType = val;
        if (!config.customTypes.includes(val)) config.customTypes.push(val);
        saveConfig(config);
        selectedItems.clear();
        toast('Tipe disimpan');
        store.emit();
      }

      if(e.target.hasAttribute('data-mh-detail')) {
        const oKey = e.target.getAttribute('data-mh-detail');
        const r = cachedResults.find(x => x.outletKey === oKey);
        if (!r) return;

        let rowsHtml = r.details.map(d => {
          let missingHtml = '';
          if (!d.met && d.unboughtProds && d.unboughtProds.length > 0) {
            missingHtml = `<div style="font-size:10px; color:#EF4444; margin-top:4px; line-height:1.3;">Belum beli (${d.unboughtProds.length}): ${d.unboughtProds.map(p => esc(p)).join(', ')}</div>`;
          }
          
          return `
          <tr>
            <td style="padding:8px; border-bottom:1px solid #eee; vertical-align:top;">
              ${esc(d.label)}
              ${missingHtml}
            </td>
            <td class="num" style="padding:8px; border-bottom:1px solid #eee; vertical-align:top;">${esc(d.requiredStr)}</td>
            <td class="num" style="padding:8px; border-bottom:1px solid #eee; vertical-align:top;">${esc(d.actualStr)}</td>
            <td class="num" style="padding:8px; border-bottom:1px solid #eee; font-weight:bold; color:${d.met ? 'var(--pos)' : 'var(--neg)'}; vertical-align:top;">
              ${d.met ? '✓' : '✗'}
            </td>
          </tr>
        `}).join('');

        openModal(`
          <div class="modal-h"><h3>Detail: ${esc(r.outlet)}</h3><button class="x">×</button></div>
          <div class="modal-b">
            <div class="mb12" style="background:#F8FAFC; padding:12px; border-radius:8px; font-size:13px;">
              <b>Tipe Outlet:</b> ${esc(r.tipe)} <br>
              <b>Salesman:</b> ${esc(r.salesman)} <br>
              <b>Status:</b> <span style="color:${r.isPassed ? 'var(--pos)' : 'var(--neg)'}">${r.metCount} / ${r.totalRules} Syarat</span>
            </div>
            <div class="tablewrap" style="max-height: 400px; border:1px solid #E2E8F0; border-radius:6px;">
              <table style="width:100%;">
                <thead style="background:#F8FAFC;"><tr><th style="padding:8px;">Syarat</th><th class="num" style="padding:8px;">Target</th><th class="num" style="padding:8px;">Aktual</th><th class="num" style="padding:8px;">Status</th></tr></thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </div>
          </div>
        `);
      }

      if(e.target.id === 'btnAddMh') {
        if (selectedItems.size === 0) {
          toast('Pilih minimal 1 item.');
          return;
        }

        const config = getConfig();
        const activeKey = config.targetMode === 'byType' ? (config.outletType || 'DEFAULT') : 'MANUAL_CUSTOM';
        
        if (config.targetMode === 'byType' && !config.outletType) { 
          toast('Pilih Tipe Outlet terlebih dahulu'); return; 
        }

        if (!config.rulesByType[activeKey]) config.rulesByType[activeKey] = [];
        
        let addedCount = 0;
        let duplicateCount = 0;

        const configRows = document.querySelectorAll('.mh-config-row');
        const tempRules = {};
        
        configRows.forEach(row => {
          const val = row.dataset.val;
          const minSkuInput = row.querySelector('.inp-minsku');
          const minQtyInput = row.querySelector('.inp-minqty');
          const unitInput = row.querySelector('.inp-unit');
          
          tempRules[val] = {
            minSkus: minSkuInput ? parseFloat(minSkuInput.value) || 1 : undefined,
            minQty: parseFloat(minQtyInput.value) || 1,
            unit: unitInput.value
          };
        });

        selectedItems.forEach(val => {
          const rConf = tempRules[val];
          if (!rConf) return;

          if (inputMode === 'subrand') {
            const existing = config.rulesByType[activeKey].find(r => r.type === 'subrand' && r.subbrandName === val);
            if (existing) { duplicateCount++; return; }
            
            config.rulesByType[activeKey].push({ 
              type: 'subrand', 
              subbrandName: val, 
              minSkus: rConf.minSkus, 
              minQty: rConf.minQty, 
              unit: rConf.unit 
            });
            addedCount++;
          } else {
            const existing = config.rulesByType[activeKey].find(r => r.type !== 'subrand' && r.pcode === val);
            if (existing) { duplicateCount++; return; }
            
            let skuName = val;
            store.state.rows.forEach(r => { if(r.pcode === val) skuName = r.product; });
            
            config.rulesByType[activeKey].push({ type: 'sku', pcode: val, skuName, minQty: rConf.minQty, unit: rConf.unit });
            addedCount++;
          }
        });

        const currentMinPass = config.minPassByType[activeKey] || 1;
        if (currentMinPass > config.rulesByType[activeKey].length) {
          config.minPassByType[activeKey] = config.rulesByType[activeKey].length;
        }

        saveConfig(config);
        
        if (addedCount > 0) toast(`${addedCount} syarat ditambahkan`);
        if (duplicateCount > 0) setTimeout(() => toast(`${duplicateCount} dilewati (sudah ada)`), 500);
        
        selectedItems.clear();
        store.emit();
      }

      if(e.target.hasAttribute('data-del-mh')) {
        const idx = +e.target.dataset.delMh;
        const config = getConfig();
        const activeKey = config.targetMode === 'byType' ? (config.outletType || 'DEFAULT') : 'MANUAL_CUSTOM';
        
        if (config.rulesByType[activeKey]) {
          config.rulesByType[activeKey].splice(idx, 1);
          
          if (config.minPassByType[activeKey] > config.rulesByType[activeKey].length && config.rulesByType[activeKey].length > 0) {
             config.minPassByType[activeKey] = config.rulesByType[activeKey].length;
          } else if (config.rulesByType[activeKey].length === 0) {
             config.minPassByType[activeKey] = 1;
          }
          
          saveConfig(config);
          toast('Syarat dihapus');
          store.emit();
        }
      }
    });
  }
});