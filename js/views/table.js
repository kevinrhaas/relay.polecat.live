// Collaborative table: dynamic JSON rows keyed by UUID, live-editable,
// with entity tabs and per-cell sync flashes when remote changes land.
import { Store } from '../store.js';
import { Sync } from '../sync.js';
import { el, escapeHtml, ago, shortId, toast, modal, confirmDialog, uuid } from '../ui.js';
import { icon } from '../icons.js';

let current = null;

export function renderTable(root, ctx, params={}){
  const names = Store.entityNames();
  current = params.entity && names.includes(params.entity) ? params.entity
          : (current && names.includes(current) ? current : names[0]);
  root.innerHTML='';
  const wrap = el('div',{class:'wrap'});

  // entity tabs + toolbar
  const toolbar = el('div',{class:'tbl-toolbar'});
  const tabs = el('div',{class:'entity-tabs'});
  names.forEach(k=>{
    const e=Store.entity(k);
    const t=el('button',{class:'entity-tab'+(k===current?' active':''),
      onclick:()=>{ current=k; renderTable(root,ctx,{entity:k}); }});
    t.innerHTML=`${icon(e.icon||'table')}<span>${escapeHtml(e.label)}</span><span class="c">${Store.count(k)}</span>`;
    tabs.append(t);
  });
  const addEntity = el('button',{class:'entity-tab', title:'New entity', html:icon('plus'),
    onclick:()=>ctx.newEntity()});
  tabs.append(addEntity);
  toolbar.append(tabs);

  if(!current){
    wrap.append(toolbar, el('div',{class:'empty', html:`${icon('db')}<div>No entities yet. Create one to start collaborating.</div>`}));
    root.append(wrap); return;
  }

  const e = Store.entity(current);
  const spacer = el('div',{style:'flex:1'});
  const pin = el('button',{class:'btn sm'+(Store.isPinned(current)?' ':''),
    html:`${icon('star')} ${Store.isPinned(current)?'Pinned':'Pin'}`,
    onclick:()=>{Store.togglePin(current);renderTable(root,ctx,{entity:current});}});
  const addCol = el('button',{class:'btn sm', html:`${icon('plus')} Field`, onclick:()=>addColumn(root,ctx)});
  const addRow = el('button',{class:'btn sm primary', html:`${icon('plus')} Row`, onclick:()=>addRowRec(root,ctx)});
  toolbar.append(spacer, pin, addCol, addRow);
  wrap.append(toolbar);

  // table
  const cols = Store.columns(current);
  const rows = Store.records(current);
  const scroll = el('div',{class:'table-scroll'});
  if(!rows.length){
    scroll.append(el('div',{class:'empty', html:`${icon('grid')}<div>No rows yet in <b>${escapeHtml(e.label)}</b>.<br>Add a row — it syncs to your peers automatically.</div>`}));
  }else{
    const table=el('table',{class:'data'});
    const thead=el('thead');
    const hr=el('tr');
    hr.append(el('th',{text:'id'}));
    cols.forEach(c=>hr.append(el('th',{text:c})));
    hr.append(el('th',{text:'updated'}), el('th',{text:''}));
    thead.append(hr); table.append(thead);

    const tbody=el('tbody');
    rows.forEach(r=>tbody.append(rowEl(r, cols, root, ctx)));
    table.append(tbody);
    scroll.append(table);
  }
  wrap.append(scroll);

  // footer summary
  wrap.append(el('div',{class:'muted tiny', style:'margin-top:12px',
    html:`${rows.length} row${rows.length!==1?'s':''} · ${cols.length} field${cols.length!==1?'s':''} · edits sync to ${Sync.onlineCount()} peer(s) automatically`}));

  root.append(wrap);
}

function rowEl(r, cols, root, ctx){
  const tr=el('tr',{'data-id':r.id});
  tr.append(el('td',{class:'rowid', text:shortId(r.id), title:r.id}));
  cols.forEach(c=>{
    const val=r.fields[c];
    const td=el('td',{contenteditable:'true', text: val==null?'' : (typeof val==='object'?JSON.stringify(val):String(val))});
    td.dataset.field=c;
    td.addEventListener('blur',()=>commitCell(r, c, td));
    td.addEventListener('keydown',ev=>{ if(ev.key==='Enter'){ev.preventDefault();td.blur();} });
    tr.append(td);
  });
  tr.append(el('td',{class:'meta-cell', text:ago(r._meta.updatedAt), title:`rev ${r._meta.rev} · by ${shortId(r._meta.updatedBy)}`}));
  const act=el('td');
  const del=el('button',{class:'btn ghost icon sm row-actions', html:icon('trash'), title:'Delete row',
    onclick:async()=>{ if(await confirmDialog('Delete row','This tombstone will propagate to your peers.',{danger:true,okLabel:'Delete'})){ Store.remove(current,r.id); renderTable(root,ctx,{entity:current}); toast('Row deleted',{kind:'ok'}); } }});
  act.append(del); tr.append(act);
  return tr;
}

function commitCell(r, field, td){
  let raw=td.textContent.trim();
  const prev=r.fields[field];
  let val=raw;
  if(raw==='true') val=true; else if(raw==='false') val=false;
  else if(raw!=='' && !isNaN(Number(raw)) && String(Number(raw))===raw) val=Number(raw);
  else if((raw.startsWith('{')||raw.startsWith('['))){ try{ val=JSON.parse(raw); }catch{} }
  if(JSON.stringify(val)===JSON.stringify(prev)) return;
  Store.upsert(current, {[field]:val}, r.id);
  td.classList.add('cell-syncing'); setTimeout(()=>td.classList.remove('cell-syncing'),800);
}

function addColumn(root, ctx){
  const input=el('input',{class:'input', placeholder:'field name (e.g. status)'});
  const {hide}=modal({ title:'Add field', icon:'plus',
    body: el('div',{},[el('div',{class:'field'},[el('label',{text:'Field name'}), input])]),
    foot:[ el('button',{class:'btn', text:'Cancel', onclick:()=>hide()}),
      el('button',{class:'btn primary', text:'Add field', onclick:()=>{
        const name=input.value.trim().replace(/\s+/g,'_'); if(!name) return;
        // materialise the column onto the first row (or a fresh row) so it shows
        const rows=Store.records(current);
        if(rows.length) Store.upsert(current,{[name]:''},rows[0].id);
        else Store.upsert(current,{[name]:''});
        hide(); renderTable(root,ctx,{entity:current}); toast('Field added',{kind:'ok'});
      }})]});
  setTimeout(()=>input.focus(),50);
}

function addRowRec(root, ctx){
  const cols=Store.columns(current);
  const fields = cols.length ? Object.fromEntries(cols.map(c=>[c,''])) : {name:''};
  Store.upsert(current, fields);
  renderTable(root,ctx,{entity:current});
  // focus first editable cell of the new (top) row
  setTimeout(()=>{ const td=root.querySelector('tbody tr td[contenteditable]'); td&&td.focus(); },30);
  toast('Row added',{kind:'ok'});
}

export function currentEntity(){ return current; }
