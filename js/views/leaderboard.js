import { esc, compactRp, pct, NF1 } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { selectFiltered } from '../core/selectors.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';

function shell(){
  return `<div id="leaderboard-content"></div>`;
}

function update(container, state){
  const rows = selectFiltered(state).filter(r => r.tt === 'F');
  const activeMonth = state.targetMonth || (rows[0]?.day.slice(0, 7));

  if (!rows.length) {
    patchHTML('#leaderboard-content', '<div class="empty" style="padding:40px; text-align:center;">Belum ada data penjualan untuk diperingkatkan.</div>');
    return;
  }

  // 1. Hitung Metrik per Salesman
  const smMap = new Map();
  
  for (const r of rows) {
    const sm = r.salesman || '—';
    if (!smMap.has(sm)) {
      smMap.set(sm, { name: sm, omset: 0, oa: new Set(), ec: new Set(), hk: new Set(), inv: new Set(), lines: 0 });
    }
    const data = smMap.get(sm);
    data.omset += r.amount;
    data.oa.add(r.outletKey);
    data.ec.add(r.day + '|' + r.outletKey);
    data.hk.add(r.day);
    data.inv.add(r.invoice);
    data.lines++;
  }

  const t = state.targets[activeMonth] || {};
  const smTargets = t.salesman || {};

  // 2. Format Data & Hitung Skor
  const results = Array.from(smMap.values()).map(sm => {
    const targetOmset = smTargets[sm.name]?.omset || 0;
    const targetOA = smTargets[sm.name]?.oa || 0;
    const targetEC = smTargets[sm.name]?.ec || 0;
    
    const actualOA = sm.oa.size;
    const actualEC = sm.hk.size > 0 ? (sm.ec.size / sm.hk.size) : 0;
    const actualIPT = sm.inv.size > 0 ? (sm.lines / sm.inv.size) : 0;
    
    const pctOmset = targetOmset > 0 ? (sm.omset / targetOmset) * 100 : 0;
    
    // Skor Komposit (Omset 60%, Pencapaian Target 20%, EC 10%, IPT 10%)
    // Jika target belum diset, skor murni dari Omset & produktivitas
    let score = sm.omset;
    if (targetOmset > 0) {
      score = (sm.omset * 0.6) + (targetOmset * (pctOmset/100) * 0.4); 
    }

    return {
      ...sm,
      actualOA, actualEC, actualIPT, targetOmset, pctOmset, score
    };
  });

  // Urutkan berdasarkan Skor
  results.sort((a, b) => b.score - a.score);

  const top1 = results[0];
  const top2 = results[1];
  const top3 = results[2];
  const rest = results.slice(3);

  // 3. Render UI Papan Peringkat
  let html = `
    <div class="card mb12" style="background:linear-gradient(135deg, #1E1B4B 0%, #312E81 100%); color:#fff; text-align:center; padding:24px 16px; position:relative; overflow:hidden;">
      <div style="font-size:36px; margin-bottom:8px;">🏆</div>
      <div style="font-size:20px; font-weight:900; margin-bottom:4px;">Sales Leaderboard</div>
      <div style="font-size:12px; color:#C7D2FE;">Peringkat Kinerja Berdasarkan Omset & Pencapaian Target</div>
    </div>

    <!-- PODIUM TOP 3 -->
    <div style="display:flex; align-items:flex-end; justify-content:center; gap:8px; margin-bottom:24px; padding:0 10px;">
      
      <!-- Peringkat 2 -->
      ${top2 ? `
      <div style="flex:1; text-align:center;">
        <div style="font-size:32px; margin-bottom:4px;">🥈</div>
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:12px 8px; height:100px; display:flex; flex-direction:column; justify-content:center;">
          <div style="font-size:12px; font-weight:800; color:#0F172A; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(top2.name)}</div>
          <div style="font-size:11px; font-weight:700; color:#1D4ED8;">${compactRp(top2.omset)}</div>
        </div>
      </div>` : '<div style="flex:1"></div>'}

      <!-- Peringkat 1 -->
      ${top1 ? `
      <div style="flex:1.2; text-align:center;">
        <div style="font-size:40px; margin-bottom:4px; animation: float 2s infinite ease-in-out;">👑</div>
        <div style="background:#FFFBEB; border:2px solid #F59E0B; border-radius:12px; padding:16px 8px; height:130px; display:flex; flex-direction:column; justify-content:center; box-shadow:0 8px 24px rgba(245,158,11,0.3);">
          <div style="font-size:13px; font-weight:900; color:#78350F; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(top1.name)}</div>
          <div style="font-size:12px; font-weight:800; color:#B45309;">${compactRp(top1.omset)}</div>
          ${top1.pctOmset > 0 ? `<div style="font-size:10px; font-weight:800; color:#fff; background:#F59E0B; padding:2px 6px; border-radius:10px; display:inline-block; margin:4px auto 0;">${pct(top1.pctOmset)}</div>` : ''}
        </div>
      </div>` : ''}

      <!-- Peringkat 3 -->
      ${top3 ? `
      <div style="flex:1; text-align:center;">
        <div style="font-size:32px; margin-bottom:4px;">🥉</div>
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:12px 8px; height:90px; display:flex; flex-direction:column; justify-content:center;">
          <div style="font-size:12px; font-weight:800; color:#0F172A; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(top3.name)}</div>
          <div style="font-size:11px; font-weight:700; color:#1D4ED8;">${compactRp(top3.omset)}</div>
        </div>
      </div>` : '<div style="flex:1"></div>'}
    </div>

    <!-- DAFTAR PERINGKAT LAINNYA -->
    <div class="tiny" style="font-weight:800; text-transform:uppercase; letter-spacing:1px; margin:0 0 10px 4px; color:#64748B;">Peringkat Lainnya</div>
    
    <div class="card" style="padding:0; overflow:hidden;">
      <div class="tablewrap">
        <table style="min-width:100%;">
          <thead>
            <tr>
              <th style="width:40px; text-align:center;">#</th>
              <th>Salesman</th>
              <th class="num">Omset</th>
              <th class="num">Target</th>
              <th class="num">Capaian</th>
            </tr>
          </thead>
          <tbody>
            ${rest.map((sm, i) => `
              <tr>
                <td style="text-align:center; font-weight:800; color:#94A3B8;">${i + 4}</td>
                <td class="strong">${esc(sm.name)}</td>
                <td class="num">${compactRp(sm.omset)}</td>
                <td class="num">${sm.targetOmset > 0 ? compactRp(sm.targetOmset) : '—'}</td>
                <td class="num" style="font-weight:800; color:${sm.pctOmset >= 100 ? 'var(--pos)' : sm.pctOmset >= 75 ? 'var(--warn)' : (sm.pctOmset > 0 ? 'var(--neg)' : '#94A3B8')};">
                  ${sm.targetOmset > 0 ? pct(sm.pctOmset) : '—'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  patchHTML('#leaderboard-content', html);
}

registerView('leaderboard', { 
  label: 'Leaderboard', 
  title: 'Papan Peringkat', 
  sub: 'Gamifikasi Kinerja Salesman', 
  shell, 
  update 
});