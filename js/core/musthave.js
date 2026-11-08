/* ═══════════════════════════════════════════════════════════════
   Must-Have SKU — CORE LOGIC (With Merge Name & Date Period)
   ═══════════════════════════════════════════════════════════════ */

import { store } from './store.js';

export function cleanStr(s) {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

export function defaultConfig() {
  return { 
    targetMode: 'byType', outletType: '', selectedOutlets: [],
    rulesByType: {}, minPassByType: {}, customTypes: [], evaluateAllTypes: false,
    startDate: '', endDate: ''
  };
}

export function getConfig() {
  try {
    const raw = store.state.settings?.musthave;
    if (raw) {
      let parsed = JSON.parse(JSON.stringify(raw));
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
      if (parsed.startDate === undefined) parsed.startDate = '';
      if (parsed.endDate === undefined) parsed.endDate = '';
      
      for (const t in parsed.rulesByType) {
        parsed.rulesByType[t].forEach(r => {
          if (!r.type) r.type = 'sku';
          if (r.type === 'subrand') {
            if (r.minSkus === undefined) {
              r.minSkus = r.minQty || 1; 
              r.minQty = 1;              
              if (!r.unit || r.unit === 'sku') r.unit = 'carton';
            }
            if (!Array.isArray(r.excludedPcodes)) r.excludedPcodes = [];
            if (!Array.isArray(r.mergedPcodes)) r.mergedPcodes = []; 
          }
        });
      }
      return parsed;
    }
  } catch(e) { console.error('[musthave config]', e); }
  return defaultConfig();
}

let _lastCacheKey = '';
let _cachedData = null;

export function processMustHave(state, config) {
  const cacheKey = 'v5|' + JSON.stringify(config) + '|' + (state.rows?.length || 0) + '|' + (state.outletMaster?.size || 0);
  if (_lastCacheKey === cacheKey && _cachedData) {
    return _cachedData;
  }

  let filteredRows = state.rows || [];
  if (config.startDate) filteredRows = filteredRows.filter(r => r.day >= config.startDate);
  if (config.endDate) filteredRows = filteredRows.filter(r => r.day <= config.endDate);

  const detectedTypes = new Set();
  const outletTypeMap = new Map();

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

  const pcodeToProduct = new Map();
  const products = new Map(); 
  const subrands = new Set();
  const subrandToPcodes = new Map(); 

  state.rows.forEach(r => {
    if (r.pcode && !pcodeToProduct.has(r.pcode)) {
      pcodeToProduct.set(r.pcode, r.product);
      products.set(r.pcode, r.product);
    }
    if (r.subbrand && r.subbrand !== '—') {
      subrands.add(r.subbrand);
      if (r.pcode) {
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
      let requiredStr = '';
      let actualStr = '';
      let skuDetails = []; 

      if (rule.type === 'subrand') {
        label = `Subrand: ${rule.subbrandName}`;
        const rawPcodes = subrandToPcodes.get(rule.subbrandName) || new Set();
        
        const excluded = new Set(rule.excludedPcodes || []);
        const mergedGroups = rule.mergedPcodes || []; 

        const pcodeToGroup = new Map();
        mergedGroups.forEach((grp, idx) => {
          const pcodes = Array.isArray(grp) ? grp : grp.pcodes;
          if (pcodes) pcodes.forEach(pc => pcodeToGroup.set(pc, idx));
        });

        let boughtSkuCount = 0;
        let totalQty = 0;
        const visited = new Set();

        rawPcodes.forEach(pc => {
          if (excluded.has(pc)) return;

          const grpId = pcodeToGroup.has(pc) ? pcodeToGroup.get(pc) : `single_${pc}`;
          if (visited.has(grpId)) return;
          visited.add(grpId);

          let groupQty = 0;
          let displayName = '';

          if (typeof grpId === 'number') {
            const grpObj = mergedGroups[grpId];
            const grpPcodes = Array.isArray(grpObj) ? grpObj : grpObj.pcodes;
            const customName = (!Array.isArray(grpObj) && grpObj.name) ? grpObj.name : '';
            
            let autoNames = [];
            grpPcodes.forEach(gpc => {
              const skuData = skuMap.get(gpc) || { pcs: 0, carton: 0, rcg: 0 };
              const q = rule.unit === 'carton' ? skuData.carton : rule.unit === 'rcg' ? skuData.rcg : skuData.pcs;
              groupQty += Number(q) || 0;
              autoNames.push(pcodeToProduct.get(gpc) || gpc);
            });

            displayName = customName || autoNames.join(' + ');
          } else {
            const skuData = skuMap.get(pc) || { pcs: 0, carton: 0, rcg: 0 };
            groupQty = rule.unit === 'carton' ? skuData.carton : rule.unit === 'rcg' ? skuData.rcg : skuData.pcs;
            displayName = pcodeToProduct.get(pc) || pc;
          }

          const finalQty = Number(groupQty) || 0;
          if (finalQty > 0) { boughtSkuCount++; totalQty += finalQty; }

          skuDetails.push({ 
            name: displayName, 
            qty: finalQty,
            isMerged: typeof grpId === 'number'
          });
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
        const finalQty = Number(qty) || 0;
        
        isMet = finalQty >= rule.minQty;
        
        requiredStr = `${rule.minQty} ${rule.unit.toUpperCase()}`;
        actualStr = `${finalQty.toFixed(1)} ${rule.unit.toUpperCase()}`;
      }

      if (isMet) metCount++;
      details.push({ 
        label, requiredStr, actualStr, met: isMet, excludedPcodes: rule.excludedPcodes, skuDetails,
        minSkus: rule.minSkus || 1 // ⚡ Tambahan untuk kalkulasi tabel view
      });
    });

    const isPassed = rulesToApply.length > 0 && metCount >= minToPassForOutlet;
    if (isPassed) passedOutlets++;
    results.push({ ...oData, metCount, totalRules: rulesToApply.length, isPassed, details });
  });

  results.sort((a, b) => a.metCount - b.metCount || a.outlet.localeCompare(b.outlet));

  const finalData = {
    results, totalOutlets, passedOutlets, activeRules, activeKey, minToPass,
    productsArr, subrandsArr, allOutletsArr, typesArr, configuredTypes,
    pcodeToProduct, subrandToPcodes
  };

  _lastCacheKey = cacheKey;
  _cachedData = finalData;

  return finalData;
}