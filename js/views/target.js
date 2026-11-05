import { esc, compactRp, pct, NF1 } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { store } from '../core/store.js';
import { selectFiltered } from '../core/selectors.js';
import { toast } from '../ui/feedback.js';
import { registerView } from './registry.js';

function getTargets(month) {
  if (!store.state.targets[month]) {
    store.state.targets[month] = { 
      global: { level: 'all', all: 0, divisi: {}, subbrand: {}, produk: {} }, 
      salesman: {}, 
      salesmanLevel: 'all',
      manualKpis: ['HHT', 'VIR'] 
    };
  }
  
  const t = store.state.targets[month];
  if (!t.salesmanLevel) t.salesmanLevel = 'all';
  
  for (const sm in t.salesman) {
    if (t.salesman[sm].omset !== undefined || t.salesman[sm].ec !== undefined || t.salesman[sm].ipt !== undefined) {
      const oldData = { ...t.salesman[sm] };
      t.salesman[sm] = { all: { ALL: oldData } };
    }
  }
  return t;
}

/* =========================================================
   HITUNG TOTAL TARGET (DENGAN FALLBACK PINTAR)
   ========================================================= */
function computeEffectiveGlobalTarget(t) {
  let totalSalesman = 0;
  for (const sm in (t.salesman || {})) {
    const smData = t.salesman[sm];
    // 1. Coba ambil dari target "All"
    let smTotal = smData?.all?.ALL?.omset || 0;
    
    // 2. Jika "All" kosong, jumlahkan dari level Divisi/Subrand/Produk
    if (!smTotal) {
      for (const lvl of ['divisi', 'subbrand', 'produk']) {
        if (smData[lvl]) {
          for (const item in smData[lvl]) {
            smTotal += (smData[lvl][item]?.omset || 0);
          }
        }
      }
    }
    totalSalesman += smTotal;
  }
  // 3. Jika total salesman 0, ambil dari target Global (jika user mengisi di tab Global)
  return totalSalesman > 0 ? totalSalesman : (t.global.all || 0);
}

function computeActualOmset(state) {
  let total = 0;
  const filtered = selectFiltered(state);
  for (const r of filtered) {
    if (r.tt === 'F') total += r.amount;
    else if (r.tt === 'R') total -= r.amount;
  }
  return total;
}

function refreshHeaderDom(state, t) {
  const actualOmset = computeActualOmset(state);
  const globalTarget = computeEffectiveGlobalTarget(t);

  const pctNum = globalTarget > 0 ? (actualOmset / globalTarget) * 100 : 0;
  const gapOmset = actualOmset - globalTarget;
  const statusClass = globalTarget > 0 && actualOmset >= globalTarget ? 'pos' : (globalTarget > 0 && pctNum >= 75 ? 'warn' : 'neg');

  const elTarget = document.getElementById('tgt-hdr-target');
  const elPct    = document.getElementById('tgt-hdr-pct');
  const elGap    = document.getElementById('tgt-hdr-gap');
  const elCard   = document.getElementById('tgt-hdr-card');

  if (elTarget) elTarget.textContent = compactRp(globalTarget);
  if (elPct)    elPct.textContent = globalTarget > 0 ? pct(pctNum) : '—';
  if (elGap) {
    elGap.textContent = 'GAP: ' + (globalTarget > 0 ? compactRp(gapOmset) : '—');
    elGap.style.color = gapOmset < 0 ? 'var(--neg)' : 'var(--pos)';
  }
  if (elCard) elCard.className = 'kpi ' + statusClass;
}

function shell(){ return `<div id="tgt-content"></div>`; }

function update(container, state){
  const allRows = state.rows;
  const filteredRows = selectFiltered(state); // <-- UNTUK FILTER SALESMAN
  
  const months = Array.from(new Set(allRows.map(r => r.day.slice(0, 7)))).sort();
  let activeMonth = state.targetMonth || (months.length > 0 ? months[months.length - 1] : null);

  if(!activeMonth){
    patchHTML('#tgt-content', '<div class="empty">Belum ada data transaksi.</div>');
    return;
  }
  if (activeMonth !== state.targetMonth) store.set({ targetMonth: activeMonth });

  const t = getTargets(activeMonth);
  const activeTab = state.ui.targetTab || 'global';

  let actualOmset = 0;
  for (const r of filteredRows) {
    if (r.tt === 'F') actualOmset += r.amount;
    else if (r.tt === 'R') actualOmset -= r.amount;
  }
  
  const globalTarget = computeEffectiveGlobalTarget(t);
  const pctNum = globalTarget > 0 ? (actualOmset / globalTarget) * 100 : 0;
  const gapOmset = actualOmset - globalTarget;
  const statusClass = globalTarget > 0 && actualOmset >= globalTarget ? 'pos' : (globalTarget > 0 && pctNum >= 75 ? 'warn' : 'neg');

  const tabNav = `
    <div class="seg mb12" id="tgtTabSeg" style="display:flex; gap:4px; background:#F1F5F9; padding:4px; border-radius:8px;">
      <button data-ttab="global" class="${activeTab === 'global' ? 'on' : ''}" style="flex:1">Target Global</button>
      <button data-ttab="salesman" class="${activeTab === 'salesman' ? 'on' : ''}" style="flex:1">Salesman</button>
      <button data-ttab="manual" class="${activeTab === 'manual' ? 'on' : ''}" style="flex:1">Manual</button>
    </div>
  `;

  const kpiHeader = `
    <div class="grid kpis">
      <div class="kpi pos">
        <div class="kpi-l">Aktual Omset</div>
        <div class="kpi-v">${compactRp(actualOmset)}</div>
        <div class="kpi-s">Berdasarkan Filter</div>
      </div>
      <div class="kpi">
        <div class="kpi-l">Target Omset</div>
        <div class="kpi-v" id="tgt-hdr-target">${compactRp(globalTarget)}</div>
      </div>
      <div class="kpi ${statusClass}" id="tgt-hdr-card">
        <div class="kpi-l">Pencapaian</div>
        <div class="kpi-v" id="tgt-hdr-pct">${globalTarget > 0 ? pct(pctNum) : '—'}</div>
        <div class="kpi-s" id="tgt-hdr-gap" style="color:${gapOmset < 0 ? 'var(--neg)' : 'var(--pos)'}; font-weight:700;">
          GAP: ${globalTarget > 0 ? compactRp(gapOmset) : '—'}
        </div>
      </div>
    </div>
  `;

  let tabContent = '';

  // ================= TAB GLOBAL =================
  if (activeTab === 'global') {
    const lvl = t.global.level;
    let rowsHtml = '';
    const allDivisi = new Set(); const allSubbrand = new Set(); const allProduk = new Set();
    for (const r of allRows) {
      if(r.divisi && r.divisi !== '—') allDivisi.add(r.divisi);
      if(r.subbrand && r.subbrand !== '—') allSubbrand.add(r.subbrand);
      if(r.product && r.product !== '—') allProduk.add(r.product);
    }

    if (lvl === 'all') {
      rowsHtml = `<tr><td class="strong">TOTAL OMSET</td><td><input type="number" class="tgt-global-inp" data-level="all" data-key="ALL" value="${t.global.all || ''}" placeholder="0"></td></tr>`;
    } else if (lvl === 'divisi') {
      rowsHtml = Array.from(allDivisi).sort().map(div => `<tr><td class="strong">${esc(div)}</td><td><input type="number" class="tgt-global-inp" data-level="divisi" data-key="${esc(div)}" value="${t.global.divisi[div] || ''}" placeholder="0"></td></tr>`).join('');
    } else if (lvl === 'subbrand') {
      rowsHtml = Array.from(allSubbrand).sort().map(sub => `<tr><td class="strong">${esc(sub)}</td><td><input type="number" class="tgt-global-inp" data-level="subbrand" data-key="${esc(sub)}" value="${t.global.subbrand[sub] || ''}" placeholder="0"></td></tr>`).join('');
    } else if (lvl === 'produk') {
      rowsHtml = Array.from(allProduk).sort().map(prod => `<tr><td class="strong">${esc(prod)}</td><td><input type="number" class="tgt-global-inp" data-level="produk" data-key="${esc(prod)}" value="${t.global.produk[prod] || ''}" placeholder="0"></td></tr>`).join('');
    }

    tabContent = `
      <div class="card mt12">
        <div class="card-h">
          <div class="card-t">Target Omset Global</div>
          <select id="tgtLevelSel" class="btn sm" style="padding:6px 10px; font-weight:700;">
            <option value="all" ${lvl === 'all' ? 'selected' : ''}>By All</option>
            <option value="divisi" ${lvl === 'divisi' ? 'selected' : ''}>By Divisi</option>
            <option value="subbrand" ${lvl === 'subbrand' ? 'selected' : ''}>By Subbrand</option>
            <option value="produk" ${lvl === 'produk' ? 'selected' : ''}>By Produk</option>
          </select>
        </div>
        <div class="tablewrap" style="max-height: 400px;"><table><thead><tr><th>Nama Item</th><th class="num" style="width:150px;">Target (Rp)</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
      </div>
    `;
  }

  // ================= TAB SALESMAN =================
  if (activeTab === 'salesman') {
    const smLevel = t.salesmanLevel || 'all';
    
    // [FIX ISSUE 2] HANYA TAMPILKAN SALESMAN YANG TERFILTER
    const allSalesman = new Set(filteredRows.map(r => r.salesman).filter(s => s && s !== '—'));
    
    const smActuals = {};
    for (const r of filteredRows) {
      if (r.tt !== 'F') continue;
      const sm = r.salesman;
      const key = smLevel === 'all' ? 'ALL' : (r[smLevel] || '—');
      
      if(!smActuals[sm]) smActuals[sm] = { all: { omset: 0, ec: new Set(), hk: new Set(), inv: new Set(), lines: 0 }, items: {} };
      
      const aAll = smActuals[sm].all;
      aAll.omset += r.amount;
      aAll.ec.add(r.day + '|' + r.outletKey);
      aAll.hk.add(r.day);
      aAll.inv.add(r.invoice);
      aAll.lines++;

      if (smLevel !== 'all') {
        if(!smActuals[sm].items[key]) smActuals[sm].items[key] = { omset: 0 };
        smActuals[sm].items[key].omset += r.amount;
      }
    }

    const prodKpis = [
      { id: 'ec', label: 'EC', format: 'num' },
      { id: 'ipt', label: 'IPT', format: 'num' },
      ...t.manualKpis.map(k => ({ id: k, label: k, format: 'num', isManual: true }))
    ];

    let tableRows = '';
    if (allSalesman.size === 0) {
      tableRows = `<tr><td colspan="6" class="empty" style="text-align:center; padding:20px;">Tidak ada data salesman di filter ini.</td></tr>`;
    } else {
      Array.from(allSalesman).sort().forEach(sm => {
        const smData = smActuals[sm] || { all: { omset: 0, ec: new Set(), hk: new Set(), inv: new Set(), lines: 0 }, items: {} };
        const aAll = smData.all;
        
        let items = new Set();
        if (smLevel !== 'all') {
          // [FIX ISSUE 2] Item juga diambil dari filteredRows
          for (const r of filteredRows) if (r.salesman === sm && r[smLevel] && r[smLevel] !== '—') items.add(r[smLevel]);
          if (t.salesman?.[sm]?.[smLevel]) for (const k in t.salesman[sm][smLevel]) items.add(k);
        }

        const itemCount = smLevel === 'all' ? 1 : items.size;
        const rowCount = itemCount + prodKpis.length;
        
        let isFirstRow = true;
        
        const renderRow = (label, target, capai, format, isManual, levelKey, kpiId) => {
           const pctVal = target > 0 ? (capai / target) * 100 : 0;
           const gapVal = capai - target;
           let pctColor = target > 0 ? (pctVal >= 100 ? 'var(--pos)' : pctVal >= 75 ? 'var(--warn)' : 'var(--neg)') : 'inherit';
           
           let html = `<tr>`;
           if (isFirstRow) {
             html += `<td rowspan="${rowCount}" class="strong" style="vertical-align: middle; border-right: 2px solid #E2E8F0; background: #F8FAFC;">${esc(sm)}</td>`;
             isFirstRow = false;
           }
           html += `<td class="strong">${esc(label)}</td>`;
           html += `<td class="num"><input type="number" class="tgt-inp" data-sm="${esc(sm)}" data-lvl="${levelKey ? smLevel : 'all'}" data-key="${esc(levelKey || 'ALL')}" data-kpi="${esc(kpiId)}" value="${target || ''}" placeholder="0" style="width:90px; padding:6px; text-align:right; border:1px solid #E2E8F0; border-radius:4px;"></td>`;
           
           if (isManual) {
             html += `<td class="num"><input type="number" class="tgt-act-inp" data-sm="${esc(sm)}" data-lvl="${levelKey ? smLevel : 'all'}" data-key="${esc(levelKey || 'ALL')}" data-kpi="${esc(kpiId)}" value="${capai || ''}" placeholder="0" style="width:80px; padding:6px; text-align:right; border:1px solid #E2E8F0; border-radius:4px;"></td>`;
           } else {
             html += `<td class="num">${format === 'rp' ? compactRp(capai) : NF1.format(capai)}</td>`;
           }
           
           html += `<td class="num" style="font-weight:700; color:${pctColor};">${target > 0 ? pct(pctVal) : '—'}</td>`;
           html += `<td class="num" style="color:${gapVal < 0 ? 'var(--neg)' : 'var(--pos)'};">${target > 0 ? (format === 'rp' ? compactRp(gapVal) : NF1.format(gapVal)) : '—'}</td>`;
           html += `</tr>`;
           return html;
        };
        
        if (smLevel === 'all') {
           const tOmset = t.salesman?.[sm]?.all?.['ALL']?.omset || 0;
           tableRows += renderRow('Omset (Total)', tOmset, aAll.omset, 'rp', false, null, 'omset');
           
           prodKpis.forEach(kpi => {
             const tVal = t.salesman?.[sm]?.all?.['ALL']?.[kpi.id] || 0;
             let cVal = 0;
             if (kpi.isManual) cVal = t.salesman?.[sm]?.all?.['ALL']?.[kpi.id + '_actual'] || 0;
             else if (kpi.id === 'ec') cVal = aAll.hk.size > 0 ? aAll.ec.size/aAll.hk.size : 0;
             else if (kpi.id === 'ipt') cVal = aAll.inv.size > 0 ? aAll.lines/aAll.inv.size : 0;
             
             tableRows += renderRow(kpi.label, tVal, cVal, kpi.format, kpi.isManual, null, kpi.id);
           });
        } else {
           if (items.size > 0) {
              Array.from(items).sort().forEach(item => {
                 const tOmset = t.salesman?.[sm]?.[smLevel]?.[item]?.omset || 0;
                 const cOmset = smData.items[item]?.omset || 0;
                 tableRows += renderRow(`Omset - ${item}`, tOmset, cOmset, 'rp', false, item, 'omset');
              });
           }
           
           prodKpis.forEach(kpi => {
             const tVal = t.salesman?.[sm]?.all?.['ALL']?.[kpi.id] || 0;
             let cVal = 0;
             if (kpi.isManual) cVal = t.salesman?.[sm]?.all?.['ALL']?.[kpi.id + '_actual'] || 0;
             else if (kpi.id === 'ec') cVal = aAll.hk.size > 0 ? aAll.ec.size/aAll.hk.size : 0;
             else if (kpi.id === 'ipt') cVal = aAll.inv.size > 0 ? aAll.lines/aAll.inv.size : 0;
             
             tableRows += renderRow(kpi.label + ' (Produktivitas)', tVal, cVal, kpi.format, kpi.isManual, null, kpi.id);
           });
        }
      });
    }

    tabContent = `
      <div class="row-flex mb12" style="justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div class="tiny" style="font-weight:700;">Matriks Pencapaian</div>
        <div class="row-flex" style="gap:8px;">
          <select id="tgtSmLevelSel" class="btn sm" style="padding:6px 10px; font-weight:700;">
            <option value="all" ${smLevel === 'all' ? 'selected' : ''}>By All (Total)</option>
            <option value="divisi" ${smLevel === 'divisi' ? 'selected' : ''}>By Divisi (Omset)</option>
            <option value="subbrand" ${smLevel === 'subbrand' ? 'selected' : ''}>By Subbrand (Omset)</option>
            <option value="produk" ${smLevel === 'produk' ? 'selected' : ''}>By Produk (Omset)</option>
          </select>
          <button class="btn sm primary" id="btnAddKpi" style="padding:6px 12px;">+ KPI Baru</button>
        </div>
      </div>
      <div class="card" style="padding:0; overflow:hidden;">
        <div class="tablewrap" style="max-height: 65vh;">
          <table style="min-width: 800px; width:100%; border-collapse:collapse;">
            <thead style="position:sticky; top:0; z-index:10; background:#fff; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
              <tr>
                <th>Salesman</th>
                <th>Item / KPI</th>
                <th class="num">Target</th>
                <th class="num">Capai</th>
                <th class="num">%</th>
                <th class="num">GAP</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ================= TAB MANUAL =================
  if (activeTab === 'manual') {
    tabContent = `
      <div class="card mt12">
        <div class="card-h"><div class="card-t">Daftar KPI Manual</div></div>
        <div class="mt12">
          ${t.manualKpis.length === 0 ? '<div class="empty">Belum ada KPI manual.</div>' : ''}
          ${t.manualKpis.map((kpi, idx) => `
            <div class="row-flex mb12" style="align-items:center; gap:10px; border-bottom:1px solid #F1F5F9; padding-bottom:12px;">
              <div class="strong" style="flex:1; font-size:15px;">${esc(kpi)}</div>
              <button class="btn sm neg" data-del-kpi="${idx}" style="color:var(--neg); border-color:var(--neg-soft);">Hapus</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  patchHTML('#tgt-content', `
    <div class="row-flex mb12" style="justify-content:space-between; align-items:center;">
      <div class="strong">Bulan Target:</div>
      <select id="tgtMonthSel" class="btn sm" style="padding:6px 10px; font-weight:700;">
        ${months.map(m => `<option value="${m}"${m === activeMonth ? ' selected' : ''}>${m}</option>`).join('')}
      </select>
    </div>
    ${tabNav}
    ${kpiHeader}
    ${tabContent}
  `);
}

registerView('target', {
  label: 'Target', title: 'Target', sub: 'Matriks Target & Perbandingan', shell, update,
  mount(){
    // ============ AUTO-SAVE + LIVE HEADER UPDATE ============
    document.addEventListener('input', e => {
      // Ambil bulan langsung dari dropdown untuk mencegah mismatch state
      const monthEl = document.getElementById('tgtMonthSel');
      const currentMonth = monthEl ? monthEl.value : store.state.targetMonth;
      const t = getTargets(currentMonth);

      // 1. Auto-save Target GLOBAL
      if (e.target.matches('.tgt-global-inp')) {
        const lvl = t.global.level;
        if (lvl === 'all') {
          t.global.all = +e.target.value || 0;
        } else {
          const inputs = document.querySelectorAll('.tgt-global-inp');
          inputs.forEach(inp => { t.global[lvl][inp.dataset.key] = +inp.value || 0; });
          let totalAll = 0;
          for (const val of Object.values(t.global[lvl])) totalAll += val;
          t.global.all = totalAll;
        }
        try { localStorage.setItem('m245.targets', JSON.stringify(store.state.targets)); } catch(e2){}
        refreshHeaderDom(store.state, t); 
      }

      // 2. Auto-save Target SALESMAN + Aktual Manual
      if (e.target.matches('.tgt-inp') || e.target.matches('.tgt-act-inp')) {
        const inp = e.target;
        const sm = inp.dataset.sm;
        const l = inp.dataset.lvl;
        const key = inp.dataset.key || 'ALL';
        const kpi = inp.dataset.kpi;
        const val = +inp.value || 0;
        
        if (!t.salesman[sm]) t.salesman[sm] = {};
        if (!t.salesman[sm][l]) t.salesman[sm][l] = {};
        if (!t.salesman[sm][l][key]) t.salesman[sm][l][key] = {};
        
        if (inp.classList.contains('tgt-act-inp')) {
          t.salesman[sm][l][key][kpi + '_actual'] = val;
        } else {
          t.salesman[sm][l][key][kpi] = val;
        }
        
        // Sinkronisasi Omset: Subrand/Divisi/Produk → All
        if (kpi === 'omset' && l !== 'all') {
          let totalOmset = 0;
          for (const k in t.salesman[sm][l]) {
            totalOmset += (t.salesman[sm][l][k]['omset'] || 0);
          }
          if (!t.salesman[sm].all) t.salesman[sm].all = {};
          if (!t.salesman[sm].all.ALL) t.salesman[sm].all.ALL = {};
          t.salesman[sm].all.ALL.omset = totalOmset;
        }
        
        try { localStorage.setItem('m245.targets', JSON.stringify(store.state.targets)); } catch(e2){}
        refreshHeaderDom(store.state, t); 
      }
    });

    // ============ RE-RENDER (untuk update %/GAP di tabel) ============
    document.addEventListener('change', e => {
      if (e.target.matches('.tgt-global-inp') || e.target.matches('.tgt-inp') || e.target.matches('.tgt-act-inp')) {
        store.emit();
      }
      
      if(e.target.id === 'tgtMonthSel') store.set({ targetMonth: e.target.value });
      if(e.target.id === 'tgtLevelSel') {
        const t = getTargets(store.state.targetMonth);
        t.global.level = e.target.value;
        store.emit();
      }
      if(e.target.id === 'tgtSmLevelSel') {
        const t = getTargets(store.state.targetMonth);
        t.salesmanLevel = e.target.value;
        store.emit();
      }
    });

    document.addEventListener('click', e => {
      const tabBtn = e.target.closest('[data-ttab]');
      if(tabBtn) store.set({ ui: { ...store.state.ui, targetTab: tabBtn.dataset.ttab } });

      if(e.target.id === 'btnAddKpi') {
        const name = prompt("Nama KPI baru (Cth: HHT, VIR):");
        if(name && name.trim()) {
          const t = getTargets(store.state.targetMonth);
          const kpiName = name.trim().toUpperCase();
          if(!t.manualKpis.includes(kpiName)) {
            t.manualKpis.push(kpiName);
            try { localStorage.setItem('m245.targets', JSON.stringify(store.state.targets)); } catch(e2){}
            store.emit();
          }
        }
      }

      if(e.target.hasAttribute('data-del-kpi')) {
        const t = getTargets(store.state.targetMonth);
        const idx = +e.target.dataset.delKpi;
        const deleted = t.manualKpis.splice(idx, 1);
        
        for(const sm in t.salesman) {
           for(const lvl in t.salesman[sm]) {
              for(const key in t.salesman[sm][lvl]) {
                 delete t.salesman[sm][lvl][key][deleted[0]];
                 delete t.salesman[sm][lvl][key][deleted[0] + '_actual'];
              }
           }
        }
        try { localStorage.setItem('m245.targets', JSON.stringify(store.state.targets)); } catch(e2){}
        store.emit();
      }
    });
  }
});