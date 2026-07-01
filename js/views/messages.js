// Light P2P messaging: a live chat between connected peers. Messages ride
// the same transports as sync (local mesh + WebRTC) — no server.
import { Store } from '../store.js';
import { Sync } from '../sync.js';
import { el, escapeHtml, avatarColor, initials, clock, ago } from '../ui.js';
import { icon } from '../icons.js';

let _off = null;

export function renderMessages(root, ctx){
  // subscribe once per mount; re-render appends via direct DOM to keep scroll
  root.innerHTML='';
  const wrap=el('div',{class:'wrap chat-wrap'});

  const online=Sync.onlineCount();
  wrap.append(el('div',{class:'section-title', html:`
    <div><h2>Messages</h2>
    <div class="muted tiny" style="margin-top:4px">Live chat with connected peers — sent directly over your peer-to-peer channels. History is kept only in your browser.</div></div>
    <div class="sp"></div>
    <span class="presence ${online?'online':''}"><span class="dot"></span><span>${online} peer${online!==1?'s':''} online</span></span>`}));

  const feed=el('div',{class:'chat-feed', id:'chatFeed'});
  Sync.chat.forEach(m=>feed.append(bubble(m)));
  if(!Sync.chat.length) feed.append(el('div',{class:'empty', html:`${icon('activity')}<div>No messages yet. Say hello — anyone connected in Peers will see it.</div>`}));
  wrap.append(feed);

  const composer=el('div',{class:'composer'});
  const input=el('textarea',{class:'input', rows:'1', placeholder: online?'Message your peers…':'No peers online — messages send once someone connects', style:'resize:none;font-family:inherit'});
  const send=el('button',{class:'btn primary', html:`${icon('broadcast')} Send`, onclick:()=>fire()});
  input.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); fire(); } });
  function fire(){ const t=input.value.trim(); if(!t) return; Sync.sendChat(t); input.value=''; input.focus(); }
  composer.append(input, send);
  wrap.append(composer);

  root.append(wrap);
  scrollBottom();

  // live updates
  if(_off) _off();
  _off = Sync.on('chat', (m)=>{
    const f=document.getElementById('chatFeed'); if(!f) { _off&&_off(); _off=null; return; }
    if(m===null){ renderMessages(root, ctx); return; }
    const emptyEl=f.querySelector('.empty'); if(emptyEl) emptyEl.remove();
    f.append(bubble(m)); scrollBottom();
  });
  setTimeout(()=>input.focus(),40);
}

function bubble(m){
  const mine = m.from===Sync.selfId;
  const b=el('div',{class:'msg'+(mine?' mine':'')});
  b.innerHTML=`
    <div class="av" style="background:${avatarColor(m.from)}">${initials(m.name)}</div>
    <div class="body">
      <div class="meta"><b>${escapeHtml(mine?'You':m.name||'Peer')}</b><span>${clock(m.ts)}</span></div>
      <div class="text">${escapeHtml(m.text)}</div>
    </div>`;
  return b;
}

function scrollBottom(){
  const f=document.getElementById('chatFeed');
  if(f) requestAnimationFrame(()=>{ f.scrollTop=f.scrollHeight; });
}
