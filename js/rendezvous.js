// -----------------------------------------------------------------------
// rendezvous.js — automatic peer discovery over a signaling relay.
//
// Connects to the optional Cloudflare Worker relay (see /rendezvous), joins
// a room, and for every other member negotiates a WebRTC data channel
// AUTOMATICALLY (offer / answer / trickle ICE) — no copy/paste. The moment
// a channel opens it is handed to Sync, which takes over sync + permissions.
// The relay only carries the handshake; records always flow peer-to-peer.
// -----------------------------------------------------------------------
import { Sync } from './sync.js';
import { Store } from './store.js';

const K_URL = 'relay.rdv.url';
const K_ROOM = 'relay.rdv.room';

class Emitter{
  constructor(){ this._l={}; }
  on(ev,fn){ (this._l[ev]||=[]).push(fn); return ()=>{this._l[ev]=this._l[ev].filter(f=>f!==fn)}; }
  emit(ev,...a){ (this._l[ev]||[]).forEach(f=>{try{f(...a)}catch(e){console.error(e)}}); }
}

export const Rendezvous = new (class extends Emitter{
  constructor(){
    super();
    this.state = 'off';           // off | connecting | online | error
    this.ws = null;
    this.url = localStorage.getItem(K_URL) || '';
    this.room = localStorage.getItem(K_ROOM) || '';
    this.pcs = new Map();         // remoteId -> { pc, pending:[] }
    this._retry = null;
    this._want = false;           // user intent to stay connected
  }

  configured(){ return !!(this.url && this.room); }

  // auto-connect on boot if the user previously configured + enabled it
  autostart(){
    if(this.configured() && localStorage.getItem('relay.rdv.on')==='1') this.connect();
  }

  save(url, room){
    this.url=url.trim(); this.room=room.trim();
    localStorage.setItem(K_URL, this.url); localStorage.setItem(K_ROOM, this.room);
  }

  connect(url, room){
    if(url!=null) this.save(url, room ?? this.room);
    if(!this.configured()){ Sync._warn('Set a rendezvous URL and room first'); return; }
    this._want=true; localStorage.setItem('relay.rdv.on','1');
    this._open();
  }
  disconnect(){
    this._want=false; localStorage.setItem('relay.rdv.on','0');
    clearTimeout(this._retry);
    try{ this.ws && this.ws.close(); }catch{}
    for(const [,r] of this.pcs){ try{ r.pc.close(); }catch{} }
    this.pcs.clear();
    this._set('off');
  }

  _open(){
    this._set('connecting');
    let wsUrl;
    try{
      const u=new URL(this.url);
      u.protocol = u.protocol==='https:'?'wss:':u.protocol==='http:'?'ws:':u.protocol;
      u.searchParams.set('room', this.room);
      wsUrl=u.toString();
    }catch(e){ Sync._err('Invalid rendezvous URL'); this._set('error'); return; }

    let ws;
    try{ ws=new WebSocket(wsUrl); }catch(e){ Sync._err('Could not open rendezvous'); this._set('error'); return; }
    this.ws=ws;

    ws.onopen=()=>{
      this._set('online');
      Sync._conn(`Joined rendezvous room “${this.room}”`);
      ws.send(JSON.stringify({ type:'join', id:Sync.selfId, name:Store.identity.name }));
    };
    ws.onmessage=(e)=>{ let m; try{ m=JSON.parse(e.data); }catch{ return; } this._onMsg(m); };
    ws.onclose=()=>{
      if(this.state!=='off'){ this._set(this._want?'connecting':'off'); }
      if(this._want){ this._retry=setTimeout(()=>this._open(), 2500); }  // auto-reconnect
    };
    ws.onerror=()=>{ Sync._err('Rendezvous connection error'); };
  }

  _onMsg(m){
    if(m.type==='welcome'){
      (m.members||[]).forEach(p=>this._startPeer(p.id, p.name));
    }else if(m.type==='join'){
      this._startPeer(m.id, m.name);
    }else if(m.type==='leave'){
      const r=this.pcs.get(m.id); if(r){ try{ r.pc.close(); }catch{} this.pcs.delete(m.id); }
    }else if(m.type==='signal'){
      this._onSignal(m.from, m.data);
    }
  }

  _send(to, data){ try{ this.ws.send(JSON.stringify({ type:'signal', to, data })); }catch{} }

  // Deterministic initiator: the lexicographically smaller id creates the
  // offer, so two peers never glare (both offering at once).
  _isInitiator(remoteId){ return Sync.selfId < remoteId; }

  async _startPeer(remoteId, remoteName){
    if(!remoteId || remoteId===Sync.selfId || this.pcs.has(remoteId)) return;
    const pc=new RTCPeerConnection(Sync.rtcConfig());
    const rec={ pc, name:remoteName, pending:[] };
    this.pcs.set(remoteId, rec);

    pc.onicecandidate=(e)=>{ if(e.candidate) this._send(remoteId, { ice:e.candidate }); };
    pc.onconnectionstatechange=()=>{
      if(['failed','closed','disconnected'].includes(pc.connectionState)) this.pcs.delete(remoteId);
    };

    if(this._isInitiator(remoteId)){
      const dc=pc.createDataChannel('relay',{ ordered:true });
      Sync.adoptChannel(remoteId, remoteName, pc, dc);
      const offer=await pc.createOffer();
      await pc.setLocalDescription(offer);
      this._send(remoteId, { sdp:pc.localDescription });
    }else{
      pc.ondatachannel=(e)=>Sync.adoptChannel(remoteId, remoteName, pc, e.channel);
    }
  }

  async _onSignal(from, data){
    let rec=this.pcs.get(from);
    if(!rec){ await this._startPeer(from, undefined); rec=this.pcs.get(from); }
    if(!rec) return;
    const pc=rec.pc;
    try{
      if(data.sdp){
        await pc.setRemoteDescription(data.sdp);
        if(data.sdp.type==='offer'){
          const answer=await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this._send(from, { sdp:pc.localDescription });
        }
        // flush any ICE that arrived before the remote description
        for(const c of rec.pending.splice(0)){ try{ await pc.addIceCandidate(c); }catch{} }
      }else if(data.ice){
        if(pc.remoteDescription && pc.remoteDescription.type) await pc.addIceCandidate(data.ice);
        else rec.pending.push(data.ice);   // buffer until remote description is set
      }
    }catch(e){ Sync._err('Signaling failed: '+e.message); }
  }

  _set(s){ this.state=s; this.emit('state', s); }
})();
