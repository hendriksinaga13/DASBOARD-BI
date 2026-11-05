export function registerServiceWorker(){
  if(!('serviceWorker' in navigator)) return;
  if(location.protocol === 'file:') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./js/pwa/sw.js', { scope: './' })
      .then(reg => console.log('[PWA] SW registered:', reg.scope))
      .catch(err => console.warn('[PWA] SW register failed:', err));
  });
}

function isIOS(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function isStandalone(){
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

export function installPWAInstallPrompt(){
  if(isStandalone()) return;
  if(window.innerWidth > 768) return;

  if(isIOS()){
    setTimeout(showIOSHint, 6000);
    return;
  }

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showAndroidInstallBtn(() => deferredPrompt);
  });
}

function showAndroidInstallBtn(getPrompt){
  if(document.getElementById('pwa-install-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'pwa-install-btn';
  btn.className = 'pwa-install-btn';
  btn.innerHTML = '<span>📲</span> Install Aplikasi';
  btn.onclick = async () => {
    const prompt = getPrompt();
    if(!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if(outcome === 'accepted') btn.remove();
  };
  document.body.appendChild(btn);
}

function showIOSHint(){
  if(document.getElementById('pwa-hint-ios')) return;
  if(sessionStorage.getItem('pwa-hint-dismissed')) return;

  const hint = document.createElement('div');
  hint.id = 'pwa-hint-ios';
  hint.className = 'pwa-hint';
  hint.innerHTML = `
    <span class="pwa-hint-ico">📲</span>
    <span style="flex:1">
      Install M245 SI: ketuk <b>Share</b> <span style="opacity:.7">􀈂</span> → <b>Add to Home Screen</b>
    </span>
    <button type="button">Tutup</button>
  `;
  hint.querySelector('button').onclick = () => {
    sessionStorage.setItem('pwa-hint-dismissed', '1');
    hint.remove();
  };
  document.body.appendChild(hint);
}