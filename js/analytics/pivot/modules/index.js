// analytics/pivot/modules/index.js

/* ══════════════════════════════════════════════════════════════
   PIVOT MODULES — Registry modul untuk Pivot Table
   ══════════════════════════════════════════════════════════════ */

import format         from './mod-format.js';
import compare        from './mod-compare.js';
import highlight      from './mod-highlight.js';
import sparkline      from './mod-sparkline.js';
import cumulative     from './mod-cumulative.js';
import databar        from './mod-databar.js';
import totals         from './mod-totals.js';
import abc            from './mod-abc.js';
import notes          from './mod-notes.js';
import ranking        from './mod-ranking.js';
import icons          from './mod-icons.js';
import targetColor    from './mod-target-color.js';
import contribution   from './mod-contribution.js';
import alert          from './mod-alert.js';

/* ✅ MODUL BARU */
import customColumns  from './custom-columns.js';

export const PIVOT_MODULES = [
  format, compare, highlight, totals, databar, cumulative,
  sparkline, abc, notes, ranking, icons, targetColor, contribution, alert,
  customColumns,  // ✅ TAMBAHKAN
];

export function applyModuleDefaults(cfg) {
  PIVOT_MODULES.forEach(m => {
    if (m && m.defaultConfig) {
      for (const key in m.defaultConfig) {
        if (cfg[key] === undefined) {
          cfg[key] = m.defaultConfig[key];
        }
      }
    }
  });
  return cfg;
}

/* Auto-install semua modul */
PIVOT_MODULES.forEach(m => {
  if (m && typeof m.install === 'function') {
    try { m.install(); }
    catch (e) { console.warn('[PivotModule] Install failed:', m.id, e); }
  }
});