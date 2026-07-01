// Home dashboard: greeting, stats, quick actions, pinned + recent entities.
import { Store } from '../store.js';
import { Sync } from '../sync.js';
import { el, ago, avatarColor, initials, escapeHtml, toast } from '../ui.js';
import { icon } from '../icons.js';

export function renderHome(root, ctx){
  const me = Store.identity;
  const hour = new Date().getHours();
  const greet = hour<5?'Still up':hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';

  root.innerHTML = '';
  const wrap = el('div',{class:'wrap'});

  // hero
  wrap.append(el('div',{class:'section-title', html:`
    <div>
      <h2 style="font-size:22px">${greet}, ${escapeHtml(me.name.split('-')[0])}</h2>
      <div class="muted tiny" style="margin-top:4px">Your peer-to-peer workspace · everything lives in this browser and syncs directly with the people you trust.</div>
    </div>`}));

  // ---- stats -----------------------------------------------------------
  const online = Sync.onlineCount();
  const stats = [
    ['Entities', Store.entityNames().length, 'shared tables', 'db', 'var(--brand-b)'],
    ['Records', Store.totalRecords(), 'across all tables', 'grid', 'var(--consensus)'],
    ['Peers online', online, online?'live now':'none discovered', 'peers', 'var(--success)'],
    ['Synced', Sync.stats.applied, 'records this session', 'activity', 'var(--brand-c)'],
  ];
  const statGrid = el('div',{class:'grid stats'});
  stats.forEach(([k,v,d,ic,col])=>{
    statGrid.append(el('div',{class:'card stat', html:`
      <div class="glow" style="background:${col}"></div>
      <div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div>
      <div class="spark" style="color:${col}">${icon(ic)}</div>`}));
  });
  wrap.append(statGrid);

  // ---- quick actions ---------------------------------------------------
  wrap.append(el('div',{class:'section-title', html:'<h2>Quick actions</h2>'}));
  const qa = el('div',{class:'grid quick'});
  const actions = [
    ['New entity','Create a shared table with dynamic JSON rows','plus','var(--brand-b)',()=>ctx.newEntity()],
    ['Open a table','Browse and edit your collaborative data','table','var(--consensus)',()=>ctx.go('table')],
    ['Find peers','Discover people running Relay and connect','broadcast','var(--success)',()=>ctx.go('peers')],
    ['Import workspace','Load entities from a .json export','upload','var(--brand-c)',()=>ctx.importWorkspace()],
  ];
  actions.forEach(([t,p,ic,col,fn])=>{
    const c=el('div',{class:'card hover qa', onclick:fn});
    c.innerHTML=`<div class="qicon" style="background:linear-gradient(135deg,${col},color-mix(in srgb,${col} 55%,#000))">${icon(ic)}</div>
      <div><b>${t}</b><p>${p}</p></div>`;
    qa.append(c);
  });
  wrap.append(qa);

  // ---- pinned (add-to-home) -------------------------------------------
  const pinned = Store.pinned();
  wrap.append(el('div',{class:'section-title', html:`<h2>Pinned to home</h2><div class="sp"></div>
    <span class="muted tiny">Pin any table from its ⭐ to keep it here</span>`}));
  if(pinned.length){
    const g=el('div',{class:'grid recents'});
    pinned.forEach(k=>g.append(entityCard(k, ctx, true)));
    wrap.append(g);
  }else{
    wrap.append(el('div',{class:'card muted', text:'Nothing pinned yet — open a table and hit the star to add it here.'}));
  }

  // ---- recents ---------------------------------------------------------
  const recents = Store.recents();
  if(recents.length){
    wrap.append(el('div',{class:'section-title', html:'<h2>Recent activity</h2>'}));
    const g=el('div',{class:'grid recents'});
    recents.forEach(r=>g.append(entityCard(r.entity, ctx, false, r.at)));
    wrap.append(g);
  }

  root.append(wrap);
}

function entityCard(key, ctx, pinned, at){
  const e = Store.entity(key); if(!e) return el('div');
  const n = Store.count(key);
  const c = el('div',{class:'card hover recent', onclick:()=>ctx.go('table',{entity:key})});
  const pin = el('button',{class:'pin-btn'+(Store.isPinned(key)?' on':''), title:'Pin to home',
    html:icon('star'), onclick:(ev)=>{ev.stopPropagation();Store.togglePin(key);toast(Store.isPinned(key)?'Pinned':'Unpinned',{kind:'ok'});ctx.refresh&&ctx.refresh();}});
  c.innerHTML = `<div class="rt"><span class="dot" style="background:${avatarColor(key)}"></span>
    <b>${escapeHtml(e.label)}</b></div>
    <div class="meta"><span>${n} record${n!==1?'s':''}</span>${at?`<span>${ago(at)}</span>`:''}</div>`;
  c.querySelector('.rt').append(pin);
  return c;
}
