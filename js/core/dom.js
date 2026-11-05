export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export function patchText(sel, text){
  const el = typeof sel === 'string' ? $(sel) : sel;
  if(!el) return;
  const s = String(text == null ? '' : text);
  if(el.textContent !== s) el.textContent = s;
}
export function patchHTML(sel, html){
  const el = typeof sel === 'string' ? $(sel) : sel;
  if(!el) return;
  const s = String(html == null ? '' : html);
  if(el._html !== s){ el.innerHTML = s; el._html = s; }
}
export function mount(container, html){
  if(typeof container === 'string') container = $(container);
  if(!container) return;
  container.innerHTML = html;
  container._html = html;
}