// app.js — main controller: boot, routing, topbar, cross-view glue.
// The app frame (rail + topbar + right panel + app switcher) comes from the
// vendored Polecat Shell (vendor/polecat-shell/ — READ-ONLY; changes belong
// in kevinrhaas/polecat-platform and arrive via sync-shell PRs).
import { Store } from './store.js';
import { Sync } from './sync.js';
import { Rendezvous } from './rendezvous.js';
import { LocalFolder, S3Sync, WebDAVSync, Dropbox, GoogleDrive } from './storage/index.js';
import { Access } from './access.js';
import { configure as themeConfigure, applyTheme, toggleMode, effectiveMode } from '../vendor/polecat-shell/theme.js';
import { initShell, rightPanel, appSwitcher } from '../vendor/polecat-shell/shell.js';
import { initWhatsNew, hasUnseen } from '../vendor/polecat-shell/whatsnew.js';
import { FLEET } from '../vendor/polecat-shell/catalog.js';
import { CHANGELOG, LATEST_VERSION } from './changelog.js';
import { el, $, escapeHtml, toast, modal, avatarColor, initials } from './ui.js';
import { icon } from './icons.js';
import { renderHome } from './views/home.js';
import { renderTable, currentEntity } from './views/table.js';
import { renderPeers } from './views/peers.js';
import { renderActivity, pushLogLine } from './views/activity.js';
import { renderSettings, importWorkspace, exportWorkspace } from './views/settings.js';
import { renderMessages } from './views/messages.js';
import { renderAdmin } from './views/admin.js';
import { openGlobalSearch } from './views/search.js';
import { openShortcuts } from './views/shortcuts.js';

const TITLES = { home:'Home', table:'Tables', messages:'Messages', peers:'Peers', activity:'Activity', admin:'Admin', settings:'Settings' };
const RENDERERS = { home:renderHome, table:renderTable, messages:renderMessages, peers:renderPeers, activity:renderActivity, admin:renderAdmin, settings:renderSettings };

export const SECTIONS = [
  { group:'Workspace' },
  { key:'home',     label:'Home',     icon:'home' },
  { key:'table',    label:'Tables',   icon:'table' },
  { key:'messages', label:'Messages', icon:'chat' },
  { key:'peers',    label:'Peers',    icon:'peers' },
  { key:'activity', label:'Activity', icon:'activity' },
  { group:'System' },
  { key:'admin',    label:'Admin',    icon:'key', admin:true },
  { key:'settings', label:'Settings', icon:'settings' },
];

const WN_KEY = 'relay.whatsnew.seen';

let view, topTitle, presence, avatars, whatsNewBtn;
let currentSection='home', currentParams={};

async function boot(){
  // Historical key kept via configure(); the pre-paint snippet in index.html
  // migrates any legacy bare-mode value ('dark') to 'polecat:dark' in place.
  themeConfigure({ storageKey:'relay.theme', defaultTheme:'polecat:dark' });
  applyTheme();

  // Relay is open to everyone — no gate. Access.init() still consumes
  // ?invite= / ?rdv= links so a shared link can preconfigure auto-connect.
  await Access.init();

  Sync.start();
  Rendezvous.autostart();
  LocalFolder.autostart();
  S3Sync.autostart();
  WebDAVSync.autostart();
  Dropbox.autostart();
  GoogleDrive.autostart();

  buildShell();
  wireEvents();
  // route from hash
  const initial = (location.hash.replace('#','') || 'home');
  go(SECTIONS.some(s=>s.key===initial)?initial:'home');
  refreshBadges(); refreshPresence();
}

// Build (or rebuild — e.g. after an admin unlock) the shell frame into #app.
function buildShell(){
  const app=$('#app');
  app.innerHTML='';

  topTitle=el('h1',{text:TITLES[currentSection]||'Home'});
  avatars=el('div',{class:'avatars'});
  presence=el('div',{class:'presence', title:'Changes sync automatically with connected peers', html:`<span class="dot"></span><span class="txt">offline</span>`});
  const searchBtn=el('button',{class:'btn icon ghost', title:'Search everything (Ctrl+K)', 'aria-label':'Search everything',
    html:icon('search'), onclick:()=>openGlobalSearch(ctx)});
  const shortcutsBtn=el('button',{class:'btn icon ghost', title:'Keyboard shortcuts (?)', 'aria-label':'Keyboard shortcuts',
    html:icon('keyboard'), onclick:()=>openShortcuts()});
  const themeBtn=el('button',{class:'btn icon ghost', title:'Toggle theme',
    html:icon(effectiveMode()==='light'?'moon':'sun'),
    onclick:()=>{ toggleMode(); themeBtn.innerHTML=icon(effectiveMode()==='light'?'moon':'sun'); }});
  whatsNewBtn=el('button',{class:'btn icon ghost wn-btn', title:"What's new",
    html:icon('sparkle'), onclick:()=>openWhatsNew()});
  if(hasUnseen(WN_KEY, LATEST_VERSION)) whatsNewBtn.classList.add('has-unread');
  const newBtn=el('button',{class:'btn sm primary', html:`${icon('plus')} New`, onclick:()=>newEntity()});

  const shell = initShell({
    app: { id:'relay', name:'Relay', wordmark:`<img src="/assets/logo.svg" alt=""/>` },
    sections: SECTIONS.map(s=> s.group ? s : { ...s, icon:icon(s.icon) }),
    onNav: (s)=>go(s),
    isAdmin: ()=>Access.isAdmin(),
    rail: { storageKey:'relay.rail' },   // historical keys: relay.rail.open / relay.rail.width
    topbar: {
      left:  [topTitle],
      right: [avatars, presence, searchBtn, shortcutsBtn, whatsNewBtn, themeBtn,
              appSwitcher(FLEET, { current:'relay' }), newBtn],
    },
    mount: app,
  });
  window.__rail = shell;

  // The shell's main region hosts the views; keep the app's historical id +
  // class so view CSS and tooling keep working unchanged.
  view = shell.els.main;
  view.id='view'; view.classList.add('view');
}

function openWhatsNew(){
  rightPanel({
    title:"What's new",
    body: initWhatsNew({ entries:CHANGELOG, latest:LATEST_VERSION, storageKey:WN_KEY,
      labels:{ title:'Relay' } }),
  });
  whatsNewBtn.classList.remove('has-unread');
}

// ---- routing -------------------------------------------------------------
function go(section, params={}){
  if(!RENDERERS[section]) section='home';
  if(currentSection==='table' && section!=='table') Sync.setViewing(null);   // leaving Tables clears our presence
  currentSection=section; currentParams=params;
  location.hash=section;
  topTitle.textContent=TITLES[section]||'Relay';
  window.__rail.setActive(section);
  render();
}
function render(){
  RENDERERS[currentSection](view, ctx, currentParams);
}
function refresh(){
  // rebuild the shell so the Admin item reflects unlock state, then re-render
  buildShell();
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
  window.__rail.setBadge('messages', Sync.totalUnread());
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

function isEditableTarget(t){
  if(!t) return false;
  if(['INPUT','TEXTAREA','SELECT'].includes(t.tagName)) return true;
  return !!t.isContentEditable;
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
  GoogleDrive.on('state', ()=>{ if(currentSection==='settings') render(); });
  GoogleDrive.on('synced', ()=>{ if(currentSection==='settings') render(); });
  Sync.on('log', (line)=>{ if(currentSection==='activity') pushLogLine(line); });
  Sync.on('chat', ()=>refreshBadges());
  Sync.on('read', ()=>refreshBadges());

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

  window.addEventListener('keydown', e=>{
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); openGlobalSearch(ctx); }
    else if(e.key==='?' && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditableTarget(e.target)){
      e.preventDefault(); openShortcuts();
    }
  });
}

document.addEventListener('DOMContentLoaded', boot);
