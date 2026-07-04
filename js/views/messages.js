// P2P messaging: a broadcast "General" room plus 1:1 direct-message threads.
// Messages ride the same transports as sync (mesh + WebRTC) — no server.
import { Store } from '../store.js';
import { Sync } from '../sync.js';
import { el, escapeHtml, avatarColor, initials, clock } from '../ui.js';
import { icon } from '../icons.js';

let _off = null;
let thread = 'general';   // 'general' or a peer uid

export function renderMessages(root, ctx, params={}){
  root.innerHTML='';
  if(params.thread) thread = params.thread;             // deep-link from global search
  const highlightId = params.highlightId; delete params.highlightId;   // one-shot
  Sync.markRead(thread);   // viewing this thread clears its unread badge
  const wrap=el('div',{class:'wrap chat-wrap'});

  // ---- thread selector (General + known peers) -------------------------
  const online=new Set(Sync.peerList().map(p=>p.uid).filter(Boolean));
  const peers=Sync.knownPeers();
  const tabs=el('div',{class:'thread-tabs'});
  tabs.append(threadPill('general','General', true));
  peers.forEach(p=>tabs.append(threadPill(p.uid, p.name, false)));
  if(!peers.length) tabs.append(el('span',{class:'muted tiny', style:'align-self:center;margin-left:6px', text:'Connect peers to start direct messages'}));
  wrap.append(el('div',{class:'section-title', html:`<h2>Messages</h2><div class="sp"></div>
    <span class="presence ${online.size?'online':''}"><span class="dot"></span><span>${online.size} online</span></span>`}));
  wrap.append(tabs);

  // ---- feed ------------------------------------------------------------
  const feed=el('div',{class:'chat-feed', id:'chatFeed'});
  const msgs=Sync.chat.filter(m=>Sync.threadKey(m)===thread);
  msgs.forEach(m=>feed.append(bubble(m)));
  if(!msgs.length){
    const who = thread==='general' ? 'anyone connected' : Sync.nameForUid(thread);
    feed.append(el('div',{class:'empty', html:`${icon('chat')}<div>No messages yet.<br>${thread==='general'?'Say hello — everyone connected sees it.':'Start a private conversation with '+escapeHtml(who)+'.'}</div>`}));
  }
  wrap.append(feed);

  // ---- composer --------------------------------------------------------
  const target = thread==='general' ? null : thread;
  const targetOnline = thread==='general' || online.has(thread);
  const composer=el('div',{class:'composer'});
  const input=el('textarea',{class:'input', rows:'1',
    placeholder: thread==='general'
      ? (online.size?'Message everyone…':'No peers online — messages send once someone connects')
      : (targetOnline?`Message ${Sync.nameForUid(thread)} privately…`:`${Sync.nameForUid(thread)} is offline — saved until they connect`),
    style:'resize:none;font-family:inherit'});
  const send=el('button',{class:'btn primary', html:`${icon(thread==='general'?'broadcast':'chat')} Send`, onclick:fire});
  input.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); fire(); } });
  function fire(){ const t=input.value.trim(); if(!t) return; Sync.sendChat(t, target); input.value=''; input.focus(); }
  composer.append(input, send);
  wrap.append(composer);

  root.append(wrap);
  if(highlightId) scrollToMessage(highlightId); else scrollBottom();

  if(_off) _off();
  _off = Sync.on('chat', (m)=>{
    const f=document.getElementById('chatFeed'); if(!f){ _off&&_off(); _off=null; return; }
    if(m===null){ renderMessages(root, ctx); return; }
    // a message for another thread never disturbs this view (e.g. composer
    // text mid-draft) — just bump that thread's pill badge in place
    if(Sync.threadKey(m)!==thread){ updatePillBadges(); return; }
    Sync.markRead(thread);
    const emptyEl=f.querySelector('.empty'); if(emptyEl) emptyEl.remove();
    f.append(bubble(m)); scrollBottom();
  });
  setTimeout(()=>input.focus(),40);

  function updatePillBadges(){
    tabs.querySelectorAll('.thread-pill').forEach(p=>{
      const key=p.dataset.threadKey;
      p.querySelector('.pill-badge')?.remove();
      if(key===thread) return;
      const n=Sync.unreadCount(key);
      if(n>0) p.insertAdjacentHTML('beforeend', `<span class="pill-badge">${n>99?'99+':n}</span>`);
    });
  }

  function threadPill(key, name, isGeneral){
    const active = key===thread;
    const isOnline = isGeneral ? online.size>0 : online.has(key);
    const b=el('button',{class:'thread-pill'+(active?' active':''), onclick:()=>{ thread=key; renderMessages(root, ctx); }});
    b.dataset.threadKey=key;
    if(isGeneral){ b.innerHTML=`${icon('chat')}<span>General</span>`; }
    else{ b.innerHTML=`<span class="tav" style="background:${avatarColor(key)}">${initials(name)}</span>
      <span>${escapeHtml(name.split('-')[0])}</span><span class="pdot${isOnline?' on':''}"></span>`; }
    if(!active){ const n=Sync.unreadCount(key); if(n>0) b.insertAdjacentHTML('beforeend', `<span class="pill-badge">${n>99?'99+':n}</span>`); }
    return b;
  }
}

function bubble(m){
  const mine = m.uid===Sync.uid;
  const b=el('div',{class:'msg'+(mine?' mine':''), id:`msg-${m.id}`});
  b.innerHTML=`
    <div class="av" style="background:${avatarColor(m.uid||m.from)}">${initials(m.name)}</div>
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

function scrollToMessage(id){
  requestAnimationFrame(()=>{
    const b=document.getElementById(`msg-${id}`);
    if(!b){ scrollBottom(); return; }
    b.scrollIntoView({block:'center'});
    b.classList.add('flash');
    setTimeout(()=>b.classList.remove('flash'), 1600);
  });
}
