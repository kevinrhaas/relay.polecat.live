// app.js — main controller: boot, routing, topbar, cross-view glue.
import { Store } from './store.js';
import { Sync } from './sync.js';
import { Rendezvous } from './rendezvous.js';
import { LocalFolder, S3Sync, WebDAVSync, Dropbox } from './storage/index.js';
import { Access } from './access.js';
import { applyTheme, getThemePref, setTheme } from './theme.js';
import { buildRail, SECTIONS } from './shell.js';
import { el, $, escapeHtml, toast, modal, avatarColor, initials } from './ui.js';
import { icon } from './icons.js';
import { renderHome } from './views/home.js';
import { renderTable, currentEntity } from './views/table.js';
import { renderPeers } from './views/peers.js';
import { renderActivity, pushLogLine } from './views/activity.js';
import { renderSettings, importWorkspace, exportWorkspace } from './views/settings.js';
import { renderMessages } from './views/messages.js';
import { renderAdmin } from './views/admin.js';
import { openWhatsNew, hasUnread } from './views/whatsnew.js';

const TITLES = { home:'Home', table:'Tables', messages:'Messages', peers:'Peers', activity:'Activity', admin:'Admin', settings:'Settings' };
const RENDERERS = { home:renderHome, table:renderTable, messages:renderMessages, peers:renderPeers, activity:renderActivity, admin:renderAdmin, settings:renderSettings };

let rail, view, topTitle, presence, avatars;
let currentSection='home', currentParams={};
let unread=0;

async function boot(){
  applyTheme();

  // invite-only gate: consume ?invite= then require access
  const gate = await Access.init();
  if(!gate.granted){ renderGate(gate.inviteError); return; }

  Sync.start();
  Rendezvous.autostart();
  LocalFolder.autostart();
  S3Sync.autostart();
  WebDAVSync.autostart();
  Dropbox.autostart();

  const app=$('#app');
  rail=el('nav',{id:'rail','aria-label':'Navigation'});
  const main=el('div',{id:'main'});
  const topbar=buildTopbar();
  view=el('div',{class:'view', id:'view'});
  main.append(topbar, view);
  // backdrop sits between rail and main so `#rail.open ~ .rail-backdrop`
  // shows it on mobile; tapping it closes the drawer
  const backdrop=el('div',{class:'rail-backdrop', onclick:()=>window.__rail.setOpen(false)});
  app.append(rail, backdrop, main);

  window.__rail = buildRail(rail, { onNav:(s)=>go(s), isAdmin:Access.isAdmin() });

  wireEvents();
  // route from hash
  const initial = (location.hash.replace('#','') || 'home');
  go(SECTIONS.some(s=>s.key===initial)?initial:'home');
  refreshBadges(); refreshPresence();
}

function buildTopbar(){
  const bar=el('div',{class:'topbar'});
  const menuBtn=el('button',{class:'btn icon ghost topbar-menu', title:'Menu', 'aria-label':'Open navigation',
    html:icon('menu'), onclick:()=>window.__rail.setOpen(!rail.classList.contains('open'))});
  topTitle=el('h1',{text:'Home'});
  bar.append(menuBtn, topTitle, el('span',{class:'sp'}));

  avatars=el('div',{class:'avatars'});
  presence=el('div',{class:'presence', title:'Changes sync automatically with connected peers', html:`<span class="dot"></span><span class="txt">offline</span>`});
  const themeBtn=el('button',{class:'btn icon ghost', title:'Toggle theme',
    html:icon(getThemePref()==='light'?'moon':'sun'),
    onclick:()=>{ const next=document.documentElement.getAttribute('data-theme')==='light'?'dark':'light';
      setTheme(next); themeBtn.innerHTML=icon(next==='light'?'moon':'sun'); }});
  const whatsNewBtn=el('button',{class:'btn icon ghost wn-btn', title:"What's new",
    html:icon('sparkle'), onclick:()=>{ openWhatsNew(); whatsNewBtn.classList.remove('has-unread'); }});
  if(hasUnread()) whatsNewBtn.classList.add('has-unread');
  const newBtn=el('button',{class:'btn sm primary', html:`${icon('plus')} New`, onclick:()=>newEntity()});
  bar.append(avatars, presence, whatsNewBtn, themeBtn, newBtn);
  return bar;
}

// ---- routing -------------------------------------------------------------
function go(section, params={}){
  if(!RENDERERS[section]) section='home';
  currentSection=section; currentParams=params;
  location.hash=section;
  topTitle.textContent=TITLES[section]||'Relay';
  window.__rail.setActive(section);
  if(section==='messages'){ unread=0; refreshBadges(); }
  if(window.innerWidth<=720) window.__rail.setOpen(false);   // close drawer on mobile
  render();
}
function render(){
  RENDERERS[currentSection](view, ctx, currentParams);
}
function refresh(){
  // rebuild rail so the Admin item reflects unlock state, then re-render
  window.__rail = buildRail(rail, { onNav:(s)=>go(s), isAdmin:Access.isAdmin() });
  window.__rail.setActive(currentSection);
  render(); refreshBadges(); refreshPresence();
}

// context handed to every view
const ctx = {
  go,
  refresh,
  newEntity: ()=>newEntity(),
  importWorkspace: ()=>importWorkspace(ctx),
  exportWorkspace,
};

// ---- new entity dialog ---------------------------------------------------
function newEntity(){
  const name=el('input',{class:'input', placeholder:'e.g. Projects, Inventory, Notes'});
  const icons=['table','db','grid','peers','check','star','bolt','key'];
  let chosen='table';
  const picker=el('div',{style:'display:flex;gap:8px;flex-wrap:wrap'});
  icons.forEach(ic=>{
    const label=ic[0].toUpperCase()+ic.slice(1)+' icon';
    const b=el('button',{class:'btn icon'+(ic==='table'?' primary':''), title:label, 'aria-label':label,
      'aria-pressed':String(ic==='table'), html:icon(ic), onclick:()=>{
      chosen=ic; [...picker.children].forEach(x=>{x.classList.remove('primary');x.setAttribute('aria-pressed','false')});
      b.classList.add('primary'); b.setAttribute('aria-pressed','true'); }});
    picker.append(b);
  });
  const body=el('div');
  body.append(
    el('div',{class:'field'},null),
    (()=>{ const f=el('div',{class:'field'}); f.append(el('label',{text:'Entity name'}), name); return f; })(),
    (()=>{ const f=el('div',{class:'field'}); f.append(el('label',{text:'Icon'}), picker); return f; })(),
    el('p',{class:'muted tiny', text:'An entity is a shared table. Every row gets a globally-unique id and fully dynamic fields — add columns as you go.'}));
  const {hide}=modal({ title:'New entity', icon:'plus', body,
    foot:[ el('button',{class:'btn', text:'Cancel', onclick:()=>hide()}),
      el('button',{class:'btn primary', text:'Create', onclick:()=>{
        const label=name.value.trim(); if(!label){ name.focus(); return; }
        try{ const key=Store.createEntity(label, chosen); hide(); toast('Entity created',{kind:'ok'}); go('table',{entity:key}); }
        catch(e){ toast('Could not create',{body:e.message,kind:'err'}); }
      }})]});
  setTimeout(()=>name.focus(),50);
}

// ---- live glue -----------------------------------------------------------
function refreshBadges(){
  window.__rail.setBadge('peers', Sync.onlineCount());
  window.__rail.setBadge('messages', unread);
}
function refreshPresence(){
  const n=Sync.onlineCount();
  presence.classList.toggle('online', n>0);
  // reassure the user sync is continuous when peers are connected
  presence.querySelector('.txt').textContent = n? `${n} online · live` : 'no peers';
  avatars.innerHTML='';
  Sync.peerList().slice(0,4).forEach(p=>{
    avatars.append(el('div',{class:'av', title:p.name, style:`background:${avatarColor(p.id)}`, text:initials(p.name)}));
  });
}

function wireEvents(){
  Sync.on('peers', ()=>{ refreshBadges(); refreshPresence(); if(currentSection==='peers') render(); if(currentSection==='home') render(); });
  Sync.on('stats', ()=>{ if(currentSection==='activity'||currentSection==='home') render(); });
  Sync.on('perms', ()=>{ if(currentSection==='peers') render(); });
  Rendezvous.on('state', ()=>{ if(['peers','settings'].includes(currentSection)) render(); });
  LocalFolder.on('state', ()=>{ if(currentSection==='settings') render(); });
  LocalFolder.on('synced', ()=>{ if(currentSection==='settings') render(); });
  S3Sync.on('state', ()=>{ if(currentSection==='settings') render(); });
  S3Sync.on('synced', ()=>{ if(currentSection==='settings') render(); });
  WebDAVSync.on('state', ()=>{ if(currentSection==='settings') render(); });
  WebDAVSync.on('synced', ()=>{ if(currentSection==='settings') render(); });
  Dropbox.on('state', ()=>{ if(currentSection==='settings') render(); });
  Dropbox.on('synced', ()=>{ if(currentSection==='settings') render(); });
  Sync.on('log', (line)=>{ if(currentSection==='activity') pushLogLine(line); });
  Sync.on('chat', (m)=>{
    if(m && m.from!==Sync.selfId && currentSection!=='messages'){ unread++; refreshBadges(); }
  });

  Store.on('entities', ()=>{ if(['table','home'].includes(currentSection)) render(); });
  Store.on('change', (c)=>{
    if(c.origin==='remote' && c.type==='record'){
      const e=Store.entity(c.entity);
      toast('Synced update', {body:`${e?.label||c.entity} changed by a peer`, kind:'info', ms:2600});
    }
    if(['home','table','activity'].includes(currentSection)) render();
  });
  Store.on('pinned', ()=>{ if(currentSection==='home') render(); });
  Store.on('identity', ()=>refreshPresence());

  window.addEventListener('hashchange',()=>{
    const s=location.hash.replace('#','');
    if(s && s!==currentSection && RENDERERS[s]) go(s);
  });
}

// ---- invite-only gate screen --------------------------------------------
function renderGate(errMsg){
  const app=$('#app');
  app.innerHTML='';
  const g=el('div',{class:'gate'});
  const card=el('div',{class:'gate-card'});
  card.innerHTML=`
    <img src="/assets/logo.svg" width="48" height="48" alt=""/>
    <h1>Relay preview</h1>
    <p class="muted">This is an invite-only preview. Paste an invite code or your admin token to continue — or open the invite link someone sent you.</p>`;
  const ta=el('textarea',{class:'input', rows:'3', placeholder:'Paste invite code or admin token…', spellcheck:'false'});
  const err=el('div',{class:'gate-err'+(errMsg?'':' hide'), text: errMsg?`That invite is ${errMsg}.`:''});
  const btn=el('button',{class:'btn primary', style:'width:100%', html:`${icon('shield')} Unlock`, onclick:enter});
  const back=el('a',{class:'link tiny', href:'/', text:'← Back to relay.polecat.live'});
  card.append(ta, err, btn, back);
  g.append(card); app.append(g);
  async function enter(){
    const v=ta.value.trim(); if(!v) return;
    btn.disabled=true; err.classList.add('hide');
    if(await Access.verifyAdminToken(v)){ await Access.unlockAdmin(v); location.reload(); return; }
    const r=await Access.verifyInvite(v);
    if(r.ok){ Access.grant('invite', r.payload.label||''); location.reload(); return; }
    btn.disabled=false; err.textContent = r.reason==='expired' ? 'That invite has expired.' : 'That code is not valid.';
    err.classList.remove('hide');
  }
  ta.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); enter(); } });
  setTimeout(()=>ta.focus(),50);
}

document.addEventListener('DOMContentLoaded', boot);
