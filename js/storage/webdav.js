// -----------------------------------------------------------------------
// storage/webdav.js — sync a workspace snapshot to any WebDAV server
// (Nextcloud, ownCloud, generic WebDAV host) straight from the browser,
// authenticated with HTTP Basic auth — no SDK, no server.
//
// On connect: GET the file (404 means "nothing there yet") and merge it in
// via Store.import(...,{merge:true}) — same LWW convergence as peer sync. On
// every local change: debounce, then PUT a fresh snapshot (Store.export()).
// This is the third adapter for the contract described in storage/index.js.
//
// Credentials (URL/username/password) live in localStorage and are used only
// to authenticate requests made directly from this browser to the server —
// see docs/sync-providers.md for the client-side-credentials caveat (use an
// app password, not your main account password).
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { Sync } from '../sync.js';

const FILE_NAME = 'relay-workspace.json';
const WRITE_DEBOUNCE_MS = 1200;
const CFG_KEY = 'relay.webdav.config';
const LAST_KEY = 'relay.webdav.last';

function basicAuth(username, password){
  return 'Basic ' + btoa(unescape(encodeURIComponent(`${username}:${password}`)));
}

class Emitter{
  constructor(){ this._l={}; }
  on(ev,fn){ (this._l[ev]||=[]).push(fn); return ()=>{this._l[ev]=this._l[ev].filter(f=>f!==fn)}; }
  emit(ev,...a){ (this._l[ev]||[]).forEach(f=>{try{f(...a)}catch(e){console.error(e)}}); }
}

export const WebDAVSync = new (class extends Emitter{
  constructor(){
    super();
    this.id = 'webdav';
    this.label = 'WebDAV';
    // off | connected | error | unsupported
    this.state = 'off';
    this.cfg = null;
    try{ const raw = localStorage.getItem(CFG_KEY); if(raw) this.cfg = JSON.parse(raw); }catch{}
    this.lastSync = Number(localStorage.getItem(LAST_KEY)) || null;
    this._writeTimer = null;
    this._writing = false;

    Store.on('change', (c)=>{ if(c.origin==='local' && this.state==='connected') this._scheduleWrite(); });
  }

  isSupported(){ return typeof fetch!=='undefined'; }

  // called once at boot — resumes silently if credentials were saved
  async autostart(){
    if(!this.isSupported()){ this._set('unsupported'); return; }
    if(this.cfg) await this._afterConnect();
  }

  // cfg: {url,username,password}
  async connect(cfg){
    if(!this.isSupported()){ Sync._warn('WebDAV sync needs a modern browser'); return false; }
    if(!cfg || !cfg.url || !cfg.username || !cfg.password){
      Sync._warn('Server URL, username and password are all required'); return false;
    }
    this.cfg = { ...cfg, url: cfg.url.trim().replace(/\/+$/,'') };
    try{ localStorage.setItem(CFG_KEY, JSON.stringify(this.cfg)); }catch{}
    return this._afterConnect();
  }

  reconnect(){ return this._afterConnect(); }

  disconnect(){
    this.cfg = null;
    try{ localStorage.removeItem(CFG_KEY); localStorage.removeItem(LAST_KEY); }catch{}
    clearTimeout(this._writeTimer);
    this.lastSync = null;
    this._set('off');
    Sync._conn('Disconnected WebDAV sync');
  }

  _fileUrl(){ return `${this.cfg.url}/${FILE_NAME}`; }
  _headers(extra){ return { Authorization: basicAuth(this.cfg.username, this.cfg.password), ...extra }; }

  async _afterConnect(){
    try{
      const res = await fetch(this._fileUrl(), { method:'GET', headers:this._headers() });
      if(res.status===200){
        const text = await res.text();
        if(text && text.trim()){ Store.import(text,{merge:true}); Sync._sync(`Loaded snapshot from WebDAV`); }
      }else if(res.status!==404){
        throw new Error(`GET ${res.status}`);
      }
      this._set('connected');
      Sync._conn(`Connected to WebDAV server`);
      await this._write();
      return true;
    }catch(e){
      Sync._err('WebDAV connect failed: '+e.message);
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
      const body = Store.export();
      const res = await fetch(this._fileUrl(), { method:'PUT', headers:this._headers({'Content-Type':'application/json'}), body });
      if(!res.ok) throw new Error(`PUT ${res.status}`);
      this.lastSync = Date.now();
      try{ localStorage.setItem(LAST_KEY, String(this.lastSync)); }catch{}
      this.emit('synced', this.lastSync);
    }catch(e){
      Sync._err('WebDAV write failed: '+e.message);
      this._set('error');
    }finally{ this._writing = false; }
  }

  _set(s){ this.state = s; this.emit('state', s); }
})();
