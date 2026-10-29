/* Router event terpusat. Satu listener per jenis event, banyak handler. */

const clickRoutes = [];
const changeRoutes = [];
const inputRoutes = [];

export function onClick(selector, fn){ clickRoutes.push({ selector, fn }); }
export function onChange(selector, fn){ changeRoutes.push({ selector, fn }); }
export function onInput(selector, fn){ inputRoutes.push({ selector, fn }); }

function route(routes, event){
  const target = event.target;
  if(!target || !target.closest) return;
  for(const { selector, fn } of routes){
    const el = target.closest(selector);
    if(el){ fn(el, event); return; }
  }
}

export function installEvents(){
  document.addEventListener('click', e => route(clickRoutes, e));
  document.addEventListener('change', e => route(changeRoutes, e));
  document.addEventListener('input', e => route(inputRoutes, e));

  /* Tooltip global — semua elemen dengan [data-tip] */
  const tipEl = document.getElementById('tip');
  document.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-tip]');
    if(!t) return;
    tipEl.textContent = t.getAttribute('data-tip');
    tipEl.classList.add('on');
  });
  document.addEventListener('mousemove', e => {
    if(!tipEl.classList.contains('on')) return;
    let x = e.clientX + 12, y = e.clientY - 38;
    const w = tipEl.offsetWidth;
    if(x + w > window.innerWidth - 8) x = e.clientX - w - 12;
    if(y < 8) y = e.clientY + 12;
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
  });
  document.addEventListener('mouseout', e => {
    if(e.target.closest('[data-tip]')) tipEl.classList.remove('on');
  });
}