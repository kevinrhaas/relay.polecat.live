// Settings: identity, appearance (dark/light/system), P2P transport,
// data export / import / reset.
import { Store } from '../store.js';
import { Sync } from '../sync.js';
import { Rendezvous } from '../rendezvous.js';
import { Access } from '../access.js';
import { el, escapeHtml, toast, confirmDialog, avatarColor, initials } from '../ui.js';
import { icon } from '../icons.js';
import { setTheme, getThemePref } from '../theme.js';

export function renderSettings(root, ctx){
  root.innerHTML='';
  const wrap=el('div',{class:'wrap'});
  wrap.append(el('div',{class:'section-title', html:'<h2>Settings</h2>'}));

  // ---- identity --------------------------------------------------------
  const idCard=el('div',{class:'card'});
  idCard.innerHTML=`<div class="section-title" style="margin-top:0"><h2 style="font-size:14px">Identity</h2></div>`;
  const av=el('div',{class:'peer-av', style:`background:${avatarColor(Store.identity.id)};width:52px;height:52px;font-size:18px`, text:initials(Store.identity.name)});
  const nameIn=el('input',{class:'input', value:Store.identity.name});
  const row=el('div',{style:'display:flex;gap:16px;align-items:center'});
  const nameField=el('div',{class:'field',style:'flex:1;margin:0'});
  nameField.append(el('label',{text:'Display name (what peers see)'}), nameIn);
  row.append(av, nameField);
  idCard.append(row);
  idCard.append(el('div',{class:'field', style:'margin-top:14px', html:
    `<label>Peer ID</label><div class="chip" style="font-family:var(--mono)">${escapeHtml(Store.identity.id)}</div>`}));
  const saveId=el('button',{class:'btn primary', style:'margin-top:6px', html:`${icon('check')} Save identity`,
    onclick:()=>{ Store.saveIdentity({name:nameIn.value.trim()||Store.identity.name});
      av.textContent=initials(Store.identity.name); toast('Identity saved',{kind:'ok'}); }});
  idCard.append(saveId);
  wrap.append(idCard);

  // ---- appearance ------------------------------------------------------
  const appCard=el('div',{class:'card', style:'margin-top:16px'});
  appCard.innerHTML=`<div class="section-title" style="margin-top:0"><h2 style="font-size:14px">Appearance</h2></div>`;
  const seg=el('div',{class:'seg'});
  const cur=getThemePref();
  [['dark','moon'],['light','sun'],['system','settings']].forEach(([mode,ic])=>{
    const b=el('button',{class:cur===mode?'on':'', html:`${icon(ic)} ${mode[0].toUpperCase()+mode.slice(1)}`,
      onclick:()=>{ setTheme(mode); [...seg.children].forEach(x=>x.classList.remove('on')); b.classList.add('on'); }});
    seg.append(b);
  });
  appCard.append(el('div',{class:'field', html:'<label>Theme</label>'}), seg);
  wrap.append(appCard);

  // ---- Advanced (collapsed): transport + optional auto-discovery -------
  // Relay is fully serverless by default; nothing in here is required. This
  // is tucked away so the everyday flow stays simple.
  const st = Rendezvous.state;
  const adv=el('details',{class:'card adv', style:'margin-top:16px'});
  const sum=el('summary', {html:`
    <span class="adv-title"><span class="adv-ic">${icon('settings')}</span> Advanced · connection &amp; auto-discovery</span>
    ${st==='online'?'<span class="conn-state conn-connected"><span class="dot"></span>auto-connect on</span>':'<span class="muted tiny">optional</span>'}
    <span class="adv-chevron">${icon('chevron')}</span>`});
  adv.append(sum);
  adv.append(el('p',{class:'muted tiny', html:`Relay is <b>fully serverless by default</b> — you don't need anything here.
    Tabs on the same machine discover each other automatically, and across the internet you connect by pasting a one-time
    WebRTC invite. Everything syncs either way.<br><br>
    If you'd rather <b>skip the copy/paste</b>, you can point Relay at a tiny signaling relay — a Cloudflare Worker you deploy
    (see the <span class="kbd">rendezvous/</span> folder in the repo). Then peers who open the same room connect automatically.
    The relay only introduces two browsers to each other; it <b>never sees, stores, or relays your data</b>.`}));

  // -- STUN (NAT traversal helper) --
  adv.append(el('div',{class:'section-title', style:'margin:18px 0 4px', html:'<h2 style="font-size:13px">STUN server</h2>'}));
  adv.append(el('p',{class:'muted tiny', html:'Only helps WebRTC discover your public address for NAT traversal — it never relays data. Leave blank for pure LAN / serverless mode.'}));
  const stun=el('input',{class:'input', placeholder:'stun:stun.l.google.com:19302',
    value: localStorage.getItem('relay.stun') ?? 'stun:stun.l.google.com:19302'});
  const stunField=el('div',{class:'field', style:'margin-top:8px'});
  stunField.append(el('label',{text:'STUN server (optional)'}), stun);
  const saveStun=el('button',{class:'btn sm', html:`${icon('check')} Save`,
    onclick:()=>{ localStorage.setItem('relay.stun', stun.value.trim()); toast('Transport updated',{kind:'ok'}); }});
  adv.append(stunField, saveStun, el('div',{class:'divider'}));

  // -- Rendezvous (auto-discovery) --
  const stColor = st==='online'?'var(--success)':st==='connecting'?'var(--warning)':st==='error'?'var(--danger)':'var(--text-3)';
  adv.append(el('div',{class:'section-title', style:'margin:4px 0 4px', html:`
    <h2 style="font-size:13px">Auto-discovery (rendezvous)</h2><div class="sp"></div>
    <span class="conn-state" style="color:${stColor}"><span class="dot" style="background:${stColor}"></span>${st}</span>`}));
  adv.append(el('p',{class:'muted tiny', html:'Point Relay at your deployed relay URL and pick a shared room. Peers in the same room auto-connect — no invite blobs to exchange.'}));
  const rurl=el('input',{class:'input', placeholder:'wss://relay-rendezvous.you.workers.dev', value:Rendezvous.url});
  const rroom=el('input',{class:'input', placeholder:'team-polecat', value:Rendezvous.room});
  const uf=el('div',{class:'field', style:'margin-top:8px'}); uf.append(el('label',{text:'Rendezvous URL'}), rurl);
  const rf=el('div',{class:'field'}); rf.append(el('label',{text:'Room'}), rroom);
  const connected = st==='online'||st==='connecting';
  const actionBtn = connected
    ? el('button',{class:'btn danger', html:`${icon('x')} Disconnect`, onclick:()=>{ Rendezvous.disconnect(); toast('Left rendezvous',{kind:'ok'}); renderSettings(root,ctx); }})
    : el('button',{class:'btn primary', html:`${icon('broadcast')} Connect`, onclick:()=>{
        if(!rurl.value.trim()||!rroom.value.trim()){ toast('URL and room required',{kind:'err'}); return; }
        Rendezvous.connect(rurl.value, rroom.value); toast('Connecting to rendezvous…',{kind:'ok'}); renderSettings(root,ctx); }});
  adv.append(uf, rf, actionBtn);
  // keep it open if the user already configured it, so state is visible
  if(Rendezvous.configured()||connected) adv.open=true;
  wrap.append(adv);

  // ---- data ------------------------------------------------------------
  const dataCard=el('div',{class:'card', style:'margin-top:16px'});
  dataCard.innerHTML=`<div class="section-title" style="margin-top:0"><h2 style="font-size:14px">Data</h2></div>
    <p class="muted tiny">Your entire workspace lives in this browser's localStorage. Export a portable snapshot, import one from a peer, or reset to the seed data.</p>`;
  const btns=el('div',{style:'display:flex;gap:10px;flex-wrap:wrap'});
  btns.append(
    el('button',{class:'btn', html:`${icon('download')} Export workspace`, onclick:exportWorkspace}),
    el('button',{class:'btn', html:`${icon('upload')} Import workspace`, onclick:()=>importWorkspace(ctx)}),
    el('button',{class:'btn danger', html:`${icon('trash')} Reset to demo`, onclick:async()=>{
      if(await confirmDialog('Reset workspace','This replaces all entities and records with the seed demo data. This cannot be undone.',{danger:true,okLabel:'Reset'})){
        Store.reset(); toast('Workspace reset',{kind:'ok'}); ctx.go('home'); }
    }}));
  dataCard.append(btns);
  wrap.append(dataCard);

  // ---- admin / invites -------------------------------------------------
  const admCard=el('div',{class:'card', style:'margin-top:16px'});
  admCard.innerHTML=`<div class="section-title" style="margin-top:0"><h2 style="font-size:14px">Admin &amp; invites</h2></div>
    <p class="muted tiny">${Access.isAdmin()?'Admin is unlocked on this device — mint invite links to share.':'Hold an admin token? Unlock the admin area to mint invite links for others.'}</p>`;
  admCard.append(el('button',{class:'btn'+(Access.isAdmin()?' primary':''),
    html:`${icon('key')} ${Access.isAdmin()?'Open admin area':'Unlock admin'}`, onclick:()=>ctx.go('admin')}));
  wrap.append(admCard);

  root.append(wrap);
}

export function exportWorkspace(){
  const blob=new Blob([Store.export()],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=el('a',{href:url, download:`relay-workspace-${Store.identity.name}.json`});
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  toast('Workspace exported',{kind:'ok'});
}

export function importWorkspace(ctx){
  const inp=el('input',{type:'file', accept:'application/json,.json', style:'display:none'});
  inp.onchange=()=>{
    const f=inp.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{ try{ Store.import(r.result,{merge:true}); toast('Workspace imported',{kind:'ok'}); ctx&&ctx.refresh&&ctx.refresh(); }
      catch(e){ toast('Import failed',{body:e.message,kind:'err'}); } };
    r.readAsText(f);
  };
  document.body.append(inp); inp.click(); inp.remove();
}
