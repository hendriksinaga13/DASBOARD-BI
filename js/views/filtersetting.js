import { esc } from '../core/utils.js';
import { patchHTML } from '../core/dom.js';
import { store } from '../core/store.js';
import { FILTERS } from '../filters/registry.js';
import { registerView } from './registry.js';
import { toast } from '../ui/feedback.js';

const STORAGE_KEY = 'm245.filterPrefs';
const PRESETS_KEY = 'm245.filterPresets';

// ═══════════════════════════════════════════════════════════════
// STORAGE HELPERS
// ═══════════════════════════════════════════════════════════════
function loadFilterPrefs() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  // Default: semua filter aktif
  const prefs = {};
  for (const key in FILTERS) prefs[key] = true;
  return prefs;
}

function saveFilterPrefs(prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (e) {}
}

function loadPresets() {
  try {
    const saved = localStorage.getItem(PRESETS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) { return []; }
}

function savePresets(presets) {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════
// EXPORT: Initialize prefs (dipanggil dari main.js saat bootstrap)
// ═══════════════════════════════════════════════════════════════
export function initFilterPrefs() {
  if (!store.state.filterPrefs) {
    store.state.filterPrefs = loadFilterPrefs();
  }
}

// ═══════════════════════════════════════════════════════════════
// SHELL
// ═══════════════════════════════════════════════════════════════
function shell() {
  return `<div id="fset-content"></div>`;
}

// ═══════════════════════════════════════════════════════════════
// UPDATE
// ═══════════════════════════════════════════════════════════════
function update(container, state) {
  const prefs = state.filterPrefs || loadFilterPrefs();
  const presets = loadPresets();
  const filterEntries = Object.entries(FILTERS);
  const enabledCount = Object.values(prefs).filter(v => v).length;

  patchHTML('#fset-content', `
    <!-- HEADER -->
    <div class="card mb12" style="background:linear-gradient(135deg, #0F172A 0%, #1E40AF 100%); color:#fff; padding:20px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="font-size:28px;">⚙️</div>
        <div>
          <div style="font-size:16px; font-weight:900;">Filter Settings</div>
          <div style="font-size:11px; color:#93C5FD;">Pilih filter yang ditampilkan & simpan preset favorit</div>
        </div>
      </div>
    </div>

    <!-- FILTER TOGGLES -->
    <div class="card mb12">
      <div class="card-h">
        <div>
          <div class="card-t">Filter Aktif (${enabledCount}/${filterEntries.length})</div>
          <div class="card-s">Centang filter yang ingin ditampilkan di toolbar</div>
        </div>
        <div class="right">
          <button id="fset-enable-all" style="padding:6px 12px; font-weight:700; background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; border-radius:6px; cursor:pointer; font-size:11px;">Aktifkan Semua</button>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px; margin-top:12px;">
        ${filterEntries.map(([key, def]) => {
          const isOn = prefs[key] !== false;
          const icon = def.time ? '⏰' : (def.product ? '📦' : '📍');
          const cat = def.time ? 'Time-based' : (def.product ? 'Product' : 'Location');
          return `
            <label style="display:flex; align-items:center; gap:10px; padding:12px; background:${isOn ? '#F0FDF4' : '#F8FAFC'}; border:1px solid ${isOn ? '#BBF7D0' : '#E2E8F0'}; border-radius:8px; cursor:pointer; transition:all 0.15s;">
              <input type="checkbox" data-fpref="${key}" ${isOn ? 'checked' : ''} style="width:18px; height:18px; accent-color:#10B981; cursor:pointer; flex-shrink:0;">
              <div style="flex:1; min-width:0;">
                <div style="font-size:12px; font-weight:800; color:#0F172A;">${icon} ${def.label}</div>
                <div style="font-size:9px; color:#64748B;">${cat}</div>
              </div>
            </label>
          `;
        }).join('')}
      </div>

      <button id="fset-save" style="width:100%; padding:12px; font-weight:800; background:#1D4ED8; color:#fff; border:none; border-radius:8px; cursor:pointer; margin-top:16px; font-size:13px;">
        💾 Simpan Pengaturan
      </button>
    </div>

    <!-- PRESETS -->
    <div class="card mb12">
      <div class="card-h">
        <div>
          <div class="card-t">Filter Presets</div>
          <div class="card-s">Simpan kombinasi filter favorit untuk akses cepat</div>
        </div>
      </div>

      <div style="margin-top:12px;">
        ${presets.length === 0
          ? '<div style="padding:20px; text-align:center; color:#94A3B8; font-size:12px; background:#F8FAFC; border-radius:6px;">Belum ada preset.<br>Simpan filter yang sering dipakai untuk akses cepat.</div>'
          : presets.map((p, i) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; margin-bottom:8px; gap:8px;">
                <div style="flex:1; min-width:0;">
                  <div style="font-size:12px; font-weight:800; color:#0F172A; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(p.name)}</div>
                  <div style="font-size:9px; color:#64748B; margin-top:2px;">${p.filterCount || 0} filter aktif · ${p.savedAt ? new Date(p.savedAt).toLocaleDateString('id-ID') : '-'}</div>
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                  <button data-load-preset="${i}" style="padding:6px 12px; background:#1D4ED8; color:#fff; border:none; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer;">Load</button>
                  <button data-del-preset="${i}" style="padding:6px 12px; background:#FEE2E2; color:#991B1B; border:none; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer;">Hapus</button>
                </div>
              </div>
            `).join('')
        }

        <button id="fset-save-preset" style="width:100%; padding:12px; font-weight:800; background:#F0FDF4; color:#166534; border:1px solid #BBF7D0; border-radius:6px; cursor:pointer; margin-top:8px; font-size:12px;">
          ➕ Simpan Filter Saat Ini sebagai Preset
        </button>
      </div>
    </div>

    <!-- INFO -->
    <div class="card" style="background:#F8FAFC; border-left:4px solid #1D4ED8; padding:12px;">
      <div style="font-size:11px; color:#334155; line-height:1.6;">
        💡 <b>Tips:</b> Preset menyimpan filter yang sedang aktif (tanggal, periode, salesman, dll). Cocok untuk menyimpan view seperti <i>"Q1 Rayon A"</i> atau <i>"Salesman Budi - Okt 2026"</i>. Setelah dimuat, filter langsung diterapkan 1 klik.
      </div>
    </div>
  `);
}

// ═══════════════════════════════════════════════════════════════
// REGISTER VIEW
// ═══════════════════════════════════════════════════════════════
registerView('filtersetting', {
  label: 'Filter Settings',
  title: 'Filter Settings',
  sub: 'Kustomisasi toolbar & preset',
  shell,
  update,
  mount() {
    // Toggle checkbox
    document.addEventListener('change', (e) => {
      if (e.target.hasAttribute('data-fpref')) {
        const key = e.target.dataset.fpref;
        const prefs = { ...(store.state.filterPrefs || {}) };
        prefs[key] = e.target.checked;
        store.state.filterPrefs = prefs;
        const label = e.target.closest('label');
        if (label) {
          label.style.background = e.target.checked ? '#F0FDF4' : '#F8FAFC';
          label.style.borderColor = e.target.checked ? '#BBF7D0' : '#E2E8F0';
        }
      }
    });

    document.addEventListener('click', (e) => {
      // Save prefs
      if (e.target.id === 'fset-save') {
        saveFilterPrefs(store.state.filterPrefs);
        toast('Filter settings disimpan');
        const fb = document.getElementById('filterbar');
        if (fb) fb._sig = null;
        store.emit();
      }

      // Enable all
      if (e.target.id === 'fset-enable-all') {
        const prefs = {};
        for (const key in FILTERS) prefs[key] = true;
        store.state.filterPrefs = prefs;
        store.emit();
        toast('Semua filter diaktifkan');
      }

      // Save preset
      if (e.target.id === 'fset-save-preset') {
        const name = prompt('Nama preset (misal: "Q1 Rayon A"):');
        if (name && name.trim()) {
          const presets = loadPresets();
          const filterSnapshot = {};
          let count = 0;
          for (const key in FILTERS) {
            const set = store.state.filters[key];
            if (set && set.size > 0) {
              filterSnapshot[key] = Array.from(set);
              count++;
            }
          }
          if (store.state.filters.from) { filterSnapshot.from = store.state.filters.from; count++; }
          if (store.state.filters.to) { filterSnapshot.to = store.state.filters.to; count++; }
          if (store.state.filters.transtype !== 'ALL') { filterSnapshot.transtype = store.state.filters.transtype; count++; }
          if (store.state.filters.q) { filterSnapshot.q = store.state.filters.q; count++; }

          presets.push({
            name: name.trim(),
            filters: filterSnapshot,
            filterCount: count,
            savedAt: new Date().toISOString(),
          });
          savePresets(presets);
          toast('Preset "' + name + '" disimpan');
          store.emit();
        }
      }

      // Load preset
      if (e.target.hasAttribute('data-load-preset')) {
        const idx = +e.target.dataset.loadPreset;
        const presets = loadPresets();
        const preset = presets[idx];
        if (!preset) return;

        for (const key in FILTERS) store.state.filters[key] = new Set();
        store.state.filters.from = '';
        store.state.filters.to = '';
        store.state.filters.transtype = 'ALL';
        store.state.filters.q = '';

        for (const [key, val] of Object.entries(preset.filters)) {
          if (key === 'from' || key === 'to' || key === 'transtype' || key === 'q') {
            store.state.filters[key] = val;
          } else if (Array.isArray(val)) {
            store.state.filters[key] = new Set(val);
          }
        }
        toast('Preset "' + preset.name + '" dimuat');
        const fb = document.getElementById('filterbar');
        if (fb) fb._sig = null;
        store.emit();
      }

      // Delete preset
      if (e.target.hasAttribute('data-del-preset')) {
        const idx = +e.target.dataset.delPreset;
        const presets = loadPresets();
        if (!confirm('Hapus preset "' + presets[idx].name + '"?')) return;
        presets.splice(idx, 1);
        savePresets(presets);
        toast('Preset dihapus');
        store.emit();
      }
    });
  },
});