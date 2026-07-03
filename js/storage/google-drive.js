// -----------------------------------------------------------------------
// storage/google-drive.js — sync a workspace snapshot to Google Drive from
// the browser, using Google Identity Services' "token model" instead of a
// classic OAuth redirect. Google requires a client secret for the
// authorization-code flow even with PKCE on "Web application" clients (only
// native/installed app types are truly secret-free), so — unlike Dropbox —
// a redirect exchange would force users to paste a secret into a static
// site. The token model sidesteps that entirely: no secret, ever, just an
// OAuth Client ID. The trade-off is a short-lived (1hr) access token instead
// of a refresh token; we silently re-request one (prompt:'') whenever it's
// stale, which succeeds without any UI as long as the browser still has an
// active Google session and the user already granted consent. If that
// silent path fails (session gone, third-party cookies blocked, etc.) we
// drop to 'needs-permission' and surface a Reconnect button, same shape as
// local-folder.js's permission story.
//
// Scope is drive.file only — Relay only ever sees the one file it creates,
// never the rest of the user's Drive. See storage/index.js for the shared
// adapter contract (connect/reconnect/disconnect/autostart/state/'synced').
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { Sync } from '../sync.js';

const FILE_NAME = 'relay-workspace.json';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const WRITE_DEBOUNCE_MS = 1200;
const CFG_KEY = 'relay.gdrive.config'; // { clientId, fileId }
const LAST_KEY = 'relay.gdrive.last';

class Emitter{
  constructor(){ this._l={}; }
  on(ev,fn){ (this._l[ev]||=[]).push(fn); return ()=>{this._l[ev]=this._l[ev].filter(f=>f!==fn)}; }
  emit(ev,...a){ (this._l[ev]||[]).forEach(f=>{try{f(...a)}catch(e){console.error(e)}}); }
}

export const GoogleDrive = new (class extends Emitter{
  constructor(){
    super();
    this.id = 'google-drive';
    this.label = 'Google Drive';
    // off | needs-permission | connected | error | unsupported
    this.state = 'off';
    this.cfg = null;
    try{ const raw = localStorage.getItem(CFG_KEY); if(raw) this.cfg = JSON.parse(raw); }catch{}
    this.lastSync = Number(localStorage.getItem(LAST_KEY)) || null;
    this._writeTimer = null;
    this._writing = false;
    this._token = null;
    this._tokenExpiresAt = 0;
    this._gisPromise = null;

    Store.on('change', (c)=>{ if(c.origin==='local' && this.state==='connected') this._scheduleWrite(); });
  }

  isSupported(){ return typeof fetch!=='undefined'; }

  // called once at boot — resumes silently if a session + prior consent are
  // still around; otherwise waits for the user to hit "Reconnect".
  async autostart(){
    if(!this.isSupported()){ this._set('unsupported'); return; }
    if(!this.cfg || !this.cfg.clientId) return;
    const token = await this._ensureToken(false);
    if(token) await this._afterConnect();
  }

  // first-time, interactive connect — requires a user gesture (click).
  async connect(clientId){
    if(!this.isSupported()){ Sync._warn('Google Drive sync needs a modern browser'); return false; }
    clientId = (clientId||'').trim();
    if(!clientId){ Sync._warn('Google OAuth Client ID is required'); return false; }
    this.cfg = { clientId, fileId: (this.cfg&&this.cfg.clientId===clientId&&this.cfg.fileId)||null };
    this._persist();
    const token = await this._ensureToken(true);
    if(!token) return false;
    return await this._afterConnect();
  }

  // re-grant after a reload (requestAccessToken needs a real click for the
  // interactive path, so this must be called from a button handler).
  async reconnect(){
    if(!this.cfg || !this.cfg.clientId) return false;
    const token = await this._ensureToken(true);
    if(!token) return false;
    return await this._afterConnect();
  }

  disconnect(){
    const token = this._token;
    this.cfg = null;
    try{ localStorage.removeItem(CFG_KEY); localStorage.removeItem(LAST_KEY); }catch{}
    clearTimeout(this._writeTimer);
    this._token = null; this._tokenExpiresAt = 0;
    this.lastSync = null;
    this._set('off');
    Sync._conn('Disconnected Google Drive sync');
    if(token) fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method:'POST' }).catch(()=>{});
  }

  _persist(){ try{ localStorage.setItem(CFG_KEY, JSON.stringify(this.cfg)); }catch{} }

  _loadGis(){
    if(window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
    if(this._gisPromise) return this._gisPromise;
    return this._gisPromise = new Promise((resolve,reject)=>{
      const s=document.createElement('script'); s.src=GIS_SRC; s.async=true; s.defer=true;
      s.onload=()=>resolve(); s.onerror=()=>reject(new Error('failed to load Google Identity Services'));
      document.head.appendChild(s);
    });
  }

  // interactive=false attempts a silent (prompt:'') renewal; on failure it
  // sets 'needs-permission' and returns null instead of throwing, since a
  // cold silent failure is expected/routine, not an error to surface loudly.
  async _ensureToken(interactive){
    if(!interactive && this._token && Date.now() < this._tokenExpiresAt - 60000) return this._token;
    try{
      await this._loadGis();
      const resp = await new Promise((resolve,reject)=>{
        const client = google.accounts.oauth2.initTokenClient({
          client_id: this.cfg.clientId,
          scope: SCOPE,
          callback: (r)=>{ if(r && r.error) reject(new Error(r.error)); else resolve(r); },
          error_callback: (e)=>{ reject(new Error((e&&e.type)||'authorization failed')); },
        });
        client.requestAccessToken(interactive ? {} : { prompt:'' });
      });
      this._token = resp.access_token;
      this._tokenExpiresAt = Date.now() + (resp.expires_in||3600)*1000;
      return this._token;
    }catch(e){
      if(interactive){ Sync._err('Google Drive connect failed: '+e.message); this._set('error'); }
      else this._set('needs-permission');
      return null;
    }
  }

  async _findOrCreateFile(token){
    const q = `name='${FILE_NAME}' and trashed=false`;
    const res = await fetch(`${FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`,
      { headers:{ Authorization:`Bearer ${token}` } });
    if(!res.ok) throw new Error(`list ${res.status}`);
    const data = await res.json();
    if(data.files && data.files.length) return data.files[0].id;
    const created = await fetch(FILES_URL, { method:'POST',
      headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ name:FILE_NAME }) });
    if(!created.ok) throw new Error(`create ${created.status}`);
    return (await created.json()).id;
  }

  async _afterConnect(){
    try{
      const token = this._token;
      if(!this.cfg.fileId){ this.cfg.fileId = await this._findOrCreateFile(token); this._persist(); }
      const res = await fetch(`${FILES_URL}/${this.cfg.fileId}?alt=media`, { headers:{ Authorization:`Bearer ${token}` } });
      if(res.status===200){
        const text = await res.text();
        if(text && text.trim()){ Store.import(text,{merge:true}); Sync._sync('Loaded snapshot from Google Drive'); }
      }else if(res.status===404){
        this.cfg.fileId = null; this._persist();
      }else{
        throw new Error(`download ${res.status}`);
      }
      this._set('connected');
      Sync._conn('Connected to Google Drive');
      await this._write();
      return true;
    }catch(e){
      Sync._err('Google Drive connect failed: '+e.message);
      this._set('error');
      return false;
    }
  }

  _scheduleWrite(){
    clearTimeout(this._writeTimer);
    this._writeTimer = setTimeout(()=>this._write(), WRITE_DEBOUNCE_MS);
  }
  async _write(){
    if(!this.cfg || this._writing) return;
    this._writing = true;
    try{
      const token = await this._ensureToken(false);
      if(!token) return; // needs-permission — next successful reconnect will flush current state
      if(!this.cfg.fileId){ this.cfg.fileId = await this._findOrCreateFile(token); this._persist(); }
      const res = await fetch(`${UPLOAD_URL}/${this.cfg.fileId}?uploadType=media`, { method:'PATCH',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body: Store.export() });
      if(!res.ok) throw new Error(`upload ${res.status}`);
      this.lastSync = Date.now();
      try{ localStorage.setItem(LAST_KEY, String(this.lastSync)); }catch{}
      this.emit('synced', this.lastSync);
    }catch(e){
      Sync._err('Google Drive write failed: '+e.message);
      this._set('error');
    }finally{ this._writing = false; }
  }

  _set(s){ this.state = s; this.emit('state', s); }
})();
