// js/views/outlet.js
import { esc, compactRp, fmtKtn, pct } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered, selectAgg, selectNotYet } from '../core/selectors.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';
import { renderOutletTable } from '../ui/outlet.js';

function shell(){
  return `<div class="grid kpis" id="out-kpis"></div><div id="out-content"></div>`;
}

function update(container, state){
  try {
    let a, notYet, master;
    try {
      a = selectAgg(state) || { oa: 0, omset: 0, masterCount: 0 };
      notYet = selectNotYet(state) || [];
      master = a.masterCount || 0;
    } catch (e) {
      a = { oa: 0, omset: 0, masterCount: 0 };
      notYet = [];
    }

    // KPI Atas
    patchHTML('#out-kpis', `
      <div class="kpi purple"><div class="kpi-l">Master Outlet (DMP)</div><div class="kpi-v">${master}</div>
        <div class="kpi-s">mengikuti filter aktif</div></div>
      <div class="kpi purple"><div class="kpi-l">Outlet Aktif (OA)</div><div class="kpi-v">${a.oa || 0}</div>
        <div class="kpi-s">${master ? 'Coverage ' + pct(((a.oa || 0) / master) * 100) : '—'}</div></div>
      <div class="kpi ${notYet.length ? 'neg' : 'pos'}"><div class="kpi-l">Belum Transaksi</div><div class="kpi-v">${notYet.length}</div></div>
      <div class="kpi"><div class="kpi-l">Avg Omset / OA</div><div class="kpi-v">${compactRp(a.oa ? a.omset / a.oa : 0)}</div></div>
    `);

    const tab = state.ui.outletTab || 'aktif';

    const tabsHtml = `
      <div class="card-h" style="margin-bottom: 12px; padding: 0 4px;">
        <div><div class="card-t">Daftar Outlet</div></div>
        <div class="right"><div class="seg" id="outletTabSeg">
          <button data-ot="aktif" class="${tab === 'aktif' ? 'on' : ''}">Aktif (OA)</button>
          <button data-ot="belum" class="${tab === 'belum' ? 'on' : ''}">Belum (${notYet.length})</button>
          <button data-ot="semua" class="${tab === 'semua' ? 'on' : ''}">Semua</button>
        </div></div>
      </div>
    `;

    const filteredTx = selectFiltered(state).filter(r => r && r.tt === 'F');
    const rawTx = (state.rows || []).filter(r => r && r.tt === 'F' && r.day && r.day.length >= 10);

    if (rawTx.length === 0 && notYet.length === 0) {
      patchHTML('#out-content', tabsHtml + renderOutletTable([]));
      return;
    }

    // Tanggal terakhir
    let maxDayStr = '1900-01-01';
    for (let i=0; i<rawTx.length; i++) {
      const dStr = rawTx[i].day.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) { if (dStr > maxDayStr) maxDayStr = dStr; }
    }
    
    const d = new Date(maxDayStr + 'T00:00:00Z');
    const msInDay = 24 * 60 * 60 * 1000;
    let limit5WStr = '9999-12-31', limit13WStr = '9999-12-31', lastMonthStr = '9999-12';

    // Hitung Jumlah Minggu dalam sebulan (dari HK)
    const hk = state.settings?.hk?.value || 24;
    const totalMinggu = Math.round(hk / 6);

    if (!isNaN(d.getTime())) {
        limit5WStr = new Date(d.getTime() - (35 * msInDay)).toISOString().slice(0, 10);
        limit13WStr = new Date(d.getTime() - (91 * msInDay)).toISOString().slice(0, 10);
        
        const lmDate = new Date(d);
        lmDate.setUTCMonth(lmDate.getUTCMonth() - 1);
        lastMonthStr = lmDate.toISOString().slice(0, 7);
    }

    const outMap = {};
    const capaiMap = {};
    const notYetKeys = new Set();
    const validKeys = new Set();

    // 1. Outlet Aktif (Filtered)
    for (const r of filteredTx) {
        const key = String(r.outletNo || r.outlet || '').trim();
        if (!key) continue;
        validKeys.add(key);
        if (!outMap[key]) outMap[key] = { name: r.outlet || 'Tanpa Nama', oms5w: 0, ctn5w: 0, oms13w: 0, ctn13w: 0, omsLM: 0, ctnLM: 0 };
        if (!capaiMap[key]) capaiMap[key] = { oms: 0, ctn: 0 };
        capaiMap[key].oms += (Number(r.amount) || 0);
        capaiMap[key].ctn += (Number(r.netCarton || r.qtyCarton) || 0);
    }

    // 2. Outlet Belum
    for (const o of notYet) {
        const key = String(o.outletNo || o.outlet || '').trim();
        if (!key) continue;
        validKeys.add(key);
        notYetKeys.add(key);
        if (!outMap[key]) outMap[key] = { name: o.outlet || 'Tanpa Nama', oms5w: 0, ctn5w: 0, oms13w: 0, ctn13w: 0, omsLM: 0, ctnLM: 0 };
    }

    // 3. History
    for (const r of rawTx) {
      const key = String(r.outletNo || r.outlet || '').trim();
      if (!key || !validKeys.has(key)) continue;
      
      const ctnVal = (Number(r.netCarton || r.qtyCarton) || 0);
      const amt = (Number(r.amount) || 0);
      const dayStr = r.day.slice(0, 10);

      if (dayStr >= limit5WStr) { outMap[key].oms5w += amt; outMap[key].ctn5w += ctnVal; }
      if (dayStr >= limit13WStr) { outMap[key].oms13w += amt; outMap[key].ctn13w += ctnVal; }
      if (dayStr.startsWith(lastMonthStr)) { outMap[key].omsLM += amt; outMap[key].ctnLM += ctnVal; }
    }

    // 4. Kalkulasi Final
    const allUiData = Object.keys(outMap).map(key => {
      const o = outMap[key];
      const cap = capaiMap[key] || { oms: 0, ctn: 0 };

      const avgLM_oms = o.omsLM / totalMinggu;
      const avgLM_ctn = o.ctnLM / totalMinggu;

      const avg5w_oms = o.oms5w / 5;
      const avg13w_oms = o.oms13w / 13;
      const avg5w_ctn = o.ctn5w / 5;
      const avg13w_ctn = o.ctn13w / 13;

      // Target Mingguan (Maksimal dari 5W, 13W, LM)
      const tgt_mingguan_oms = Math.max(avg5w_oms, avg13w_oms, avgLM_oms);
      const tgt_mingguan_ctn = Math.max(avg5w_ctn, avg13w_ctn, avgLM_ctn);

      // ⚡ TARGET BULANAN (TGT Mingguan x Jumlah Minggu)
      const tgt_bulanan_oms = tgt_mingguan_oms * totalMinggu;
      const tgt_bulanan_ctn = tgt_mingguan_ctn * totalMinggu;

      return {
        key,
        name: o.name,
        avg5w_oms, avg13w_oms, avgLM_oms, 
        tgt_oms: tgt_bulanan_oms, // ⚡ TGT di tabel sekarang jadi TGT Bulanan
        capai_oms: cap.oms, 
        gap_oms: cap.oms - tgt_bulanan_oms, // ⚡ GAP = Capai - Target Bulanan
        
        avg5w_ctn, avg13w_ctn, avgLM_ctn, 
        tgt_ctn: tgt_bulanan_ctn, 
        capai_ctn: cap.ctn, 
        gap_ctn: cap.ctn - tgt_bulanan_ctn,
        
        isNotYet: notYetKeys.has(key)
      };
    });

    // 5. Filter Tab
    let displayData = [];
    if (tab === 'belum') {
      displayData = allUiData.filter(x => x.isNotYet);
    } else if (tab === 'aktif') {
      displayData = allUiData.filter(x => !x.isNotYet);
    } else {
      displayData = allUiData;
    }

    displayData.sort((a,b) => b.capai_oms - a.capai_oms);

    patchHTML('#out-content', tabsHtml + renderOutletTable(displayData));

  } catch (err) {
    console.error('Outlet Error:', err);
    patchHTML('#out-content', `<div style="padding:20px; background:#FEF2F2; color:#991B1B; margin:0 4px; border-radius:8px;">Gagal memuat: ${esc(err.message)}</div>`);
  }
}

registerView('outlet', {
  label: 'Outlet', title: 'Monitoring Outlet', sub: 'Aktif, belum transaksi, semua master', shell, update,
  mount(){
    document.addEventListener('click', e => {
      const t = e.target.closest('#outletTabSeg button');
      if(t) store.set({ ui: { ...store.state.ui, outletTab: t.dataset.ot } });
    });
  }
});