// -----------------------------------------------------------------------
// storage/s3.js — sync a workspace snapshot to any S3-compatible bucket
// (Cloudflare R2, Backblaze B2, AWS S3, MinIO...) straight from the browser,
// signed with AWS SigV4 over Web Crypto — no SDK, no server.
//
// On connect: GET the object (404 means "nothing there yet") and merge it in
// via Store.import(...,{merge:true}) — same LWW convergence as peer sync. On
// every local change: debounce, then PUT a fresh snapshot (Store.export()).
// This is the second adapter for the contract described in storage/index.js.
//
// Credentials (endpoint/bucket/key id/secret) live in localStorage and are
// used only to sign requests made directly from this browser to the bucket —
// see docs/sync-providers.md for the "use a scoped key" caveat.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { Sync } from '../sync.js';

const FILE_NAME = 'relay-workspace.json';
const WRITE_DEBOUNCE_MS = 1200;
const CFG_KEY = 'relay.s3.config';
const LAST_KEY = 'relay.s3.last';

const enc = new TextEncoder();
function toHex(buf){ return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function sha256Hex(data){ return toHex(await crypto.subtle.digest('SHA-256', typeof data==='string'?enc.encode(data):data)); }
async function hmacRaw(keyBytes, msg){
  const key = await crypto.subtle.importKey('raw', keyBytes, {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, typeof msg==='string'?enc.encode(msg):msg));
}
function amzStamp(d = new Date()){
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g,'');
  return { amzDate: iso, dateStamp: iso.slice(0,8) };
}

// AWS SigV4 for a single-object GET/PUT (path-style, no query string).
async function signRequest({ method, url, region, accessKeyId, secretAccessKey, payload }){
  const u = new URL(url);
  const { amzDate, dateStamp } = amzStamp();
  const payloadHash = await sha256Hex(payload || '');
  const canonicalHeaders = `host:${u.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, u.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');
  let key = enc.encode('AWS4'+secretAccessKey);
  for(const part of [dateStamp, region, 's3', 'aws4_request']) key = await hmacRaw(key, part);
  const signature = toHex(await hmacRaw(key, stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { 'x-amz-date':amzDate, 'x-amz-content-sha256':payloadHash, 'Authorization':authorization };
}

class Emitter{
  constructor(){ this._l={}; }
  on(ev,fn){ (this._l[ev]||=[]).push(fn); return ()=>{this._l[ev]=this._l[ev].filter(f=>f!==fn)}; }
  emit(ev,...a){ (this._l[ev]||[]).forEach(f=>{try{f(...a)}catch(e){console.error(e)}}); }
}

export const S3Sync = new (class extends Emitter{
  constructor(){
    super();
    this.id = 's3';
    this.label = 'S3-compatible';
    // off | connected | error | unsupported
    this.state = 'off';
    this.cfg = null;
    try{ const raw = localStorage.getItem(CFG_KEY); if(raw) this.cfg = JSON.parse(raw); }catch{}
    this.lastSync = Number(localStorage.getItem(LAST_KEY)) || null;
    this._writeTimer = null;
    this._writing = false;

    Store.on('change', (c)=>{ if(c.origin==='local' && this.state==='connected') this._scheduleWrite(); });
  }

  isSupported(){ return typeof crypto!=='undefined' && !!crypto.subtle; }

  // called once at boot — resumes silently if credentials were saved
  async autostart(){
    if(!this.isSupported()){ this._set('unsupported'); return; }
    if(this.cfg) await this._afterConnect();
  }

  // cfg: {endpoint,bucket,accessKeyId,secretAccessKey,region?,prefix?}
  async connect(cfg){
    if(!this.isSupported()){ Sync._warn('S3 sync needs a modern browser (Web Crypto)'); return false; }
    if(!cfg || !cfg.endpoint || !cfg.bucket || !cfg.accessKeyId || !cfg.secretAccessKey){
      Sync._warn('Endpoint, bucket, access key and secret are all required'); return false;
    }
    this.cfg = { region:'auto', prefix:'', ...cfg, endpoint: cfg.endpoint.trim().replace(/\/+$/,'') };
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
    Sync._conn('Disconnected S3 sync');
  }

  _objectUrl(){
    const { endpoint, bucket, prefix } = this.cfg;
    const key = (prefix||'').replace(/^\/+|\/+$/g,'');
    const path = [bucket, ...(key?key.split('/'):[]), FILE_NAME].map(encodeURIComponent).join('/');
    return `${endpoint}/${path}`;
  }

  async _sign(method, payload){
    const { region, accessKeyId, secretAccessKey } = this.cfg;
    return signRequest({ method, url:this._objectUrl(), region, accessKeyId, secretAccessKey, payload });
  }

  async _afterConnect(){
    try{
      const headers = await this._sign('GET', '');
      const res = await fetch(this._objectUrl(), { method:'GET', headers });
      if(res.status===200){
        const text = await res.text();
        if(text && text.trim()){ Store.import(text,{merge:true}); Sync._sync(`Loaded snapshot from bucket "${this.cfg.bucket}"`); }
      }else if(res.status!==404){
        throw new Error(`GET ${res.status}`);
      }
      this._set('connected');
      Sync._conn(`Connected to S3 bucket "${this.cfg.bucket}"`);
      await this._write();
      return true;
    }catch(e){
      Sync._err('S3 connect failed: '+e.message);
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
      const headers = await this._sign('PUT', body);
      const res = await fetch(this._objectUrl(), { method:'PUT', headers, body });
      if(!res.ok) throw new Error(`PUT ${res.status}`);
      this.lastSync = Date.now();
      try{ localStorage.setItem(LAST_KEY, String(this.lastSync)); }catch{}
      this.emit('synced', this.lastSync);
    }catch(e){
      Sync._err('S3 write failed: '+e.message);
      this._set('error');
    }finally{ this._writing = false; }
  }

  _set(s){ if(this.state===s) return; this.state = s; this.emit('state', s); }
})();
