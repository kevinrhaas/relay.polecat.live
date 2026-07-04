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
    const emeta = { updatedAt:BASE, updatedBy:by };  // stable entity metadata
    const data = {
      entities: {
        contacts: { label:'Contacts', icon:'peers', records:{}, _meta:{...emeta} },
        tasks:    { label:'Tasks',    icon:'check', records:{}, _meta:{...emeta} },
        assets:   { label:'Assets',   icon:'grid',  records:{}, _meta:{...emeta} },
      },
      recents: [],
      pinned: ['contacts'],
      entityTombstones: {},   // key -> {at, by}  (deleted-table markers, synced)
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
  // display order for the tree: names sorted by the optional per-entity
  // `order` set by dragging a table (reorderEntities); entities that have
  // never been reordered (or were created since the last reorder) keep
  // discovery order and sort after any that do — same shape as columns()'s
  // fieldOrder precedent, just workspace-wide instead of per-entity.
  orderedEntityNames(){
    const names = this.entityNames();
    const withOrder = names.filter(k=>Number.isInteger(this.entity(k).order))
      .sort((a,b)=>this.entity(a).order-this.entity(b).order);
    const withoutOrder = names.filter(k=>!Number.isInteger(this.entity(k).order));
    return [...withOrder, ...withoutOrder];
  }
  _emeta(){ return { updatedAt: Date.now(), updatedBy: this.identity.id }; }
  _slugify(label){
    return label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'') || 'entity_'+uuid().slice(0,4);
  }
  createEntity(label, iconName='table'){
    const key = this._slugify(label);
    if(this.data.entities[key]) throw new Error('An entity with that name already exists');
    this.data.entities[key] = { label, icon:iconName, records:{}, _meta:this._emeta() };
    (this.data.entityTombstones||={}) && delete this.data.entityTombstones[key];  // un-tombstone if recreated
    this._persist(); this.emit('entities'); this.emit('change',{type:'entity',key,origin:'local'});
    return key;
  }
  // clone a table's fields, field types and current rows into a brand-new
  // entity — "<label> copy" (then "copy 2", "copy 3", ...) — with fresh ids
  // and metadata so it syncs as an ordinary new table, not a linked copy.
  duplicateEntity(key){
    const e=this.entity(key); if(!e) return null;
    let label=e.label+' copy', newKey=this._slugify(label), n=2;
    while(this.data.entities[newKey]){ label=e.label+' copy '+n; newKey=this._slugify(label); n++; }
    const records={};
    for(const r of Object.values(e.records)){
      if(r._meta.deleted) continue;
      const id=uuid();
      records[id] = { id, entity:newKey, fields:{...r.fields}, _meta:this._emeta() };
    }
    this.data.entities[newKey] = { label, icon:e.icon, fieldTypes: e.fieldTypes?{...e.fieldTypes}:undefined,
      fieldOrder: e.fieldOrder?[...e.fieldOrder]:undefined, records, _meta:this._emeta() };
    delete (this.data.entityTombstones||{})[newKey];
    this._persist(); this.emit('entities'); this.emit('change',{type:'entity',key:newKey,origin:'local'});
    return newKey;
  }
  renameEntity(key, label){
    const e=this.entity(key); if(!e || !label.trim()) return;
    e.label=label.trim(); e._meta=this._emeta();
    this._persist(); this.emit('entities'); this.emit('change',{type:'entity',key,origin:'local'});
  }
  setEntityIcon(key, icon){
    const e=this.entity(key); if(!e) return;
    e.icon=icon; e._meta=this._emeta();
    this._persist(); this.emit('entities'); this.emit('change',{type:'entity',key,origin:'local'});
  }
  // table (tree) order: each entity carries its own `order` number rather
  // than one workspace-level array, so a reorder rides the same per-entity
  // LWW sync entityDefs()/ensureEntity() already do for label/icon/
  // fieldTypes — no new sync path needed. orderedKeys is every current
  // entity key in its new order (same contract as reorderFields).
  reorderEntities(orderedKeys){
    const updatedAt = Date.now();
    (orderedKeys||[]).forEach((key,i)=>{
      const e=this.entity(key); if(!e) return;
      e.order = i; e._meta = { updatedAt, updatedBy:this.identity.id };
    });
    this._persist(); this.emit('entities'); this.emit('change',{type:'entity',origin:'local'});
  }
  deleteEntity(key){
    if(!this.data.entities[key]) return;
    delete this.data.entities[key];
    (this.data.entityTombstones||={})[key] = { at: Date.now(), by: this.identity.id };  // tombstone → propagates
    this.data.pinned = (this.data.pinned||[]).filter(k=>k!==key);
    this._persist(); this.emit('entities'); this.emit('change',{type:'entity',key,origin:'local'});
  }

  // undo a deleteEntity() — snapshot is the removed entity object itself
  // (label/icon/fieldTypes/records), captured by the caller *before* calling
  // deleteEntity. It's safe to reuse without cloning: once removed from
  // `entities`, nothing else touches that object. Re-creating with a fresh
  // updatedAt (newer than the delete's tombstone) makes it win LWW on peers
  // the same way a brand-new table would, so no separate "un-tombstone"
  // message type is needed.
  restoreEntity(key, snapshot){
    if(!snapshot || this.data.entities[key]) return false;
    this.data.entities[key] = {
      label: snapshot.label, icon: snapshot.icon,
      fieldTypes: snapshot.fieldTypes, fieldOrder: snapshot.fieldOrder, order: snapshot.order, records: snapshot.records,
      _meta: this._emeta(),
    };
    delete (this.data.entityTombstones||{})[key];
    this._persist(); this.emit('entities'); this.emit('change',{type:'entity',key,origin:'local'});
    return true;
  }

  // ---- field (column) operations — applied across all records ----------
  renameField(entity, oldKey, newKey){
    const e=this.entity(entity); newKey=(newKey||'').trim().replace(/\s+/g,'_');
    if(!e || !newKey || oldKey===newKey) return;
    for(const r of Object.values(e.records)){
      if(r._meta.deleted || !(oldKey in (r.fields||{}))) continue;
      const f={...r.fields}; f[newKey]=f[oldKey]; delete f[oldKey];
      r.fields=f; r._meta={ rev:(r._meta.rev||0)+1, updatedAt:Date.now(), updatedBy:this.identity.id, deleted:false };
    }
    if(e.fieldTypes && oldKey in e.fieldTypes){ e.fieldTypes[newKey]=e.fieldTypes[oldKey]; delete e.fieldTypes[oldKey]; }
    if(e.fieldOrder){ const i=e.fieldOrder.indexOf(oldKey); if(i>=0) e.fieldOrder[i]=newKey; }
    this._persist(); this.emit('records', entity); this.emit('change',{type:'record',entity,origin:'local'});
  }
  deleteField(entity, key){
    const e=this.entity(entity); if(!e) return;
    for(const r of Object.values(e.records)){
      if(r._meta.deleted || !(key in (r.fields||{}))) continue;
      const f={...r.fields}; delete f[key];
      r.fields=f; r._meta={ rev:(r._meta.rev||0)+1, updatedAt:Date.now(), updatedBy:this.identity.id, deleted:false };
    }
    if(e.fieldTypes) delete e.fieldTypes[key];
    if(e.fieldOrder) e.fieldOrder = e.fieldOrder.filter(k=>k!==key);
    this._persist(); this.emit('records', entity); this.emit('change',{type:'record',entity,origin:'local'});
  }

  // undo a deleteField() — valuesById is a {id: value} snapshot of exactly the
  // records that had the field set, captured by the caller before deleting,
  // since deleteField only ever touches records that had the key in the first
  // place. fieldType re-applies whatever Store.fieldType() returned pre-delete.
  restoreField(entity, key, valuesById, fieldType){
    const e=this.entity(entity); if(!e) return 0;
    const updatedAt = Date.now();
    let n=0;
    for(const [id,value] of Object.entries(valuesById||{})){
      const cur=e.records[id]; if(!cur || cur._meta.deleted) continue;
      cur.fields = {...cur.fields, [key]:value};
      cur._meta = { rev:(cur._meta.rev||0)+1, updatedAt, updatedBy:this.identity.id, deleted:false };
      n++;
    }
    if(fieldType){ e.fieldTypes||={}; e.fieldTypes[key]=fieldType; e._meta=this._emeta(); }
    if(n || fieldType){
      this._touch(entity); this._persist();
      this.emit('records', entity); this.emit('entities');
      this.emit('change', {type:'record', entity, origin:'local'});
    }
    return n;
  }

  // ---- field types (optional per-field editor/validation hint) ---------
  // undefined/absent = "auto": editors infer from the current value, same as
  // before this feature existed. An explicit type is entity-level metadata
  // (like label/icon), so it syncs the same way and survives empty columns.
  fieldType(entity, field){
    const e=this.entity(entity);
    return (e && e.fieldTypes && e.fieldTypes[field]) || null;
  }
  // `config` is type-specific: an options array for 'select', or
  // `{entity, multi}` for 'link' (target entity key + whether the field
  // holds one linked record id or an array of them) — same overloaded third
  // slot, since only one of them is ever meaningful for a given type.
  setFieldType(entity, field, type, config){
    const e=this.entity(entity); if(!e) return;
    e.fieldTypes||={};
    if(!type || type==='auto') delete e.fieldTypes[field];
    else if(type==='select') e.fieldTypes[field] = (config && config.length) ? {type, options:config} : {type};
    else if(type==='link'){
      const targetEntity = config && typeof config==='object' ? config.entity : config;
      const multi = !!(config && typeof config==='object' && config.multi);
      e.fieldTypes[field] = targetEntity ? (multi ? {type, entity:targetEntity, multi:true} : {type, entity:targetEntity}) : {type};
    }
    else e.fieldTypes[field] = {type};
    e._meta=this._emeta();
    this._persist(); this.emit('entities'); this.emit('change',{type:'entity',key:entity,origin:'local'});
  }

  // ---- field order (optional; unset = discovery order from columns()) --
  // entity-level metadata like fieldTypes, so it syncs and survives rename/
  // delete-field the same way.
  reorderFields(entity, orderedKeys){
    const e=this.entity(entity); if(!e) return;
    e.fieldOrder = (orderedKeys||[]).slice();
    e._meta=this._emeta();
    this._persist(); this.emit('entities'); this.emit('change',{type:'entity',key:entity,origin:'local'});
  }

  // ---- entity definitions + tombstones for sync ------------------------
  entityDefs(filter){
    return Object.entries(this.data.entities)
      .filter(([k])=>!filter || filter.includes(k))
      .map(([key,e])=>({ key, label:e.label, icon:e.icon||'table', fieldTypes:e.fieldTypes||{}, fieldOrder:e.fieldOrder||[], order:Number.isInteger(e.order)?e.order:null, _meta:e._meta||{updatedAt:0,updatedBy:'?'} }));
  }
  tombstoneDefs(){ return Object.entries(this.data.entityTombstones||{}).map(([key,t])=>({key,...t})); }

  // create-or-update an entity from a peer's definition (LWW on label/icon/fieldTypes/order)
  ensureEntity(def){
    if(!def || !def.key) return false;
    const tomb=(this.data.entityTombstones||{})[def.key];
    const incoming = def._meta?.updatedAt || 0;
    if(tomb && tomb.at >= incoming) return false;              // a newer delete wins
    const e=this.data.entities[def.key];
    if(!e){
      this.data.entities[def.key] = { label:def.label||def.key, icon:def.icon||'table', fieldTypes:def.fieldTypes||{}, fieldOrder:def.fieldOrder||[], order:Number.isInteger(def.order)?def.order:undefined, records:{}, _meta:def._meta||this._emeta() };
      this._persist(); this.emit('entities'); this.emit('change',{type:'entity',key:def.key,origin:'remote'});
      return 'created';
    }
    const ftChanged = JSON.stringify(e.fieldTypes||{}) !== JSON.stringify(def.fieldTypes||{});
    const foChanged = JSON.stringify(e.fieldOrder||[]) !== JSON.stringify(def.fieldOrder||[]);
    const oChanged = (Number.isInteger(e.order)?e.order:null) !== (def.order??null);
    if(incoming > (e._meta?.updatedAt||0) && (e.label!==def.label || e.icon!==def.icon || ftChanged || foChanged || oChanged)){
      e.label=def.label; e.icon=def.icon||e.icon; e.fieldTypes=def.fieldTypes||{}; e.fieldOrder=def.fieldOrder||[];
      if(Number.isInteger(def.order)) e.order=def.order; else delete e.order;
      e._meta=def._meta;
      this._persist(); this.emit('entities'); this.emit('change',{type:'entity',key:def.key,origin:'remote'});
      return 'updated';
    }
    return false;
  }
  // apply peers' delete-tombstones (LWW vs the entity's own metadata)
  applyTombstones(list){
    if(!list) return; let changed=false;
    this.data.entityTombstones||={};
    for(const t of list){
      const cur=this.data.entityTombstones[t.key];
      if(cur && cur.at>=t.at) continue;
      this.data.entityTombstones[t.key]={ at:t.at, by:t.by };
      const e=this.data.entities[t.key];
      if(e && t.at >= (e._meta?.updatedAt||0)){ delete this.data.entities[t.key]; changed=true; }
    }
    if(changed){ this._persist(); this.emit('entities'); this.emit('change',{type:'entity',origin:'remote'}); }
  }

  // ---- records ---------------------------------------------------------
  records(entity){
    const e=this.entity(entity); if(!e) return [];
    return Object.values(e.records).filter(r=>!r._meta.deleted)
      .sort((a,b)=>b._meta.updatedAt-a._meta.updatedAt);
  }
  count(entity){ return this.records(entity).length; }
  totalRecords(){ return this.entityNames().reduce((n,e)=>n+this.count(e),0); }

  // columns discovered dynamically from the union of record fields, in
  // discovery order unless the entity has an explicit fieldOrder (set by
  // dragging/reordering a column) — known fields sort by that order first,
  // with any newly-discovered field appended at the end.
  columns(entity){
    const cols=new Set();
    for(const r of this.records(entity)) Object.keys(r.fields||{}).forEach(k=>cols.add(k));
    const order = this.entity(entity)?.fieldOrder;
    if(!order || !order.length) return [...cols];
    const ordered = order.filter(k=>cols.has(k));
    for(const k of cols) if(!ordered.includes(k)) ordered.push(k);
    return ordered;
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

  // insert a batch of brand-new rows with a single persist/emit instead of one
  // per row — upsert() re-stringifies the whole workspace on every call, which
  // gets slower as an entity grows, so importing thousands of CSV rows one at
  // a time would get progressively slower on top of being wasteful. Only for
  // fresh rows (no id/prior-value merge), which is all a CSV import ever needs.
  upsertMany(entity, rowsOfFields){
    const e=this.entity(entity); if(!e) return [];
    const updatedAt = Date.now();
    const created = rowsOfFields.map(fields=>{
      const id = uuid();
      const rec = { id, entity, fields, _meta:{ rev:1, updatedAt, updatedBy:this.identity.id, deleted:false } };
      e.records[id]=rec;
      return rec;
    });
    this._touch(entity);
    this._persist();
    this.emit('records', entity);
    this.emit('change', {type:'record', entity, origin:'local'});
    return created;
  }

  // clone a single record's fields into a brand-new row with a fresh id/meta —
  // same one-off-copy convenience duplicateEntity gives whole tables, for a
  // single row via the grid/record-panel's "Duplicate row" action.
  duplicateRecord(entity, id){
    const e=this.entity(entity); const src=e?.records[id]; if(!src || src._meta.deleted) return null;
    const newId=uuid();
    const rec={ id:newId, entity, fields:{...src.fields}, _meta:this._emeta() };
    e.records[newId]=rec;
    this._touch(entity); this._persist();
    this.emit('records', entity);
    this.emit('change',{type:'record', entity, id:newId, origin:'local'});
    return rec;
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

  // tombstone a batch of records with a single persist/emit instead of one per
  // row — same rationale as upsertMany, for bulk-selecting many rows in the
  // table view and deleting them all at once.
  removeMany(entity, ids){
    const e=this.entity(entity); if(!e) return 0;
    const updatedAt = Date.now();
    let n=0;
    for(const id of ids){
      const cur=e.records[id]; if(!cur || cur._meta.deleted) continue;
      cur._meta={ rev:(cur._meta.rev||0)+1, updatedAt, updatedBy:this.identity.id, deleted:true };
      n++;
    }
    if(n){
      this._touch(entity); this._persist();
      this.emit('records', entity);
      this.emit('change', {type:'record', entity, origin:'local'});
    }
    return n;
  }

  // un-tombstone a record deleted via remove()/removeMany() — a newer rev/
  // updatedAt than the delete, so it wins LWW and un-deletes on every peer too.
  // Only meaningful as long as the tombstone hasn't been pruned, which this
  // app never does, so undo works no matter how the delete propagated.
  restore(entity, id){
    const e=this.entity(entity); const cur=e?.records[id]; if(!cur || !cur._meta.deleted) return false;
    cur._meta={ rev:(cur._meta.rev||0)+1, updatedAt:Date.now(), updatedBy:this.identity.id, deleted:false };
    this._touch(entity); this._persist();
    this.emit('records', entity);
    this.emit('change',{type:'record', entity, id, origin:'local'});
    return true;
  }
  restoreMany(entity, ids){
    const e=this.entity(entity); if(!e) return 0;
    const updatedAt = Date.now();
    let n=0;
    for(const id of ids){
      const cur=e.records[id]; if(!cur || !cur._meta.deleted) continue;
      cur._meta={ rev:(cur._meta.rev||0)+1, updatedAt, updatedBy:this.identity.id, deleted:false };
      n++;
    }
    if(n){
      this._touch(entity); this._persist();
      this.emit('records', entity);
      this.emit('change', {type:'record', entity, origin:'local'});
    }
    return n;
  }

  // set a single field's value across a batch of existing records with one
  // persist/emit instead of one per row — same rationale as upsertMany/
  // removeMany, for the bulk-select action bar's "Set field" action.
  setFieldMany(entity, ids, field, value){
    const e=this.entity(entity); if(!e) return 0;
    const updatedAt = Date.now();
    let n=0;
    for(const id of ids){
      const cur=e.records[id]; if(!cur || cur._meta.deleted) continue;
      cur.fields = {...cur.fields, [field]:value};
      cur._meta = { rev:(cur._meta.rev||0)+1, updatedAt, updatedBy:this.identity.id, deleted:false };
      n++;
    }
    if(n){
      this._touch(entity); this._persist();
      this.emit('records', entity);
      this.emit('change', {type:'record', entity, origin:'local'});
    }
    return n;
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
