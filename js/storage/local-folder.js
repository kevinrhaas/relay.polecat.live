// -----------------------------------------------------------------------
// storage/local-folder.js — sync a workspace snapshot to a local folder via
// the File System Access API. No credentials: the user grants Relay
// read/write on one folder they picked (often one their Dropbox / Google
// Drive / iCloud desktop app already syncs, for free cloud backup).
//
// On connect: read relay-workspace.json from the folder (if present) and
// merge it in via Store.import(...,{merge:true}) — same LWW convergence as
// peer sync. On every local change: debounce, then write a fresh snapshot
// (Store.export()) back to the folder. This is the reference implementation
// for the adapter contract described in storage/index.js.
// -----------------------------------------------------------------------
import { Store } from '../store.js';
import { Sync } from '../sync.js';

const FILE_NAME = 'relay-workspace.json';
const WRITE_DEBOUNCE_MS = 1200;
const NAME_KEY = 'relay.fsa.name';
const LAST_KEY = 'relay.fsa.last';
const IDB_NAME = 'relay-fsa';
const IDB_STORE = 'handles';
const IDB_KEY = 'folder';

function idbOpen(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = ()=>req.result.createObjectStore(IDB_STORE);
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}
async function idbGet(key){
  const db = await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_STORE,'readonly');
    const r=tx.objectStore(IDB_STORE).get(key);
    r.onsuccess=()=>resolve(r.result||null); r.onerror=()=>reject(r.error);
  });
}
async function idbSet(key,val){
  const db = await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).put(val,key);
    tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);
  });
}
async function idbDel(key){
  const db = await idbOpen();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);
  });
}

class Emitter{
  constructor(){ this._l={}; }
  on(ev,fn){ (this._l[ev]||=[]).push(fn); return ()=>{this._l[ev]=this._l[ev].filter(f=>f!==fn)}; }
  emit(ev,...a){ (this._l[ev]||[]).forEach(f=>{try{f(...a)}catch(e){console.error(e)}}); }
}

export const LocalFolder = new (class extends Emitter{
  constructor(){
    super();
    this.id = 'local-folder';
    this.label = 'Local folder';
    // off | needs-permission | connected | error | unsupported
    this.state = 'off';
    this.dirHandle = null;
    this.folderName = localStorage.getItem(NAME_KEY) || '';
    this.lastSync = Number(localStorage.getItem(LAST_KEY)) || null;
    this._writeTimer = null;
    this._writing = false;

    // reflect every local mutation to the folder, debounced
    Store.on('change', (c)=>{ if(c.origin==='local' && this.state==='connected') this._scheduleWrite(); });
  }

  isSupported(){ return 'showDirectoryPicker' in window; }

  // called once at boot — silently resumes if the browser still remembers
  // the permission grant; otherwise waits for the user to hit "Reconnect"
  // (requestPermission() needs a real click, queryPermission() doesn't).
  async autostart(){
    if(!this.isSupported()){ this._set('unsupported'); return; }
    let handle;
    try{ handle = await idbGet(IDB_KEY); }catch{ handle = null; }
    if(!handle) return;
    this.dirHandle = handle;
    let perm;
    try{ perm = await handle.queryPermission({mode:'readwrite'}); }catch{ perm='denied'; }
    if(perm==='granted') await this._afterConnect();
    else this._set('needs-permission');
  }

  async connect(){
    if(!this.isSupported()){ Sync._warn('Local folder sync needs a Chromium browser (Chrome / Edge)'); return false; }
    let handle;
    try{ handle = await window.showDirectoryPicker({ mode:'readwrite' }); }
    catch(e){ return false; }  // user cancelled the picker
    this.dirHandle = handle;
    this.folderName = handle.name;
    try{ localStorage.setItem(NAME_KEY, this.folderName); }catch{}
    try{ await idbSet(IDB_KEY, handle); }catch{}
    await this._afterConnect();
    return true;
  }

  // re-grant permission after a reload (requires a user gesture, so this
  // must be called from a click handler)
  async reconnect(){
    if(!this.dirHandle) return this.connect();
    let perm;
    try{ perm = await this.dirHandle.requestPermission({mode:'readwrite'}); }catch{ perm='denied'; }
    if(perm==='granted'){ await this._afterConnect(); return true; }
    this._set('needs-permission');
    Sync._warn('Folder permission was not granted');
    return false;
  }

  disconnect(){
    this.dirHandle = null; this.folderName = '';
    try{ localStorage.removeItem(NAME_KEY); localStorage.removeItem(LAST_KEY); }catch{}
    idbDel(IDB_KEY).catch(()=>{});
    clearTimeout(this._writeTimer);
    this.lastSync = null;
    this._set('off');
    Sync._conn('Disconnected local folder sync');
  }

  async _afterConnect(){
    this._set('connected');
    Sync._conn(`Connected to local folder "${this.folderName}"`);
    try{
      const fh = await this.dirHandle.getFileHandle(FILE_NAME,{create:false}).catch(()=>null);
      if(fh){
        const text = await (await fh.getFile()).text();
        if(text && text.trim()){ Store.import(text,{merge:true}); Sync._sync(`Loaded snapshot from "${this.folderName}"`); }
      }
      await this._write();
    }catch(e){
      Sync._err('Local folder read failed: '+e.message);
      this._set('error');
    }
  }

  _scheduleWrite(){
    clearTimeout(this._writeTimer);
    this._writeTimer = setTimeout(()=>this._write(), WRITE_DEBOUNCE_MS);
  }
  async _write(){
    if(!this.dirHandle || this._writing) return;
    this._writing = true;
    try{
      const fh = await this.dirHandle.getFileHandle(FILE_NAME,{create:true});
      const w = await fh.createWritable();
      await w.write(Store.export());
      await w.close();
      this.lastSync = Date.now();
      try{ localStorage.setItem(LAST_KEY, String(this.lastSync)); }catch{}
      this.emit('synced', this.lastSync);
    }catch(e){
      Sync._err('Local folder write failed: '+e.message);
      this._set('error');
    }finally{ this._writing = false; }
  }

  _set(s){ if(this.state===s) return; this.state = s; this.emit('state', s); }
})();
