// Keyboard shortcuts help — a modal listing every shortcut the app supports,
// opened via the topbar button or the "?" key. Purely informational; no
// state, no sync.
import { el, modal } from '../ui.js';

const isMac = typeof navigator!=='undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform||'');
const MOD = isMac ? 'Cmd' : 'Ctrl';

const GROUPS = [
  { title:'Everywhere', rows:[
    { keys:[MOD,'K'], desc:'Open global search' },
    { keys:['?'], desc:'Show this shortcuts panel' },
    { keys:['Esc'], desc:'Close the open dialog, sheet, or popover' },
  ]},
  { title:'Table grid — editing a cell', rows:[
    { keys:['↑ / ↓'], desc:'Move to the row above/below, same column' },
    { keys:['← / →'], desc:'Move to the previous/next column, from the start/end of the text' },
    { keys:['Enter'], desc:'Save the cell and move down one row' },
    { keys:['Esc'], desc:'Cancel the edit and restore the previous value' },
    { keys:[MOD,'Arrow key'], desc:'Move out of a dropdown, date, or link cell (which otherwise use bare arrows for their own value)' },
  ]},
  { title:'Dragging to reorder', rows:[
    { keys:['↑ / ↓ / ← / →'], desc:'With a drag handle (grip icon) focused, swap it with its neighbor' },
  ]},
  { title:'Messages', rows:[
    { keys:['Enter'], desc:'Send the message' },
    { keys:['Shift','Enter'], desc:'Add a new line' },
  ]},
];

function keyRow({keys, desc}){
  const keysEl = el('div',{class:'shortcut-keys'});
  keys.forEach((k,i)=>{
    if(i) keysEl.append(el('span',{class:'shortcut-plus', text:'+'}));
    keysEl.append(el('span',{class:'kbd', text:k}));
  });
  const row = el('div',{class:'shortcut-row'});
  row.append(keysEl, el('div',{class:'shortcut-desc', text:desc}));
  return row;
}

export function openShortcuts(){
  if(document.querySelector('.overlay.show')) return;   // don't stack over an existing dialog
  const body = el('div',{class:'shortcuts'});
  GROUPS.forEach(g=>{
    body.append(el('div',{class:'shortcuts-group', text:g.title}));
    g.rows.forEach(r=>body.append(keyRow(r)));
  });
  modal({ title:'Keyboard shortcuts', icon:'keyboard', body });
}
