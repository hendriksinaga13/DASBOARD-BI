// js/views/settings/index.js
import { store } from '../../core/store.js';
import { patchHTML } from '../../core/dom.js';
import { registerView } from '../registry.js';
import { renderSettingsLayout } from '../../ui/settings/index.js';
import { initHkView } from './hk.js';
import { renderTargetSettingsView } from './target.js';
import { renderInsentifSettingsView } from './insentif.js';
import { renderProgramSettingsView, attachProgramSettingsHandlers } from './programs.js';
import { renderMustHaveSettingsView, attachMustHaveSettingsHandlers } from './musthave.js';
import { renderHkForm } from '../../ui/settings/hk.js';
import { pullAll } from '../../sync/pull.js';

function shell() {
  return `<div id="settings-content" style="padding-bottom: 40px;"></div>`;
}

function update(container, state) {
  const activeTab = state.ui.settingsTab || 'target';
  let contentHtml = '';

  if (activeTab === 'hk') {
    const hkValue = state.settings?.hk?.value || 25;
    contentHtml = renderHkForm(hkValue);
  } else if (activeTab === 'target') {
    contentHtml = renderTargetSettingsView(state);
  } else if (activeTab === 'insentif') {
    contentHtml = renderInsentifSettingsView(state);
  } else if (activeTab === 'programs') {
    contentHtml = renderProgramSettingsView(state);
  } else if (activeTab === 'musthave') {
    contentHtml = renderMustHaveSettingsView(state);
  }

  patchHTML('#settings-content', renderSettingsLayout(activeTab, contentHtml));

  // Attach handlers khusus untuk tab tertentu
  if (activeTab === 'programs') {
    attachProgramSettingsHandlers(state);
  } else if (activeTab === 'musthave') {
    attachMustHaveSettingsHandlers(state);
  }
}

registerView('settings', {
  label: 'Pengaturan',
  title: 'Pengaturan',
  sub: 'Konfigurasi',
  shell,
  update,
  mount() {
    document.addEventListener('click', async e => {
      const tabBtn = e.target.closest('[data-stab]');
      if (tabBtn) store.set({ ui: { ...store.state.ui, settingsTab: tabBtn.dataset.stab } });

      // Sync Cloud (HK, Target, Insentif, Programs, Must-Have)
      if (e.target.id === 'btnSyncSettings') {
        const btn = e.target;
        btn.disabled = true;
        btn.textContent = 'Menarik...';
        try {
          await pullAll();
          alert('Pengaturan berhasil disinkronkan dari Cloud!');
          store.emit();
        } catch (err) {
          alert('Gagal sync: ' + err.message);
        } finally {
          btn.disabled = false;
          btn.innerHTML = '🔄 Sync Cloud';
        }
      }
    });
    initHkView();
  }
});