// app.js — main controller: boot, routing, topbar, cross-view glue.
import { Store } from './store.js';
import { Sync } from './sync.js';
import { Rendezvous } from './rendezvous.js';
import { applyTheme, getThemePref, setTheme } from './theme.js';
import { buildRail, SECTIONS } from './shell.js';
import { el, $, escapeHtml, toast, modal, avatarColor, initials } from './ui.js';
import { icon } from './icons.js';
import { renderHome } from './views/home.js';
import { renderTable, currentEntity } from './views/table.js';
import { renderPeers } from './views/peers.js';
import { renderActivity, pushLogLine } from './views/activity.js';
import { renderSettings, importWorkspace, exportWorkspace } from './views/settings.js';

const TITLES = { home:'Home', table:'Tables', peers:'Peers', activity:'Activity', settings:'Settings' };
const RENDERERS = { home:renderHome, table:renderTable, peers:renderPeers, activity:renderActivity, settings:renderSettings };

let rail, view, topTitle, presence, avatars;
let currentSection='home', currentParams={};

function boot(){
  applyTheme();
  Sync.start();
  Rendezvous.autostart();

  const app=$('#app');
  rail=el('nav',{id:'rail','aria-label':'Navigation'});
  const main=el('div',{id:'main'});
  const topbar=buildTopbar();
  view=el('div',{class:'view', id:'view'});
  main.append(topbar, view);
  app.append(rail, main);

  window.__rail = buildRail(rail, { onNav:(s)=>go(s) });

  wireEvents();
  // route from hash
  const initial = (location.hash.replace('#','') || 'home');
  go(SECTIONS.some(s=>s.key===initial)?initial:'home');
  refreshBadges(); refreshPresence();
}

function buildTopbar(){
  const bar=el('div',{class:'topbar'});
  topTitle=el('h1',{text:'Home'});
  bar.append(topTitle, el('span',{class:'sp'}));

  avatars=el('div',{class:'avatars'});
  presence=el('div',{class:'presence', html:`<span class="dot"></span><span class="txt">offline</span>`});
  const syncBtn=el('button',{class:'btn sm', html:`${icon('refresh')} Sync`, title:'Sync with all peers',
    onclick:()=>{ Sync.syncAll(); }});
  const themeBtn=el('button',{class:'btn icon ghost', title:'Toggle theme',
    html:icon(getThemePref()==='light'?'moon':'sun'),
    onclick:()=>{ const next=document.documentElement.getAttribute('data-theme')==='light'?'dark':'light';
      setTheme(next); themeBtn.innerHTML=icon(next==='light'?'moon':'sun'); }});
  const newBtn=el('button',{class:'btn sm primary', html:`${icon('plus')} New`, onclick:()=>newEntity()});
  bar.append(avatars, presence, syncBtn, themeBtn, newBtn);
  return bar;
}

// ---- routing -------------------------------------------------------------
function go(section, params={}){
  if(!RENDERERS[section]) section='home';
  currentSection=section; currentParams=params;
  location.hash=section;
  topTitle.textContent=TITLES[section]||'Relay';
  window.__rail.setActive(section);
  render();
}
function render(){
  RENDERERS[currentSection](view, ctx, currentParams);
}
function refresh(){ render(); refreshBadges(); refreshPresence(); }

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
    const b=el('button',{class:'btn icon'+(ic==='table'?' primary':''), html:icon(ic), onclick:()=>{
      chosen=ic; [...picker.children].forEach(x=>x.classList.remove('primary')); b.classList.add('primary'); }});
    picker.append(b);
  });
  const body=el('div');
  body.append(
    el('div',{class:'field'},null),
    (()=>{ const f=el('div',{class:'field'}); f.append(el('label',{text:'Entity name'}), name); return f; })(),
    (()=>{ const f=el('div',{class:'field'}); f.append(el('label',{text:'Icon'}), picker); return f; })(),
    el('p',{class:'muted tiny', text:'An entity is a shared table of UUID-keyed JSON rows. Fields are fully dynamic — add columns as you go.'}));
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
}
function refreshPresence(){
  const n=Sync.onlineCount();
  presence.classList.toggle('online', n>0);
  presence.querySelector('.txt').textContent = n? `${n} online` : 'no peers';
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
  Sync.on('log', (line)=>{ if(currentSection==='activity') pushLogLine(line); });

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

document.addEventListener('DOMContentLoaded', boot);
