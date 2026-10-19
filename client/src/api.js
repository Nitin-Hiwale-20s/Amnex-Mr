const KEY = 'rtmc_token';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = t => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));
const authHeader = () => (getToken() ? { Authorization: 'Bearer ' + getToken() } : {});

export async function api(url, method = 'GET', body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...authHeader() }, body: body ? JSON.stringify(body) : undefined });
  let d = null;
  try { d = await r.json(); } catch { /* empty */ }
  if (r.status === 401 && getToken()) { setToken(null); window.dispatchEvent(new Event('unauth')); }
  if (!r.ok) throw new Error(d?.error || 'Something went wrong');
  return d;
}

export async function download(url) {
  const r = await fetch(url, { headers: authHeader() });
  if (!r.ok) { let d = null; try { d = await r.json(); } catch { /* empty */ } throw new Error(d?.error || 'Download failed'); }
  const name = ((r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/) || [])[1] || 'report';
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

export async function upload(url, formData) {
  const r = await fetch(url, { method: 'POST', headers: authHeader(), body: formData });
  let d = null;
  try { d = await r.json(); } catch { /* empty */ }
  if (r.status === 401 && getToken()) { setToken(null); window.dispatchEvent(new Event('unauth')); }
  if (!r.ok) throw new Error(d?.error || 'Upload failed');
  return d;
}
