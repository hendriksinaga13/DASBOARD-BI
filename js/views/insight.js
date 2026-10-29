import { esc } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { runInsights, exportReport } from '../analytics/engine.js';
import { store } from '../core/store.js';
import { registerView } from './registry.js';
import { toast } from '../ui/feedback.js';

const CAT_META = {
  risk:{label:'Risiko',color:'var(--neg)',icon:'!'},
  opportunity:{label:'Peluang',color:'var(--pos)',icon:'●'},
  quality:{label:'Kualitas',color:'var(--warn)',icon:'▲'},
  efficiency:{label:'Efisiensi',color:'var(--purple)',icon:'◐'},
  growth:{label:'Pertumbuhan',color:'var(--brand)',icon:'▲'},
};
const SEV_META = {
  critical:{label:'Kritis',bg:'var(--neg-soft)',fg:'var(--neg)'},
  high:{label:'Tinggi',bg:'#FED7AA',fg:'#9A3412'},
  medium:{label:'Sedang',bg:'var(--warn-soft)',fg:'var(--warn)'},
  low:{label:'Rendah',bg:'var(--brand-soft)',fg:'var(--brand)'},
  info:{label:'Info',bg:'#F1F5F9',fg:'var(--muted)'},
};
const CONF_META = {high:'Akurasi Tinggi',medium:'Akurasi Sedang',low:'Akurasi Rendah'};

function shell(){
  return `
    <div class="card" id="ins-header"></div>
    <div class="row-flex mt12" id="ins-filters"></div>
    <div class="grid mt12" id="ins-grid" style="grid-template-columns:1fr"></div>
  `;
}

function headerBlock(insights){
  const bySev = {}, byCat = {};
  insights.forEach(i => {
    bySev[i.severity] = (bySev[i.severity]||0)+1;
    byCat[i.category] = (byCat[i.category]||0)+1;
  });
  const crit = bySev.critical||0, high = bySev.high||0;
  const score = (crit*3 + high*2 + (bySev.medium||0)) / Math.max(insights.length, 1);
  const healthLabel = score > 1.5 ? 'Kritis' : score > 0.8 ? 'Waspada' : 'Sehat';
  const healthColor = score > 1.5 ? 'var(--neg)' : score > 0.8 ? 'var(--warn)' : 'var(--pos)';
  return `
    <div class="card-h"><div><div class="card-t">Executive Summary</div>
      <div class="card-s">${insights.length} temuan · engine kuantitatif multi-dimensi</div></div>
      <div class="right"><button class="btn primary" id="ins-export">Ekspor Laporan (.md)</button></div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
      <div class="kpi ${crit?'neg':'pos'}"><div class="kpi-l">Kritis</div><div class="kpi-v">${crit}</div></div>
      <div class="kpi ${high?'warn':'pos'}"><div class="kpi-l">Prioritas Tinggi</div><div class="kpi-v">${high}</div></div>
      <div class="kpi"><div class="kpi-l">Total Temuan</div><div class="kpi-v">${insights.length}</div></div>
      <div class="kpi" style="border-left-color:${healthColor}"><div class="kpi-l">Status Kesehatan</div>
        <div class="kpi-v" style="color:${healthColor}">${healthLabel}</div>
        <div class="kpi-s">Health score: ${(1-score).toFixed(2)}</div></div>
    </div>
    <div class="row-flex">
      ${Object.entries(byCat).map(([cat,n]) => {
        const m = CAT_META[cat] || {color:'var(--ink2)',icon:'•',label:cat};
        return `<span class="pill" style="background:${m.color}15;color:${m.color};font-weight:800">${m.icon} ${m.label} (${n})</span>`;
      }).join(' ')}
    </div>`;
}

function filtersBlock(state){
  const cat = state.insightFilter || 'all';
  const sev = state.insightSevFilter || 'all';
  return `
    <span class="tiny" style="font-weight:800;text-transform:uppercase">Filter:</span>
    <select id="ins-cat-filter" style="padding:6px 10px;border:1px solid var(--line);border-radius:7px;font-size:12px;font-weight:600">
      <option value="all"${cat==='all'?' selected':''}>Semua Kategori</option>
      ${Object.entries(CAT_META).map(([k,m])=>`<option value="${k}"${cat===k?' selected':''}>${m.label}</option>`).join('')}
    </select>
    <select id="ins-sev-filter" style="padding:6px 10px;border:1px solid var(--line);border-radius:7px;font-size:12px;font-weight:600">
      <option value="all"${sev==='all'?' selected':''}>Semua Severity</option>
      ${Object.entries(SEV_META).map(([k,m])=>`<option value="${k}"${sev===k?' selected':''}>${m.label}</option>`).join('')}
    </select>
  `;
}

function card(ins){
  const cat = CAT_META[ins.category] || {color:'var(--brand)'};
  const sev = SEV_META[ins.severity] || {};
  const conf = CONF_META[ins.confidence] || ins.confidence;
  const effectSize = ins.effectSize != null ? `<span class="pill n" style="font-weight:700">Effect size: ${Number(ins.effectSize).toFixed(2)}</span>` : '';
  const action = ins.actionView ? `<button class="btn sm" data-view="${ins.actionView}">Lihat Detail →</button>` : '';
  const evidenceHtml = (ins.evidence||[]).map(e => `<dt>${esc(e.label)}</dt><dd>${esc(e.value)}</dd>`).join('');
  return `
    <div class="card" style="border-left:4px solid ${cat.color}">
      <div class="card-h" style="margin-bottom:10px">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span class="pill" style="background:${cat.color}15;color:${cat.color};font-weight:800">${cat.icon || '•'} ${cat.label || ins.category}</span>
          <span class="pill" style="background:${sev.bg};color:${sev.fg};font-weight:800">${sev.label || ins.severity}</span>
          <span class="pill n" style="font-weight:700">${conf}</span>
          ${effectSize}
        </div>
        <div class="right">${action}</div>
      </div>
      <div style="font-size:14.5px;font-weight:820;letter-spacing:-.2px;margin-bottom:6px">${esc(ins.title)}</div>
      <div style="font-size:12px;color:var(--muted);font-weight:600;margin-bottom:10px;padding:6px 10px;background:#F8FAFC;border-radius:6px;display:inline-block">
        📐 ${esc(ins.methodology)}
      </div>
      <div style="font-size:12.5px;color:var(--ink2);line-height:1.65;margin-bottom:12px">${esc(ins.desc)}</div>
      ${ins.metric ? `<div style="padding:9px 12px;background:var(--brand-soft);border-radius:8px;margin-bottom:12px;font-size:12px;font-weight:750;color:var(--brand)">${esc(ins.metric)}</div>` : ''}
      ${evidenceHtml ? `
        <div style="margin-bottom:12px">
          <div class="tiny" style="font-weight:800;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Bukti Kuantitatif</div>
          <div class="kv" style="font-size:11.5px">${evidenceHtml}</div>
        </div>` : ''}
      ${ins.recommendation ? `<div style="padding:10px 12px;background:var(--pos-soft);border-radius:8px;border-left:3px solid var(--pos);font-size:12px;color:#065F46;line-height:1.6"><b style="font-weight:800">Rekomendasi:</b> ${esc(ins.recommendation)}</div>` : ''}
    </div>`;
}

function update(container, state){
  const all = runInsights(state);
  patchHTML('#ins-header', headerBlock(all));
  patchHTML('#ins-filters', filtersBlock(state));

  const catF = state.insightFilter || 'all';
  const sevF = state.insightSevFilter || 'all';
  const filtered = all.filter(i =>
    (catF === 'all' || i.category === catF) &&
    (sevF === 'all' || i.severity === sevF)
  );

  patchHTML('#ins-grid', filtered.length
    ? filtered.map(card).join('')
    : `<div class="empty" style="padding:32px"><h3>Tidak ada insight pada filter ini</h3><p>Ubah filter atau rentang tanggal.</p></div>`
  );
}

registerView('insight', {
  label: 'Insight',
  title: 'Insight Analytics',
  sub: 'Analisis statistik multi-dimensi · 22 detektor',
  shell, update,
  mount(){
    document.addEventListener('change', e => {
      if(e.target.id === 'ins-cat-filter'){
        store.state.insightFilter = e.target.value;
        store.emit();
      }
      if(e.target.id === 'ins-sev-filter'){
        store.state.insightSevFilter = e.target.value;
        store.emit();
      }
    });
    document.addEventListener('click', e => {
      if(e.target.id === 'ins-export'){
        const insights = runInsights(store.state);
        const md = exportReport(insights);
        const blob = new Blob([md], {type:'text/markdown;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'insight_report_' + new Date().toISOString().slice(0,10) + '.md';
        a.click();
        setTimeout(()=>URL.revokeObjectURL(url), 200);
        toast('Laporan insight diekspor');
      }
    });
  },
});