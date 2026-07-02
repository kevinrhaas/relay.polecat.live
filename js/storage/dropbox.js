// -----------------------------------------------------------------------
// storage/dropbox.js — sync a workspace snapshot to Dropbox straight from
// the browser via OAuth 2.0 + PKCE (no client secret, no server). This is
// the fourth adapter for the contract described in storage/index.js, and
// the first that authenticates by redirect instead of a pasted key.
//
// Flow: connect() sends the browser to Dropbox's consent screen with a PKCE
// challenge; Dropbox redirects back to this same page with ?code=&state=;
// autostart() (run at boot) notices those params, exchanges the code for an
// access + refresh token pair, and stores them in localStorage. From then on
// it behaves like the other adapters: GET-merge on connect (Store.import
// with {merge:true}), debounced PUT-overwrite on every local change
// (Store.export()) — same LWW convergence as peer sync.
//
// The "App key" (OAuth client id) is entered by the user in Settings — see
// docs/sync-providers.md for how to create a Dropbox app and register the
// redirect URI. No client secret is ever needed (PKCE is for public clients).
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { Sync } from '../sync.js';

const FILE_PATH = '/relay-workspace.json';
const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const DOWNLOAD_URL = 'https://content.dropboxapi.com/2/files/download';
const UPLOAD_URL = 'https://content.dropboxapi.com/2/files/upload';
const ACCOUNT_URL = 'https://api.dropboxapi.com/2/users/get_current_account';
const WRITE_DEBOUNCE_MS = 1200;
const CFG_KEY = 'relay.dropbox.config';
const LAST_KEY = 'relay.dropbox.last';
const PKCE_KEY = 'relay.dropbox.pkce'; // sessionStorage — lives only across the redirect

const enc = new TextEncoder();
function b64url(bytesOrBuf){
  const bytes = bytesOrBuf instanceof ArrayBuffer ? new Uint8Array(bytesOrBuf) : bytesOrBuf;
  let s=''; for(const b of bytes) s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function randToken(len){ return b64url(crypto.getRandomValues(new Uint8Array(len))); }
async function pkceChallenge(verifier){ return b64url(await crypto.subtle.digest('SHA-256', enc.encode(verifier))); }

class Emitter{
  constructor(){ this._l={}; }
  on(ev,fn){ (this._l[ev]||=[]).push(fn); return ()=>{this._l[ev]=this._l[ev].filter(f=>f!==fn)}; }
  emit(ev,...a){ (this._l[ev]||[]).forEach(f=>{try{f(...a)}catch(e){console.error(e)}}); }
}

export const Dropbox = new (class extends Emitter{
  constructor(){
    super();
    this.id = 'dropbox';
    this.label = 'Dropbox';
    // off | connected | error | unsupported
    this.state = 'off';
    this.cfg = null;
    try{ const raw = localStorage.getItem(CFG_KEY); if(raw) this.cfg = JSON.parse(raw); }catch{}
    this.lastSync = Number(localStorage.getItem(LAST_KEY)) || null;
    this._writeTimer = null;
    this._writing = false;

    Store.on('change', (c)=>{ if(c.origin==='local' && this.state==='connected') this._scheduleWrite(); });
  }

  isSupported(){ return typeof crypto!=='undefined' && !!crypto.subtle && typeof fetch!=='undefined'; }

  // called once at boot — completes a pending OAuth redirect, or silently
  // resumes with a saved refresh token
  async autostart(){
    if(!this.isSupported()){ this._set('unsupported'); return; }
    const handledRedirect = await this._handleRedirect();
    if(handledRedirect) return;
    if(this.cfg && this.cfg.refreshToken) await this._afterConnect();
  }

  // starts the OAuth redirect — the page navigates away, so there is no
  // meaningful return value; completion happens in autostart() on return
  async connect(appKey){
    if(!this.isSupported()){ Sync._warn('Dropbox sync needs a modern browser'); return false; }
    appKey = (appKey||'').trim();
    if(!appKey){ Sync._warn('Dropbox app key is required'); return false; }
    const verifier = randToken(64);
    const state = randToken(16);
    const redirectUri = location.origin + location.pathname;
    try{ sessionStorage.setItem(PKCE_KEY, JSON.stringify({ appKey, verifier, state, redirectUri })); }catch{}
    const url = new URL(AUTH_URL);
    url.searchParams.set('client_id', appKey);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('code_challenge', await pkceChallenge(verifier));
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('token_access_type', 'offline');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    this._navigate(url.toString());
    return true;
  }

  // separated out so tests can stub navigation without leaving the page
  _navigate(url){ location.assign(url); }

  reconnect(){ return this._afterConnect(); }

  disconnect(){
    const token = this.cfg && this.cfg.accessToken;
    this.cfg = null;
    try{ localStorage.removeItem(CFG_KEY); localStorage.removeItem(LAST_KEY); }catch{}
    clearTimeout(this._writeTimer);
    this.lastSync = null;
    this._set('off');
    Sync._conn('Disconnected Dropbox sync');
    if(token){
      fetch('https://api.dropboxapi.com/2/auth/token/revoke', { method:'POST', headers:{ Authorization:`Bearer ${token}` } }).catch(()=>{});
    }
  }

  // exchanges ?code=&state= for tokens if present; always strips them from
  // the URL. Returns true if a callback was present (handled or not).
  async _handleRedirect(){
    const params = new URLSearchParams(location.search);
    const code = params.get('code'), state = params.get('state');
    if(!code || !state) return false;
    params.delete('code'); params.delete('state');
    history.replaceState(null, '', location.pathname + (params.toString()?`?${params}`:'') + location.hash);
    let saved=null;
    try{ saved = JSON.parse(sessionStorage.getItem(PKCE_KEY)||'null'); }catch{}
    try{ sessionStorage.removeItem(PKCE_KEY); }catch{}
    if(!saved || saved.state!==state){ Sync._err('Dropbox authorization did not match — try connecting again'); this._set('error'); return true; }
    try{
      const body = new URLSearchParams({ code, grant_type:'authorization_code', client_id:saved.appKey,
        code_verifier:saved.verifier, redirect_uri:saved.redirectUri });
      const res = await fetch(TOKEN_URL, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
      if(!res.ok) throw new Error(`token ${res.status}`);
      const data = await res.json();
      this.cfg = { appKey:saved.appKey, refreshToken:data.refresh_token, accessToken:data.access_token,
        expiresAt: Date.now() + data.expires_in*1000, email:'' };
      this.cfg.email = await this._fetchEmail(this.cfg.accessToken);
      try{ localStorage.setItem(CFG_KEY, JSON.stringify(this.cfg)); }catch{}
      await this._afterConnect();
    }catch(e){
      Sync._err('Dropbox connect failed: '+e.message);
      this._set('error');
    }
    return true;
  }

  async _fetchEmail(token){
    try{
      const res = await fetch(ACCOUNT_URL, { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body:'null' });
      if(res.ok){ const data = await res.json(); return data.email || (data.name&&data.name.display_name) || ''; }
    }catch{}
    return '';
  }

  // refreshes the access token if it's missing or near expiry
  async _ensureToken(){
    if(this.cfg.accessToken && Date.now() < this.cfg.expiresAt - 60000) return this.cfg.accessToken;
    const body = new URLSearchParams({ grant_type:'refresh_token', refresh_token:this.cfg.refreshToken, client_id:this.cfg.appKey });
    const res = await fetch(TOKEN_URL, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
    if(!res.ok) throw new Error(`refresh ${res.status}`);
    const data = await res.json();
    this.cfg.accessToken = data.access_token;
    this.cfg.expiresAt = Date.now() + data.expires_in*1000;
    try{ localStorage.setItem(CFG_KEY, JSON.stringify(this.cfg)); }catch{}
    return this.cfg.accessToken;
  }

  async _afterConnect(){
    try{
      const token = await this._ensureToken();
      const res = await fetch(DOWNLOAD_URL, { method:'POST',
        headers:{ Authorization:`Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path:FILE_PATH }) } });
      if(res.status===200){
        const text = await res.text();
        if(text && text.trim()){ Store.import(text,{merge:true}); Sync._sync('Loaded snapshot from Dropbox'); }
      }else if(res.status!==409){ // 409 == path/not_found, i.e. nothing there yet
        throw new Error(`download ${res.status}`);
      }
      this._set('connected');
      Sync._conn(`Connected to Dropbox${this.cfg.email?` as ${this.cfg.email}`:''}`);
      await this._write();
      return true;
    }catch(e){
      Sync._err('Dropbox connect failed: '+e.message);
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
      const token = await this._ensureToken();
      const body = Store.export();
      const res = await fetch(UPLOAD_URL, { method:'POST',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({ path:FILE_PATH, mode:'overwrite', mute:true }) },
        body });
      if(!res.ok) throw new Error(`upload ${res.status}`);
      this.lastSync = Date.now();
      try{ localStorage.setItem(LAST_KEY, String(this.lastSync)); }catch{}
      this.emit('synced', this.lastSync);
    }catch(e){
      Sync._err('Dropbox write failed: '+e.message);
      this._set('error');
    }finally{ this._writing = false; }
  }

  _set(s){ this.state = s; this.emit('state', s); }
})();
