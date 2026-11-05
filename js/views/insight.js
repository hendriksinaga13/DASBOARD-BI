import { esc } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { generateAIReport } from '../analytics/engine.js';
import { store } from '../core/store.js';
import { selectFiltered } from '../core/selectors.js';
import { registerView } from './registry.js';
import { openModal, toast } from '../ui/feedback.js';

let isAnalyzing = false;
let aiResult = null;
let loadingInterval = null;

function getFilterSummary(state) {
  const f = state.filters;
  const meta = [];
  if (f.from) meta.push(f.from);
  if (f.to) meta.push(f.to);
  if (f.salesman && f.salesman.size > 0) meta.push(`Salesman: ${Array.from(f.salesman).join(', ')}`);
  if (f.divisi && f.divisi.size > 0) meta.push(`Divisi: ${Array.from(f.divisi).join(', ')}`);
  return meta.length > 0 ? meta.join(' · ') : 'Semua Data (Tanpa Filter)';
}

function shell(){
  const filterInfo = getFilterSummary(store.state);
  return `
    <div class="card mb12" id="ai-hero" style="text-align:center; padding:40px 20px; background:linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%); border-radius:16px; box-shadow:0 10px 25px rgba(29,78,216,0.3); position:relative; overflow:hidden;">
      <div style="position:absolute; top:-50px; right:-50px; width:200px; height:200px; background:rgba(255,255,255,0.1); border-radius:50%;"></div>
      <div style="position:absolute; bottom:-30px; left:-30px; width:150px; height:150px; background:rgba(255,255,255,0.1); border-radius:50%;"></div>
      <div style="font-size:48px; margin-bottom:12px; text-shadow:0 4px 10px rgba(0,0,0,0.2);">🧠</div>
      <div style="font-size:24px; font-weight:900; color:#fff; margin-bottom:8px; letter-spacing:-0.5px;">Expert AI Board</div>
      <div style="font-size:14px; color:#BFDBFE; margin-bottom:24px; max-width:400px; margin-left:auto; margin-right:auto; line-height:1.5;">Diagnosis bisnis layaknya Konsultan Ahli.</div>
      <div style="display:inline-block; background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); padding:8px 16px; border-radius:8px; margin-bottom:20px;">
        <div style="font-size:10px; color:#93C5FD; font-weight:700; margin-bottom:2px; letter-spacing:1px;">DATA YANG DIANALISIS</div>
        <div style="font-size:12px; color:#fff; font-weight:600;">${esc(filterInfo)}</div>
      </div>
      <br>
      <button class="btn" id="btnRunAI" style="padding:14px 32px; font-weight:800; border-radius:99px; background:#fff; color:#1D4ED8; font-size:14px; box-shadow:0 4px 15px rgba(0,0,0,0.2); border:none; cursor:pointer;">✨ Mulai Analisis Cerdas</button>
    </div>
    <div id="ai-output" style="animation: fadeIn 0.5s ease;"></div>
    <style>
      @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.8; } 100% { transform: scale(1); opacity: 1; } }
      .ai-loading-text { animation: pulse 1.5s infinite; font-weight: 700; color: #1D4ED8; font-size: 15px; margin-top: 12px; }
      .ai-desc { white-space: pre-line; font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 16px; }
    </style>
  `;
}

function renderOutput(){
  const out = document.getElementById('ai-output');
  if(!out) return;

  if (isAnalyzing) {
    out.innerHTML = `
      <div class="card" style="text-align:center; padding:40px; background:#F8FAFC; border:1px solid #E2E8F0;">
        <div style="font-size:32px;">⚙️</div>
        <div class="ai-loading-text" id="ai-loading-txt">Membaca pola data terfilter...</div>
        <div style="height:6px; width:100%; max-width:300px; background:#E2E8F0; border-radius:3px; margin:20px auto; overflow:hidden;">
          <div id="ai-loading-bar" style="height:100%; width:0%; background:#1D4ED8; transition: width 0.3s;"></div>
        </div>
      </div>`;
    const texts = ["Menghitung Pareto...", "Analisis EC & IPT...", "Mendeteksi Penurunan...", "Menyusun Strategi..."];
    let step = 0, bar = 0;
    clearInterval(loadingInterval);
    loadingInterval = setInterval(() => {
      const txtEl = document.getElementById('ai-loading-txt');
      const barEl = document.getElementById('ai-loading-bar');
      if (!txtEl || !barEl) return clearInterval(loadingInterval);
      step = (step + 1) % texts.length; bar += 25; if (bar > 100) bar = 100;
      txtEl.textContent = texts[step]; barEl.style.width = bar + '%';
    }, 400);
    return;
  }

  if (!aiResult) { out.innerHTML = ''; return; }
  const { healthScore, summary, insights } = aiResult;
  
  if (insights.length === 0) {
    out.innerHTML = `<div class="card" style="text-align:center; padding:32px; background:#FEF2F2; border:1px solid #FECACA; margin-top:12px;"><div style="font-size:40px; margin-bottom:8px;">📭</div><div style="font-weight:800; color:#991B1B; font-size:16px;">Data Tidak Cukup</div></div>`;
    return;
  }

  let scoreColor = '#10B981'; if (healthScore < 80) scoreColor = '#F59E0B'; if (healthScore < 50) scoreColor = '#EF4444'; 

  let html = `
    <div id="ai-report-card" class="card" style="padding:0; overflow:hidden; border:none; box-shadow:0 4px 20px rgba(0,0,0,0.08); margin-bottom:20px;">
      <div style="background:#0F172A; padding:24px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:16px;">
        <div>
          <div style="font-size:11px; font-weight:800; color:#94A3B8; letter-spacing:2px;">EXECUTIVE SUMMARY</div>
          <div style="font-size:20px; font-weight:900; color:#fff; margin-top:4px;">Laporan Kesehatan Bisnis</div>
        </div>
        <div style="text-align:right; display:flex; align-items:center; gap:12px;">
          <button class="btn sm" data-quick-export="#ai-report-card" data-title="Laporan AI Analyst" data-filename="ai_insight_report" style="background:#334155; color:#fff; border:none; cursor:pointer;">📥 Ekspor</button>
          <div style="background:${scoreColor}; color:#fff; padding:8px 16px; border-radius:8px; font-weight:900; font-size:18px;">${healthScore} <span style="font-size:10px;">/ 100</span></div>
        </div>
      </div>
      <div style="padding:24px;">
        <div style="font-size:14px; line-height:1.7; color:#334155; background:#F8FAFC; padding:20px; border-radius:12px; border-left:4px solid ${scoreColor}; white-space: pre-line;">
          ${summary.replace(/\*\*(.*?)\*\*/g, '<b style="color:#0F172A;">$1</b>')}
        </div>
      </div>
      <div style="padding:0 24px 24px 24px;">
        <div style="font-size:13px; font-weight:900; text-transform:uppercase; margin-bottom:16px; color:#0F172A;">🎯 Rekomendasi Strategis (${insights.length})</div>
  `;

  html += insights.map((i, idx) => {
    let sevBg, sevBorder, sevIcon, sevText;
    if (i.severity === 'critical') { sevBg = '#FEF2F2'; sevBorder = '#EF4444'; sevIcon = '🚨'; sevText = '#991B1B'; }
    else if (i.severity === 'high') { sevBg = '#FFF7ED'; sevBorder = '#F97316'; sevIcon = '⚠️'; sevText = '#9A3412'; }
    else if (i.severity === 'growth') { sevBg = '#F0FDF4'; sevBorder = '#22C55E'; sevIcon = '🚀'; sevText = '#166534'; }
    else { sevBg = '#F8FAFC'; sevBorder = '#64748B'; sevIcon = '💡'; sevText = '#334155'; }
    
    return `
      <div style="background:${sevBg}; border:1px solid ${sevBorder}30; border-left:6px solid ${sevBorder}; padding:20px; margin-bottom:16px; border-radius:8px;">
        <div style="display:flex; align-items:flex-start; gap:12px;">
          <div style="font-size:24px;">${sevIcon}</div>
          <div style="flex:1;">
            <div style="font-size:11px; font-weight:800; color:${sevText}; text-transform:uppercase; margin-bottom:4px;">${esc(i.category)}</div>
            <div style="font-size:16px; font-weight:800; color:#0F172A; margin-bottom:8px;">${esc(i.title)}</div>
            <div class="ai-desc">${esc(i.desc)}</div>
            <button class="ai-action-btn" data-action-idx="${idx}" style="background:#0F172A; padding:8px 16px; border-radius:6px; font-weight:700; font-size:12px; color:#fff; border:none; cursor:pointer;">Lihat Solusi & Playbook →</button>
          </div>
        </div>
      </div>`;
  }).join('');

  html += `</div></div>`;
  out.innerHTML = html;
}

function handleAction(idx) {
  const insight = aiResult.insights[idx];
  if (!insight) return;

  const techList = (insight.techActions || []).map(a => `<li style="margin-bottom:6px;">${esc(a)}</li>`).join('');
  const nonTechList = (insight.nonTechnicalActions || []).map(a => `<li style="margin-bottom:6px;">${esc(a)}</li>`).join('');

  const html = `
    <div class="modal-h" style="background:#0F172A; color:#fff; padding:20px;">
      <h3 style="font-size:16px; margin:0;">Executive Playbook</h3>
      <button class="x" style="color:#fff;">×</button>
    </div>
    <div class="modal-b" style="padding:20px; max-height:80vh; overflow-y:auto;">
      <div style="font-size:18px; font-weight:900; color:#0F172A; margin-bottom:16px;">${esc(insight.title)}</div>
      <div style="margin-bottom:20px;">
        <div style="font-size:13px; font-weight:800; color:#166534; margin-bottom:8px;">🤝 Tindakan Bisnis & Lapangan</div>
        <ul style="margin:0; padding:16px 16px 16px 36px; font-size:13px; color:#334155; line-height:1.6; background:#F0FDF4; border-radius:8px; border:1px solid #BBF7D0;">${nonTechList || '<li>Tidak ada.</li>'}</ul>
      </div>
      <div style="margin-bottom:20px;">
        <div style="font-size:13px; font-weight:800; color:#475569; margin-bottom:8px;">⚙️ Tindakan Sistem</div>
        <ul style="margin:0; padding:16px 16px 16px 36px; font-size:13px; color:#334155; line-height:1.6; background:#F8FAFC; border-radius:8px; border:1px solid #E2E8F0;">${techList || '<li>Tidak ada.</li>'}</ul>
      </div>
      ${insight.actionData ? `
        <div style="background:#EFF6FF; border:1px solid #BFDBFE; padding:16px; border-radius:8px; margin-bottom:20px;">
          <div style="font-size:12px; color:#1E3A8A; font-weight:700; margin-bottom:8px;">Aksi Cepat</div>
          <button class="btn-action-exec" id="btnApplyAction" style="width:100%; padding:12px; font-weight:800; border-radius:6px; background:#1D4ED8; color:#fff; border:none; cursor:pointer;">Terapkan Filter & Buka Data Terkait</button>
        </div>
      ` : `<button class="btn" style="width:100%; padding:14px; font-weight:800; border-radius:8px; background:#F1F5F9; color:#475569; border:1px solid #CBD5E1; cursor:pointer;" onclick="document.getElementById('modalScrim').classList.remove('on')">Tutup</button>`}
    </div>`;

  openModal(html);

  if (insight.actionData) {
    document.getElementById('btnApplyAction').onclick = () => {
      const { type, keys } = insight.actionData;
      store.state.filters.salesman = new Set();
      store.state.filters.produk = new Set();
      store.state.filters.divisi = new Set();
      store.state.filters.outlet = new Set();
      
      if (type === 'salesman' && keys && keys.length > 0) { store.state.filters.salesman = new Set(keys); store.set({ view: 'salesman' }); }
      else if (type === 'product' && keys && keys.length > 0) { store.state.filters.produk = new Set(keys); store.set({ view: 'product' }); }
      else if (type === 'outlet' && keys && keys.length > 0) { store.state.filters.outlet = new Set(keys); store.set({ view: 'outlet' }); }
      else { store.set({ view: 'overview' }); }
      
      document.getElementById('modalScrim').classList.remove('on');
      store.emit();
      toast('Filter berhasil diterapkan!');
    };
  }
}

function update(container, state){
  patchHTML('#insight-ai-container', shell());
  document.getElementById('btnRunAI').onclick = () => {
    const filteredData = selectFiltered(state);
    if (!filteredData || filteredData.length === 0) { toast('Data kosong.'); return; }
    isAnalyzing = true; aiResult = null; renderOutput();
    setTimeout(() => {
      aiResult = generateAIReport(state);
      isAnalyzing = false; renderOutput();
      const isInsufficient = aiResult.insights.some(i => i.id === 'insufficient-data');
      if (isInsufficient) toast('Data terlalu kecil.'); else toast('Analisis Selesai!');
    }, 2500); 
  };
  if (aiResult) renderOutput();
}

registerView('insight', {
  label: 'AI Insight', title: 'Expert AI Analyst', sub: 'Diagnosis & Root Cause',
  shell() { return `<div id="insight-ai-container"></div>`; }, update,
  mount() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action-idx]');
      if (btn) handleAction(+btn.dataset.actionIdx);
    });
  }
});