// js/views/insentif.js
import { esc, compactRp, pct, NF1 } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';
import { DS } from '../core/datasource.js';
import { renderInsentifTables } from '../ui/insentif.js';

function formatShort(val, format) {
  if (val == null || isNaN(val)) return '0';
  if (val === 0) return '0';
  if (format === 'rp') {
    const a = Math.abs(val);
    if (a >= 1e9) return (val / 1e9).toFixed(1).replace('.0', '') + ' M';
    if (a >= 1e6) return (val / 1e6).toFixed(1).replace('.0', '') + ' Jt';
    if (a >= 1e3) return (val / 1e3).toFixed(0) + ' Rb';
    return val.toString();
  }
  return NF1.format(val);
}

function calculateInsentif(state) {
  const insData = state.settings?.insentif || { _default: { kpis: [], tiers: {} } };
  const filteredRows = DS.Data.rows(state);
  const mode = state.ui.insMode || 'salesman';
  const allSalesman = Array.from(new Set(filteredRows.filter(r => r.tt === 'F').map(r => r.salesman))).sort();
  const allKpis = DS.getAllKpis(state) || [];

  const configuredKpiIds = new Set();
  Object.values(insData).forEach(scheme => (scheme.kpis || []).forEach(k => configuredKpiIds.add(k.id)));
  
  const activeKpis = Array.from(configuredKpiIds).map(id => allKpis.find(x => x.id === id)).filter(Boolean);

  let totalIncentive = 0, qualifiedCount = 0, maxPossibleIncentive = 0;
  const defaultTiers = insData['_default']?.tiers || {};
  
  activeKpis.forEach(k => {
    const kTiers = defaultTiers[k.id] || [];
    if (kTiers.length > 0) maxPossibleIncentive += Math.max(...kTiers.map(t => t.amount));
  });

  const processEval = (rows, smName, isTotal) => {
    const kpiActuals = {}, kpiTargets = {}, kpiEarned = {};
    let rowIncentive = 0;

    const scheme = (!isTotal && insData[smName]) 
      ? insData[smName] 
      : (insData['_default'] || { kpis: [], tiers: {} });
    const activeTiers = scheme.tiers || {};

    (scheme.kpis || []).forEach(sk => {
      const k = allKpis.find(x => x.id === sk.id) || sk;
      if (!k) return;

      let act = 0, tgt = 0;

      // ⚡ Mengambil angka dari Target dan Aktual
      if (isTotal) {
        act = (k.type === 'auto' || k.type === 'subrand' || k.type === 'divisi')
          ? DS.calcKpi(rows, k.id, state) 
          : allSalesman.reduce((sum, sm) => sum + DS.Data.manualKpi(sm, k.id, state), 0);
        tgt = allSalesman.reduce((sum, sm) => sum + DS.getTarget(k.id, sm, state), 0);
        if (tgt === 0 && k.id === 'omset') tgt = DS.Data.targets(state).global?.all || 0;
      } else {
        act = (k.type === 'auto' || k.type === 'subrand' || k.type === 'divisi')
          ? DS.calcKpi(rows, k.id, state)
          : DS.Data.manualKpi(smName, k.id, state);
        tgt = DS.getTarget(k.id, smName, state);
      }

      kpiActuals[k.id] = act;
      kpiTargets[k.id] = tgt;

      const pctVal = tgt > 0 ? (act / tgt) * 100 : 0;
      const kTiers = activeTiers[k.id] || [];
      let earned = 0;

      if (k.hasTarget && tgt === 0) {
        kpiEarned[k.id] = 0;
        return;
      }

      const metric = k.hasTarget ? pctVal : act;
      kTiers.forEach(tier => {
        if (metric >= tier.min && metric <= tier.max) earned = tier.amount;
      });

      kpiEarned[k.id] = earned;
      rowIncentive += earned;
    });

    return {
      name: smName, actuals: kpiActuals, targets: kpiTargets, earned: kpiEarned, insentif: rowIncentive,
      scheme: scheme
    };
  };

  let results;
  if (mode === 'total') {
    const totalRes = processEval(filteredRows, 'TOTAL TIM', true);
    results = [totalRes];
    totalIncentive = totalRes.insentif;
    qualifiedCount = totalRes.insentif > 0 ? 1 : 0;
  } else {
    results = allSalesman.map(sm => processEval(filteredRows.filter(r => r.salesman === sm), sm, false));
    totalIncentive = results.reduce((s, r) => s + r.insentif, 0);
    qualifiedCount = results.filter(r => r.insentif > 0).length;
  }

  return { results, totalIncentive, maxPossibleIncentive, qualifiedCount, activeKpis, mode, insData };
}

function shell() {
  return `
    <div class="grid kpis mb12" id="ins-kpis"></div>
    
    <div class="card mb12" style="display:flex; align-items:center; justify-content:space-between; padding:12px; background:#F8FAFC; border:1px solid #E2E8F0;">
      <div style="font-weight:700; color:#334155;">Mode Evaluasi:</div>
      <div class="seg" id="insModeSeg" style="display:flex; background:#E2E8F0; padding:4px; border-radius:6px;">
        <button data-ins-mode="salesman" class="btn sm ${ (store.state.ui.insMode || 'salesman') === 'salesman' ? 'primary' : ''}" style="border:none; font-weight:700;">Per Salesman</button>
        <button data-ins-mode="total" class="btn sm ${ store.state.ui.insMode === 'total' ? 'primary' : ''}" style="border:none; font-weight:700;">Total Tim</button>
      </div>
    </div>

    <div id="ins-table"></div>
  `;
}

function update(container, state) {
  patchHTML('#ins-kpis', '<div class="kpi"><div class="kpi-l">Memuat...</div><div class="kpi-v">...</div></div>');

  try {
    const { results, totalIncentive, maxPossibleIncentive, qualifiedCount, mode } = calculateInsentif(state);
    const activeMonth = DS.Data.month(state);
    const filteredRows = DS.Data.rows(state);
    
    const modeSeg = document.getElementById('insModeSeg');
    if (modeSeg) {
      modeSeg.querySelectorAll('button').forEach(btn => {
        btn.classList.toggle('primary', btn.dataset.insMode === mode);
      });
    }

    const pctOnTrack = maxPossibleIncentive > 0 ? (totalIncentive / maxPossibleIncentive) * 100 : 0;

    const kpiHtml = `
      <div class="kpi purple">
        <div class="kpi-l">Total Insentif</div>
        <div class="kpi-v">${compactRp(totalIncentive)}</div>
        <div class="kpi-s">Bulan: ${esc(activeMonth || '—')}</div>
      </div>
      <div class="kpi pos">
        <div class="kpi-l">Status "On Track"</div>
        <div class="kpi-v">${pct(pctOnTrack)}</div>
        <div class="kpi-s">Dari maks ${compactRp(maxPossibleIncentive)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-l">Dapat Bonus</div>
        <div class="kpi-v">${qualifiedCount}</div>
        <div class="kpi-s">Dari ${results.length} Salesman</div>
      </div>
    `;

    const createRow = (label, target, capai, earned, format, kpiId, scheme) => {
       const pctVal = target > 0 ? (capai / target) * 100 : 0;
       
       // ⚡ TAMPILKAN ANGKA 0 JIKA TARGET MEMANG 0
       const targetStr = target === 0 ? '0' : formatShort(target, format);
       const capaiStr = capai === 0 ? '0' : formatShort(capai, format);
       const pctStr = target > 0 ? Math.round(pctVal) + '%' : '—';
       
       let kete = '';
       let pctColor = '#64748B'; 

       if (target > 0) {
         pctColor = pctVal >= 100 ? '#16A34A' : pctVal >= 85 ? '#D97706' : '#DC2626';
         
         if (pctVal >= 100) {
           kete = `<span style="color:#16A34A">✓ Tercapai</span>`;
         } else {
           const gap = target - capai;
           const kTiers = scheme?.tiers?.[kpiId] || [];
           const sortedTiers = kTiers.slice().sort((a,b) => a.min - b.min);
           const nextTier = sortedTiers.find(t => t.min > pctVal);

           if (nextTier) {
              kete = `Kejar <b>${formatShort(gap, format)}</b> (Bonus ${compactRp(nextTier.amount).replace('Rp ','')})`;
           } else {
              kete = `Kurang <b>${formatShort(gap, format)}</b>`;
           }
         }
       } else {
         kete = `<span style="color:#DC2626">Target blm diset</span>`;
       }

       return { label, targetStr, capaiStr, earned, format, pctStr, kete, pctColor };
    };

    // ⚡ MENYUSUN DATA: TOTAL DI BAWAH
    const uiSalesmanData = results.map(res => {
      const smName = res.name === 'TOTAL TIM' ? 'GLOBAL' : res.name;
      const rows = [];
      let totalRow = null;
      const scheme = res.scheme || { kpis: [], tiers: {} };

      (scheme.kpis || []).forEach(sk => {
        const kpiId = sk.id;

        if (kpiId === 'omset') {
           // Simpan baris TOTAL untuk ditaruh di akhir
           totalRow = createRow('TOTAL OMSET', res.targets[kpiId] || 0, res.actuals[kpiId] || 0, res.earned[kpiId] || 0, 'rp', kpiId, scheme);
        } 
        else if (kpiId.startsWith('divisi_omset_')) {
           const divName = kpiId.replace('divisi_omset_', '');
           rows.push(createRow(divName, res.targets[kpiId] || 0, res.actuals[kpiId] || 0, res.earned[kpiId] || 0, 'rp', kpiId, scheme));
        }
        else {
           let label = sk.label || kpiId.toUpperCase();
           if (kpiId === 'oa') label = 'OA';
           if (kpiId === 'ipt') label = 'IPT';
           
           const allKpis = DS.getAllKpis(store.state) || [];
           const master = allKpis.find(x => x.id === kpiId) || { format: 'num' };

           rows.push(createRow(label, res.targets[kpiId] || 0, res.actuals[kpiId] || 0, res.earned[kpiId] || 0, master.format, kpiId, scheme));
        }
      });

      // Masukkan TOTAL di urutan paling bawah
      if (totalRow) rows.push(totalRow);

      return { name: smName, totalInsentif: res.insentif, rows };
    });

    patchHTML('#ins-kpis', kpiHtml);
    patchHTML('#ins-table', renderInsentifTables(uiSalesmanData));

  } catch (err) {
    console.error('Insentif Error:', err);
    patchHTML('#ins-kpis', '');
    patchHTML('#ins-table', `<div style="padding:20px; background:#FEF2F2; border:1px solid #FECACA; color:#991B1B; font-family:monospace; font-size:12px;">
      <b>Error:</b> ${esc(err.message)}<br>
      <small>${esc(err.stack || '').slice(0, 300)}</small>
    </div>`);
  }
}

registerView('insentif', {
  label: 'Insentif',
  title: 'Monitoring Insentif',
  sub: 'Perhitungan bonus otomatis berdasarkan KPI',
  shell,
  update,
  mount() {
    document.addEventListener('click', (e) => {
      const modeBtn = e.target.closest('[data-ins-mode]');
      if (modeBtn) store.set({ ui: { ...store.state.ui, insMode: modeBtn.dataset.insMode } });
    });
  }
});