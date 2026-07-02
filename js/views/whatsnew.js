// "What's new" — a searchable, slide-in changelog sheet. Mobile-friendly.
import { CHANGELOG, LATEST_VERSION } from '../changelog.js';
import { el, escapeHtml } from '../ui.js';
import { icon } from '../icons.js';

const SEEN_KEY = 'relay.whatsnew.seen';

export function hasUnread(){
  let seen = 0; try{ seen = parseInt(localStorage.getItem(SEEN_KEY)||'0',10); }catch{}
  return LATEST_VERSION > seen;
}
export function markSeen(){ try{ localStorage.setItem(SEEN_KEY, String(LATEST_VERSION)); }catch{} }

export function openWhatsNew(){
  const overlay = el('div',{class:'sheet-overlay'});
  const sheet = el('div',{class:'sheet', role:'dialog', 'aria-label':'What\'s new'});

  const head = el('div',{class:'sheet-head'});
  head.innerHTML = `<div><h3>What's new</h3>
    <div class="muted tiny">Relay · v${LATEST_VERSION} · ${CHANGELOG.length} release${CHANGELOG.length!==1?'s':''}</div></div>`;
  head.append(el('button',{class:'btn ghost sm', text:'Close', onclick:()=>hide()}));

  const search = el('div',{class:'search', style:'margin:0 20px 8px'});
  const input = el('input',{class:'input', placeholder:'Search updates…', spellcheck:'false'});
  search.append(el('span',{html:icon('search')}), input);

  const list = el('div',{class:'sheet-body', id:'wnList'});
  const render = (q='')=>{
    list.innerHTML='';
    const needle = q.trim().toLowerCase();
    const rows = CHANGELOG.filter(e=> !needle
      || e.title.toLowerCase().includes(needle)
      || e.items.some(i=>i.toLowerCase().includes(needle)));
    if(!rows.length){ list.append(el('div',{class:'empty muted', text:'No updates match that search.'})); return; }
    rows.forEach(e=>{
      const entry = el('div',{class:'wn-entry'});
      entry.innerHTML = `
        <div class="wn-top"><span class="wn-badge">v${e.v}</span>
          <b>${escapeHtml(e.title)}</b></div>
        <div class="wn-date">${escapeHtml(e.date)}</div>
        <ul>${e.items.map(i=>`<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
      list.append(entry);
    });
  };
  render();
  input.addEventListener('input', ()=>render(input.value));

  sheet.append(head, search, list);
  overlay.append(sheet);
  overlay.addEventListener('mousedown', e=>{ if(e.target===overlay) hide(); });
  document.body.append(overlay);
  requestAnimationFrame(()=>overlay.classList.add('show'));
  markSeen();

  function hide(){ overlay.classList.remove('show'); setTimeout(()=>overlay.remove(),240); document.removeEventListener('keydown',esc); }
  function esc(e){ if(e.key==='Escape') hide(); }
  document.addEventListener('keydown', esc);
  setTimeout(()=>input.focus(),60);
  return { hide };
}
