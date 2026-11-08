export function safeDiv(a, b) { return b === 0 ? 0 : a / b; }
export function getDaysBetween(d1, d2) { return Math.max(1, Math.round((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24))); }
export function sumOmset(rows) {
  return rows.reduce((s, r) => s + (r.tt === 'F' ? r.amount : -r.amount), 0);
}
export function groupSum(rows, keyFn) {
  const map = new Map();
  rows.forEach(r => {
    const k = keyFn(r) || '—';
    map.set(k, (map.get(k) || 0) + (r.tt === 'F' ? r.amount : -r.amount));
  });
  return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a,b) => b.value - a.value);
}