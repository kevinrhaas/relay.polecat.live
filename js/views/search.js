// Global search (Ctrl+K / Cmd+K): a command-palette style modal that finds
// tables by name and records by any field value across the whole workspace,
// then jumps straight there — the only search before this was the Tables
// toolbar's per-table filter box, which never left the currently open table.
import { Store } from '../store.js';
import { el, escapeHtml, shortId, modal } from '../ui.js';
import { icon } from '../icons.js';
import { recordLabel } from './table.js';

const MAX_TABLE_HITS = 6;
const MAX_RECORD_HITS = 30;
const DEBOUNCE_MS = 120;

function highlight(text, q){
  const s = String(text);
  const i = s.toLowerCase().indexOf(q);
  if(i<0) return escapeHtml(s);
  return escapeHtml(s.slice(0,i)) + '<mark>' + escapeHtml(s.slice(i,i+q.length)) + '</mark>' + escapeHtml(s.slice(i+q.length));
}
function truncate(s, n){ s=String(s); return s.length>n ? s.slice(0,n-1)+'…' : s; }

export function openGlobalSearch(ctx){
  if(document.querySelector('.overlay.show')) return;   // don't stack over an existing dialog

  const input = el('input',{class:'input', type:'search', placeholder:'Search tables and records…',
    'aria-label':'Search everything', role:'combobox', 'aria-expanded':'true', 'aria-autocomplete':'list'});
  const inputWrap = el('div',{class:'search gsearch-input'});
  inputWrap.append(el('span',{html:icon('search')}), input);
  const list = el('div',{class:'gsearch-list', role:'listbox', 'aria-label':'Search results'});
  const body = el('div',{class:'gsearch'});
  body.append(inputWrap, list);
  const {hide} = modal({title:'Search', icon:'search', body});

  let items = [];        // flat, in on-screen order — what arrow keys/Enter act on
  let activeIdx = -1;
  let debounceTimer = null;

  function jump(item){
    hide();
    setTimeout(()=>{
      if(item.type==='table') ctx.go('table', {entity:item.entity});
      else ctx.go('table', {entity:item.entity, openRecord:item.id});
    }, 220);   // let the modal's own hide transition finish first
  }

  function setActive(i){
    const rows = [...list.querySelectorAll('.gsearch-row')];
    rows.forEach(r=>r.classList.remove('active'));
    rows.forEach(r=>r.setAttribute('aria-selected','false'));
    activeIdx = i;
    const row = rows[i];
    if(row){
      row.classList.add('active'); row.setAttribute('aria-selected','true');
      row.scrollIntoView({block:'nearest'});
      input.setAttribute('aria-activedescendant', row.id);
    } else input.removeAttribute('aria-activedescendant');
  }

  function addRow(item, iconHtml, titleHtml, metaText){
    const idx = items.length; items.push(item);
    const row = el('div',{class:'gsearch-row', id:`gs-opt-${idx}`, role:'option', 'aria-selected':'false'});
    row.innerHTML = `<span class="gs-ic">${iconHtml}</span><div class="gs-text">
      <div class="gs-title">${titleHtml}</div><div class="gs-meta">${escapeHtml(metaText)}</div></div>`;
    row.addEventListener('mouseenter', ()=>setActive(idx));
    row.addEventListener('click', ()=>jump(item));
    list.append(row);
  }

  function render(){
    const q = input.value.trim().toLowerCase();
    list.innerHTML=''; items=[]; activeIdx=-1;
    if(!q){ list.append(el('div',{class:'muted tiny gsearch-hint', text:'Type to search every table and record.'})); return; }

    const names = Store.orderedEntityNames();
    const tableHits = names.filter(n=>(Store.entity(n)?.label||'').toLowerCase().includes(q)).slice(0,MAX_TABLE_HITS);

    const recordHits = [];
    outer:
    for(const n of names){
      for(const rec of Store.records(n)){
        const fields = rec.fields||{};
        let hitField=null, hitVal=null;
        for(const f of Object.keys(fields)){
          const v = fields[f]; if(v==null || v==='') continue;
          const s = typeof v==='object' ? JSON.stringify(v) : String(v);
          if(s.toLowerCase().includes(q)){ hitField=f; hitVal=s; break; }
        }
        if(hitField){
          recordHits.push({entity:n, id:rec.id, field:hitField, value:hitVal});
          if(recordHits.length>=MAX_RECORD_HITS) break outer;
        }
      }
    }

    if(!tableHits.length && !recordHits.length){
      list.append(el('div',{class:'muted tiny gsearch-hint', text:`No matches for "${input.value.trim()}".`}));
      return;
    }

    if(tableHits.length){
      list.append(el('div',{class:'gsearch-group', text:'Tables'}));
      tableHits.forEach(n=>{
        const e = Store.entity(n);
        addRow({type:'table', entity:n}, icon(e.icon||'table'), highlight(e.label,q), 'Open table');
      });
    }
    if(recordHits.length){
      list.append(el('div',{class:'gsearch-group', text:'Records'}));
      recordHits.forEach(h=>{
        const e = Store.entity(h.entity);
        const rec = Store.records(h.entity).find(r=>r.id===h.id);
        const label = recordLabel(h.entity, rec) || shortId(h.id);
        addRow({type:'record', entity:h.entity, id:h.id}, icon(e.icon||'table'), highlight(label,q),
          `${e.label} · ${h.field}: ${truncate(h.value,60)}`);
      });
    }
    setActive(0);
  }

  input.addEventListener('input', ()=>{
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, DEBOUNCE_MS);
  });
  input.addEventListener('keydown', e=>{
    if(e.key==='ArrowDown'){ e.preventDefault(); if(items.length) setActive(Math.min(activeIdx+1, items.length-1)); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); if(items.length) setActive(Math.max(activeIdx-1, 0)); }
    else if(e.key==='Enter'){ e.preventDefault(); const item = items[activeIdx>=0?activeIdx:0]; if(item) jump(item); }
  });

  render();
  setTimeout(()=>input.focus(), 50);
}
