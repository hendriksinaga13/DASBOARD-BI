// js/sync/auth.js
import { supabase } from '../supabase.js';

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}
export async function signOut() { await supabase.auth.signOut(); }
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export function onAuthChange(fn) {
  const { data } = supabase.auth.onAuthStateChange((_e, s) => fn(s?.user || null));
  return () => data.subscription.unsubscribe();
}

export function showLogin(onSuccess) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:#0f172a;font-family:system-ui`;
  el.innerHTML = `
    <form id="lg" style="background:#1e293b;padding:28px;border-radius:12px;width:320px;color:#e2e8f0">
      <h2 style="margin:0 0 16px;font-size:18px">M245 — Login Admin</h2>
      <input id="em" type="email" placeholder="Email" required
        style="width:100%;padding:10px;margin-bottom:10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#fff;box-sizing:border-box"/>
      <input id="pw" type="password" placeholder="Password" required
        style="width:100%;padding:10px;margin-bottom:14px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#fff;box-sizing:border-box"/>
      <button id="btn" type="submit"
        style="width:100%;padding:10px;border-radius:6px;border:0;background:#3b82f6;color:#fff;cursor:pointer;font-weight:600">Masuk</button>
      <div id="err" style="color:#f87171;font-size:12px;margin-top:10px;min-height:16px"></div>
    </form>`;
  document.body.appendChild(el);

  const btn = el.querySelector('#btn');
  const errEl = el.querySelector('#err');

  el.querySelector('#lg').onsubmit = async (e) => {
    e.preventDefault();
    errEl.textContent = ''; btn.disabled = true; btn.textContent = 'Memproses…';
    try {
      const user = await signIn(
        el.querySelector('#em').value.trim(),
        el.querySelector('#pw').value
      );
      el.remove();
      onSuccess?.(user);
    } catch (ex) {
      errEl.textContent = ex.message || 'Login gagal';
      btn.disabled = false; btn.textContent = 'Masuk';
    }
  };
}