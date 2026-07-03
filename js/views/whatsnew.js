// "What's new" — a searchable, slide-in changelog sheet. Mobile-friendly.
import { CHANGELOG, LATEST_VERSION } from '../changelog.js';
import { el, escapeHtml, sheet } from '../ui.js';
import { icon } from '../icons.js';

const SEEN_KEY = 'relay.whatsnew.seen';

// Format an ISO-8601 UTC timestamp to a friendly Central-Time string.
// Falls back to a legacy `date` string, then to '' — never fabricates a time.
function fmtWhen(e){
  if(e.ts){
    const d = new Date(e.ts);
    if(!isNaN(d)){
      try{
        return d.toLocaleString('en-US',{ timeZone:'America/Chicago',
          month:'short', day:'numeric', year:'numeric',
          hour:'numeric', minute:'2-digit' }) + ' CT';
      }catch{ return d.toISOString(); }
    }
  }
  return e.date || '';
}

export function hasUnread(){
  let seen = 0; try{ seen = parseInt(localStorage.getItem(SEEN_KEY)||'0',10); }catch{}
  return LATEST_VERSION > seen;
}
export function markSeen(){ try{ localStorage.setItem(SEEN_KEY, String(LATEST_VERSION)); }catch{} }

export function openWhatsNew(){
  const search = el('div',{class:'search', style:'margin:0 20px 8px'});
  const input = el('input',{class:'input', placeholder:'Search updates…', spellcheck:'false'});
  search.append(el('span',{html:icon('search')}), input);

  const list = el('div',{id:'wnList'});
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
        <div class="wn-date">${escapeHtml(fmtWhen(e))}</div>
        <ul>${e.items.map(i=>`<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
      list.append(entry);
    });
  };
  render();
  input.addEventListener('input', ()=>render(input.value));

  const { hide } = sheet({
    ariaLabel:'What\'s new',
    head:`<div><h3>What's new</h3>
      <div class="muted tiny">Relay · v${LATEST_VERSION} · ${CHANGELOG.length} release${CHANGELOG.length!==1?'s':''}</div></div>`,
    extra:search, body:list,
  });
  markSeen();
  setTimeout(()=>input.focus(),60);
  return { hide };
}
