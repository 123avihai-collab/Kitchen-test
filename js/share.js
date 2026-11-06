import { store } from './state.js';
import { CONFIG } from './config.js';

// שיתוף תכנון: (1) קישור שהתכנון מקודד בתוכו, (2) שמירה ושליחה ל-Google Drive דרך Apps Script
const BACKUP_KEY = 'kitchen-lab-backup';
const ME_KEY = 'kitchen-lab-sender';

// ---------- קידוד לקישור ----------
const b64url = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = (str) => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };

async function pack(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'undefined') return 'j' + b64url(bytes);
  const cs = new CompressionStream('deflate-raw'); const w = cs.writable.getWriter(); w.write(bytes); w.close();
  return 'z' + b64url(new Uint8Array(await new Response(cs.readable).arrayBuffer()));
}
async function unpack(str) {
  const kind = str[0], bytes = unb64url(str.slice(1));
  if (kind === 'j') return JSON.parse(new TextDecoder().decode(bytes));
  const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); w.write(bytes); w.close();
  return JSON.parse(await new Response(ds.readable).text());
}
const siteUrl = () => location.origin + location.pathname;

function usedAssets(state) {
  const json = JSON.stringify(state); const out = {};
  for (const [id, a] of Object.entries(store.assets)) if (json.includes(`custom:${id}`)) out[id] = a;
  return out;
}

export async function makeLink(name) {
  return `${siteUrl()}#d=${await pack({ n: name || '', s: store.state })}`;
}

// ---------- טעינת תכנון ששותף (בפתיחת האתר) ----------
function backupCurrent() {
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ state: store.state, at: Date.now() })); } catch (e) { /* ignore */ }
}
export function hasBackup() { try { return !!localStorage.getItem(BACKUP_KEY); } catch (e) { return false; } }
export function restoreBackup() {
  const b = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null'); if (!b) return false;
  store.replace(b.state); localStorage.removeItem(BACKUP_KEY); return true;
}

export async function loadFromUrl() {
  const hash = new URLSearchParams(location.hash.slice(1)); const q = new URLSearchParams(location.search);
  let loaded = null;
  try {
    if (hash.get('d')) {
      const o = await unpack(hash.get('d'));
      loaded = { name: o.n, state: o.s, assets: {} };
    } else if (q.get('sub') && CONFIG.SUBMIT_URL) {
      const r = await fetch(`${CONFIG.SUBMIT_URL}?id=${encodeURIComponent(q.get('sub'))}`);
      const o = await r.json(); if (!o.ok) throw new Error(o.error || 'not found');
      loaded = { name: o.name, state: o.state, assets: o.assets || {}, phone: o.phone, note: o.note };
    }
  } catch (e) { console.warn('shared design failed', e); return { error: true }; }
  if (!loaded || !loaded.state || !Array.isArray(loaded.state.wall)) return null;
  backupCurrent();
  if (Object.keys(loaded.assets).length) { Object.assign(store.assets, loaded.assets); store.saveAssets(); }
  store.replace(loaded.state);
  history.replaceState(null, '', siteUrl());
  return loaded;
}

// ---------- שליחה ל-Drive ----------
export async function submit(info, image) {
  const payload = { ...info, state: store.state, assets: usedAssets(store.state), image, site: siteUrl(), at: new Date().toISOString(), ua: navigator.userAgent };
  const r = await fetch(CONFIG.SUBMIT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'שגיאה');
  return j;
}

// ---------- חלון שליחה ----------
export class ShareDialog {
  constructor(app) {
    this.app = app;
    const me = JSON.parse(localStorage.getItem(ME_KEY) || '{}');
    const owner = CONFIG.OWNER_NAME;
    this.el = document.createElement('div'); this.el.id = 'share-dlg'; this.el.className = 'dlg';
    this.el.innerHTML = `
      <div class="card" role="dialog" aria-modal="true" aria-label="שליחת התכנון">
        <button class="x" data-a="close" aria-label="סגירה">✕</button>
        <h2>שליחת התכנון ל${owner}</h2>
        <p class="note">${CONFIG.SUBMIT_URL ? `התכנון נשמר אצל ${owner} יחד עם צילום מסך, ו${owner} יכול/ה לפתוח אותו בכלי.` : 'שלחו את הקישור – מי שפותח אותו רואה בדיוק את התכנון שלכם.'}</p>
        <label class="f">שם${CONFIG.SUBMIT_URL ? ' *' : ''}<input id="sh-name" autocomplete="name" value="${(me.name || '').replace(/"/g, '&quot;')}"></label>
        <label class="f">טלפון<input id="sh-phone" type="tel" autocomplete="tel" inputmode="tel" value="${(me.phone || '').replace(/"/g, '&quot;')}"></label>
        <label class="f">הערה<textarea id="sh-note" rows="2" placeholder="למשל: מעדיף ידיות זהב, צריך מקום למיקסר"></textarea></label>
        ${CONFIG.SUBMIT_URL ? `<button class="btn primary big" data-a="submit">שמור ושלח ל${owner}</button><div class="or"><span>או שיתוף בקישור</span></div>` : ''}
        <div class="row">
          <button class="btn" data-a="wa">וואטסאפ</button>
          <button class="btn" data-a="copy">העתק קישור</button>
          ${navigator.share ? '<button class="btn" data-a="native">שיתוף…</button>' : ''}
        </div>
        <div id="sh-status" class="sh-status"></div>
      </div>`;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) return this.close();
      const a = e.target.closest('[data-a]')?.dataset.a; if (a) this[a]();
    });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.el.classList.contains('open')) this.close(); });
  }
  $(id) { return this.el.querySelector(id); }
  info() {
    const i = { name: this.$('#sh-name').value.trim(), phone: this.$('#sh-phone').value.trim(), note: this.$('#sh-note').value.trim() };
    try { localStorage.setItem(ME_KEY, JSON.stringify({ name: i.name, phone: i.phone })); } catch (e) { /* ignore */ }
    return i;
  }
  status(msg, cls = '') { const s = this.$('#sh-status'); s.textContent = msg; s.className = 'sh-status ' + cls; }
  open() {
    this.el.classList.add('open'); this.status('');
    if (Object.keys(usedAssets(store.state)).length && !CONFIG.SUBMIT_URL) this.status('שימו לב: תמונות שהעליתם לא נכנסות לקישור. לשליחה מלאה – ייצוא קובץ (טאב "קובץ").', 'warn');
  }
  close() { this.el.classList.remove('open'); }
  async linkText() {
    const i = this.info(); const url = await makeLink(i.name);
    const who = i.name ? ` מ${i.name}` : '';
    return { url, text: `תכנון מטבח${who}${i.note ? ` – ${i.note}` : ''}\n${url}` };
  }
  async wa() {
    const { text } = await this.linkText();
    window.open(`https://wa.me/${CONFIG.OWNER_WHATSAPP || ''}?text=${encodeURIComponent(text)}`, '_blank');
  }
  async copy() {
    const { url } = await this.linkText();
    try { await navigator.clipboard.writeText(url); this.status('הקישור הועתק ✓', 'ok'); }
    catch (e) { prompt('העתיקו את הקישור:', url); }
  }
  async native() {
    const { url, text } = await this.linkText();
    try { await navigator.share({ title: 'תכנון מטבח', text, url }); } catch (e) { /* בוטל */ }
  }
  async submit() {
    const i = this.info();
    if (!i.name) { this.status('נא למלא שם', 'err'); this.$('#sh-name').focus(); return; }
    const btn = this.el.querySelector('[data-a=submit]'); btn.disabled = true;
    this.status('שולח…');
    try {
      await submit(i, this.app.captureImage());
      this.status(`נשלח ל${CONFIG.OWNER_NAME} ✓ תודה!`, 'ok');
    } catch (e) {
      console.warn(e); this.status('השליחה נכשלה. נסו שוב או שתפו בקישור.', 'err');
    } finally { btn.disabled = false; }
  }
}

// ---------- באנר "צופה בתכנון ששותף" ----------
export function showSharedBanner(loaded, onRestore) {
  const el = document.createElement('div'); el.id = 'shared-banner';
  const who = loaded.name ? `של ${loaded.name}` : 'ששותף איתך';
  const esc = (t) => String(t).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const extra = [loaded.phone ? `<bdi dir="ltr" style="white-space:nowrap">${esc(loaded.phone)}</bdi>` : '', loaded.note ? esc(loaded.note) : ''].filter(Boolean).join(' • ');
  el.innerHTML = `<span><b></b>${extra ? ` <small>${extra}</small>` : ''}</span>
    <button class="btn small" data-a="keep">השאר</button><button class="btn small" data-a="restore">חזור לתכנון שלי</button>`;
  el.querySelector('b').textContent = `תכנון ${who}`;
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'restore') onRestore();
    el.remove();
  });
  document.body.appendChild(el);
}
