// js/ui/settings/index.js
export function renderSettingsLayout(activeTab, contentHtml) {
  return `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap');
      .set-header { background: linear-gradient(135deg, #800000, #B71C1C); color: #fff; padding: 20px 16px 24px 16px; border-radius: 0 0 24px 24px; box-shadow: 0 6px 16px rgba(128,0,0,0.3); margin-bottom: 16px; position: sticky; top: 0; z-index: 100; display: flex; justify-content: space-between; align-items: flex-start; }
      .set-title { font-size: 22px; font-weight: 900; letter-spacing: 0.5px; }
      .set-sub { font-size: 13px; color: #FFCDD2; margin-top: 4px; }

      .set-btn-sync { background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); color: #fff; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px; }
      .set-btn-sync:active { background: rgba(255,255,255,0.4); }

      .set-tabs { display: flex; background: #F5F5F5; border-radius: 28px; padding: 4px; margin-bottom: 16px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05); border: 1px solid #FFCDD2; overflow-x: auto; }
      .set-tab { flex: 1; padding: 12px 16px; border-radius: 24px; font-weight: 800; font-size: 13px; cursor: pointer; border: none; background: transparent; color: #757575; transition: 0.3s; text-align: center; white-space: nowrap; }
      .set-tab.on { background: #800000; color: #fff; box-shadow: 0 3px 6px rgba(128,0,0,0.2); }
    </style>

    <div class="set-header">
      <div>
        <div class="set-title">Pengaturan</div>
        <div class="set-sub">Konfigurasi Global</div>
      </div>
      <button class="set-btn-sync" id="btnSyncSettings">🔄 Sync Cloud</button>
    </div>

    <div class="set-tabs" style="margin: 0 4px 16px 4px;">
      <button class="set-tab ${activeTab === 'hk' ? 'on' : ''}" data-stab="hk">Hari Kerja</button>
      <button class="set-tab ${activeTab === 'target' ? 'on' : ''}" data-stab="target">Target</button>
      <button class="set-tab ${activeTab === 'insentif' ? 'on' : ''}" data-stab="insentif">Insentif</button>
      <button class="set-tab ${activeTab === 'programs' ? 'on' : ''}" data-stab="programs">📢 Program</button>
      <button class="set-tab ${activeTab === 'musthave' ? 'on' : ''}" data-stab="musthave">📦 Must-Have</button>
    </div>

    ${contentHtml}
  `;
}