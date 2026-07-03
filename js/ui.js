// Stateless DOM + UX helpers (toasts, modals, formatting).
import { icon } from './icons.js';

export const $  = (s, r=document) => r.querySelector(s);
export const $$ = (s, r=document) => [...r.querySelectorAll(s)];

export function el(tag, attrs={}, children){
  const n = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(k==='class') n.className=v;
    else if(k==='html') n.innerHTML=v;
    else if(k==='text') n.textContent=v;
    else if(k.startsWith('on') && typeof v==='function') n.addEventListener(k.slice(2),v);
    else if(v!=null&&v!==false) n.setAttribute(k, v===true?'':v);
  }
  if(children!=null){
    (Array.isArray(children)?children:[children]).forEach(c=>{
      if(c==null) return;
      n.append(c.nodeType?c:document.createTextNode(c));
    });
  }
  return n;
}

export function escapeHtml(s){
  return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---- deterministic color from a string (avatars / dots) ------------------
export function hue(str){
  let h=0; for(let i=0;i<String(str).length;i++) h=(h*31+str.charCodeAt(i))>>>0;
  return h%360;
}
export function avatarColor(id){
  const h=hue(id);
  return `linear-gradient(135deg,hsl(${h} 62% 52%),hsl(${(h+40)%360} 62% 45%))`;
}
export function initials(name){
  return String(name||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
}

// ---- time --------------------------------------------------------------
export function ago(ts){
  if(!ts) return '—';
  const s=Math.max(0,(Date.now()-ts)/1000);
  if(s<45) return 'just now';
  if(s<90) return '1 min ago';
  if(s<3600) return `${Math.round(s/60)} min ago`;
  if(s<5400) return '1 hr ago';
  if(s<86400) return `${Math.round(s/3600)} hr ago`;
  if(s<172800) return 'yesterday';
  return `${Math.round(s/86400)} d ago`;
}
export function clock(ts=Date.now()){
  const d=new Date(ts);
  return d.toTimeString().slice(0,8);
}
export function uuid(){
  if(crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
    const r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8); return v.toString(16);
  });
}
export function shortId(id){ return String(id).slice(0,8); }

// ---- toasts ------------------------------------------------------------
export function toast(title, {body='', kind='info', ms=3800}={}){
  const host = $('#toasts') || document.body.appendChild(el('div',{id:'toasts', role:'status', 'aria-live':'polite'}));
  const ic = {ok:'check',err:'x',info:'info',warn:'info'}[kind]||'info';
  const t = el('div',{class:`toast ${kind}`, html:
    `<span class="ic">${icon(ic)}</span><div><b>${escapeHtml(title)}</b>${body?`<p>${escapeHtml(body)}</p>`:''}</div>`});
  host.append(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  const kill=()=>{t.classList.remove('show');setTimeout(()=>t.remove(),320)};
  const to=setTimeout(kill,ms);
  t.addEventListener('click',()=>{clearTimeout(to);kill()});
  return kill;
}

// ---- dialog focus trap (shared by modal() and sheet()) -----------------
// Focuses the first focusable element on open, cycles Tab/Shift+Tab within
// the container instead of leaking to the page behind the overlay, closes
// on Escape, and restores focus to whatever triggered the dialog on close.
const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
function trapDialog(container, requestHide){
  const prevFocus = document.activeElement;
  (container.querySelector(FOCUSABLE)||container).focus();
  function onKeydown(e){
    if(e.key==='Escape'){ requestHide(); return; }
    if(e.key!=='Tab') return;
    const items = $$(FOCUSABLE, container);
    if(!items.length) return;
    const first=items[0], last=items[items.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKeydown);
  return { release(){ document.removeEventListener('keydown', onKeydown); if(prevFocus?.isConnected) prevFocus.focus(); } };
}

// ---- modal -------------------------------------------------------------
let modalTitleSeq = 0;

export function modal({title='', body, foot, wide=false, icon:ic}={}){
  const titleId = `modal-title-${++modalTitleSeq}`;
  const overlay = el('div',{class:'overlay'});
  const m = el('div',{class:'modal'+(wide?' wide':''), role:'dialog', 'aria-modal':'true', 'aria-labelledby':titleId, tabindex:'-1'});
  const head = el('div',{class:'modal-head', html:
    `${ic?`<span style="color:var(--brand-b)">${icon(ic)}</span>`:''}<h3 id="${titleId}">${escapeHtml(title)}</h3>`});
  const close = el('button',{class:'btn ghost icon', title:'Close', 'aria-label':'Close', html:icon('x'), onclick:()=>hide()});
  head.append(close);
  const bodyEl = el('div',{class:'modal-body'});
  if(typeof body==='string') bodyEl.innerHTML=body; else if(body) bodyEl.append(body);
  m.append(head, bodyEl);
  if(foot){ const f=el('div',{class:'modal-foot'}); (Array.isArray(foot)?foot:[foot]).forEach(b=>f.append(b)); m.append(f); }
  overlay.append(m);
  overlay.addEventListener('mousedown',e=>{if(e.target===overlay) hide()});
  document.body.append(overlay);
  requestAnimationFrame(()=>overlay.classList.add('show'));
  const focusGuard = trapDialog(m, ()=>hide());
  function hide(){
    overlay.classList.remove('show'); setTimeout(()=>overlay.remove(),220);
    focusGuard.release();
  }
  return {overlay, body:bodyEl, hide};
}

// ---- sheet (slide-in panel, e.g. record editor / what's new) -----------
export function sheet({head, extra, body, bodyClass='', foot, className='', ariaLabel, onHide}={}){
  const overlay = el('div',{class:'sheet-overlay'});
  const s = el('div',{class:'sheet'+(className?' '+className:''), role:'dialog', 'aria-modal':'true', 'aria-label':ariaLabel, tabindex:'-1'});
  const headEl = el('div',{class:'sheet-head'});
  if(typeof head==='string') headEl.innerHTML=head; else if(head) headEl.append(head);
  headEl.append(el('button',{class:'btn ghost sm', text:'Close', onclick:()=>hide()}));
  s.append(headEl);
  if(extra) s.append(extra);
  const bodyEl = el('div',{class:'sheet-body'+(bodyClass?' '+bodyClass:'')});
  if(typeof body==='string') bodyEl.innerHTML=body; else if(body) bodyEl.append(body);
  s.append(bodyEl);
  if(foot){ const f=el('div',{class:'sheet-foot'}); (Array.isArray(foot)?foot:[foot]).forEach(b=>f.append(b)); s.append(f); }
  overlay.append(s);
  overlay.addEventListener('mousedown',e=>{if(e.target===overlay) hide()});
  document.body.append(overlay);
  requestAnimationFrame(()=>overlay.classList.add('show'));
  const focusGuard = trapDialog(s, ()=>hide());
  function hide(){
    overlay.classList.remove('show'); setTimeout(()=>overlay.remove(),240);
    if(onHide) onHide();
    focusGuard.release();
  }
  return {overlay, body:bodyEl, hide};
}

export function confirmDialog(title, message, {danger=false, okLabel='Confirm'}={}){
  return new Promise(res=>{
    const ok = el('button',{class:'btn '+(danger?'danger':'primary'), text:okLabel});
    const cancel = el('button',{class:'btn', text:'Cancel'});
    const {hide} = modal({title, body:`<p class="muted">${escapeHtml(message)}</p>`, foot:[cancel, ok]});
    ok.onclick=()=>{hide();res(true)}; cancel.onclick=()=>{hide();res(false)};
  });
}
