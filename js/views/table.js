// Collaborative table: a DBeaver-style tree of entities/fields in a left
// panel, a dynamic JSON grid in the middle, and an animated field-by-field
// record editor that slides in from the right when a row is opened.
import { Store } from '../store.js';
import { Sync } from '../sync.js';
import { el, escapeHtml, ago, shortId, toast, modal, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';

const K_TREE_OPEN = 'relay.tree.open';
const K_TREE_EXPANDED = 'relay.tree.expanded';

let current = null;
let treeOpen = localStorage.getItem(K_TREE_OPEN)!=='0';
let expanded = loadExpanded();
let filterText = '';
let sortField = null, sortDir = 'asc';

function loadExpanded(){
  try{ return new Set(JSON.parse(localStorage.getItem(K_TREE_EXPANDED)||'[]')); }catch{ return new Set(); }
}
function saveExpanded(){ try{ localStorage.setItem(K_TREE_EXPANDED, JSON.stringify([...expanded])); }catch{} }
function toggleExpanded(key){ expanded.has(key)?expanded.delete(key):expanded.add(key); saveExpanded(); }

export function renderTable(root, ctx, params={}){
  const names = Store.entityNames();
  const prevEntity = current;
  current = params.entity && names.includes(params.entity) ? params.entity
          : (current && names.includes(current) ? current : names[0]);
  if(current!==prevEntity){ filterText=''; sortField=null; sortDir='asc'; }

  // preserve focus/cursor in the filter box across full re-renders (e.g. a
  // remote sync landing mid-keystroke) — only the row area normally rebuilds
  const searchFocused = document.activeElement?.classList?.contains('tbl-search-input');
  const searchSel = searchFocused ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;

  root.innerHTML='';
  const wrap = el('div',{class:'wrap'});
  const shell = el('div',{class:'table-shell'});
  shell.append(buildTree(root, ctx, names));

  const mainCol = el('div',{class:'table-main'});
  const toolbar = el('div',{class:'tbl-toolbar'});

  if(!current){
    toolbar.append(el('div',{class:'muted', text:'No tables yet'}));
    mainCol.append(toolbar, el('div',{class:'empty', html:`${icon('db')}<div>No entities yet. Create one to start collaborating.</div>`}));
    shell.append(mainCol); wrap.append(shell); root.append(wrap); return;
  }

  const e = Store.entity(current);
  const label = el('div',{class:'tbl-current', html:`${icon(e.icon||'table')}<b>${escapeHtml(e.label)}</b>`});
  const search = el('div',{class:'search tbl-search'});
  const searchInput = el('input',{class:'input tbl-search-input', type:'search', placeholder:'Filter rows…',
    value:filterText, 'aria-label':`Filter rows in ${e.label}`});
  search.append(el('span',{html:icon('search')}), searchInput);
  const spacer = el('div',{style:'flex:1'});
  const pin = el('button',{class:'btn sm', html:`${icon('star')} ${Store.isPinned(current)?'Pinned':'Pin'}`,
    onclick:()=>{Store.togglePin(current);renderTable(root,ctx,{entity:current});}});
  const editBtn = el('button',{class:'btn sm', html:`${icon('edit')} Edit table`, onclick:()=>editEntity(root,ctx)});
  const addCol = el('button',{class:'btn sm', html:`${icon('plus')} Field`, onclick:()=>addColumn(root,ctx)});
  const addRow = el('button',{class:'btn sm primary', html:`${icon('plus')} Row`, onclick:()=>addRowRec(root,ctx)});
  toolbar.append(label, search, spacer, pin, editBtn, addCol, addRow);
  mainCol.append(toolbar);

  const body = el('div');
  mainCol.append(body);
  refreshRows();

  searchInput.addEventListener('input', ()=>{ filterText=searchInput.value; refreshRows(); });
  if(searchFocused){
    searchInput.focus();
    if(searchSel) searchInput.setSelectionRange(searchSel[0], searchSel[1]);
  }

  shell.append(mainCol);
  wrap.append(shell);
  root.append(wrap);

  // rebuilds only the field header + rows + footer, so filtering/sorting
  // never disturbs the toolbar (and the search box keeps its focus)
  function refreshRows(){
    body.innerHTML='';
    const cols = Store.columns(current);
    let rows = Store.records(current);
    const total = rows.length;
    const needle = filterText.trim().toLowerCase();
    if(needle) rows = rows.filter(r=>rowMatches(r, cols, needle));
    if(sortField) rows = rows.slice().sort((a,b)=>{
      const d = cmpVals(a.fields[sortField], b.fields[sortField]);
      return sortDir==='asc' ? d : -d;
    });

    const scroll = el('div',{class:'table-scroll'});
    if(!total){
      scroll.append(el('div',{class:'empty', html:`${icon('grid')}<div>No rows yet in <b>${escapeHtml(e.label)}</b>.<br>Add a row — it syncs to your peers automatically.</div>`}));
    }else if(!rows.length){
      scroll.append(el('div',{class:'empty', html:`${icon('search')}<div>No rows match “${escapeHtml(filterText.trim())}”.</div>`}));
    }else{
      const table=el('table',{class:'data'});
      const thead=el('thead');
      const hr=el('tr');
      hr.append(el('th',{class:'open-head', text:''}));
      hr.append(el('th',{text:'id'}));
      cols.forEach(c=>{
        const sorted = sortField===c;
        const th = el('th',{class:'col-head'+(sorted?' sorted':''), title:`Sort by ${c}`,
          onclick:()=>{ if(sortField!==c){ sortField=c; sortDir='asc'; } else if(sortDir==='asc'){ sortDir='desc'; } else { sortField=null; sortDir='asc'; } refreshRows(); }});
        const inner = el('div',{class:'col-head-inner'});
        inner.append(el('span',{class:'col-label', text:c}));
        if(sorted) inner.append(el('span',{class:'col-sort-ic'+(sortDir==='desc'?' desc':''), html:icon('chevron')}));
        inner.append(el('button',{class:'col-edit-btn', title:`Rename or delete field “${c}”`, 'aria-label':`Edit field ${c}`,
          html:icon('edit'), onclick:(ev)=>{ ev.stopPropagation(); editField(c, root, ctx); }}));
        th.append(inner);
        hr.append(th);
      });
      hr.append(el('th',{text:'updated'}), el('th',{text:''}));
      thead.append(hr); table.append(thead);

      const tbody=el('tbody');
      rows.forEach(r=>tbody.append(rowEl(r, cols, root, ctx)));
      table.append(tbody);
      scroll.append(table);
    }
    body.append(scroll);

    // footer summary
    const filtered = needle && rows.length!==total;
    body.append(el('div',{class:'muted tiny', style:'margin-top:12px',
      html:`${filtered?`${rows.length} of ${total}`:total} row${total!==1?'s':''} · ${cols.length} field${cols.length!==1?'s':''} · edits sync to ${Sync.onlineCount()} peer(s) automatically`}));
  }
}

function rowMatches(r, cols, needle){
  if(String(r.id).toLowerCase().includes(needle)) return true;
  return cols.some(c=>{
    const v = r.fields[c];
    if(v==null) return false;
    const s = typeof v==='object' ? JSON.stringify(v) : String(v);
    return s.toLowerCase().includes(needle);
  });
}

function cmpVals(a, b){
  if(a==null && b==null) return 0;
  if(a==null) return -1;
  if(b==null) return 1;
  if(typeof a==='number' && typeof b==='number') return a-b;
  if(typeof a==='boolean' && typeof b==='boolean') return a===b ? 0 : (a?1:-1);
  return String(a).localeCompare(String(b), undefined, {numeric:true, sensitivity:'base'});
}

// ---- left tree: entities, expandable to their fields ---------------------
function buildTree(root, ctx, names){
  const panel = el('div',{class:'tree-panel'+(treeOpen?' open':'')});
  const head = el('div',{class:'tree-head'});
  const toggle = el('button',{class:'btn ghost icon sm tree-toggle',
    title: treeOpen?'Collapse panel':'Expand panel', 'aria-label': treeOpen?'Collapse tables panel':'Expand tables panel',
    html:icon('chevron'), onclick:()=>{ treeOpen=!treeOpen; localStorage.setItem(K_TREE_OPEN, treeOpen?'1':'0'); renderTable(root,ctx,{entity:current}); }});
  head.append(toggle, el('span',{class:'tree-title', text:'Tables'}),
    el('button',{class:'btn ghost icon sm', title:'New table', 'aria-label':'New table', html:icon('plus'), onclick:()=>ctx.newEntity()}));
  panel.append(head);

  const list = el('div',{class:'tree-list'});
  if(!names.length) list.append(el('div',{class:'muted tiny', style:'padding:6px 8px', text:'No tables yet.'}));
  names.forEach(k=>{
    const e = Store.entity(k);
    const isOpen = expanded.has(k);
    const node = el('div',{class:'tree-node'});
    const row = el('div',{class:'tree-row'+(k===current?' active':''), role:'button', tabindex:'0',
      title:e.label,
      onclick:()=>{ current=k; renderTable(root,ctx,{entity:k}); },
      onkeydown:(ev)=>{ if(ev.target!==ev.currentTarget) return; if(ev.key==='Enter'||ev.key===' '){ ev.preventDefault(); current=k; renderTable(root,ctx,{entity:k}); } }});
    const caret = el('button',{class:'tree-caret'+(isOpen?' open':''), title: isOpen?'Collapse fields':'Expand fields',
      'aria-label': isOpen?'Collapse fields':'Expand fields', html:icon('chevron'),
      onclick:(ev)=>{ ev.stopPropagation(); toggleExpanded(k); renderTable(root,ctx,{entity:current}); }});
    row.append(caret, el('span',{class:'tree-ic', html:icon(e.icon||'table')}),
      el('span',{class:'tree-label', text:e.label}), el('span',{class:'tree-count', text:String(Store.count(k))}));
    node.append(row);
    if(isOpen){
      const cols = Store.columns(k);
      const fields = el('div',{class:'tree-fields'});
      if(!cols.length) fields.append(el('div',{class:'tree-field muted', text:'No fields yet'}));
      else cols.forEach(c=>fields.append(el('button',{class:'tree-field', text:c, title:`Edit field “${c}”`,
        onclick:(ev)=>{ ev.stopPropagation(); current=k; editField(c, root, ctx); }})));
      node.append(fields);
    }
    list.append(node);
  });
  panel.append(list);
  return panel;
}

function rowEl(r, cols, root, ctx){
  const tr=el('tr',{'data-id':r.id});
  const openTd=el('td',{class:'open-cell'});
  openTd.append(el('button',{class:'btn ghost icon sm row-open', title:'Open record', 'aria-label':'Open record',
    html:icon('chevron'), onclick:()=>openRecordPanel(r, cols, root, ctx)}));
  tr.append(openTd);
  tr.append(el('td',{class:'rowid', text:shortId(r.id), title:r.id}));
  cols.forEach(c=>{
    const val=r.fields[c];
    const td=el('td',{contenteditable:'true', text: val==null?'' : (typeof val==='object'?JSON.stringify(val):String(val))});
    td.dataset.field=c;
    td.addEventListener('blur',()=>commitCell(r, c, td));
    td.addEventListener('keydown',ev=>{ if(ev.key==='Enter'){ev.preventDefault();td.blur();} });
    td.addEventListener('paste',ev=>{
      // force plain text — pasting from Sheets/Excel/Word otherwise drops
      // fonts/colors/spans into the cell that persist until the next full
      // table re-render, since commitCell only reads text back out.
      ev.preventDefault();
      const text=(ev.clipboardData||window.clipboardData).getData('text/plain');
      const sel=window.getSelection();
      if(!sel.rangeCount) return;
      sel.deleteFromDocument();
      sel.getRangeAt(0).insertNode(document.createTextNode(text));
      sel.collapseToEnd();
    });
    tr.append(td);
  });
  tr.append(el('td',{class:'meta-cell', text:ago(r._meta.updatedAt), title:`rev ${r._meta.rev} · by ${shortId(r._meta.updatedBy)}`}));
  const act=el('td');
  const del=el('button',{class:'btn ghost icon sm row-actions', html:icon('trash'), title:'Delete row', 'aria-label':'Delete row',
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

// ---- right-hand record editor: field-by-field, typed inputs ---------------
function openRecordPanel(rec, cols, root, ctx){
  const e = Store.entity(current);
  const overlay = el('div',{class:'sheet-overlay'});
  const sheet = el('div',{class:'sheet record-sheet', role:'dialog', 'aria-label':'Record editor'});

  const head = el('div',{class:'sheet-head'});
  head.innerHTML = `<div><h3>${escapeHtml(e.label)} record</h3>
    <div class="muted tiny">${shortId(rec.id)} · updated ${ago(rec._meta.updatedAt)}</div></div>`;
  head.append(el('button',{class:'btn ghost sm', text:'Close', onclick:()=>hide()}));

  const body = el('div',{class:'sheet-body record-fields'});
  const allCols = cols.length ? cols : Object.keys(rec.fields||{});
  if(!allCols.length) body.append(el('div',{class:'empty muted', text:'No fields yet — add one from the table toolbar.'}));
  allCols.forEach(c=>body.append(recordFieldRow(rec, c)));

  const foot = el('div',{class:'sheet-foot'});
  const del = el('button',{class:'btn danger', html:`${icon('trash')} Delete row`, onclick:async()=>{
    if(await confirmDialog('Delete row','This tombstone will propagate to your peers.',{danger:true,okLabel:'Delete'})){
      Store.remove(current, rec.id); toast('Row deleted',{kind:'ok'}); hide();
    }
  }});
  foot.append(del);

  sheet.append(head, body, foot);
  overlay.append(sheet);
  overlay.addEventListener('mousedown', ev=>{ if(ev.target===overlay) hide(); });
  document.body.append(overlay);
  requestAnimationFrame(()=>overlay.classList.add('show'));

  function hide(){ overlay.classList.remove('show'); setTimeout(()=>overlay.remove(),240); document.removeEventListener('keydown',esc); renderTable(root,ctx,{entity:current}); }
  function esc(ev){ if(ev.key==='Escape') hide(); }
  document.addEventListener('keydown', esc);
  setTimeout(()=>{ const first=body.querySelector('input,textarea'); first&&first.focus(); },60);
}

function recordFieldRow(rec, field){
  const val = rec.fields[field];
  const row = el('div',{class:'field record-field'});
  row.append(el('label',{text:field}));
  let input;
  if(typeof val==='boolean'){
    input = el('button',{class:'toggle'+(val?' on':''), type:'button', role:'switch', 'aria-checked':String(!!val),
      onclick:()=>{ const nv=!input.classList.contains('on'); input.classList.toggle('on',nv); input.setAttribute('aria-checked',String(nv)); commitField(rec, field, nv, input); }});
  }else if(typeof val==='number'){
    input = el('input',{class:'input', type:'number', value: val==null?'':String(val)});
    input.addEventListener('blur',()=>commitField(rec, field, input.value===''?'':Number(input.value), input));
    input.addEventListener('keydown',ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); input.blur(); } });
  }else if(val && typeof val==='object'){
    input = el('textarea',{class:'input', rows:'3', text: JSON.stringify(val,null,2)});
    input.addEventListener('blur',()=>{ let nv; try{ nv=JSON.parse(input.value); }catch{ nv=input.value; } commitField(rec, field, nv, input); });
  }else{
    input = el('input',{class:'input', type:'text', value: val==null?'':String(val)});
    input.addEventListener('blur',()=>commitField(rec, field, input.value, input));
    input.addEventListener('keydown',ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); input.blur(); } });
  }
  row.append(input);
  return row;
}

function commitField(rec, field, val, inputEl){
  const prev = rec.fields[field];
  if(JSON.stringify(val)===JSON.stringify(prev)) return;
  const updated = Store.upsert(current, {[field]:val}, rec.id);
  rec.fields = updated.fields; rec._meta = updated._meta;
  inputEl.classList.add('cell-syncing'); setTimeout(()=>inputEl.classList.remove('cell-syncing'),800);
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

// ---- edit / delete a table (rename, icon, delete) -----------------------
function editEntity(root, ctx){
  const e=Store.entity(current); if(!e) return;
  const name=el('input',{class:'input', value:e.label});
  const icons=['table','db','grid','peers','check','star','bolt','key','chat','activity'];
  let chosen=e.icon||'table';
  const picker=el('div',{style:'display:flex;gap:8px;flex-wrap:wrap'});
  icons.forEach(ic=>{
    const label=ic[0].toUpperCase()+ic.slice(1)+' icon';
    const b=el('button',{class:'btn icon'+(ic===chosen?' primary':''), title:label, 'aria-label':label,
      'aria-pressed':String(ic===chosen), html:icon(ic), onclick:()=>{
      chosen=ic; [...picker.children].forEach(x=>{x.classList.remove('primary');x.setAttribute('aria-pressed','false')});
      b.classList.add('primary'); b.setAttribute('aria-pressed','true'); }});
    picker.append(b);
  });
  const body=el('div');
  body.append(
    (()=>{ const f=el('div',{class:'field'}); f.append(el('label',{text:'Table name'}), name); return f; })(),
    (()=>{ const f=el('div',{class:'field'}); f.append(el('label',{text:'Icon'}), picker); return f; })(),
    el('p',{class:'muted tiny', text:'Renames and icon changes sync to your peers.'}));
  const del=el('button',{class:'btn danger', html:`${icon('trash')} Delete table`, onclick:async()=>{
    if(await confirmDialog('Delete table',`Delete “${e.label}” and all its rows for you and your peers? This can't be undone.`,{danger:true,okLabel:'Delete table'})){
      hide(); Store.deleteEntity(current);
      current=Store.entityNames()[0]||null;
      renderTable(root,ctx,{entity:current}); toast('Table deleted',{kind:'ok'});
    }
  }});
  const save=el('button',{class:'btn primary', text:'Save', onclick:()=>{
    Store.renameEntity(current, name.value); Store.setEntityIcon(current, chosen);
    hide(); renderTable(root,ctx,{entity:current}); toast('Table updated',{kind:'ok'});
  }});
  const { hide }=modal({ title:'Edit table', icon:'edit', body, foot:[del, el('div',{style:'flex:1'}),
    el('button',{class:'btn', text:'Cancel', onclick:()=>hide()}), save] });
  setTimeout(()=>name.focus(),50);
}

// ---- rename / delete a field (column) -----------------------------------
function editField(field, root, ctx){
  const input=el('input',{class:'input', value:field});
  const body=el('div');
  body.append(
    (()=>{ const f=el('div',{class:'field'}); f.append(el('label',{text:'Field name'}), input); return f; })(),
    el('p',{class:'muted tiny', text:'Applies across every row and syncs to your peers.'}));
  const del=el('button',{class:'btn danger', html:`${icon('trash')} Delete field`, onclick:async()=>{
    if(await confirmDialog('Delete field',`Remove “${field}” from every row in this table (for you and your peers)?`,{danger:true,okLabel:'Delete field'})){
      hide(); Store.deleteField(current, field); renderTable(root,ctx,{entity:current}); toast('Field deleted',{kind:'ok'});
    }
  }});
  const save=el('button',{class:'btn primary', text:'Rename', onclick:()=>{
    const nn=input.value.trim().replace(/\s+/g,'_');
    if(nn && nn!==field) Store.renameField(current, field, nn);
    hide(); renderTable(root,ctx,{entity:current}); toast('Field renamed',{kind:'ok'});
  }});
  const { hide }=modal({ title:`Field: ${field}`, icon:'edit', body, foot:[del, el('div',{style:'flex:1'}),
    el('button',{class:'btn', text:'Cancel', onclick:()=>hide()}), save] });
  setTimeout(()=>{ input.focus(); input.select(); },50);
}

export function currentEntity(){ return current; }
