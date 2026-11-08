// js/views/settings/musthave.js
import { store } from '../../core/store.js';
import { toast } from '../../ui/feedback.js';
import * as C from '../../core/musthave.js';
import * as UI from '../../ui/musthave/config.js';
import * as Svc from '../../sync/musthave.js';
import { renderKpis } from '../../ui/musthave/read.js';

let localSelectedItems = new Set(); 
let localExcludedMap = {}; 
let localMergedMap = {};
let localValuesMap = {}; 
let editingIndex = null;

export function renderMustHaveSettingsView(state) {
  const config = C.getConfig();
  const computedData = C.processMustHave(state, config);

  return `
    <div id="mh-local-kpis">${renderKpis(computedData.totalOutlets, computedData.passedOutlets, config)}</div>
    <div id="mh-local-form">${UI.renderConfigUI(config, computedData, localSelectedItems, localExcludedMap, localMergedMap, localValuesMap, editingIndex)}</div>
  `;
}

function rerenderFormLocal() {
  const config = C.getConfig();
  const computedData = C.processMustHave(store.state, config);
  const formContainer = document.getElementById('mh-local-form');
  if (formContainer) {
    formContainer.innerHTML = UI.renderConfigUI(config, computedData, localSelectedItems, localExcludedMap, localMergedMap, localValuesMap, editingIndex);
  }
}

export function attachMustHaveSettingsHandlers(state) {
  
  if (window._mhSettingsHandler) {
    document.removeEventListener('input', window._mhSettingsHandler.input);
    document.removeEventListener('change', window._mhSettingsHandler.change);
    document.removeEventListener('click', window._mhSettingsHandler.click);
  }

  const inputHandler = (e) => {
    if (e.target.classList.contains('inp-minsku') || e.target.classList.contains('inp-minqty') || e.target.classList.contains('inp-unit')) {
      const row = e.target.closest('.mh-config-row');
      if (row) {
        const key = row.dataset.val;
        if (!localValuesMap[key]) localValuesMap[key] = {};
        if (e.target.classList.contains('inp-minsku')) localValuesMap[key].minSkus = +e.target.value || 1;
        if (e.target.classList.contains('inp-minqty')) localValuesMap[key].minQty = +e.target.value || 1;
        if (e.target.classList.contains('inp-unit')) localValuesMap[key].unit = e.target.value;
      }
      return; 
    }

    if (e.target.id === 'mhProdSearch') {
      const q = e.target.value.toLowerCase();
      document.getElementById('mhProdList')?.querySelectorAll('.mh-prod-opt').forEach(opt => {
        opt.style.display = opt.dataset.name.includes(q) ? 'flex' : 'none';
      });
    }
    if (e.target.id === 'mhOutSearch') {
      const q = e.target.value.toLowerCase();
      document.getElementById('mhOutList')?.querySelectorAll('.mh-out-opt').forEach(opt => {
        opt.style.display = opt.dataset.name.includes(q) ? 'flex' : 'none';
      });
    }
  };

  const changeHandler = (e) => {
    if (e.target.classList.contains('inp-unit')) {
       const row = e.target.closest('.mh-config-row');
       if (row) {
         const key = row.dataset.val;
         if (!localValuesMap[key]) localValuesMap[key] = {};
         localValuesMap[key].unit = e.target.value;
       }
       return;
    }

    if (e.target.id === 'mhStartDate') {
      const config = C.getConfig();
      config.startDate = e.target.value;
      Svc.saveMustHaveConfig(config);
      store.emit();
      return;
    }
    if (e.target.id === 'mhEndDate') {
      const config = C.getConfig();
      config.endDate = e.target.value;
      Svc.saveMustHaveConfig(config);
      store.emit();
      return;
    }
    if (e.target.id === 'mhEvalAll') {
      const config = C.getConfig();
      config.evaluateAllTypes = e.target.checked;
      Svc.saveMustHaveConfig(config);
      localSelectedItems.clear();
      localExcludedMap = {};
      localMergedMap = {};
      localValuesMap = {};
      editingIndex = null;
      store.emit();
      return;
    }

    if (e.target.classList.contains('mh-chk')) {
      if (e.target.checked) {
        localSelectedItems.add(e.target.value);
        if (!localValuesMap[e.target.value]) {
          const isSub = e.target.value.startsWith('SUB:');
          localValuesMap[e.target.value] = { 
            minSkus: isSub ? (parseInt(e.target.dataset.skucount) || 1) : 1, 
            minQty: 1, 
            unit: 'carton' 
          };
        }
      } else {
        localSelectedItems.delete(e.target.value);
        delete localValuesMap[e.target.value];
        const [type, val] = e.target.value.split(':');
        if (type === 'SUB') {
          delete localExcludedMap[val]; 
          delete localMergedMap[val];
        }
      }
      document.getElementById('mhSelectedCount').textContent = localSelectedItems.size;
      rerenderFormLocal();
    }

    if (e.target.classList.contains('inp-exc-sel')) {
      const subName = e.target.dataset.sub;
      const pc = e.target.value;
      if (!pc) return;
      if (!localExcludedMap[subName]) localExcludedMap[subName] = [];
      if (!localExcludedMap[subName].includes(pc)) localExcludedMap[subName].push(pc);
      rerenderFormLocal();
    }

    if (e.target.classList.contains('mh-out-chk')) {
      const config = C.getConfig();
      if (e.target.checked) {
        if (!config.selectedOutlets.includes(e.target.value)) config.selectedOutlets.push(e.target.value);
      } else {
        config.selectedOutlets = config.selectedOutlets.filter(k => k !== e.target.value);
      }
      Svc.saveMustHaveConfig(config);
      document.getElementById('outSelectedCount').textContent = config.selectedOutlets.length + ' Terpilih';
      store.emit();
    }
    
    if (e.target.id === 'mhMinPass') {
      const config = C.getConfig();
      const computedData = C.processMustHave(store.state, config);
      config.minPassByType[computedData.activeKey] = Math.max(1, parseInt(e.target.value) || 1);
      Svc.saveMustHaveConfig(config);
      store.emit();
    }
  };

  const clickHandler = (e) => {
    const config = C.getConfig();

    if (e.target.id === 'btnSaveMh') {
      Svc.saveMustHaveConfig(config);
      toast('Pengaturan Must-Have berhasil disimpan ke Cloud!');
      return;
    }

    if (e.target.id === 'btnCancelEdit') {
      localSelectedItems.clear();
      localExcludedMap = {};
      localMergedMap = {};
      localValuesMap = {};
      editingIndex = null;
      rerenderFormLocal();
      return;
    }

    if (e.target.classList.contains('rm-exc')) {
      const subName = e.target.dataset.sub;
      const pc = e.target.dataset.pc;
      if (localExcludedMap[subName]) {
        localExcludedMap[subName] = localExcludedMap[subName].filter(x => x !== pc);
        rerenderFormLocal();
      }
      return;
    }

    if (e.target.classList.contains('rm-merge')) {
      const subName = e.target.dataset.sub;
      const grpIdx = +e.target.dataset.grpIdx;
      if (localMergedMap[subName]) {
        localMergedMap[subName].splice(grpIdx, 1);
        rerenderFormLocal();
      }
      return;
    }

    if (e.target.classList.contains('btn-merge-multi')) {
      const subName = e.target.dataset.sub;
      const chks = document.querySelectorAll(`.merge-chk[data-sub="${subName}"]:checked`);
      const selectedPcodes = Array.from(chks).map(chk => chk.value);
      const nameInput = document.querySelector(`.inp-merge-name[data-sub="${subName}"]`);
      const customName = nameInput ? nameInput.value.trim() : '';

      if (selectedPcodes.length < 2) {
        toast('Pilih minimal 2 SKU untuk digabung');
        return;
      }

      if (!localMergedMap[subName]) localMergedMap[subName] = [];
      // ⚡ Simpan dalam format object dengan nama
      localMergedMap[subName].push({ name: customName, pcodes: selectedPcodes });
      
      chks.forEach(chk => chk.checked = false);
      
      rerenderFormLocal();
      return;
    }

    if (e.target.id === 'btnSaveType') {
      const input = document.getElementById('mhOutletTypeInput');
      const val = C.cleanStr(input?.value);
      if (!val) { toast('Ketik nama Tipe Outlet terlebih dahulu'); return; }
      
      config.outletType = val;
      if (!config.customTypes.includes(val)) config.customTypes.push(val);
      Svc.saveMustHaveConfig(config);
      toast('Tipe Outlet disimpan');
      store.emit();
      return;
    }

    if (e.target.hasAttribute('data-edit-mh')) {
      editingIndex = +e.target.getAttribute('data-edit-mh');
      const activeKey = config.targetMode === 'byType' ? (config.outletType || 'DEFAULT') : 'MANUAL_CUSTOM';
      const rule = config.rulesByType[activeKey][editingIndex];
      
      localSelectedItems.clear();
      localExcludedMap = {};
      localMergedMap = {};
      localValuesMap = {};

      if (rule.type === 'subrand') {
        localSelectedItems.add('SUB:' + rule.subbrandName);
        localExcludedMap[rule.subbrandName] = [...(rule.excludedPcodes || [])];
        localMergedMap[rule.subbrandName] = rule.mergedPcodes ? JSON.parse(JSON.stringify(rule.mergedPcodes)) : [];
        localValuesMap['SUB:' + rule.subbrandName] = { minSkus: rule.minSkus || 1, minQty: rule.minQty || 1, unit: rule.unit || 'carton' };
      } else {
        localSelectedItems.add('SKU:' + rule.pcode);
        localValuesMap['SKU:' + rule.pcode] = { minQty: rule.minQty || 1, unit: rule.unit || 'carton' };
      }

      rerenderFormLocal();
      return;
    }

    if (e.target.hasAttribute('data-switch-type')) {
      config.outletType = e.target.getAttribute('data-switch-type');
      config.targetMode = 'byType';
      config.evaluateAllTypes = false;
      Svc.saveMustHaveConfig(config);
      localSelectedItems.clear();
      localExcludedMap = {};
      localMergedMap = {};
      localValuesMap = {};
      editingIndex = null;
      store.emit();
      return;
    }

    if (e.target.id === 'modeTargetType') {
      config.targetMode = 'byType'; Svc.saveMustHaveConfig(config); store.emit(); return;
    }
    if (e.target.id === 'modeTargetOutlet') {
      config.targetMode = 'byOutlet'; Svc.saveMustHaveConfig(config); store.emit(); return;
    }

    if (e.target.id === 'mhToggleAll') {
      const list = document.getElementById('mhProdList');
      if (!list) return;
      const visibleOpts = Array.from(list.querySelectorAll('.mh-prod-opt')).filter(o => o.style.display !== 'none');
      const allChks = visibleOpts.map(o => o.querySelector('input[type="checkbox"]')).filter(c => c && !c.disabled);
      
      const allChecked = allChks.length > 0 && allChks.every(c => c.checked);
      
      allChks.forEach(c => {
        c.checked = !allChecked;
        if (!allChecked) {
          localSelectedItems.add(c.value);
          if (!localValuesMap[c.value]) {
            const isSub = c.value.startsWith('SUB:');
            localValuesMap[c.value] = { 
              minSkus: isSub ? (parseInt(c.dataset.skucount) || 1) : 1, 
              minQty: 1, 
              unit: 'carton' 
            };
          }
        } else {
          localSelectedItems.delete(c.value);
          delete localValuesMap[c.value];
        }
      });
      
      document.getElementById('mhSelectedCount').textContent = localSelectedItems.size;
      rerenderFormLocal();
      return;
    }

    if (e.target.id === 'btnAddMh') {
      if (localSelectedItems.size === 0) { toast('Pilih minimal 1 item.'); return; }
      
      if (config.targetMode === 'byType' && !config.outletType) { 
        toast('⚠️ Isi "Tipe Outlet" terlebih dahulu sebelum menambah syarat!'); 
        return; 
      }

      const computedData = C.processMustHave(store.state, config);
      if (!config.rulesByType[computedData.activeKey]) config.rulesByType[computedData.activeKey] = [];
      
      let addedCount = 0;

      if (editingIndex !== null) {
        config.rulesByType[computedData.activeKey].splice(editingIndex, 1);
      }

      localSelectedItems.forEach(key => {
        const rConf = localValuesMap[key]; 
        if (!rConf) return;

        const [type, val] = key.split(':');

        if (type === 'SUB') {
          config.rulesByType[computedData.activeKey].push({ 
            type: 'subrand', subbrandName: val, minSkus: rConf.minSkus, minQty: rConf.minQty, unit: rConf.unit,
            excludedPcodes: localExcludedMap[val] || [],
            mergedPcodes: localMergedMap[val] || []
          });
          addedCount++;
        } else {
          let skuName = val;
          store.state.rows.forEach(r => { if(r.pcode === val) skuName = r.product; });
          config.rulesByType[computedData.activeKey].push({ type: 'sku', pcode: val, skuName, minQty: rConf.minQty, unit: rConf.unit });
          addedCount++;
        }
      });

      if (config.minPassByType[computedData.activeKey] > config.rulesByType[computedData.activeKey].length) {
        config.minPassByType[computedData.activeKey] = config.rulesByType[computedData.activeKey].length;
      }

      Svc.saveMustHaveConfig(config);
      if (editingIndex !== null) toast(`Syarat berhasil diupdate`);
      else if (addedCount > 0) toast(`${addedCount} syarat ditambahkan`);
      
      localSelectedItems.clear();
      localExcludedMap = {};
      localMergedMap = {};
      localValuesMap = {};
      editingIndex = null;
      store.emit(); 
    }

    if (e.target.hasAttribute('data-del-mh')) {
      const idx = +e.target.dataset.delMh;
      const computedData = C.processMustHave(store.state, config);
      if (config.rulesByType[computedData.activeKey]) {
        config.rulesByType[computedData.activeKey].splice(idx, 1);
        if (config.minPassByType[computedData.activeKey] > config.rulesByType[computedData.activeKey].length && config.rulesByType[computedData.activeKey].length > 0) {
           config.minPassByType[computedData.activeKey] = config.rulesByType[computedData.activeKey].length;
        } else if (config.rulesByType[computedData.activeKey].length === 0) {
           config.minPassByType[computedData.activeKey] = 1;
        }
        Svc.saveMustHaveConfig(config);
        toast('Syarat dihapus');
        
        if (editingIndex === idx) {
          localSelectedItems.clear();
          localExcludedMap = {};
          localMergedMap = {};
          localValuesMap = {};
          editingIndex = null;
        } else if (editingIndex > idx) {
          editingIndex--;
        }
        store.emit(); 
      }
    }
  };

  document.addEventListener('input', inputHandler);
  document.addEventListener('change', changeHandler);
  document.addEventListener('click', clickHandler);

  window._mhSettingsHandler = { input: inputHandler, change: changeHandler, click: clickHandler };
}