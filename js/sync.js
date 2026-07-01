// -----------------------------------------------------------------------
// sync.js — serverless peer-to-peer sync engine.
//
// Two transports, one message protocol:
//   • Local mesh (BroadcastChannel)  — zero-config discovery + sync across
//     tabs/windows of the same browser. Great for demos & multi-window use.
//   • WebRTC data channel            — real cross-internet P2P with manual
//     copy/paste signaling (no signaling server; you exchange one blob).
//
// Permissions are per-peer, per-entity:
//   read[entity]  = this peer may PULL that entity FROM us (we push it out)
//   write[entity] = this peer may PUSH changes INTO that entity on us
//
// Conflict resolution lives in the store (LWW). This file only moves bytes
// and enforces permissions. Everything is logged to the monitor.
// -----------------------------------------------------------------------
import { Store } from './store.js';
import { clock, uuid } from './ui.js';

const PERM_KEY = 'relay.perms.v1';
const MESH = 'relay-mesh-v1';

class Emitter{
  constructor(){ this._l={}; }
  on(ev,fn){ (this._l[ev]||=[]).push(fn); return ()=>{this._l[ev]=this._l[ev].filter(f=>f!==fn)}; }
  emit(ev,...a){ (this._l[ev]||[]).forEach(f=>{try{f(...a)}catch(e){console.error(e)}}); }
}

export const Sync = new (class extends Emitter{
  constructor(){
    super();
    // Wire/session identity: unique per tab so two windows of the SAME
    // browser profile (which share localStorage, and thus Store.identity)
    // still discover each other over the local mesh. Store.identity.name
    // still travels with every message for display.
    this.selfId = uuid();
    this.peers = new Map();       // peerId -> {id,name,transport,state,lastSeen,offers}
    this.rtc = new Map();         // peerId -> {pc, dc}
    this.pendingOffer = null;     // {pc, dc} awaiting an answer
    this.perms = this._loadPerms();
    this.log = [];
    this.stats = { sent:0, received:0, applied:0, sessions:0 };
    this.meshOn = false;
    this.chat = this._loadChat();   // light P2P messaging history
    this._seenChat = new Set(this.chat.map(m=>m.id));
  }

  // ---- lifecycle -------------------------------------------------------
  start(){
    this._startMesh();
    // reflect local edits outward to connected peers (auto-sync)
    Store.on('change', (c)=>{ if(c.origin==='local' && c.type==='record') this._pushEntity(c.entity); });
    window.addEventListener('beforeunload', ()=>this._say('*',{kind:'bye', id:this.selfId}));
    this._info('Sync engine online');
  }

  // ---- local mesh transport -------------------------------------------
  _startMesh(){
    if(!('BroadcastChannel' in window)){ this._warn('BroadcastChannel unavailable — local mesh off'); return; }
    this.mesh = new BroadcastChannel(MESH);
    this.mesh.onmessage = (e)=>this._onMesh(e.data);
    this.meshOn = true;
    this._hello();
    this._hb = setInterval(()=>this._prune()||this._hello(), 4000);
    this.emit('peers');
  }
  _hello(){
    this._say('*', { kind:'hello', id:this.selfId, name:Store.identity.name,
      offers:this._readableEntities('*') });
  }
  _say(to, msg){ if(this.meshOn) this.mesh.postMessage({ ...msg, from:this.selfId, to }); }

  _onMesh(m){
    if(!m || m.from===this.selfId) return;
    if(m.to!=='*' && m.to!==this.selfId) return;
    this._route(m.from, m, 'mesh');
  }

  // ---- unified message router (mesh + webrtc share this) ---------------
  _route(from, m, transport){
    switch(m.kind){
      case 'hello':{
        const known=this.peers.has(from);
        this._seePeer(from, m.name, transport, m.offers);
        if(!known){ this._conn(`${m.name} appeared on the network`); }
        // reply so the newcomer learns about us too
        if(m.to==='*' || !known) this._reply(from, transport,{ kind:'welcome',
          id:this.selfId, name:Store.identity.name, offers:this._readableEntities(from) });
        break; }
      case 'welcome':
        this._seePeer(from, m.name, transport, m.offers); break;
      case 'bye':
        this._dropPeer(from); break;
      case 'sync-req':
        this._pushTo(from, transport, m.entities); break;
      case 'push':
        this._onPush(from, m.records); break;
      case 'chat':
        this._recvChat(m.msg); break;
    }
  }
  _reply(to, transport, msg){
    if(transport==='mesh') this._say(to, msg);
    else this._rtcSend(to, msg);
  }

  // ---- peer registry ---------------------------------------------------
  _seePeer(id, name, transport, offers){
    const p = this.peers.get(id) || { id, transport };
    p.name = name || p.name || id.slice(0,6);
    p.transport = transport;
    p.state = transport==='webrtc' ? 'connected' : 'connected';
    p.lastSeen = Date.now();
    p.offers = offers || p.offers || [];
    this.peers.set(id, p);
    this.emit('peers');
  }
  _dropPeer(id){
    const p=this.peers.get(id);
    if(p){ this._conn(`${p.name} left the network`); }
    this.peers.delete(id); this.emit('peers');
  }
  _prune(){
    const now=Date.now(); let changed=false;
    for(const [id,p] of this.peers){
      if(p.transport==='mesh' && now-p.lastSeen>11000){ this.peers.delete(id); changed=true; }
    }
    if(changed) this.emit('peers');
    return false;
  }
  peerList(){ return [...this.peers.values()].sort((a,b)=>(a.name||'').localeCompare(b.name||'')); }
  onlineCount(){ return [...this.peers.values()].filter(p=>p.state==='connected').length; }

  // ---- permissions -----------------------------------------------------
  _loadPerms(){ try{ return JSON.parse(localStorage.getItem(PERM_KEY))||{}; }catch{ return {}; } }
  _savePerms(){ try{ localStorage.setItem(PERM_KEY, JSON.stringify(this.perms)); }catch{} }
  // NOTE: new peers default to read+write on all entities so demos "just
  // work"; revoke per-entity in the Peers panel at any time.
  permFor(peerId){
    if(!this.perms[peerId]){
      const all=Store.entityNames();
      this.perms[peerId]={ read:Object.fromEntries(all.map(e=>[e,true])),
                           write:Object.fromEntries(all.map(e=>[e,true])) };
      this._savePerms();
    }
    return this.perms[peerId];
  }
  can(peerId, mode, entity){ return !!this.permFor(peerId)[mode]?.[entity]; }
  setPerm(peerId, mode, entity, val){
    const p=this.permFor(peerId); (p[mode]||={})[entity]=val; this._savePerms();
    this._perm(`${val?'granted':'revoked'} ${mode} · ${entity} · ${this.peers.get(peerId)?.name||peerId.slice(0,6)}`);
    this.emit('perms');
    if(mode==='read'&&val) this._pushEntity(entity);
  }
  _readableEntities(peerId){
    if(peerId==='*') return Store.entityNames(); // advertise everything; enforcement happens on push
    return Store.entityNames().filter(e=>this.can(peerId,'read',e));
  }

  // ---- sync operations -------------------------------------------------
  syncAll(){
    const peers=this.peerList();
    if(!peers.length){ this._warn('No peers online to sync with'); return; }
    this.stats.sessions++;
    for(const p of peers){ this._pushTo(p.id, p.transport); this._reply(p.id,p.transport,{kind:'sync-req',entities:null}); }
    this._sync(`Sync pass with ${peers.length} peer${peers.length>1?'s':''}`);
    this.emit('stats');
  }
  syncPeer(peerId){
    const p=this.peers.get(peerId); if(!p) return;
    this._pushTo(peerId,p.transport);
    this._reply(peerId,p.transport,{kind:'sync-req',entities:null});
    this._sync(`Sync with ${p.name}`); this.emit('stats');
  }
  _pushEntity(entity){ for(const p of this.peerList()) this._pushTo(p.id,p.transport,[entity]); }

  _pushTo(peerId, transport, entities){
    const share=(entities||Store.entityNames()).filter(e=>this.can(peerId,'read',e));
    if(!share.length) return;
    const records=Store.snapshot(share);
    if(!records.length) return;
    this._reply(peerId, transport, { kind:'push', records });
    this.stats.sent += records.length; this.emit('stats');
  }
  _onPush(from, records){
    this.stats.received += records.length;
    let applied=0;
    for(const rec of records){
      if(!this.can(from,'write',rec.entity)) continue;   // permission gate
      if(Store.merge(rec)) applied++;
    }
    this.stats.applied += applied;
    if(applied) this._ok(`Applied ${applied} record${applied>1?'s':''} from ${this.peers.get(from)?.name||from.slice(0,6)}`);
    else this._sync(`Received ${records.length} record${records.length>1?'s':''} (no changes) from ${this.peers.get(from)?.name||from.slice(0,6)}`);
    this.emit('stats');
  }

  // ---- light P2P messaging --------------------------------------------
  _loadChat(){ try{ return JSON.parse(localStorage.getItem('relay.chat')||'[]'); }catch{ return []; } }
  _saveChat(){ try{ localStorage.setItem('relay.chat', JSON.stringify(this.chat.slice(-200))); }catch{} }
  sendChat(text){
    text=String(text||'').trim(); if(!text) return;
    const msg={ id:uuid(), from:this.selfId, name:Store.identity.name, text:text.slice(0,2000), ts:Date.now() };
    this._store(msg);
    // broadcast to every connected peer (mesh in one shot, webrtc per-peer)
    if(this.meshOn) this._say('*', { kind:'chat', msg });
    for(const [id,r] of this.rtc){ if(r?.dc?.readyState==='open') this._rtcSendRaw(r.dc,{ kind:'chat', msg, from:this.selfId, to:id }); }
    this.emit('chat', msg);
  }
  _recvChat(msg){
    if(!msg || !msg.id || this._seenChat.has(msg.id)) return;   // dedupe (mesh + webrtc)
    this._store(msg);
    this.emit('chat', msg);
  }
  _store(msg){
    this._seenChat.add(msg.id);
    this.chat.push(msg);
    if(this.chat.length>200){ this.chat=this.chat.slice(-200); }
    this._saveChat();
  }
  clearChat(){ this.chat=[]; this._seenChat.clear(); this._saveChat(); this.emit('chat', null); }

  // ---- WebRTC manual signaling ----------------------------------------
  _iceServers(){
    const s=localStorage.getItem('relay.stun'); // '' = pure serverless / LAN only
    if(s==='') return [];
    return [{ urls: s || 'stun:stun.l.google.com:19302' }];
  }
  // exposed for the rendezvous transport (automatic signaling)
  rtcConfig(){ return { iceServers:this._iceServers() }; }

  // Adopt a data channel negotiated elsewhere (e.g. the rendezvous relay)
  // into Sync's peer registry + message routing. Reuses the same protocol
  // as the mesh and manual WebRTC paths.
  adoptChannel(peerId, peerName, pc, dc){
    this.rtc.set(peerId, { pc, dc });
    const wire=()=>{
      this._seePeer(peerId, peerName, 'webrtc', Store.entityNames());
      this._conn(`WebRTC channel open with ${peerName||peerId.slice(0,6)} (auto)`);
      this._rtcSendRaw(dc,{ kind:'hello', id:this.selfId, name:Store.identity.name,
        to:'*', from:this.selfId, offers:Store.entityNames() });
    };
    if(dc.readyState==='open') wire(); else dc.addEventListener('open', wire);
    dc.addEventListener('message', (e)=>{ try{ const m=JSON.parse(e.data); this._route(m.from,m,'webrtc'); }catch{} });
    dc.addEventListener('close', ()=>{ const p=this.peers.get(peerId); if(p){ p.state='offline'; this.emit('peers'); } });
    pc.addEventListener('connectionstatechange', ()=>{
      if(['failed','disconnected','closed'].includes(pc.connectionState)){
        const p=this.peers.get(peerId); if(p){ p.state='offline'; this.emit('peers'); }
      }
    });
  }
  async createOffer(){
    const pc=new RTCPeerConnection({iceServers:this._iceServers()});
    const dc=pc.createDataChannel('relay',{ordered:true});
    this.pendingOffer={pc,dc};
    this._wireChannel(pc,dc,null);
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this._ice(pc);
    return this._pack({ t:'offer', id:this.selfId, name:Store.identity.name, sdp:pc.localDescription });
  }
  async acceptOffer(blob){
    const data=this._unpack(blob);
    if(data.t!=='offer') throw new Error('That is not an offer blob');
    const pc=new RTCPeerConnection({iceServers:this._iceServers()});
    pc.ondatachannel=(e)=>this._wireChannel(pc,e.channel,data.id,data.name);
    await pc.setRemoteDescription(data.sdp);
    const answer=await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this._ice(pc);
    this.rtc.set(data.id,{pc,dc:null});
    return this._pack({ t:'answer', id:this.selfId, name:Store.identity.name, sdp:pc.localDescription });
  }
  async acceptAnswer(blob){
    const data=this._unpack(blob);
    if(data.t!=='answer') throw new Error('That is not an answer blob');
    if(!this.pendingOffer) throw new Error('No pending offer to complete');
    await this.pendingOffer.pc.setRemoteDescription(data.sdp);
    this.rtc.set(data.id,{pc:this.pendingOffer.pc,dc:this.pendingOffer.dc});
    this.pendingOffer=null;
    this._conn(`Answer accepted from ${data.name} — establishing channel…`);
  }
  _wireChannel(pc,dc,peerId,peerName){
    dc.onopen=()=>{
      const id=peerId||dc._peerId;
      this._conn(`WebRTC channel open with ${peerName||id?.slice(0,6)||'peer'}`);
      if(id){ this._seePeer(id, peerName, 'webrtc', Store.entityNames()); this.rtc.get(id)&&(this.rtc.get(id).dc=dc); }
      this._rtcSendRaw(dc,{kind:'hello',id:this.selfId,name:Store.identity.name,to:'*',from:this.selfId,offers:Store.entityNames()});
    };
    dc.onmessage=(e)=>{ try{ const m=JSON.parse(e.data); this._route(m.from,m,'webrtc'); }catch{} };
    dc.onclose=()=>{ if(peerId){ const p=this.peers.get(peerId); if(p){p.state='offline';this.emit('peers');} } };
    pc.onconnectionstatechange=()=>{
      if(['failed','disconnected','closed'].includes(pc.connectionState) && peerId){
        const p=this.peers.get(peerId); if(p){p.state='offline';this.emit('peers');this._warn(`Connection to ${p.name} ${pc.connectionState}`);}
      }
    };
  }
  _rtcSend(peerId,msg){ const r=this.rtc.get(peerId); if(r?.dc?.readyState==='open') this._rtcSendRaw(r.dc,{...msg,from:this.selfId,to:peerId}); }
  _rtcSendRaw(dc,msg){ try{ dc.send(JSON.stringify(msg)); }catch(e){ this._err('WebRTC send failed'); } }
  _ice(pc){ return new Promise(res=>{
    if(pc.iceGatheringState==='complete') return res();
    const t=setTimeout(res,2500);
    pc.onicegatheringstatechange=()=>{ if(pc.iceGatheringState==='complete'){clearTimeout(t);res();} };
  }); }
  _pack(o){ return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); }
  _unpack(b){ return JSON.parse(decodeURIComponent(escape(atob(b.trim())))); }

  // ---- monitor / activity log -----------------------------------------
  _push(tag,msg,kind){
    const line={ ts:clock(), tag, msg, kind };
    this.log.unshift(line); this.log=this.log.slice(0,200);
    this.emit('log', line);
  }
  _sync(m){ this._push('SYNC',m,'t-sync'); }
  _conn(m){ this._push('CONN',m,'t-conn'); }
  _perm(m){ this._push('PERM',m,'t-perm'); }
  _ok(m){ this._push('OK',m,'t-ok'); }
  _err(m){ this._push('ERR',m,'t-err'); }
  _warn(m){ this._push('WARN',m,'t-perm'); }
  _info(m){ this._push('INFO',m,'t-conn'); }
})();
