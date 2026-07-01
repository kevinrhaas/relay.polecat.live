// Activity: live sync monitor + session stats.
import { Sync } from '../sync.js';
import { Store } from '../store.js';
import { el, escapeHtml } from '../ui.js';
import { icon } from '../icons.js';

export function renderActivity(root){
  root.innerHTML='';
  const wrap=el('div',{class:'wrap'});
  wrap.append(el('div',{class:'section-title', html:'<h2>Sync monitor</h2>'}));

  const stats=[
    ['Peers online', Sync.onlineCount(), 'peers'],
    ['Records sent', Sync.stats.sent, 'upload'],
    ['Records received', Sync.stats.received, 'download'],
    ['Records applied', Sync.stats.applied, 'check'],
  ];
  const g=el('div',{class:'grid stats'});
  stats.forEach(([k,v,ic])=>g.append(el('div',{class:'card stat',
    html:`<div class="k">${k}</div><div class="v">${v}</div><div class="spark">${icon(ic)}</div>`})));
  wrap.append(g);

  wrap.append(el('div',{class:'section-title', html:`<h2>Activity log</h2><div class="sp"></div>
    <span class="muted tiny">live · newest first</span>`}));
  const mon=el('div',{class:'monitor', id:'monitorLog'});
  renderLog(mon);
  wrap.append(mon);
  root.append(wrap);
}

function renderLog(mon){
  mon.innerHTML='';
  if(!Sync.log.length){ mon.append(el('div',{class:'muted', text:'No activity yet. Discovery and syncs will stream here.'})); return; }
  Sync.log.forEach(l=>{
    mon.append(el('div',{class:`log-line ${l.kind}`,
      html:`<span class="ts">${l.ts}</span><span class="tag">${l.tag}</span><span>${escapeHtml(l.msg)}</span>`}));
  });
}

// allow the app to stream new lines without a full re-render
export function pushLogLine(){
  const mon=document.querySelector('#monitorLog');
  if(mon) renderLog(mon);
}
