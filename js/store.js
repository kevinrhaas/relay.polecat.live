// -----------------------------------------------------------------------
// store.js — the shared, peer-syncable data model.
//
// A "workspace" holds any number of *entities* (tables). Each entity is a
// map of UUID-keyed records. Every record carries LWW sync metadata so two
// peers can converge deterministically:
//
//   record = { id, entity, fields:{...arbitrary json...}, _meta:{
//               rev, updatedAt, updatedBy, deleted } }
//
// Conflict resolution = last-writer-wins on (updatedAt, updatedBy). Deletes
// are tombstones (deleted:true) so they propagate instead of resurrecting.
// Everything persists to localStorage; nothing touches a server.
// -----------------------------------------------------------------------
import { uuid } from './ui.js';

const LS_KEY = 'relay.workspace.v1';
const ID_KEY = 'relay.identity.v1';

class Emitter{
  constructor(){ this._l={}; }
  on(ev,fn){ (this._l[ev]||=[]).push(fn); return ()=>this.off(ev,fn); }
  off(ev,fn){ this._l[ev]=(this._l[ev]||[]).filter(f=>f!==fn); }
  emit(ev,...a){ (this._l[ev]||[]).forEach(f=>{try{f(...a)}catch(e){console.error(e)}}); }
}

function loadIdentity(){
  try{ const raw=localStorage.getItem(ID_KEY); if(raw) return JSON.parse(raw); }catch{}
  const names=['Otter','Lynx','Marten','Sable','Ferret','Stoat','Weasel','Badger','Mink','Fisher'];
  const id={
    id: uuid(),
    name: names[Math.floor((Date.now()/1000)%names.length)] + '-' + uuid().slice(0,4),
    color: null,
  };
  try{ localStorage.setItem(ID_KEY, JSON.stringify(id)); }catch{}
  return id;
}

export const Store = new (class extends Emitter{
  constructor(){
    super();
    this.identity = loadIdentity();
    this.data = this._load();
  }

  // ---- persistence -----------------------------------------------------
  _load(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(raw) return JSON.parse(raw);
    }catch(e){ console.warn('store load failed', e); }
    return this._seed();
  }
  _persist(){
    try{ localStorage.setItem(LS_KEY, JSON.stringify(this.data)); }
    catch(e){ console.warn('store persist failed', e); }
  }
  saveIdentity(patch){
    this.identity = {...this.identity, ...patch};
    try{ localStorage.setItem(ID_KEY, JSON.stringify(this.identity)); }catch{}
    this.emit('identity', this.identity);
  }

  // ---- seed demo content ----------------------------------------------
  // IMPORTANT: seed rows use STABLE ids + STABLE metadata (not random UUIDs
  // or Date.now()). Every fresh install therefore shares byte-identical demo
  // records, so when two peers sync the demo rows merge by id instead of
  // duplicating. (Random per-device ids on identical demo rows was the cause
  // of the "double-created records" bug.) Rows the user creates still get a
  // real uuid() — one row, one id, deduped everywhere.
  _seed(){
    const BASE = 1735689600000;   // fixed epoch, identical on every peer
    const by = 'seed';            // fixed author so LWW is deterministic
    const mk = (id, entity, fields, dt) =>
      ({ id, entity, fields, _meta:{ rev:1, updatedAt:BASE-dt, updatedBy:by, deleted:false } });
    const data = {
      entities: {
        contacts: { label:'Contacts', icon:'peers', records:{} },
        tasks:    { label:'Tasks',    icon:'check', records:{} },
        assets:   { label:'Assets',   icon:'grid',  records:{} },
      },
      recents: [],
      pinned: ['contacts'],
    };
    [
      mk('seed-contact-ada',   'contacts',{name:'Ada Lovelace', role:'Engineer', email:'ada@relay.dev', status:'active'}, 8.6e6),
      mk('seed-contact-alan',  'contacts',{name:'Alan Turing', role:'Researcher', email:'alan@relay.dev', status:'active'}, 3.2e6),
      mk('seed-contact-grace', 'contacts',{name:'Grace Hopper', role:'Architect', email:'grace@relay.dev', status:'away'}, 6e5),
      mk('seed-task-sync',     'tasks',{title:'Ship P2P sync', owner:'Ada', priority:'high', done:false}, 4e6),
      mk('seed-task-nav',      'tasks',{title:'Design rail nav', owner:'Grace', priority:'medium', done:true}, 9e5),
      mk('seed-asset-logo',    'assets',{name:'logo.svg', type:'image', size:'2.1kb', tags:'brand'}, 1.1e6),
    ].forEach(rec=>{ data.entities[rec.entity].records[rec.id]=rec; });
    return data;
  }

  // ---- entities --------------------------------------------------------
  entities(){ return this.data.entities; }
  entity(name){ return this.data.entities[name]; }
  entityNames(){ return Object.keys(this.data.entities); }
  createEntity(label, iconName='table'){
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'') || 'entity_'+uuid().slice(0,4);
    if(this.data.entities[key]) throw new Error('An entity with that name already exists');
    this.data.entities[key] = { label, icon:iconName, records:{} };
    this._persist(); this.emit('entities'); this.emit('change',{type:'entity',key,origin:'local'});
    return key;
  }
  deleteEntity(key){
    delete this.data.entities[key];
    this.data.pinned = (this.data.pinned||[]).filter(k=>k!==key);
    this._persist(); this.emit('entities'); this.emit('change',{type:'entity',key,origin:'local'});
  }
  // entity DEFINITIONS (label+icon) for sync, so empty tables propagate and
  // arrive with the creator's chosen name/icon (not a generic guess)
  entityDefs(filter){
    return Object.entries(this.data.entities)
      .filter(([k])=>!filter || filter.includes(k))
      .map(([key,e])=>({ key, label:e.label, icon:e.icon||'table' }));
  }
  ensureEntity(def){
    if(!def || !def.key || this.data.entities[def.key]) return false;
    this.data.entities[def.key] = { label:def.label||def.key, icon:def.icon||'table', records:{} };
    this._persist(); this.emit('entities'); this.emit('change',{type:'entity',key:def.key,origin:'remote'});
    return true;
  }

  // ---- records ---------------------------------------------------------
  records(entity){
    const e=this.entity(entity); if(!e) return [];
    return Object.values(e.records).filter(r=>!r._meta.deleted)
      .sort((a,b)=>b._meta.updatedAt-a._meta.updatedAt);
  }
  count(entity){ return this.records(entity).length; }
  totalRecords(){ return this.entityNames().reduce((n,e)=>n+this.count(e),0); }

  // columns discovered dynamically from the union of record fields
  columns(entity){
    const cols=new Set();
    for(const r of this.records(entity)) Object.keys(r.fields||{}).forEach(k=>cols.add(k));
    return [...cols];
  }

  upsert(entity, fields, id, {origin='local', meta}={}){
    const e=this.entity(entity); if(!e) return null;
    id = id || uuid();
    const prev = e.records[id];
    const _meta = meta || {
      rev: (prev?._meta.rev||0)+1,
      updatedAt: Date.now(),
      updatedBy: this.identity.id,
      deleted: false,
    };
    e.records[id] = { id, entity, fields:{...(prev?.fields||{}), ...fields}, _meta };
    this._touch(entity);
    this._persist();
    this.emit('records', entity);
    this.emit('change', {type:'record', entity, id, origin});
    return e.records[id];
  }

  // merge a record received from a peer using LWW; returns true if applied
  merge(rec){
    const e=this.entity(rec.entity);
    if(!e){ // auto-create unknown entity so shared entities appear
      this.data.entities[rec.entity]={label:rec.entity.replace(/^\w/,c=>c.toUpperCase()),icon:'table',records:{}};
      this.emit('entities');
    }
    const target=this.entity(rec.entity);
    const cur=target.records[rec.id];
    if(cur && !this._wins(rec._meta, cur._meta)) return false;
    target.records[rec.id]=rec;
    this._persist();
    this.emit('records', rec.entity);
    this.emit('change',{type:'record', entity:rec.entity, id:rec.id, origin:'remote'});
    return true;
  }
  _wins(a,b){ return a.updatedAt!==b.updatedAt ? a.updatedAt>b.updatedAt : String(a.updatedBy)>String(b.updatedBy); }

  remove(entity, id){
    const e=this.entity(entity); const cur=e?.records[id]; if(!cur) return;
    cur._meta={ rev:(cur._meta.rev||0)+1, updatedAt:Date.now(), updatedBy:this.identity.id, deleted:true };
    this._touch(entity); this._persist();
    this.emit('records', entity);
    this.emit('change',{type:'record', entity, id, origin:'local'});
  }

  // ---- sync helpers ----------------------------------------------------
  // full snapshot of one or more entities (tombstones included) for sync
  snapshot(entityFilter){
    const out=[];
    for(const [name,e] of Object.entries(this.data.entities)){
      if(entityFilter && !entityFilter.includes(name)) continue;
      out.push(...Object.values(e.records));
    }
    return out;
  }
  // digest = {recId: [updatedAt, updatedBy]} for delta negotiation
  digest(entityFilter){
    const d={};
    for(const [name,e] of Object.entries(this.data.entities)){
      if(entityFilter && !entityFilter.includes(name)) continue;
      for(const r of Object.values(e.records)) d[r.id]=[r._meta.updatedAt, r._meta.updatedBy];
    }
    return d;
  }

  // ---- recents / pinned ------------------------------------------------
  _touch(entity){
    const r=(this.data.recents||[]).filter(x=>x.entity!==entity);
    r.unshift({entity, at:Date.now()});
    this.data.recents=r.slice(0,8);
  }
  recents(){ return (this.data.recents||[]).filter(r=>this.entity(r.entity)); }
  pinned(){ return (this.data.pinned||[]).filter(k=>this.entity(k)); }
  togglePin(entity){
    const p=new Set(this.data.pinned||[]);
    p.has(entity)?p.delete(entity):p.add(entity);
    this.data.pinned=[...p]; this._persist(); this.emit('pinned');
  }
  isPinned(entity){ return (this.data.pinned||[]).includes(entity); }

  // ---- import / export -------------------------------------------------
  export(){
    return JSON.stringify({ version:1, exportedAt:Date.now(),
      identity:{name:this.identity.name}, data:this.data }, null, 2);
  }
  import(json, {merge=true}={}){
    const parsed = typeof json==='string'?JSON.parse(json):json;
    const incoming = parsed.data || parsed;
    if(!incoming.entities) throw new Error('Not a valid relay workspace file');
    if(merge){
      for(const [name,e] of Object.entries(incoming.entities)){
        if(!this.data.entities[name]) this.data.entities[name]={...e, records:{}};
        for(const rec of Object.values(e.records)) this.merge(rec);
      }
    }else{
      this.data = incoming;
    }
    this._persist(); this.emit('entities'); this.emit('records'); this.emit('change',{type:'import'});
  }
  reset(){
    this.data=this._seed(); this._persist();
    this.emit('entities'); this.emit('records'); this.emit('change',{type:'reset'});
  }
})();
