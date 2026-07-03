// Peers: discover people on the network, connect over WebRTC (manual
// signaling, no server), and manage per-entity read/write permissions.
import { Store } from '../store.js';
import { Sync } from '../sync.js';
import { Rendezvous } from '../rendezvous.js';
import { el, escapeHtml, ago, shortId, avatarColor, initials, toast, modal } from '../ui.js';
import { icon } from '../icons.js';

// which peer cards have "Manage sharing" expanded — persists across
// re-renders of this view (e.g. after toggling a permission) but resets on
// navigation away, which is fine since it's just a UI convenience.
const expanded=new Set();

export function renderPeers(root, ctx){
  root.innerHTML='';
  const wrap=el('div',{class:'wrap'});

  // header
  wrap.append(el('div',{class:'section-title', html:`
    <div><h2>Network</h2>
    <div class="muted tiny" style="margin-top:4px">Discovery runs over a local mesh (other tabs/windows) automatically. Connect across the internet with a WebRTC invite — no server involved.</div></div>`}));

  const bar=el('div',{class:'tbl-toolbar'});
  const mesh=el('span',{class:'chip', html:`${icon('broadcast')} Local mesh ${Sync.meshOn?'active':'off'}`});
  const you=el('span',{class:'chip', html:`${icon('shield')} You: ${escapeHtml(Store.identity.name)}`});
  bar.append(mesh, you);
  // auto-discovery is an advanced/optional feature — only surface it here
  // when it's actually running (configured in Settings → Advanced)
  const rst=Rendezvous.state;
  if(rst==='online'||rst==='connecting'){
    const rColor=rst==='online'?'var(--success)':'var(--warning)';
    bar.append(el('span',{class:'chip', style:`cursor:pointer;color:${rColor}`, title:'Manage in Settings → Advanced',
      html:`${icon('link')} Auto-connect ${rst==='online'?'on':'…'}`, onclick:()=>ctx.go('settings')}));
  }
  bar.append(el('div',{style:'flex:1'}),
    el('button',{class:'btn sm ghost', title:'Sync is automatic — use only if something looks out of date',
      html:`${icon('refresh')} Force resync`, onclick:()=>{Sync.syncAll();toast('Resynced with all peers',{kind:'ok'});}}),
    el('button',{class:'btn sm primary', html:`${icon('link')} WebRTC invite`, onclick:()=>signalingModal()}));
  wrap.append(bar);
  wrap.append(el('div',{class:'muted tiny', style:'margin:-6px 0 10px',
    html:'Changes sync automatically with connected peers — you don\'t need to press anything.'}));

  // Merge live peers with the durable known-peers registry so definitions
  // (and their permissions) persist across reloads/deploys — even offline.
  const online=Sync.peerList();
  const byUid=new Map();
  online.forEach(p=>{ if(p.uid) byUid.set(p.uid, { ...p, online:true }); });
  Sync.knownPeers().forEach(k=>{ if(!byUid.has(k.uid)) byUid.set(k.uid, { uid:k.uid, name:k.name, state:'offline', transport:'—', online:false, lastSeen:k.lastSeen }); });
  const list=[...byUid.values()].sort((a,b)=>(b.online-a.online)||(a.name||'').localeCompare(b.name||''));

  if(!list.length){
    wrap.append(el('div',{class:'empty', html:`${icon('peers')}
      <div><b>No peers yet.</b><br>Open Relay in another browser tab to see local-mesh discovery,
      or send a WebRTC invite to connect across the internet.</div>`}));
  }else{
    const isOnline=p=>p.online;
    const onlineList=list.filter(isOnline), offlineList=list.filter(p=>!isOnline(p));
    if(onlineList.length){
      wrap.append(el('div',{class:'muted tiny', style:'margin:14px 0 8px;text-transform:uppercase;letter-spacing:.04em', text:`Online — ${onlineList.length}`}));
      const grid=el('div',{class:'grid peer-grid'});
      onlineList.forEach(p=>grid.append(peerCard(p, ctx)));
      wrap.append(grid);
    }
    if(offlineList.length){
      wrap.append(el('div',{class:'muted tiny', style:'margin:18px 0 8px;text-transform:uppercase;letter-spacing:.04em', text:`Saved · offline — ${offlineList.length}`}));
      const grid=el('div',{class:'grid peer-grid'});
      offlineList.forEach(p=>grid.append(peerCard(p, ctx)));
      wrap.append(grid);
    }
  }
  root.append(wrap);
}

const SHARING_LABEL={ all:'Everything', custom:'Custom', none:'Nothing' };

function peerCard(p, ctx){
  const c=el('div',{class:'card peer'});
  const state = p.state==='connected'?'conn-connected':p.state==='connecting'?'conn-connecting':'conn-offline';
  const head=el('div',{class:'peer-head'});
  head.innerHTML=`
    <div class="peer-av" style="background:${avatarColor(p.uid||p.id)}">${initials(p.name)}</div>
    <div style="flex:1;min-width:0">
      <b>${escapeHtml(p.name)}</b>
      <div class="pid">${shortId(p.uid||p.id)} · ${p.online?p.transport:'saved'}</div>
    </div>
    <span class="conn-state ${state}"><span class="dot"></span>${p.state}</span>`;
  c.append(head);

  const uid=p.uid||p.id;
  const rerender=()=>renderPeers(document.querySelector('#view'), ctx);

  // ---- compact sharing summary: ONE control, three states --------------
  // "Everything"/"Nothing" apply a bulk change directly; "Custom" opens the
  // per-table grid below (whether the state is already mixed, or the user
  // wants to hand-pick tables starting from a uniform state).
  const sharing=el('div',{class:'sharing-row'});
  const state0=Sync.sharingState(uid);
  const isOpen=expanded.has(uid);
  const activeKey=isOpen?'custom':state0;
  const seg=el('div',{class:'seg sharing-seg'});
  ['all','custom','none'].forEach(key=>{
    const label=key==='custom'?`${SHARING_LABEL[key]} ${icon('chevron')}`:SHARING_LABEL[key];
    const btn=el('button',{class:(key===activeKey?'on':'')+(key==='custom'?' seg-custom':''), html:label,
      title:key==='all'?'Share every table, both ways':key==='none'?'Share nothing with this peer':'Choose per table below'});
    if(key==='custom') btn.classList.toggle('open',isOpen);
    btn.onclick=()=>{
      // Sync.setAllPerms emits 'perms' synchronously, which the app shell
      // turns into its own full re-render of this section — so mutate
      // `expanded` *first* (the re-render must see the collapsed state) and
      // don't also rerender() here, or every click rebuilds `.peer` twice.
      if(key==='all'||key==='none'){ expanded.delete(uid); Sync.setAllPerms(uid,key==='all'); }
      else{ isOpen?expanded.delete(uid):expanded.add(uid); rerender(); }
    };
    seg.append(btn);
  });
  sharing.append(el('span',{class:'muted tiny', text:'Sharing'}), seg);
  c.append(sharing);

  if(isOpen){
    const perms=el('div',{class:'perm-grid'});
    Store.entityNames().forEach(ent=>{
      const e=Store.entity(ent);
      const row=el('div',{class:'perm-row'});
      row.innerHTML=`<span class="en">${escapeHtml(e.label)}</span>`;
      ['read','write'].forEach(mode=>{
        const on=Sync.can(uid,mode,ent);
        const t=el('button',{class:'toggle'+(on?' on':''), title:`${mode==='read'?'Peer can read this from you':'Peer can write this to you'}`,
          // Sync.setPerm's own 'perms' emit already re-renders this section.
          onclick:()=>{ Sync.setPerm(uid,mode,ent,!Sync.can(uid,mode,ent)); }});
        const lbl=el('span',{class:'muted tiny', style:'width:38px;text-align:right', text:mode});
        row.append(lbl, t);
      });
      perms.append(row);
    });
    c.append(perms);
  }

  const actions=el('div',{style:'display:flex;gap:8px;margin-top:12px'});
  if(p.online){
    actions.append(
      el('span',{class:'muted tiny', style:'flex:1;align-self:center', text:'Connected · syncing live'}),
      el('button',{class:'btn sm', html:`${icon('chat')} Message`,
        onclick:()=>ctx.go('messages')}));
  }else{
    actions.append(
      el('span',{class:'muted tiny', style:'flex:1;align-self:center', text:'Saved peer · permissions kept'}),
      el('button',{class:'btn sm ghost', html:`${icon('trash')} Forget`,
        // Sync.forgetPeer's own 'peers' emit already re-renders this section.
        onclick:()=>{ Sync.forgetPeer(uid); toast('Peer forgotten',{kind:'ok'}); }}));
  }
  c.append(actions);
  return c;
}

// ---- WebRTC manual signaling modal --------------------------------------
function signalingModal(){
  const body=el('div');
  const seg=el('div',{class:'seg', style:'margin-bottom:16px'});
  const bCreate=el('button',{class:'on', text:'Create invite'});
  const bJoin=el('button',{text:'Join with invite'});
  seg.append(bCreate,bJoin);
  const pane=el('div');
  body.append(seg,pane);
  const { hide, overlay } = modal({ title:'Connect a peer over WebRTC', icon:'link', wide:true, body });

  // Watch for the data channel actually opening, then celebrate. Any webrtc
  // peer that becomes connected after the modal opened is "the one".
  const before = new Set(Sync.peerList().filter(p=>p.transport==='webrtc'&&p.state==='connected').map(p=>p.id));
  const off = Sync.on('peers', ()=>{
    if(!document.body.contains(overlay)){ off(); return; }   // modal closed elsewhere
    const fresh = Sync.peerList().find(p=>p.transport==='webrtc'&&p.state==='connected'&&!before.has(p.id));
    if(fresh) showConnected(fresh);
  });
  const done=()=>{ off(); hide(); };

  function showConnected(peer){
    seg.classList.add('hide');
    pane.innerHTML='';
    const box=el('div',{class:'connected-box'});
    box.innerHTML=`<div class="ok-badge">${icon('check')}</div>
      <h3>Connected to ${escapeHtml(peer.name)}</h3>
      <p class="muted tiny">You're syncing directly, peer-to-peer. Manage permissions on their card.</p>`;
    const btns=el('div',{style:'display:flex;gap:10px;justify-content:center;margin-top:8px'});
    btns.append(
      el('button',{class:'btn primary', html:`${icon('check')} Done`, onclick:done}),
      el('button',{class:'btn', html:`${icon('plus')} Connect another`, onclick:()=>{
        before.add(peer.id);                 // don't re-trigger on this one
        seg.classList.remove('hide');
        bCreate.classList.add('on'); bJoin.classList.remove('on'); showCreate();
      }}));
    box.append(btns); pane.append(box);
    toast(`Connected to ${peer.name}`,{kind:'ok'});
  }

  const help=(t)=>el('p',{class:'muted tiny', html:t});
  const ta=(ph)=>el('textarea',{class:'input', rows:'4', placeholder:ph, spellcheck:'false'});
  const copyBtn=(getVal)=>el('button',{class:'btn sm', html:`${icon('copy')} Copy`,
    onclick:()=>{navigator.clipboard?.writeText(getVal()).then(()=>toast('Copied',{kind:'ok'}));}});

  function showCreate(){
    pane.innerHTML='';
    pane.append(help('1 — Generate an <b>offer</b> and send it to your peer (chat, email, anything). 2 — Paste the <b>answer</b> they send back. No server sees this.'));
    const out=ta('Offer will appear here…'); out.readOnly=true;
    const gen=el('button',{class:'btn primary', html:`${icon('bolt')} Generate offer`,
      onclick:async()=>{ gen.disabled=true; gen.innerHTML=`${icon('refresh')} Gathering…`;
        try{ out.value=await Sync.createOffer(); toast('Offer ready — share it',{kind:'ok'}); }
        catch(e){ toast('Failed to create offer',{body:e.message,kind:'err'}); }
        gen.disabled=false; gen.innerHTML=`${icon('refresh')} Regenerate`; }});
    const ansIn=ta('Paste the answer blob from your peer…');
    const complete=el('button',{class:'btn', html:`${icon('check')} Complete connection`,
      onclick:async()=>{ try{ await Sync.acceptAnswer(ansIn.value); complete.disabled=true;
          complete.innerHTML=`${icon('refresh')} Connecting…`; }
        catch(e){ toast('Could not complete',{body:e.message,kind:'err'}); } }});
    pane.append(field('Your offer', out, copyBtn(()=>out.value), gen),
      field('Their answer', ansIn, complete));
  }
  function showJoin(){
    pane.innerHTML='';
    pane.append(help('1 — Paste the <b>offer</b> your peer sent you. 2 — Generate an <b>answer</b> and send it back to them.'));
    const offIn=ta('Paste the offer blob from your peer…');
    const out=ta('Answer will appear here…'); out.readOnly=true;
    const gen=el('button',{class:'btn primary', html:`${icon('bolt')} Generate answer`,
      onclick:async()=>{ gen.disabled=true; gen.innerHTML=`${icon('refresh')} Gathering…`;
        try{ out.value=await Sync.acceptOffer(offIn.value); toast('Answer ready — send it back',{kind:'ok'}); }
        catch(e){ toast('Invalid offer',{body:e.message,kind:'err'}); }
        gen.disabled=false; gen.innerHTML=`${icon('bolt')} Generate answer`; }});
    pane.append(field('Their offer', offIn, gen),
      field('Your answer', out, copyBtn(()=>out.value)));
  }
  function field(label, control, ...btns){
    const f=el('div',{class:'field'});
    const head=el('div',{style:'display:flex;align-items:center;gap:8px'});
    head.append(el('label',{text:label, style:'flex:1'}), ...btns.filter(Boolean));
    f.append(head, control); return f;
  }
  bCreate.onclick=()=>{bCreate.classList.add('on');bJoin.classList.remove('on');showCreate();};
  bJoin.onclick=()=>{bJoin.classList.add('on');bCreate.classList.remove('on');showJoin();};
  showCreate();
}
