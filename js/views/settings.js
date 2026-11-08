/* View "Program Berjalan" — READ-ONLY ORCHESTRATOR */

import { esc } from '../core/utils.js';
import { store } from '../core/store.js';
import { selectFiltered } from '../core/selectors.js';
import { toast, openModal } from '../ui/feedback.js';
import { registerView } from './registry.js';
import * as C from '../core/programs.js';
import * as R from '../ui/programs/read.js';
import * as M from '../ui/programs/modals.js';

function shell() { return `<div id="prog-view"></div>`; }

function update(container, state) {
  try {
    const programs = C.loadPrograms();
    const expiring = programs.filter(p => {
      const s = C.getProgramStatus(p);
      return s.status === 'critical' || s.status === 'warning';
    });
    const order = { critical: 0, warning: 1, active: 2, upcoming: 3, expired: 4 };
    programs.sort((a, b) => (order[C.getProgramStatus(a).status] || 9) - (order[C.getProgramStatus(b).status] || 9));

    const el = document.getElementById('prog-view');
    if (!el) return;
    el.innerHTML = `
      ${R.renderHeader(programs)}
      ${R.renderExpiringAlert(expiring)}
      ${programs.length === 0 ? R.renderEmpty() : programs.map(p => R.renderProgramCard(p)).join('')}
    `;

    document.querySelectorAll('[data-program-id]').forEach(card => {
      card.onclick = () => {
        const program = programs.find(p => p.id === card.dataset.programId);
        if (program) openProgramDetail(program, state);
      };
    });
  } catch (err) {
    console.error('[programs view]', err);
    const el = document.getElementById('prog-view');
    if (el) el.innerHTML = `<div style="padding:24px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;">
      <div style="font-size:15px;font-weight:800;color:#991B1B;">⚠️ Error</div>
      <div style="font-size:12px;color:#7F1D1D;">${esc(err.message)}</div>
    </div>`;
  }
}

function openProgramDetail(program, state) {
  try {
    const analysis = C.analyzeProgram(program, selectFiltered(state), state);
    const status = C.getProgramStatus(program);

    openModal(M.renderProgramDetailReadOnly(program, analysis, status));
    setTimeout(() => bindDetailHandlers(program, analysis), 50);
  } catch (err) {
    console.error('[detail]', err);
    toast('Error: ' + err.message);
  }
}

function bindDetailHandlers(program, analysis) {
  document.querySelectorAll('[data-scheme-toggle]').forEach(el => {
    el.onclick = () => {
      const c = document.querySelector(`[data-scheme-content="${el.dataset.schemeToggle}"]`);
      if (c) c.style.display = c.style.display === 'none' ? 'block' : 'none';
    };
  });
  document.querySelectorAll('[data-view-scorecard]').forEach(b => b.onclick = () => showScorecard(program, analysis));
  document.querySelectorAll('[data-coaching]').forEach(el => {
    el.onclick = e => { e.stopPropagation(); openCoaching(program, analysis, el.dataset.coaching); };
  });
  document.querySelectorAll('[data-bulk-broadcast]').forEach(b => b.onclick = () => openBroadcast(program, analysis));
  document.querySelectorAll('[data-outlet-detail]').forEach(el => {
    el.onclick = () => {
      const [s, o] = el.dataset.outletDetail.split(':').map(Number);
      const outlet = analysis.schemes[s].qualified[o];
      if (outlet) showOutletDetail(outlet, analysis.schemes[s].scheme, 'qualified');
    };
  });
  document.querySelectorAll('[data-notq-detail]').forEach(el => {
    el.onclick = () => {
      const [s, o] = el.dataset.notqDetail.split(':').map(Number);
      const outlet = analysis.schemes[s].notQualified[o];
      if (outlet) showOutletDetail(outlet, analysis.schemes[s].scheme, 'notQualified');
    };
  });
}

function showScorecard(program, analysis) {
  const r = C.detectAlerts(program, analysis);
  openModal(M.renderScorecardModal(program, r));
}

function openCoaching(program, analysis, name) {
  const r = C.detectAlerts(program, analysis);
  const stat = r.stats.get(name);
  if (!stat) { toast('Salesman tidak ditemukan'); return; }

  const diagnosis = C.diagnoseSalesman(stat, program, analysis, r.progress);
  const playbook  = C.generateCoachingPlaybook(stat, diagnosis, program, r.progress);
  const waMsg     = C.generateWhatsAppMessage(stat, diagnosis, program, r.progress);

  openModal(M.renderCoachingModal(name, stat, diagnosis, playbook, waMsg));

  setTimeout(() => {
    const ta = document.getElementById('wa-msg-text');
    document.querySelector('[data-wa-copy]').onclick = () => {
      navigator.clipboard.writeText(ta.value).then(() => toast('Disalin!')).catch(() => { ta.select(); document.execCommand('copy'); toast('Disalin!'); });
    };
    document.querySelector('[data-wa-open]').onclick = () => {
      window.location.href = 'https://wa.me/?text=' + encodeURIComponent(ta.value);
    };
    document.querySelector('[data-outlet-drill]').onclick = () => openDrill(program, name, diagnosis);
  }, 50);
}

function openDrill(program, name, diagnosis) {
  openModal(M.renderDrillModal(program, name, diagnosis));
}

function openBroadcast(program, analysis) {
  const r = C.detectAlerts(program, analysis);
  if (r.notStarted) { toast('Program belum dimulai'); return; }
  const bt = r.alerts.filter(a => a.severity <= 1);
  if (!bt.length) { toast('Semua on-track!'); return; }

  const contacts = bt.map(a => {
    const d = C.diagnoseSalesman(a.stat, program, analysis, r.progress);
    return {
      name: a.salesman, icon: a.icon,
      msg: C.generateWhatsAppMessage(a.stat, d, program, r.progress),
      stat: a.stat,
    };
  });

  openModal(M.renderBroadcastModal(contacts));

  setTimeout(() => {
    document.querySelectorAll('[data-bulk-send]').forEach(btn => {
      btn.onclick = () => {
        const c = contacts[+btn.dataset.bulkSend];
        window.location.href = 'https://wa.me/?text=' + encodeURIComponent(c.msg);
        btn.innerHTML = '✅ Terkirim';
        btn.disabled = true;
        btn.style.opacity = '0.5';
      };
    });
  }, 50);
}

function showOutletDetail(outlet, scheme, category) {
  try {
    const scoped = C.getScopedRows(scheme, outlet.rows || []);
    openModal(M.renderOutletDetailModal(outlet, scheme, category, scoped));
  } catch (err) {
    console.error('[outlet detail]', err);
    toast('Error: ' + err.message);
  }
}

registerView('programs', {
  label: 'Program Berjalan',
    title: 'Program Berjalan',
  sub: 'Rule-based · Strata · DMP Target · Read-Only',
  shell,
  update,
});