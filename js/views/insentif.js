import { esc, compactRp, pct, NF1 } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { store } from '../core/store.js';
import { toast, openModal } from '../ui/feedback.js';
import { registerView } from './registry.js';
import { sortableTable } from '../ui/table.js';
import { DS } from '../core/datasource.js';

// ⚡ PEMBERSIH MEMORI (versi baru = user harus setup ulang)
try {
  if (localStorage.getItem('m245.insentifVersion') !== 'v11') {
    localStorage.removeItem('m245.insentifKpis');
    localStorage.removeItem('m245.insentifTiers');
    localStorage.setItem('m245.insentifVersion', 'v11');
  }
} catch(e) {}

/* ── Helper ── */
function fmtKpi(val, kpi) {
  if (val == null || isNaN(val)) val = 0;
  if (kpi.format === 'rp') return compactRp(val);
  if (kpi.format === 'pct') return pct(val);
  return NF1.format(val);
}

function getActiveKpiIds() {
  try {
    const saved = localStorage.getItem('m245.insentifKpis');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(p => typeof p === 'string' ? p : p.id).filter(Boolean);
      }
    }
  } catch(e){}
  return ['omset'];
}

function saveActiveKpiIds(ids) {
  localStorage.setItem('m245.insentifKpis', JSON.stringify(ids));
}

function getTiers() {
  try {
    const saved = localStorage.getItem('m245.insentifTiers');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.omset && Array.isArray(parsed.omset)) return { '_default': parsed };
      if (parsed && !parsed._default) return { '_default': parsed };
      return parsed;
    }
  } catch(e){}
  return { 
    '_default': { omset: [{ min: 90, max: 99.99, amount: 100000 }, { min: 100, max: 9999, amount: 500000 }] } 
  };
}
function saveTiers(tiers) { localStorage.setItem('m245.insentifTiers', JSON.stringify(tiers)); }

/* ── UI SHELL ── */
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

    <div class="card mb12">
      <div class="card-h">
        <div><div class="card-t">Skema Insentif (Tiering)</div>
        <div class="card-s">Atur nominal insentif per KPI.</div></div>
        <div class="right" style="display:flex; gap:6px;">
          <button class="btn sm" id="btnManageKpi">📊 Pilih KPI</button>
          <button class="btn sm primary" id="btnManageTiers">⚙️ Atur Tier</button>
        </div>
      </div>
      <div id="ins-tiers-preview"></div>
    </div>

    <div class="card" id="ins-table-card">
      <div class="card-h">
        <div><div class="card-t">Monitoring & Gap Analysis</div></div>
        <div class="right">
          <button class="btn sm" data-quick-export="#ins-table-card" data-title="Laporan Insentif" data-filename="insentif_salesman">📥 Ekspor Laporan</button>
        </div>
      </div>
      <div id="ins-table"></div>
    </div>
  `;
}

/* ── KALKULASI ── */
function calculateInsentif(state) {
  const filteredRows = DS.Data.rows(state);
  const activeIds = getActiveKpiIds();
  const allKpis = DS.getAllKpis(state);
  const activeKpis = activeIds.map(id => allKpis.find(k => k.id === id)).filter(Boolean);
  
  if (activeKpis.length === 0) {
    activeKpis.push(allKpis.find(k => k.id === 'omset'));
  }

  const globalTiers = getTiers();
  const mode = state.ui.insMode || 'salesman';
  
  const allSalesman = Array.from(new Set(filteredRows.filter(r => r.tt === 'F').map(r => r.salesman))).sort();

  let totalIncentive = 0, qualifiedCount = 0, maxPossibleIncentive = 0;
  const defaultTiers = globalTiers['_default'] || {};
  activeKpis.forEach(k => {
    const kTiers = defaultTiers[k.id] || [];
    if (kTiers.length > 0) maxPossibleIncentive += Math.max(...kTiers.map(t => t.amount));
  });

  const processEval = (rows, smName, isTotal) => {
    const kpiActuals = {}, kpiTargets = {}, kpiEarned = {};
    let rowIncentive = 0;
    const nextGaps = [];

    const activeTiers = (!isTotal && globalTiers[smName]) 
      ? { ...defaultTiers, ...globalTiers[smName] } 
      : defaultTiers;

    activeKpis.forEach(k => {
      let act = 0, tgt = 0;

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
        nextGaps.push(`Target ${k.label} belum diset`);
        kpiEarned[k.id] = 0;
        return;
      }

      const metric = k.hasTarget ? pctVal : act;
      kTiers.forEach(tier => {
        if (metric >= tier.min && metric <= tier.max) earned = tier.amount;
      });

      kpiEarned[k.id] = earned;
      rowIncentive += earned;

      if (earned === 0 || (k.hasTarget && pctVal < Math.max(...kTiers.map(t=>t.max), 0))) {
        const higher = kTiers.filter(t => t.min > metric).sort((a,b) => a.min - b.min);
        if (higher.length > 0) {
          const nxt = higher[0];
          if (k.hasTarget) {
            const gap = (tgt * (nxt.min / 100)) - act;
            nextGaps.push(`Kurang ${fmtKpi(gap, k)} ${k.label} (utk dpt ${compactRp(nxt.amount)})`);
          } else {
            const gap = nxt.min - act;
            nextGaps.push(`Kurang ${fmtKpi(gap, k)} ${k.label} (utk dpt ${compactRp(nxt.amount)})`);
          }
        }
      }
    });

    return {
      name: smName, actuals: kpiActuals, targets: kpiTargets, earned: kpiEarned, insentif: rowIncentive,
      customScheme: (!isTotal && globalTiers[smName]) ? 'Custom' : 'Default',
      nextGapLabel: nextGaps.length > 0 ? nextGaps[0] : (rowIncentive > 0 ? '🎉 Maksimal!' : 'Belum ada tier')
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

  return { results, totalIncentive, maxPossibleIncentive, qualifiedCount, activeKpis, mode };
}

/* ── RENDER ── */
function update(container, state) {
  patchHTML('#ins-kpis', '<div class="kpi"><div class="kpi-l">Memuat...</div><div class="kpi-v">...</div></div>');

  try {
    const { results, totalIncentive, maxPossibleIncentive, qualifiedCount, activeKpis, mode } = calculateInsentif(state);
    const activeMonth = DS.Data.month(state);
    
    const modeSeg = document.getElementById('insModeSeg');
    if (modeSeg) {
      modeSeg.querySelectorAll('button').forEach(btn => {
        btn.classList.toggle('primary', btn.dataset.insMode === mode);
      });
    }

    const pctOnTrack = maxPossibleIncentive > 0 ? (totalIncentive / maxPossibleIncentive) * 100 : 0;

    const kpiHtml = `
      <div class="kpi purple">
        <div class="kpi-l">Total Insentif Didapat</div>
        <div class="kpi-v">${compactRp(totalIncentive)}</div>
        <div class="kpi-s">Bulan: ${esc(activeMonth || '—')} · ${mode === 'total' ? 'Total Tim' : 'Per Salesman'}</div>
      </div>
      <div class="kpi pos">
        <div class="kpi-l">Status "On Track"</div>
        <div class="kpi-v">${pct(pctOnTrack)}</div>
        <div class="kpi-s">Dari maksimal ${compactRp(maxPossibleIncentive)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-l">${mode === 'total' ? 'Status Tim' : 'Salesman Dapat Bonus'}</div>
        <div class="kpi-v">${qualifiedCount}</div>
        <div class="kpi-s">${mode === 'total' ? (qualifiedCount > 0 ? 'Target Tim Tercapai' : 'Belum Capai') : `Dari ${results.length} Salesman`}</div>
      </div>
    `;

    const globalTiers = getTiers();
    const defaultTiers = globalTiers['_default'] || {};
    const tiersHtml = `
      <div style="padding:12px; display:flex; flex-wrap:wrap; gap:12px;">
        <div style="width:100%; font-size:11px; color:#64748B; margin-bottom:4px;">Menampilkan <b>Skema Default</b>. Salesman dengan skema khusus punya aturan berbeda.</div>
        ${activeKpis.map(k => {
          const kTiers = defaultTiers[k.id] || [];
          if (kTiers.length === 0) return '';
          const borderColor = k.type === 'divisi' ? '#A7F3D0' : (k.type === 'subrand' ? '#BFDBFE' : '#E2E8F0');
          const icon = k.type === 'divisi' ? '🏢' : (k.type === 'subrand' ? '📦' : '');
          return `
            <div style="background:#fff; border:1px solid ${borderColor}; border-radius:8px; padding:12px; font-size:12px; min-width:250px; flex:1;">
              <div style="font-weight:800; color:#1D4ED8; margin-bottom:8px; font-size:14px; border-bottom:1px solid #E2E8F0; padding-bottom:4px;">${icon} ${esc(k.label)}</div>
              <ul style="margin:0; padding-left:16px; color:#334155; line-height:1.6;">
                ${kTiers.map(t => `<li>Jika <b>${t.min}${k.hasTarget ? '%' : ''} - ${t.max >= 9999 ? '∞' : t.max + (k.hasTarget ? '%' : '')}</b> ➔ Dapat <b style="color:#16A34A;">${compactRp(t.amount)}</b></li>`).join('')}
              </ul>
            </div>
          `;
        }).join('')}
      </div>
    `;

    const columns = [
      { key: 'name', label: mode === 'total' ? 'Nama Tim' : 'Salesman', render: r => `
          <div style="font-weight:700;">${esc(r.name)}</div>
          ${r.customScheme === 'Custom' ? '<span style="font-size:9px; background:#FEF08A; color:#854D0E; padding:1px 4px; border-radius:4px; font-weight:800; border:1px solid #FDE047;">SKEMA KHUSUS</span>' : ''}
        ` 
      }
    ];

    activeKpis.forEach(k => {
      columns.push({
        key: `kpi_${k.id}`,
        label: k.label,
        align: 'num',
        render: r => {
          const act = r.actuals[k.id] || 0;
          const tgt = r.targets[k.id] || 0;
          const earned = r.earned[k.id] || 0;
          const pctVal = tgt > 0 ? (act / tgt) * 100 : 0;
          
          let mainVal = fmtKpi(act, k);
          if (k.hasTarget && tgt > 0) mainVal += ` (${pct(pctVal)})`;
          
          const color = k.hasTarget 
            ? (pctVal >= 100 ? 'var(--pos)' : (pctVal > 0 ? 'var(--warn)' : 'inherit'))
            : (earned > 0 ? 'var(--pos)' : 'inherit');

          const badge = earned > 0 
            ? `<div style="font-size:10px; font-weight:800; color:#16A34A; margin-top:2px;">+ ${compactRp(earned)}</div>` 
            : '';

          if (k.type === 'manual' && mode !== 'total') {
            return `<div style="font-weight:700; cursor:pointer; color:#1D4ED8; text-decoration:underline;" data-manual-kpi="${esc(r.name)}|${esc(k.id)}">${mainVal}</div>${badge}`;
          }
          return `<div style="font-weight:700; color:${color};">${mainVal}</div>${badge}`;
        }
      });
    });

    columns.push({ 
      key: 'nextGapLabel', 
      label: 'Apa yang Kurang?', 
      render: r => `<span class="tiny" style="color:#9A3412; font-weight:600; background:#FFF7ED; padding:4px 8px; border-radius:4px; border:1px solid #FED7AA; display:inline-block;">${esc(r.nextGapLabel)}</span>` 
    });
    columns.push({ 
      key: 'insentif', 
      label: 'Total Insentif', 
      align: 'num', 
      render: r => `<span class="strong" style="color:#1D4ED8; font-size:15px;">${compactRp(r.insentif)}</span>` 
    });

    const tableHtml = sortableTable({ 
      scope: 'insentif-dyn-table', 
      rows: results, 
      columns, 
      empty: 'Belum ada data target atau transaksi di periode ini.' 
    });

    patchHTML('#ins-kpis', kpiHtml);
    patchHTML('#ins-tiers-preview', tiersHtml);
    patchHTML('#ins-table', tableHtml);

  } catch (err) {
    console.error('Insentif Error:', err);
    patchHTML('#ins-kpis', '');
    patchHTML('#ins-tiers-preview', '');
    patchHTML('#ins-table', `<div style="padding:20px; background:#FEF2F2; border:1px solid #FECACA; color:#991B1B; font-family:monospace; font-size:12px;">
      <b>Error:</b> ${esc(err.message)}<br>
      <small>${esc(err.stack || '').slice(0, 300)}</small>
    </div>`);
  }
}

/* ── MODAL PILIH KPI ── */
function openKpiModal() {
  const activeIds = getActiveKpiIds();
  const allKpis = DS.getAllKpis(store.state);
  
  const buildLabel = (k) => `
    <label style="display:flex; align-items:center; gap:8px; padding:8px; border-bottom:1px solid #F1F5F9; font-size:13px; cursor:pointer;">
      <input type="checkbox" class="kpi-chk" value="${k.id}" ${activeIds.includes(k.id) ? 'checked' : ''} style="width:16px; height:16px;">
      <span style="font-weight:700; flex:1;">${esc(k.label)}</span>
      <span class="tiny" style="background:${k.type === 'auto' ? '#DCFCE7' : '#FEF3C7'}; color:${k.type === 'auto' ? '#166534' : '#92400E'}; padding:2px 6px; border-radius:4px;">${k.type === 'auto' ? 'OTOMATIS' : 'MANUAL'}</span>
    </label>
  `;

  const baseKpis = allKpis.filter(k => k.type === 'auto' || k.type === 'manual');
  const divisiKpis = allKpis.filter(k => k.type === 'divisi');
  const subrandKpis = allKpis.filter(k => k.type === 'subrand');

  openModal(`
    <div class="modal-h"><h3>Pilih Indikator KPI</h3><button class="x">×</button></div>
    <div class="modal-b">
      <div style="border:1px solid #E2E8F0; border-radius:6px; max-height:400px; overflow-y:auto;">
        ${baseKpis.map(buildLabel).join('')}
        ${divisiKpis.length ? `<div style="padding:8px; background:#F0FDF4; font-weight:800; font-size:11px; color:#166534;">🏢 KPI DIVISI</div>${divisiKpis.map(buildLabel).join('')}` : ''}
        ${subrandKpis.length ? `<div style="padding:8px; background:#EFF6FF; font-weight:800; font-size:11px; color:#1E40AF;">📦 KPI SUBRAND</div>${subrandKpis.map(buildLabel).join('')}` : ''}
      </div>
    </div>
    <div class="modal-f" style="padding:16px; border-top:1px solid #E2E8F0; text-align:right;">
      <button class="btn primary" id="btnSaveKpi">Simpan KPI</button>
    </div>
  `);

  document.getElementById('btnSaveKpi').onclick = () => {
    const ids = Array.from(document.querySelectorAll('.kpi-chk:checked')).map(chk => chk.value);
    if (ids.length === 0) { toast('Pilih minimal 1 KPI.'); return; }
    saveActiveKpiIds(ids);
    document.getElementById('modalScrim').classList.remove('on');
    store.emit();
  };
}

/* ── MODAL ATUR TIER ── */
function openTiersModal() {
  const activeIds = getActiveKpiIds();
  const allKpis = DS.getAllKpis(store.state);
  const activeKpis = activeIds.map(id => allKpis.find(k => k.id === id)).filter(Boolean);

  const allTiers = getTiers();
  const allSalesman = Array.from(new Set((DS.Data.rows(store.state) || []).filter(r => r.tt === 'F').map(r => r.salesman))).sort();

  const buildTierForm = (targetName) => {
    const tiers = allTiers[targetName] || {};
    return activeKpis.map(k => {
      const kTiers = tiers[k.id] || [];
      const unit = k.hasTarget ? '%' : (k.format === 'rp' ? 'Rp' : '');
      const isSubrand = k.type === 'subrand';
      const isDivisi = k.type === 'divisi';
      const borderColor = isDivisi ? '#A7F3D0' : (isSubrand ? '#BFDBFE' : '#E2E8F0');
      
      const tierRows = kTiers.map(t => `
        <div class="tier-row" style="display:flex; gap:6px; margin-bottom:6px; align-items:center;">
          <input type="number" class="tier-min" value="${t.min}" style="padding:6px; border:1px solid #CBD5E1; border-radius:4px; flex:1; text-align:right;">
          <span style="font-size:12px; font-weight:bold; color:#64748B;">-</span>
          <input type="number" class="tier-max" value="${t.max}" style="padding:6px; border:1px solid #CBD5E1; border-radius:4px; flex:1; text-align:right;">
          <span style="font-size:11px; color:#64748B; min-width:20px;">${unit}</span>
          <span style="font-size:12px; font-weight:bold; color:#16A34A;">Rp</span>
          <input type="number" class="tier-amount" value="${t.amount}" style="padding:6px; border:1px solid #16A34A; border-radius:4px; flex:1.2; text-align:right; font-weight:bold; color:#16A34A;">
          <button class="btn sm neg btn-del-tier" style="padding:4px 8px;">✕</button>
        </div>
      `).join('');

      return `
        <div class="kpi-tier-box" data-kpiid="${k.id}" style="border:1px solid ${borderColor}; border-radius:8px; padding:12px; margin-bottom:12px; background:#F8FAFC;">
          <div style="font-weight:800; font-size:14px; color:#1D4ED8; margin-bottom:8px; display:flex; justify-content:space-between;">
            <span>${isDivisi ? '🏢 ' : (isSubrand ? '📦 ' : '')}${esc(k.label)}</span>
            <span class="tiny" style="background:#DBEAFE; padding:2px 6px; border-radius:4px; color:#1E40AF;">${k.hasTarget ? 'Diukur dalam %' : 'Diukur dalam Angka'}</span>
          </div>
          <div class="tier-container">${tierRows}</div>
          <button class="btn sm mt12 btn-add-tier" style="width:100%; font-size:11px; background:#E2E8F0; color:#334155;">+ Tambah Tier</button>
        </div>
      `;
    }).join('');
  };

  const targetOptions = [
    `<option value="_default">🌐 Semua Salesman (Skema Default)</option>`,
    ...allSalesman.map(sm => `<option value="${esc(sm)}">👤 Salesman: ${esc(sm)}</option>`)
  ].join('');

  openModal(`
    <div class="modal-h"><h3>Pengaturan Tier Insentif</h3><button class="x">×</button></div>
    <div class="modal-b" style="max-height:75vh; overflow-y:auto; background:#F1F5F9;">
      <div style="background:#fff; padding:12px; border-radius:8px; margin-bottom:16px; border:1px solid #E2E8F0;">
        <label style="font-size:12px; font-weight:800; color:#334155; display:block; margin-bottom:4px;">Terapkan Skema Ini Kepada:</label>
        <select id="tierTargetSel" class="btn" style="width:100%; padding:10px; font-weight:bold; text-align:left;">${targetOptions}</select>
      </div>
      <div style="font-size:12px; color:#475569; margin-bottom:12px; padding:8px; background:#FEF3C7; border-radius:6px; border:1px solid #FDE68A;">
        <b>Tips:</b> Isi Min=90, Max=99.99 untuk "90%-99.9% dapat bonus". Max 9999 = "ke atas tanpa batas".
      </div>
      <div id="tiers-container" data-current-target="_default">${buildTierForm('_default')}</div>
    </div>
    <div class="modal-f" style="padding:16px; border-top:1px solid #E2E8F0; text-align:right;">
      <button class="btn primary" id="btnSaveTiers">Simpan Skema</button>
    </div>
  `);

  document.getElementById('tierTargetSel').addEventListener('change', (e) => {
    const newTarget = e.target.value;
    const currentTarget = document.getElementById('tiers-container').dataset.currentTarget || '_default';
    const boxData = {};
    document.querySelectorAll('.kpi-tier-box').forEach(box => {
      const kpiId = box.dataset.kpiid;
      const kTiers = [];
      box.querySelectorAll('.tier-row').forEach(row => {
        const min = parseFloat(row.querySelector('.tier-min').value) || 0;
        const max = parseFloat(row.querySelector('.tier-max').value) || 9999;
        const amount = parseFloat(row.querySelector('.tier-amount').value) || 0;
        if (amount > 0) kTiers.push({ min, max, amount });
      });
      kTiers.sort((a,b) => a.min - b.min);
      if (kTiers.length > 0) boxData[kpiId] = kTiers;
    });
    allTiers[currentTarget] = boxData;
    
    const container = document.getElementById('tiers-container');
    container.dataset.currentTarget = newTarget;
    container.innerHTML = buildTierForm(newTarget);
  });

  document.getElementById('tiers-container').addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-del-tier')) e.target.closest('.tier-row').remove();
    if (e.target.classList.contains('btn-add-tier')) {
      const box = e.target.closest('.kpi-tier-box');
      const container = box.querySelector('.tier-container');
      const div = document.createElement('div');
      div.className = 'tier-row';
      div.style = 'display:flex; gap:6px; margin-bottom:6px; align-items:center;';
      div.innerHTML = `
        <input type="number" class="tier-min" value="0" style="padding:6px; border:1px solid #CBD5E1; border-radius:4px; flex:1; text-align:right;">
        <span style="font-size:12px; font-weight:bold; color:#64748B;">-</span>
        <input type="number" class="tier-max" value="9999" style="padding:6px; border:1px solid #CBD5E1; border-radius:4px; flex:1; text-align:right;">
        <span style="font-size:11px; color:#64748B; min-width:20px;">%</span>
        <span style="font-size:12px; font-weight:bold; color:#16A34A;">Rp</span>
        <input type="number" class="tier-amount" value="100000" style="padding:6px; border:1px solid #16A34A; border-radius:4px; flex:1.2; text-align:right; font-weight:bold; color:#16A34A;">
        <button class="btn sm neg btn-del-tier" style="padding:4px 8px;">✕</button>
      `;
      container.appendChild(div);
    }
  });

  document.getElementById('btnSaveTiers').onclick = () => {
    const lastTarget = document.getElementById('tiers-container').dataset.currentTarget || '_default';
    const boxData = {};
    document.querySelectorAll('.kpi-tier-box').forEach(box => {
      const kpiId = box.dataset.kpiid;
      const kTiers = [];
      box.querySelectorAll('.tier-row').forEach(row => {
        const min = parseFloat(row.querySelector('.tier-min').value) || 0;
        const max = parseFloat(row.querySelector('.tier-max').value) || 9999;
        const amount = parseFloat(row.querySelector('.tier-amount').value) || 0;
        if (amount > 0) kTiers.push({ min, max, amount });
      });
      kTiers.sort((a,b) => a.min - b.min);
      if (kTiers.length > 0) boxData[kpiId] = kTiers;
    });
    allTiers[lastTarget] = boxData;
    saveTiers(allTiers);
    document.getElementById('modalScrim').classList.remove('on');
    toast('Skema tier tersimpan!');
    store.emit();
  };
}

/* ── REGISTER VIEW ── */
registerView('insentif', {
  label: 'Insentif',
  title: 'Monitoring Insentif',
  sub: 'Perhitungan bonus otomatis berdasarkan KPI',
  shell,
  update,
  mount() {
    document.addEventListener('click', (e) => {
      if (e.target.id === 'btnManageKpi') openKpiModal();
      if (e.target.id === 'btnManageTiers') openTiersModal();
      const modeBtn = e.target.closest('[data-ins-mode]');
      if (modeBtn) store.set({ ui: { ...store.state.ui, insMode: modeBtn.dataset.insMode } });
    });

    document.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-manual-kpi]');
      if (!cell) return;
      const [sm, kpi] = cell.dataset.manualKpi.split('|');
      const currentVal = DS.Data.manualKpi(sm, kpi, store.state) || '';
      const val = prompt(`Masukkan nilai aktual ${kpi.toUpperCase()} untuk ${sm}:`, currentVal);
      if (val !== null) {
        DS.Data.setManualKpi(sm, kpi, val, store.state);
        store.emit();
      }
    });
  }
});