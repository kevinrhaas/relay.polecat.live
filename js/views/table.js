// Collaborative table: a DBeaver-style tree of entities/fields in a left
// panel, a dynamic JSON grid in the middle, and an animated field-by-field
// record editor that slides in from the right when a row is opened.
import { Store } from '../store.js';
import { Sync } from '../sync.js';
import { el, escapeHtml, ago, shortId, toast, modal, sheet, confirmDialog, avatarColor, initials } from '../ui.js';
import { icon } from '../icons.js';

const K_TREE_OPEN = 'relay.tree.open';
const K_TREE_EXPANDED = 'relay.tree.expanded';
const K_TREE_WIDTH = 'relay.tree.width';
const TREE_MINW = 180, TREE_MAXW = 420, TREE_DEFAULTW = 220;

// field types: an optional per-field hint that swaps the auto-detected
// text/number/JSON editor for a dedicated one. Unset ("auto") keeps the
// original behavior of inferring the editor from whatever value is present.
const FIELD_TYPES = [
  ['auto', 'Auto (detect from value)'],
  ['text', 'Text'],
  ['number', 'Number'],
  ['boolean', 'Yes / No'],
  ['date', 'Date'],
  ['select', 'Dropdown (choose from list)'],
];
const TYPE_BADGE = { number:'num', boolean:'y/n', date:'date', select:'list' };

let current = null;
let treeOpen = localStorage.getItem(K_TREE_OPEN)!=='0';
let treeWidth = clampTreeW(parseInt(localStorage.getItem(K_TREE_WIDTH)||String(TREE_DEFAULTW),10));
let expanded = loadExpanded();
let filterText = '';
let sortField = null, sortDir = 'asc';
let selected = new Set(); // row ids checked for bulk actions, cleared on entity switch
let _presOff = null; // unsub for the live "who's viewing this table" listener

function loadExpanded(){
  try{ return new Set(JSON.parse(localStorage.getItem(K_TREE_EXPANDED)||'[]')); }catch{ return new Set(); }
}
function saveExpanded(){ try{ localStorage.setItem(K_TREE_EXPANDED, JSON.stringify([...expanded])); }catch{} }
function toggleExpanded(key){ expanded.has(key)?expanded.delete(key):expanded.add(key); saveExpanded(); }
function clampTreeW(w){ return Math.max(TREE_MINW, Math.min(TREE_MAXW, w||TREE_DEFAULTW)); }

export function renderTable(root, ctx, params={}){
  const names = Store.entityNames();
  const prevEntity = current;
  current = params.entity && names.includes(params.entity) ? params.entity
          : (current && names.includes(current) ? current : names[0]);
  if(current!==prevEntity){ filterText=''; sortField=null; sortDir='asc'; selected=new Set(); }
  Sync.setViewing(current || null);   // tell peers what table (if any) we're looking at

  // preserve focus/cursor in the filter box across full re-renders (e.g. a
  // remote sync landing mid-keystroke) — only the row area normally rebuilds
  const searchFocused = document.activeElement?.classList?.contains('tbl-search-input');
  const searchSel = searchFocused ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;

  root.innerHTML='';
  const wrap = el('div',{class:'wrap'});
  const shell = el('div',{class:'table-shell'});
  const viewerEls = new Map(); // entity key -> its tree-row "who's viewing" badge
  shell.append(buildTree(root, ctx, names, viewerEls));

  const mainCol = el('div',{class:'table-main'});
  const toolbar = el('div',{class:'tbl-toolbar'});

  if(!current){
    toolbar.append(el('div',{class:'muted', text:'No tables yet'}));
    mainCol.append(toolbar, el('div',{class:'empty', html:`${icon('db')}<div>No entities yet. Create one to start collaborating.</div>`}));
    shell.append(mainCol); wrap.append(shell); root.append(wrap);
    wirePresence(wrap, viewerEls, null);
    return;
  }

  const e = Store.entity(current);
  const label = el('div',{class:'tbl-current', html:`${icon(e.icon||'table')}<b>${escapeHtml(e.label)}</b>`});
  const viewersBadge = el('span',{class:'tbl-viewers'});
  label.append(viewersBadge);
  const search = el('div',{class:'search tbl-search'});
  const searchInput = el('input',{class:'input tbl-search-input', type:'search', placeholder:'Filter rows…',
    value:filterText, 'aria-label':`Filter rows in ${e.label}`});
  search.append(el('span',{html:icon('search')}), searchInput);
  const spacer = el('div',{style:'flex:1'});
  const pin = el('button',{class:'btn sm', html:`${icon('star')} ${Store.isPinned(current)?'Pinned':'Pin'}`,
    onclick:()=>{Store.togglePin(current);renderTable(root,ctx,{entity:current});}});
  const editBtn = el('button',{class:'btn sm', html:`${icon('edit')} Edit table`, onclick:()=>editEntity(root,ctx)});
  const exportBtn = el('button',{class:'btn sm', title:'Export the current view to a .csv file', html:`${icon('download')} Export CSV`, onclick:()=>exportCsv()});
  const addCol = el('button',{class:'btn sm', html:`${icon('plus')} Field`, onclick:()=>addColumn(root,ctx)});
  const addRow = el('button',{class:'btn sm primary', html:`${icon('plus')} Row`, onclick:()=>addRowRec(root,ctx)});
  toolbar.append(label, search, spacer, pin, editBtn, exportBtn, addCol, addRow);
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
  wirePresence(wrap, viewerEls, viewersBadge);

  // action bar shown above the grid whenever one or more rows are checked
  function bulkBar(){
    const ids = [...selected];
    return el('div',{class:'bulk-bar'},[
      el('span',{class:'bulk-count', text:`${ids.length} selected`}),
      el('button',{class:'btn ghost sm', text:'Clear', onclick:()=>{ selected.clear(); refreshRows(); }}),
      el('div',{style:'flex:1 0 0;min-width:0'}),
      el('button',{class:'btn ghost sm', title:'Set one field’s value on every checked row', html:`${icon('edit')} Set field…`, onclick:()=>bulkSetField(root, ctx, ids)}),
      el('button',{class:'btn ghost sm', title:'Export just the checked rows to a .csv file', html:`${icon('download')} Export selected`, onclick:()=>{
        const idSet = new Set(ids);
        exportCsv(Store.records(current).filter(r=>idSet.has(r.id)));
      }}),
      el('button',{class:'btn danger sm', html:`${icon('trash')} Delete selected`, onclick:async()=>{
        if(await confirmDialog('Delete rows', `Delete ${ids.length} row${ids.length!==1?'s':''}? This will propagate to your peers.`, {danger:true, okLabel:'Delete'})){
          selected.clear();
          Store.removeMany(current, ids);
          renderTable(root, ctx, {entity:current});
          deletedToast(current, ids, root, ctx);
        }
      }}),
    ]);
  }

  // rebuilds only the field header + rows + footer, so filtering/sorting
  // never disturbs the toolbar (and the search box keeps its focus)
  function refreshRows(){
    body.innerHTML='';
    const cols = Store.columns(current);
    const total = Store.records(current).length;
    const needle = filterText.trim().toLowerCase();
    const rows = visibleRows(cols);

    // drop selections for rows a peer deleted elsewhere (or the whole set once a table empties)
    const liveIds = new Set(Store.records(current).map(r=>r.id));
    for(const id of selected) if(!liveIds.has(id)) selected.delete(id);
    if(selected.size) body.append(bulkBar());

    const scroll = el('div',{class:'table-scroll'});
    if(!total){
      scroll.append(el('div',{class:'empty', html:`${icon('grid')}<div>No rows yet in <b>${escapeHtml(e.label)}</b>.<br>Add a row — it syncs to your peers automatically.</div>`}));
    }else if(!rows.length){
      scroll.append(el('div',{class:'empty', html:`${icon('search')}<div>No rows match “${escapeHtml(filterText.trim())}”.</div>`}));
    }else{
      const table=el('table',{class:'data'});
      const thead=el('thead');
      const hr=el('tr');
      const allSelected = rows.length>0 && rows.every(r=>selected.has(r.id));
      const someSelected = !allSelected && rows.some(r=>selected.has(r.id));
      const selectAllCb = el('input',{type:'checkbox', class:'row-check', 'aria-label':'Select all visible rows'});
      selectAllCb.checked = allSelected;
      selectAllCb.indeterminate = someSelected;
      selectAllCb.addEventListener('change',()=>{
        if(selectAllCb.checked) rows.forEach(r=>selected.add(r.id));
        else rows.forEach(r=>selected.delete(r.id));
        refreshRows();
      });
      hr.append(el('th',{class:'chk-head'},[selectAllCb]));
      hr.append(el('th',{class:'open-head', text:''}));
      hr.append(el('th',{text:'id'}));
      cols.forEach(c=>{
        const sorted = sortField===c;
        const ft = Store.fieldType(current, c);
        const doSort=()=>{ if(sortField!==c){ sortField=c; sortDir='asc'; } else if(sortDir==='asc'){ sortDir='desc'; } else { sortField=null; sortDir='asc'; } refreshRows(); };
        const th = el('th',{class:'col-head'+(sorted?' sorted':''), title:`Sort by ${c}`, tabindex:'0',
          'aria-sort': sorted ? (sortDir==='asc'?'ascending':'descending') : 'none',
          onclick:doSort,
          onkeydown:(ev)=>{ if(ev.target!==ev.currentTarget) return; if(ev.key!=='Enter'&&ev.key!==' ') return; ev.preventDefault(); doSort(); }});
        const inner = el('div',{class:'col-head-inner'});
        inner.append(el('span',{class:'col-label', text:c}));
        if(ft) inner.append(el('span',{class:'col-type-badge', title:FIELD_TYPES.find(([v])=>v===ft.type)?.[1]||ft.type, text:TYPE_BADGE[ft.type]||ft.type}));
        if(sorted) inner.append(el('span',{class:'col-sort-ic'+(sortDir==='desc'?' desc':''), html:icon('chevron')}));
        inner.append(el('button',{class:'col-edit-btn', title:`Rename or delete field “${c}”`, 'aria-label':`Edit field ${c}`,
          html:icon('edit'), onclick:(ev)=>{ ev.stopPropagation(); editField(c, root, ctx); }}));
        th.append(inner);
        hr.append(th);
      });
      hr.append(el('th',{text:'updated'}), el('th',{text:''}));
      thead.append(hr); table.append(thead);

      const tbody=el('tbody');
      rows.forEach(r=>tbody.append(rowEl(r, cols, root, ctx, refreshRows)));
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

// ---- "who's viewing this table" — live, ephemeral, never touches Store ---
// Paints once immediately, then keeps repainting in place (no full re-render,
// so it never disturbs an in-progress filter/edit) whenever a peer's presence
// changes, until this render's root is no longer in the document.
function wirePresence(wrap, viewerEls, viewersBadge){
  const paint = ()=>{
    viewerEls.forEach((elm,k)=>paintViewers(elm,k));
    if(viewersBadge && current) paintViewers(viewersBadge, current);
  };
  paint();
  if(_presOff) _presOff();
  _presOff = Sync.on('peers', ()=>{
    if(!document.body.contains(wrap)){ _presOff&&_presOff(); _presOff=null; return; }
    paint();
  });
}
function paintViewers(elm, entityKey){
  const viewers = Sync.viewersOf(entityKey);
  if(!viewers.length){ elm.innerHTML=''; elm.title=''; elm.classList.remove('show'); return; }
  elm.classList.add('show');
  elm.title = `${viewers.map(v=>v.name).join(', ')} also viewing this table`;
  const shown = viewers.slice(0,3);
  elm.innerHTML = shown.map(v=>`<span class="viewer-dot" style="background:${avatarColor(v.uid)}">${escapeHtml(initials(v.name))}</span>`).join('')
    + (viewers.length>shown.length ? `<span class="viewer-dot viewer-more">+${viewers.length-shown.length}</span>` : '');
}

// same filter + sort the toolbar applies, shared with CSV export so a
// download always matches what's currently on screen
function visibleRows(cols){
  let rows = Store.records(current);
  const needle = filterText.trim().toLowerCase();
  if(needle) rows = rows.filter(r=>rowMatches(r, cols, needle));
  if(sortField) rows = rows.slice().sort((a,b)=>{
    const d = cmpVals(a.fields[sortField], b.fields[sortField]);
    return sortDir==='asc' ? d : -d;
  });
  return rows;
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
function buildTree(root, ctx, names, viewerEls){
  const panel = el('div',{class:'tree-panel'+(treeOpen?' open':'')});
  if(treeOpen) panel.style.width = treeWidth+'px';
  const head = el('div',{class:'tree-head'});
  const toggle = el('button',{class:'btn ghost icon sm tree-toggle',
    title: treeOpen?'Collapse panel':'Expand panel', 'aria-label': treeOpen?'Collapse tables panel':'Expand tables panel',
    html:icon('chevron'), onclick:()=>{ treeOpen=!treeOpen; localStorage.setItem(K_TREE_OPEN, treeOpen?'1':'0'); renderTable(root,ctx,{entity:current}); }});
  head.append(toggle, el('span',{class:'tree-title', text:'Tables'}),
    el('button',{class:'btn ghost icon sm', title:'Import CSV', 'aria-label':'Import CSV', html:icon('upload'), onclick:()=>importCsv(root,ctx)}),
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
    const viewersEl = el('span',{class:'tree-viewers'});
    viewerEls.set(k, viewersEl);
    row.append(caret, el('span',{class:'tree-ic', html:icon(e.icon||'table')}),
      el('span',{class:'tree-label', text:e.label}), el('span',{class:'tree-count', text:String(Store.count(k))}), viewersEl);
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
  if(treeOpen){
    const resize = el('div',{class:'tree-resize', title:'Drag to resize', role:'separator', 'aria-orientation':'vertical', 'aria-label':'Resize tables panel'});
    panel.append(resize);
    wireTreeResize(panel, resize);
  }
  return panel;
}

// drag-to-resize the tree panel; mirrors the rail nav's resize handle
// (js/shell.js) but scoped to this panel instead of a global CSS var, since
// the panel is torn down and rebuilt on every renderTable() call anyway
function wireTreeResize(panel, handle){
  let startX=0, startW=0, active=false;
  const onMove=(e)=>{
    if(!active) return;
    const x = e.touches?e.touches[0].clientX:e.clientX;
    panel.style.width = clampTreeW(startW + (x-startX))+'px';
  };
  const onUp=()=>{
    if(!active) return;
    active=false; panel.classList.remove('dragging');
    treeWidth = clampTreeW(parseInt(panel.style.width,10));
    localStorage.setItem(K_TREE_WIDTH, treeWidth);
    document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp);
    document.removeEventListener('touchmove',onMove); document.removeEventListener('touchend',onUp);
  };
  const onDown=(e)=>{
    active=true; panel.classList.add('dragging');
    startX = e.touches?e.touches[0].clientX:e.clientX;
    startW = panel.getBoundingClientRect().width;
    document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
    document.addEventListener('touchmove',onMove,{passive:false}); document.addEventListener('touchend',onUp);
    e.preventDefault();
  };
  handle.addEventListener('mousedown',onDown);
  handle.addEventListener('touchstart',onDown,{passive:false});
  handle.addEventListener('dblclick',()=>{
    treeWidth = TREE_DEFAULTW;
    panel.style.width = treeWidth+'px';
    localStorage.setItem(K_TREE_WIDTH, treeWidth);
  });
}

// tombstones never get pruned, so a delete is always a rev away from undone —
// surface that as an "Undo" action on the confirmation toast instead of
// requiring peers/settings/export to recover an accidental delete.
function deletedToast(entity, ids, root, ctx){
  const n = ids.length;
  toast(`Deleted ${n} row${n!==1?'s':''}`, {kind:'ok', action:{label:'Undo', onClick:()=>{
    Store.restoreMany(entity, ids);
    if(entity===current) renderTable(root, ctx, {entity:current});
    toast(`Restored ${n} row${n!==1?'s':''}`, {kind:'ok'});
  }}});
}

function rowEl(r, cols, root, ctx, onSelectionChange){
  const tr=el('tr',{'data-id':r.id, class: selected.has(r.id)?'row-selected':''});
  const chkTd=el('td',{class:'chk-cell'});
  const chk=el('input',{type:'checkbox', class:'row-check', 'aria-label':`Select row ${shortId(r.id)}`});
  chk.checked = selected.has(r.id);
  chk.addEventListener('change',()=>{
    if(chk.checked) selected.add(r.id); else selected.delete(r.id);
    onSelectionChange();
  });
  chkTd.append(chk);
  tr.append(chkTd);
  const openTd=el('td',{class:'open-cell'});
  openTd.append(el('button',{class:'btn ghost icon sm row-open', title:'Open record', 'aria-label':'Open record',
    html:icon('chevron'), onclick:()=>openRecordPanel(r, cols, root, ctx)}));
  tr.append(openTd);
  tr.append(el('td',{class:'rowid', text:shortId(r.id), title:r.id}));
  cols.forEach(c=>tr.append(fieldCell(r, c, Store.fieldType(current, c))));
  tr.append(el('td',{class:'meta-cell', text:ago(r._meta.updatedAt), title:`rev ${r._meta.rev} · by ${shortId(r._meta.updatedBy)}`}));
  const act=el('td');
  const del=el('button',{class:'btn ghost icon sm row-actions', html:icon('trash'), title:'Delete row', 'aria-label':'Delete row',
    onclick:async()=>{ if(await confirmDialog('Delete row','This tombstone will propagate to your peers.',{danger:true,okLabel:'Delete'})){ Store.remove(current,r.id); renderTable(root,ctx,{entity:current}); deletedToast(current,[r.id],root,ctx); } }});
  act.append(del); tr.append(act);
  return tr;
}

// a typed field renders a dedicated control (toggle / dropdown / date
// picker); an untyped ("auto") field keeps the original plain-text
// contenteditable cell, whose value is inferred on commit.
function fieldCell(r, field, ft){
  const val = r.fields[field];
  if(ft?.type==='boolean'){
    const td=el('td',{class:'bool-cell'});
    const isOn = toBool(val);
    const btn=el('button',{class:'toggle'+(isOn?' on':''), type:'button', role:'switch',
      'aria-checked':String(isOn), 'aria-label':`${field}: ${isOn?'on':'off'}`});
    btn.addEventListener('click',()=>{
      const nv=!btn.classList.contains('on');
      btn.classList.toggle('on',nv); btn.setAttribute('aria-checked',String(nv));
      commitCellValue(r, field, nv, td);
    });
    td.append(btn);
    return td;
  }
  if(ft?.type==='select'){
    const td=el('td',{class:'select-cell'});
    const opts = ft.options||[];
    const cur = val==null ? '' : String(val);
    const values = cur && !opts.includes(cur) ? [cur, ...opts] : opts;
    const sel=el('select',{class:'cell-select', 'aria-label':`${field} value`});
    sel.append(el('option',{value:'', text:'—'}));
    values.forEach(o=>sel.append(el('option',{value:o, text:o})));
    sel.value = cur;
    sel.addEventListener('change',()=>commitCellValue(r, field, sel.value, td));
    td.append(sel);
    return td;
  }
  if(ft?.type==='date'){
    const td=el('td',{class:'date-cell'});
    const inp=el('input',{class:'cell-date', type:'date', value: val||'', 'aria-label':`${field} date`});
    inp.addEventListener('change',()=>commitCellValue(r, field, inp.value, td));
    td.append(inp);
    return td;
  }
  const td=el('td',{contenteditable:'true', text: cellText(val)});
  td.dataset.field=field;
  td.addEventListener('blur',()=>commitCell(r, field, td, ft));
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
  return td;
}

function commitCell(r, field, td, ft){
  const raw=td.textContent.trim();
  const prev=r.fields[field];
  let val;
  if(ft?.type==='number'){
    if(raw===''){ val=''; }
    else{
      const n=Number(raw);
      if(isNaN(n)){ toast('Not a number',{body:`“${raw}” isn’t a valid number for “${field}”.`,kind:'err'}); td.textContent=cellText(prev); return; }
      val=n;
    }
  }else{
    val=inferValue(raw);
  }
  if(JSON.stringify(val)===JSON.stringify(prev)) return;
  Store.upsert(current, {[field]:val}, r.id);
  td.classList.add('cell-syncing'); setTimeout(()=>td.classList.remove('cell-syncing'),800);
}

// commit a value that a dedicated control (toggle/select/date) already typed
// correctly — no text inference needed.
function commitCellValue(r, field, val, td){
  const prev=r.fields[field];
  if(JSON.stringify(val)===JSON.stringify(prev)) return;
  Store.upsert(current, {[field]:val}, r.id);
  td.classList.add('cell-syncing'); setTimeout(()=>td.classList.remove('cell-syncing'),800);
}

// same auto-typing rules used for inline cell edits, reused for CSV import
function inferValue(raw){
  if(raw==='true') return true;
  if(raw==='false') return false;
  if(raw!=='' && !isNaN(Number(raw)) && String(Number(raw))===raw) return Number(raw);
  if(raw.startsWith('{')||raw.startsWith('[')){ try{ return JSON.parse(raw); }catch{} }
  return raw;
}

// the inverse of inferValue's typing for display/export: objects flatten to JSON text
function cellText(val){
  return val==null ? '' : (typeof val==='object' ? JSON.stringify(val) : String(val));
}

// coerce a value to a boolean for the toggle control — a plain `!!val` would
// treat leftover strings like "false" (truthy in JS) as on, which bites
// whenever a field already held free-form data before being retyped
function toBool(val){
  if(typeof val==='string') return !['','false','0','no'].includes(val.trim().toLowerCase());
  return !!val;
}

// ---- export current table (respecting filter + sort) → .csv --------------
// rowsOverride lets the bulk-select bar export just the checked rows instead
// of whatever the toolbar's filter/sort currently shows.
function exportCsv(rowsOverride){
  const cols = Store.columns(current);
  const rows = rowsOverride || visibleRows(cols);
  if(!rows.length){ toast('No rows to export',{kind:'err'}); return; }
  const e = Store.entity(current);
  const lines = [cols.map(csvField).join(',')];
  rows.forEach(r=>lines.push(cols.map(c=>csvField(cellText(r.fields[c]))).join(',')));
  const blob = new Blob([lines.join('\r\n')], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const base = (e.label||'table').trim().replace(/[^\w-]+/g,'_')||'table';
  const a = el('a',{href:url, download:`${base}${rowsOverride?'_selected':''}.csv`});
  document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toast(`Exported ${rows.length} row${rows.length!==1?'s':''}`,{kind:'ok'});
}
function csvField(v){
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v;
}

// ---- bulk-set a single field's value across the checked rows -------------
// value editor swaps to match the chosen field's type, same controls the
// grid/record-panel already use, so a typed field (dropdown/date/yes-no)
// can't be bulk-set to a value it wouldn't otherwise accept.
function bulkSetField(root, ctx, ids){
  const cols = Store.columns(current);
  if(!cols.length){ toast('No fields to set',{kind:'err'}); return; }
  const fieldSel = el('select',{class:'input', 'aria-label':'Field to set'});
  cols.forEach(c=>fieldSel.append(el('option',{value:c, text:c})));
  const valueWrap = el('div',{class:'field'});
  let getValue = ()=>'';
  function buildValueInput(){
    valueWrap.innerHTML='';
    const field = fieldSel.value;
    const ft = Store.fieldType(current, field);
    const label = el('label',{text:'Value'});
    if(ft?.type==='boolean'){
      let on=false;
      const btn=el('button',{class:'toggle', type:'button', role:'switch', 'aria-checked':'false', 'aria-label':`${field} value`,
        onclick:()=>{ on=!on; btn.classList.toggle('on',on); btn.setAttribute('aria-checked',String(on)); }});
      valueWrap.append(label, btn);
      getValue=()=>on;
    }else if(ft?.type==='select'){
      const opts=ft.options||[];
      const sel=el('select',{class:'input'});
      sel.append(el('option',{value:'', text:'—'}));
      opts.forEach(o=>sel.append(el('option',{value:o, text:o})));
      valueWrap.append(label, sel);
      getValue=()=>sel.value;
    }else if(ft?.type==='date'){
      const inp=el('input',{class:'input', type:'date'});
      valueWrap.append(label, inp);
      getValue=()=>inp.value;
    }else if(ft?.type==='number'){
      const inp=el('input',{class:'input', type:'number', placeholder:'New value'});
      valueWrap.append(label, inp);
      getValue=()=>{ const raw=inp.value.trim(); if(raw==='') return ''; const n=Number(raw); return isNaN(n) ? undefined : n; };
    }else{
      const inp=el('input',{class:'input', type:'text', placeholder:'New value for every selected row'});
      valueWrap.append(label, inp);
      getValue=()=>inferValue(inp.value);
    }
  }
  fieldSel.addEventListener('change', buildValueInput);
  buildValueInput();
  const body = el('div',{},[
    el('div',{class:'field'},[el('label',{text:'Field'}), fieldSel]),
    valueWrap,
    el('p',{class:'muted tiny', text:`Sets this field on all ${ids.length} selected row${ids.length!==1?'s':''} and syncs to your peers.`}),
  ]);
  const { hide } = modal({ title:'Set field on selected rows', icon:'edit', body,
    foot:[ el('button',{class:'btn', text:'Cancel', onclick:()=>hide()}),
      el('button',{class:'btn primary', text:'Apply', onclick:()=>{
        const field=fieldSel.value, val=getValue();
        if(val===undefined){ toast('Not a number',{kind:'err'}); return; }
        Store.setFieldMany(current, ids, field, val);
        hide(); selected.clear(); renderTable(root, ctx, {entity:current});
        toast(`Updated ${ids.length} row${ids.length!==1?'s':''}`,{kind:'ok'});
      }})]});
  setTimeout(()=>fieldSel.focus(),50);
}

// ---- right-hand record editor: field-by-field, typed inputs ---------------
function openRecordPanel(rec, cols, root, ctx){
  const e = Store.entity(current);

  const bodyFrag = document.createDocumentFragment();
  const allCols = cols.length ? cols : Object.keys(rec.fields||{});
  if(!allCols.length) bodyFrag.append(el('div',{class:'empty muted', text:'No fields yet — add one from the table toolbar.'}));
  allCols.forEach(c=>bodyFrag.append(recordFieldRow(rec, c)));

  const del = el('button',{class:'btn danger', html:`${icon('trash')} Delete row`, onclick:async()=>{
    if(await confirmDialog('Delete row','This tombstone will propagate to your peers.',{danger:true,okLabel:'Delete'})){
      Store.remove(current, rec.id); deletedToast(current,[rec.id],root,ctx); s.hide();
    }
  }});

  const s = sheet({
    className:'record-sheet', ariaLabel:'Record editor', bodyClass:'record-fields',
    head:`<div><h3>${escapeHtml(e.label)} record</h3>
      <div class="muted tiny">${shortId(rec.id)} · updated ${ago(rec._meta.updatedAt)}</div></div>`,
    body:bodyFrag, foot:del,
    onHide:()=>renderTable(root,ctx,{entity:current}),
  });
  setTimeout(()=>{ const first=s.body.querySelector('input,textarea'); first&&first.focus(); },60);
}

function recordFieldRow(rec, field){
  const val = rec.fields[field];
  const ft = Store.fieldType(current, field);
  // an explicit field type overrides guessing the editor from the current
  // value; "auto" (no type set) keeps the original value-based heuristic.
  const kind = ft?.type || (typeof val==='boolean' ? 'boolean'
    : typeof val==='number' ? 'number'
    : (val && typeof val==='object') ? 'json' : 'text');
  const row = el('div',{class:'field record-field'});
  row.append(el('label',{text:field}));
  let input;
  if(kind==='boolean'){
    const isOn = toBool(val);
    input = el('button',{class:'toggle'+(isOn?' on':''), type:'button', role:'switch', 'aria-checked':String(isOn),
      onclick:()=>{ const nv=!input.classList.contains('on'); input.classList.toggle('on',nv); input.setAttribute('aria-checked',String(nv)); commitField(rec, field, nv, input); }});
  }else if(kind==='number'){
    input = el('input',{class:'input', type:'number', value: val==null?'':String(val)});
    input.addEventListener('blur',()=>commitField(rec, field, input.value===''?'':Number(input.value), input));
    input.addEventListener('keydown',ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); input.blur(); } });
  }else if(kind==='date'){
    input = el('input',{class:'input', type:'date', value: val||''});
    input.addEventListener('change',()=>commitField(rec, field, input.value, input));
  }else if(kind==='select'){
    const opts = ft.options||[];
    const cur = val==null ? '' : String(val);
    const values = cur && !opts.includes(cur) ? [cur, ...opts] : opts;
    input = el('select',{class:'input'});
    input.append(el('option',{value:'', text:'—'}));
    values.forEach(o=>input.append(el('option',{value:o, text:o})));
    input.value = cur;
    input.addEventListener('change',()=>commitField(rec, field, input.value, input));
  }else if(kind==='json'){
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
  const typeSel=el('select',{class:'input'});
  FIELD_TYPES.forEach(([v,l])=>typeSel.append(el('option',{value:v, text:l})));
  const optsInput=el('input',{class:'input', placeholder:'Comma-separated options, e.g. Open, In progress, Done'});
  const optsField=el('div',{class:'field', style:'display:none'},[el('label',{text:'Options'}), optsInput]);
  typeSel.addEventListener('change',()=>{ optsField.style.display = typeSel.value==='select' ? '' : 'none'; });
  const {hide}=modal({ title:'Add field', icon:'plus',
    body: el('div',{},[
      el('div',{class:'field'},[el('label',{text:'Field name'}), input]),
      el('div',{class:'field'},[el('label',{text:'Type'}), typeSel]),
      optsField]),
    foot:[ el('button',{class:'btn', text:'Cancel', onclick:()=>hide()}),
      el('button',{class:'btn primary', text:'Add field', onclick:()=>{
        const name=input.value.trim().replace(/\s+/g,'_'); if(!name) return;
        // materialise the column onto the first row (or a fresh row) so it shows
        const defaultVal = typeSel.value==='boolean' ? false : '';
        const rows=Store.records(current);
        if(rows.length) Store.upsert(current,{[name]:defaultVal},rows[0].id);
        else Store.upsert(current,{[name]:defaultVal});
        if(typeSel.value!=='auto'){
          const opts=optsInput.value.split(',').map(s=>s.trim()).filter(Boolean);
          Store.setFieldType(current, name, typeSel.value, opts);
        }
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

// ---- import CSV → new table ------------------------------------------
function importCsv(root, ctx){
  const inp=el('input',{type:'file', accept:'.csv,text/csv', style:'display:none'});
  inp.onchange=()=>{
    const f=inp.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const rows=parseCSV(String(r.result));
        if(!rows.length) throw new Error('The file has no rows');
        const headers=dedupeHeaders(rows[0].map(sanitizeHeader));
        const dataRows=rows.slice(1).filter(row=>row.some(v=>v!==''));
        if(!dataRows.length) throw new Error('No data rows found under the header');
        openImportPreview(root, ctx, f.name, headers, dataRows);
      }catch(e){ toast('Could not read CSV',{body:e.message,kind:'err'}); }
    };
    r.readAsText(f);
  };
  document.body.append(inp); inp.click(); inp.remove();
}

// minimal RFC4180 parser: quoted fields, "" escapes, commas/newlines inside quotes
function parseCSV(text){
  const rows=[]; let row=[], field='', inQuotes=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQuotes){
      if(c==='"'){ if(text[i+1]==='"'){ field+='"'; i++; } else inQuotes=false; }
      else field+=c;
    }else if(c==='"') inQuotes=true;
    else if(c===','){ row.push(field); field=''; }
    else if(c==='\n'){ row.push(field); rows.push(row); row=[]; field=''; }
    else if(c!=='\r') field+=c;
  }
  if(field!==''||row.length){ row.push(field); rows.push(row); }
  return rows.filter(r=>!(r.length===1 && r[0]===''));
}

function sanitizeHeader(h,i){
  return (h||'').trim().replace(/\s+/g,'_').replace(/[^\w-]/g,'') || `field_${i+1}`;
}
function dedupeHeaders(headers){
  const seen={};
  return headers.map(h=>{ seen[h]=(seen[h]||0)+1; return seen[h]>1 ? `${h}_${seen[h]}` : h; });
}

function openImportPreview(root, ctx, filename, headers, dataRows){
  const suggested = filename.replace(/\.csv$/i,'').replace(/[_-]+/g,' ').trim() || 'Imported table';
  const name=el('input',{class:'input', value:suggested});
  const previewRows = dataRows.slice(0,5);
  const table=el('table',{class:'data'});
  const thead=el('thead'); const hr=el('tr');
  headers.forEach(h=>hr.append(el('th',{text:h})));
  thead.append(hr); table.append(thead);
  const tbody=el('tbody');
  previewRows.forEach(row=>{
    const tr=el('tr');
    headers.forEach((_,i)=>tr.append(el('td',{text:row[i]??''})));
    tbody.append(tr);
  });
  table.append(tbody);

  const typeRows = headers.map((h,i)=>{
    const colValues = dataRows.map(row=>row[i]).filter(v=>v);
    const suggestion = suggestColumnType(colValues);
    const sel=el('select',{class:'input'});
    FIELD_TYPES.forEach(([v,l])=>sel.append(el('option',{value:v, text:l})));
    sel.value = suggestion.type;
    const optsInput=el('input',{class:'input', placeholder:'Comma-separated options', value:(suggestion.options||[]).join(', ')});
    const optsWrap=el('div',{class:'import-type-opts', style:suggestion.type==='select'?'':'display:none'}, optsInput);
    sel.addEventListener('change',()=>{ optsWrap.style.display = sel.value==='select' ? '' : 'none'; });
    const row=el('div',{class:'import-type-row'},[
      el('span',{class:'import-type-name', title:h, text:h}), sel, optsWrap]);
    return { header:h, sel, optsInput, row };
  });

  const progressFill=el('div',{class:'import-progress-fill'});
  const progressLabel=el('p',{class:'muted tiny import-progress-label'});
  const progressWrap=el('div',{class:'field', style:'display:none'},
    [el('div',{class:'import-progress-track'}, progressFill), progressLabel]);

  const body=el('div');
  body.append(
    (()=>{ const f=el('div',{class:'field'}); f.append(el('label',{text:'Table name'}), name); return f; })(),
    el('p',{class:'muted tiny', text:`${dataRows.length} row${dataRows.length!==1?'s':''} · ${headers.length} field${headers.length!==1?'s':''}`
      + (dataRows.length>previewRows.length ? ` · showing first ${previewRows.length}` : '')}),
    el('div',{class:'table-scroll', style:'max-height:240px'}, table),
    (()=>{ const f=el('div',{class:'field'}); f.append(
      el('label',{text:'Field types'}),
      el('p',{class:'muted tiny', style:'margin:0 0 8px', text:'Auto keeps the original text/number/boolean guessing. Columns that look like a short repeated set of values are pre-set to Dropdown.'}),
      el('div',{class:'import-types'}, typeRows.map(t=>t.row))); return f; })(),
    progressWrap);

  // rows import in fixed-size chunks, yielding to the main thread between each
  // one, so a large CSV (tens of thousands of rows) never freezes the tab —
  // only the final chunk resolves the click handler and closes the modal.
  const CHUNK=300;
  const cancelBtn=el('button',{class:'btn', text:'Cancel', onclick:()=>hide()});
  const importBtn=el('button',{class:'btn primary', text:`Import ${dataRows.length} row${dataRows.length!==1?'s':''}`, onclick:async()=>{
    const label=name.value.trim(); if(!label) return;
    let key;
    try{ key=Store.createEntity(label, 'table'); }
    catch(e){ toast('Could not create table',{body:e.message,kind:'err'}); return; }
    const total=dataRows.length;
    cancelBtn.disabled=true; importBtn.disabled=true; progressWrap.style.display='';
    for(let i=0;i<total;i+=CHUNK){
      const batch=dataRows.slice(i,i+CHUNK).map(row=>{
        const fields={};
        headers.forEach((h,ci)=>{ if(row[ci]) fields[h]=coerceImportValue(row[ci], typeRows[ci].sel.value); });
        return fields;
      }).filter(fields=>Object.keys(fields).length);
      if(batch.length) Store.upsertMany(key, batch);
      const done=Math.min(i+CHUNK,total);
      progressFill.style.width=Math.round(done/total*100)+'%';
      progressLabel.textContent=`Importing ${done}/${total} rows…`;
      if(done<total) await new Promise(r=>setTimeout(r,0));
    }
    typeRows.forEach(({header,sel,optsInput})=>{
      if(sel.value==='auto') return;
      const opts = sel.value==='select' ? optsInput.value.split(',').map(s=>s.trim()).filter(Boolean) : undefined;
      Store.setFieldType(key, header, sel.value, opts);
    });
    hide(); renderTable(root, ctx, {entity:key}); toast(`Imported ${total} row${total!==1?'s':''}`,{kind:'ok'});
  }});

  const { hide }=modal({ title:'Import CSV', icon:'upload', wide:true, body, foot:[cancelBtn, importBtn] });
  setTimeout(()=>{ name.focus(); name.select(); },50);
}

// suggest Dropdown for a column that looks like a small repeated set of string
// values (e.g. status/priority/category) — CSV exports of categorical fields
// are exactly where a fixed option list pays off over free text. Leaves
// already-auto-detectable columns (all booleans, all numbers) alone.
function suggestColumnType(colValues){
  if(colValues.length<3) return {type:'auto'};
  if(colValues.every(v=>v==='true'||v==='false')) return {type:'auto'};
  if(colValues.every(v=>v!=='' && !isNaN(Number(v)) && String(Number(v))===v)) return {type:'auto'};
  const unique=[...new Set(colValues)];
  if(unique.length>=2 && unique.length<=8 && unique.length<=colValues.length*0.6) return {type:'select', options:unique};
  return {type:'auto'};
}

// apply an explicit import-time field type to a raw CSV cell string, falling
// back to the normal auto-typing rules when left on "auto"
function coerceImportValue(raw, type){
  if(type==='boolean') return toBool(raw);
  if(type==='number'){ const n=Number(raw); return isNaN(n) ? raw : n; }
  if(type==='date'||type==='select'||type==='text') return raw;
  return inferValue(raw);
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
    if(await confirmDialog('Delete table',`Delete “${e.label}” and all its rows for you and your peers? This cannot be undone.`,{danger:true,okLabel:'Delete table'})){
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

// ---- rename / retype / delete a field (column) --------------------------
function editField(field, root, ctx){
  const input=el('input',{class:'input', value:field});
  const ft=Store.fieldType(current, field);
  const typeSel=el('select',{class:'input'});
  FIELD_TYPES.forEach(([v,l])=>typeSel.append(el('option',{value:v, text:l})));
  typeSel.value = ft?.type || 'auto';
  const optsInput=el('input',{class:'input', placeholder:'Comma-separated options, e.g. Open, In progress, Done', value:(ft?.options||[]).join(', ')});
  const optsField=el('div',{class:'field', style: typeSel.value==='select'?'':'display:none'},[el('label',{text:'Options'}), optsInput]);
  typeSel.addEventListener('change',()=>{ optsField.style.display = typeSel.value==='select' ? '' : 'none'; });
  const body=el('div');
  body.append(
    (()=>{ const f=el('div',{class:'field'}); f.append(el('label',{text:'Field name'}), input); return f; })(),
    (()=>{ const f=el('div',{class:'field'}); f.append(el('label',{text:'Type'}), typeSel); return f; })(),
    optsField,
    el('p',{class:'muted tiny', text:'Applies across every row and syncs to your peers.'}));
  const del=el('button',{class:'btn danger', html:`${icon('trash')} Delete field`, onclick:async()=>{
    if(await confirmDialog('Delete field',`Remove “${field}” from every row in this table (for you and your peers)?`,{danger:true,okLabel:'Delete field'})){
      hide(); Store.deleteField(current, field); renderTable(root,ctx,{entity:current}); toast('Field deleted',{kind:'ok'});
    }
  }});
  const save=el('button',{class:'btn primary', text:'Save', onclick:()=>{
    const nn=input.value.trim().replace(/\s+/g,'_');
    const finalField = (nn && nn!==field) ? nn : field;
    if(nn && nn!==field) Store.renameField(current, field, nn);
    const opts=optsInput.value.split(',').map(s=>s.trim()).filter(Boolean);
    Store.setFieldType(current, finalField, typeSel.value, opts);
    hide(); renderTable(root,ctx,{entity:current}); toast('Field updated',{kind:'ok'});
  }});
  const { hide }=modal({ title:`Field: ${field}`, icon:'edit', body, foot:[del, el('div',{style:'flex:1'}),
    el('button',{class:'btn', text:'Cancel', onclick:()=>hide()}), save] });
  setTimeout(()=>{ input.focus(); input.select(); },50);
}

export function currentEntity(){ return current; }
