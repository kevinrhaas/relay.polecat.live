// Admin area: unlock with the admin token, then mint invite links to send
// to people. Everything is local + client-side (see access.js).
import { Access } from '../access.js';
import { el, escapeHtml, toast, ago, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';

export function renderAdmin(root, ctx){
  root.innerHTML='';
  const wrap=el('div',{class:'wrap'});
  wrap.append(el('div',{class:'section-title', html:`<h2>Admin</h2>`}));

  if(!Access.isAdmin()){
    // ---- locked: prompt for the admin token ----------------------------
    const card=el('div',{class:'card', style:'max-width:560px'});
    card.innerHTML=`<div class="section-title" style="margin-top:0"><h2 style="font-size:14px">Unlock admin</h2></div>
      <p class="muted tiny">Paste your admin token to unlock invite management. The token is your private key — it's stored only in this browser and never leaves your device.</p>`;
    const ta=el('textarea',{class:'input', rows:'3', placeholder:'Paste admin token…', spellcheck:'false'});
    const btn=el('button',{class:'btn primary', style:'margin-top:6px', html:`${icon('key')} Unlock`, onclick:async()=>{
      btn.disabled=true;
      const ok=await Access.unlockAdmin(ta.value);
      btn.disabled=false;
      if(ok){ toast('Admin unlocked',{kind:'ok'}); ctx.refresh(); }
      else toast('Invalid admin token',{kind:'err'});
    }});
    const f=el('div',{class:'field'}); f.append(el('label',{text:'Admin token'}), ta);
    card.append(f, btn);
    wrap.append(card);
    root.append(wrap); return;
  }

  // ---- unlocked: mint + manage invites ---------------------------------
  const head=el('div',{class:'card', style:'display:flex;align-items:center;gap:12px'});
  head.innerHTML=`<span class="conn-state conn-connected"><span class="dot"></span>Admin unlocked</span>
    <span class="muted tiny" style="flex:1">You can mint invite links below.</span>`;
  head.append(el('button',{class:'btn sm', html:`${icon('x')} Lock`, onclick:()=>{ Access.lockAdmin(); toast('Admin locked',{kind:'ok'}); ctx.refresh(); }}));
  wrap.append(head);

  // mint form
  const mint=el('div',{class:'card', style:'margin-top:16px'});
  mint.innerHTML=`<div class="section-title" style="margin-top:0"><h2 style="font-size:14px">Create an invite</h2></div>
    <p class="muted tiny">Generates a signed, unforgeable invite link. Send it to someone — opening it unlocks the preview for them. No server checks it.</p>`;
  const label=el('input',{class:'input', placeholder:'Who is this for? (e.g. Grace)'} );
  const exp=el('select',{class:'input'});
  [['7','7 days'],['30','30 days'],['90','90 days'],['0','Never expires']].forEach(([v,t])=>exp.append(el('option',{value:v,text:t})));
  const lf=el('div',{class:'field'}); lf.append(el('label',{text:'Label'}), label);
  const ef=el('div',{class:'field'}); ef.append(el('label',{text:'Expires'}), exp);
  const row=el('div',{style:'display:flex;gap:14px'}); lf.style.flex='1'; row.append(lf, ef);
  const gen=el('button',{class:'btn primary', html:`${icon('plus')} Generate invite link`, onclick:async()=>{
    try{ await Access.mintInvite({ label:label.value.trim(), days:parseInt(exp.value,10) });
      label.value=''; toast('Invite created',{kind:'ok'}); renderAdmin(root,ctx); }
    catch(e){ toast('Could not create',{body:e.message,kind:'err'}); }
  }});
  mint.append(row, gen);
  wrap.append(mint);

  // minted list
  const list=Access.minted();
  wrap.append(el('div',{class:'section-title', html:`<h2>Invites you've created (${list.length})</h2>`}));
  if(!list.length){
    wrap.append(el('div',{class:'card muted', text:'No invites yet. Create one above to share.'}));
  }else{
    const g=el('div',{class:'grid', style:'gap:10px'});
    list.forEach(inv=>g.append(inviteRow(inv, root, ctx)));
    wrap.append(g);
  }
  root.append(wrap);
}

function inviteRow(inv, root, ctx){
  const c=el('div',{class:'card', style:'display:flex;align-items:center;gap:12px;padding:14px 16px'});
  const expTxt = inv.exp ? `expires ${new Date(inv.exp).toLocaleDateString()}` : 'never expires';
  c.innerHTML=`<div style="flex:1;min-width:0">
      <b>${escapeHtml(inv.label||'Untitled invite')}</b>
      <div class="muted tiny">created ${ago(inv.iat)} · ${expTxt}</div>
    </div>`;
  const copy=el('button',{class:'btn sm', html:`${icon('copy')} Copy link`, onclick:()=>{
    navigator.clipboard?.writeText(inv.link).then(()=>toast('Invite link copied',{kind:'ok'})); }});
  const del=el('button',{class:'btn ghost icon sm', html:icon('trash'), title:'Remove from list', onclick:async()=>{
    if(await confirmDialog('Remove invite','This only removes it from your local list; a link already sent still works until it expires.',{danger:true,okLabel:'Remove'})){
      Access.forget(inv.iat); renderAdmin(root,ctx); } }});
  c.append(copy, del);
  return c;
}
