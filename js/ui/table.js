import { esc } from '../core/utils.js';
import { store } from '../core/store.js';
import { onClick } from '../core/events.js';
let installed = false;
export function installTable(){
  if(installed) return;
  installed = true;
  onClick('th[data-sort]', (th) => {
    const scope = th.dataset.scope;
    const key = th.dataset.sort;
    const cur = store.state.sort[scope];
    if(cur && cur.key === key) cur.dir *= -1;
    else store.state.sort[scope] = { key, dir: -1 };
    store.emit();
  });
}
export function sortableTable({ columns, rows, scope, empty = 'Tidak ada data' }){
  const s = store.state.sort[scope];
  const sorted = s
    ? rows.slice().sort((a, b) => {
        const va = a[s.key], vb = b[s.key];
        if(typeof va === 'string') return String(va).localeCompare(String(vb), 'id') * s.dir;
        const na = (va == null || !isFinite(va)) ? -Infinity : va;
        const nb = (vb == null || !isFinite(vb)) ? -Infinity : vb;
        return (na - nb) * s.dir;
      })
    : rows;
  if(!sorted.length) return `<div class="empty" style="padding:24px">${esc(empty)}</div>`;
  const head = columns.map(c => {
    const on = s && s.key === c.key;
    const arrow = on ? (s.dir < 0 ? '↓' : '↑') : '↕';
    const cls = c.align === 'num' ? 'num' : '';
    return `<th class="sortable${on?' sorted':''} ${cls}" data-sort="${c.key}" data-scope="${scope}">
      ${esc(c.label)}<span class="sortind">${arrow}</span>
    </th>`;
  }).join('');
  const body = sorted.map(row => '<tr>' + columns.map(c => {
    const cls = c.align === 'num' ? 'num' : '';
    const content = c.render ? c.render(row) : esc(row[c.key]);
    return `<td class="${cls}">${content}</td>`;
  }).join('') + '</tr>').join('');
  return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}