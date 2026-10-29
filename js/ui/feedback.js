let toastTimer = null;
export function toast(msg){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2800);
}
export function openModal(html){
  const scrim = document.getElementById('modalScrim');
  const modal = document.getElementById('modal');
  modal.innerHTML = html;
  scrim.classList.add('on');
  const x = modal.querySelector('.x');
  if(x) x.addEventListener('click', closeModal);
}
export function closeModal(){
  const scrim = document.getElementById('modalScrim');
  const modal = document.getElementById('modal');
  scrim.classList.remove('on');
  modal.innerHTML = '';
}
export function installFeedback(){
  const scrim = document.getElementById('modalScrim');
  if(scrim) scrim.addEventListener('click', e => { if(e.target.id === 'modalScrim') closeModal(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') closeModal(); });
}