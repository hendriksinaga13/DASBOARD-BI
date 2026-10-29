import { store } from './core/store.js';
import { installEvents } from './core/events.js';
import { installFeedback, toast } from './ui/feedback.js';
import { installMultiselect } from './ui/multiselect.js';
import { installFilterBar, renderFilterBar } from './ui/filterbar.js';
import { installTable } from './ui/table.js';
import { getView, listViews } from './views/registry.js';
import { initFilters } from './filters/registry.js';
import { addFile } from './data/loader.js';
import { installDrill } from './plugins/drill.js';
import { installOverviewControls } from './views/overview.js';

import './views/overview.js';
import './views/comparison.js';
import './views/pivot.js';
import './views/salesman.js';
import './views/product.js';
import './views/outlet.js';
import './views/territory.js';
import './views/insight.js';
import './views/target.js';
import './views/data.js';

initFilters(store.state.filters);
installEvents();
installFeedback();
installMultiselect();
installFilterBar();
installTable();
installDrill();
installOverviewControls();

try {
  const raw = localStorage.getItem('m245.targets');
  if(raw) store.state.targets = JSON.parse(raw);
} catch(e){}

function renderNav(){
  const nav = document.getElementById('nav');
  nav.innerHTML = listViews().map(v =>
    `<button class="nav-item${store.state.view === v.id ? ' on' : ''}" data-view="${v.id}">${v.label}</button>`
  ).join('');
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-view]');
  if(!btn) return;
  switchToView(btn.dataset.view);
});

function switchToView(id){
  const view = getView(id);
  if(!view) return;
  store.state.view = id;
  document.getElementById('pageTitle').textContent = view.title || id;
  document.getElementById('pageSub').textContent = view.sub || '';
  const container = document.getElementById('view');
  container.innerHTML = view.shell ? view.shell() : '';
  if(view.mount) view.mount();
  renderNav();
  store.emit();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAll(state){
  renderFilterBar(document.getElementById('filterbar'), state);
  const view = getView(state.view);
  if(view?.update) view.update(document.getElementById('view'), state);
  const chip = document.getElementById('chipMeta');
  if(chip){
    if(!state.rows.length) chip.innerHTML = '<span class="dot"></span><span>Belum ada data</span>';
    else {
      const dates = state.rows.map(r => r.day).sort();
      chip.innerHTML = `<span class="dot"></span><span>${state.rows.length} baris · ${dates[0]} – ${dates[dates.length-1]}</span>`;
    }
  }
}
store.sub(renderAll);

const actionsBtn = document.getElementById('actionsBtn');
if(actionsBtn){
  actionsBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.txt,.csv,.tsv,.dat,text/plain';
    input.onchange = async () => {
      if(!input.files) return;
      for(const file of input.files){
        toast('Memuat ' + file.name + '...');
        try { await addFile(file); }
        catch(err){ toast('Gagal: ' + err.message); }
      }
    };
    input.click();
  });
}

document.getElementById('hamb')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('scrim').classList.add('on');
});
document.getElementById('scrim')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('scrim').classList.remove('on');
});

renderNav();
store.state.view = 'overview';
document.getElementById('pageTitle').textContent = 'Overview';
document.getElementById('pageSub').textContent = 'Ringkasan performa penjualan';
const v = getView('overview');
document.getElementById('view').innerHTML = v.shell();
if(v.mount) v.mount();
store.emit();