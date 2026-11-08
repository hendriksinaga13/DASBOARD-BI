// js/data/lazy.js
import { store } from '../core/store.js';
import { loadFileHash } from './cache.js';

async function collectAllData(monthFilter) {
  const lbpFiles = store.state.files.filter(f => f.type === 'LBP');
  const dmpFiles = store.state.files.filter(f => f.type === 'DMP');
  const allHashes = [...lbpFiles.map(f => f.hash), ...dmpFiles.map(f => f.hash)];

  const rows = [];
  const master = new Map();
  const errors = [];

  for (const hash of allHashes) {
    const cached = await loadFileHash(hash);
    if (!cached) continue;

    if (cached.type === 'LBP') {
      for (const r of cached.result.records) {
        if (!monthFilter || monthFilter.has(r.periode)) rows.push(r);
      }
    } else if (cached.type === 'DMP') {
      for (const o of cached.result.outlets) {
        const no = String(o.outletNo || '').trim();
        const nm = String(o.outlet || '').trim();
        const key = no || nm;
        if (!key) continue;
        master.set(key, o);
      }
    }
    if (cached.result.errors) errors.push(...cached.result.errors);
  }

  // Enrich data LBP dengan master DMP
  const masterByName = new Map();
  for (const o of master.values()) if (o.outlet) masterByName.set(o.outlet, o);

  for (const r of rows) {
    const m = (r.outletNo && master.get(r.outletNo))
           || (r.outlet && master.get(r.outlet))
           || (r.outlet && masterByName.get(r.outlet));
    if (!m) continue;
    if ((!r.rayon || r.rayon === '—') && m.rayon && m.rayon !== '—') r.rayon = m.rayon;
    if ((!r.kabupaten || r.kabupaten === '—') && m.kabupaten && m.kabupaten !== '—') r.kabupaten = m.kabupaten;
    if ((!r.kecamatan || r.kecamatan === '—') && m.kecamatan && m.kecamatan !== '—') r.kecamatan = m.kecamatan;
    if ((!r.kelurahan || r.kelurahan === '—') && m.kelurahan && m.kelurahan !== '—') r.kelurahan = m.kelurahan;
    if ((!r.tipe || r.tipe === '—') && m.tipe && m.tipe !== '—') r.tipe = m.tipe;
    if ((!r.channel || r.channel === '—') && m.channel && m.channel !== '—') r.channel = m.channel;
    if ((!r.salesTeam || r.salesTeam === '—') && m.salesTeam && m.salesTeam !== '—') r.salesTeam = m.salesTeam;
  }

  return { rows, master, errors };
}

export function getAllMonths() {
  const months = new Set();
  for (const f of store.state.files) {
    if (f.months) f.months.forEach(m => months.add(m));
  }
  return [...months].sort(); // ascending (oldest → newest)
}

export async function activateMonth(month) {
  const { rows, master, errors } = await collectAllData(new Set([month]));
  store.set({
    rows, outletMaster: master, errors,
    activeMonth: month,
    activeMode: 'month',
    activeRange: null,
  });
  console.log(`[Lazy] 1 bulan (${month}): ${rows.length} baris`);
}

export async function activateRange(monthsArray, label) {
  const { rows, master, errors } = await collectAllData(new Set(monthsArray));
  store.set({
    rows, outletMaster: master, errors,
    activeMonth: monthsArray[monthsArray.length - 1] || null,
    activeMode: 'range',
    activeRange: { months: monthsArray, label },
  });
  console.log(`[Lazy] ${label}: ${rows.length} baris (${monthsArray.length} bulan)`);
}

export async function activateLastNMonths(n) {
  const allMonths = getAllMonths();
  if (!allMonths.length) return;
  await activateRange(allMonths.slice(-n), `${n} Bulan Terakhir`);
}

export async function activateAll() {
  const allMonths = getAllMonths();
  if (!allMonths.length) return;
  await activateRange(allMonths, `Semua Data`);
}