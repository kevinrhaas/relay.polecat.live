// Settings: identity, appearance (palette × dark/light/system), P2P transport,
// data export / import / reset.
import { Store } from '../store.js';
import { Sync } from '../sync.js';
import { Rendezvous } from '../rendezvous.js';
import { LocalFolder, S3Sync, WebDAVSync, Dropbox, GoogleDrive } from '../storage/index.js';
import { Access } from '../access.js';
import { el, escapeHtml, toast, confirmDialog, avatarColor, initials, ago } from '../ui.js';
import { icon } from '../icons.js';
import { setTheme, getTheme, PALETTES } from '../../vendor/polecat-shell/theme.js';

export function renderSettings(root, ctx){
  root.innerHTML='';
  const wrap=el('div',{class:'wrap'});
  wrap.append(el('div',{class:'section-title', html:'<h2>Settings</h2>'}));

  // ---- identity --------------------------------------------------------
  const idCard=el('div',{class:'card'});
  idCard.innerHTML=`<div class="section-title" style="margin-top:0"><h2 style="font-size:14px">Identity</h2></div>`;
  const av=el('div',{class:'peer-av', style:`background:${avatarColor(Store.identity.id)};width:52px;height:52px;font-size:18px`, text:initials(Store.identity.name)});
  const nameIn=el('input',{class:'input', value:Store.identity.name});
  const row=el('div',{style:'display:flex;gap:16px;align-items:center'});
  const nameField=el('div',{class:'field',style:'flex:1;margin:0'});
  nameField.append(el('label',{text:'Display name (what peers see)'}), nameIn);
  row.append(av, nameField);
  idCard.append(row);
  idCard.append(el('div',{class:'field', style:'margin-top:14px', html:
    `<label>Peer ID</label><div class="chip" style="font-family:var(--mono)">${escapeHtml(Store.identity.id)}</div>`}));
  const saveId=el('button',{class:'btn primary', style:'margin-top:6px', html:`${icon('check')} Save identity`,
    onclick:()=>{ Store.saveIdentity({name:nameIn.value.trim()||Store.identity.name});
      av.textContent=initials(Store.identity.name); toast('Identity saved',{kind:'ok'}); }});
  idCard.append(saveId);
  wrap.append(idCard);

  // ---- appearance ------------------------------------------------------
  const appCard=el('div',{class:'card', style:'margin-top:16px'});
  appCard.innerHTML=`<div class="section-title" style="margin-top:0"><h2 style="font-size:14px">Appearance</h2></div>`;
  const seg=el('div',{class:'seg'});
  const cur=getTheme();
  [['dark','moon'],['light','sun'],['system','settings']].forEach(([mode,ic])=>{
    const b=el('button',{class:cur.mode===mode?'on':'', html:`${icon(ic)} ${mode[0].toUpperCase()+mode.slice(1)}`,
      onclick:()=>{ setTheme(getTheme().palette, mode); [...seg.children].forEach(x=>x.classList.remove('on')); b.classList.add('on'); }});
    seg.append(b);
  });
  appCard.append(el('div',{class:'field', html:'<label>Theme</label>'}), seg);
  // palette (from the vendored shell's tokens.css — relay's classic look is `polecat`)
  const palSeg=el('div',{class:'seg'});
  PALETTES.forEach(p=>{
    const b=el('button',{class:getTheme().palette===p.key?'on':'', text:p.label, title:p.hint||'',
      onclick:()=>{ setTheme(p.key, getTheme().mode); [...palSeg.children].forEach(x=>x.classList.remove('on')); b.classList.add('on'); }});
    palSeg.append(b);
  });
  appCard.append(el('div',{class:'field', style:'margin-top:10px', html:'<label>Palette</label>'}), palSeg);
  wrap.append(appCard);

  // ---- Advanced (collapsed): transport + optional auto-discovery -------
  // Relay is fully serverless by default; nothing in here is required. This
  // is tucked away so the everyday flow stays simple.
  const st = Rendezvous.state;
  const adv=el('details',{class:'card adv', style:'margin-top:16px'});
  const sum=el('summary', {html:`
    <span class="adv-title"><span class="adv-ic">${icon('settings')}</span> Advanced · connection &amp; auto-discovery</span>
    ${st==='online'?'<span class="conn-state conn-connected"><span class="dot"></span>auto-connect on</span>':'<span class="muted tiny">optional</span>'}
    <span class="adv-chevron">${icon('chevron')}</span>`});
  adv.append(sum);
  adv.append(el('p',{class:'muted tiny', html:`Relay is <b>fully serverless by default</b> — you don't need anything here.
    Tabs on the same machine discover each other automatically, and across the internet you connect by pasting a one-time
    WebRTC invite. Everything syncs either way.<br><br>
    If you'd rather <b>skip the copy/paste</b>, you can point Relay at a tiny signaling relay — a Cloudflare Worker you deploy
    (see the <span class="kbd">rendezvous/</span> folder in the repo). Then peers who open the same room connect automatically.
    The relay only introduces two browsers to each other; it <b>never sees, stores, or relays your data</b>.`}));

  // -- STUN (NAT traversal helper) --
  adv.append(el('div',{class:'section-title', style:'margin:18px 0 4px', html:'<h2 style="font-size:13px">STUN server</h2>'}));
  adv.append(el('p',{class:'muted tiny', html:'Only helps WebRTC discover your public address for NAT traversal — it never relays data. Leave blank for pure LAN / serverless mode.'}));
  const stun=el('input',{class:'input', placeholder:'stun:stun.l.google.com:19302',
    value: localStorage.getItem('relay.stun') ?? 'stun:stun.l.google.com:19302'});
  const stunField=el('div',{class:'field', style:'margin-top:8px'});
  stunField.append(el('label',{text:'STUN server (optional)'}), stun);
  const saveStun=el('button',{class:'btn sm', html:`${icon('check')} Save`,
    onclick:()=>{ localStorage.setItem('relay.stun', stun.value.trim()); toast('Transport updated',{kind:'ok'}); }});
  adv.append(stunField, saveStun, el('div',{class:'divider'}));

  // -- TURN (relay fallback for strict NATs / corporate firewalls) --
  adv.append(el('div',{class:'section-title', style:'margin:18px 0 4px', html:'<h2 style="font-size:13px">TURN server (optional)</h2>'}));
  adv.append(el('p',{class:'muted tiny', html:'STUN alone can\'t punch through symmetric NATs or locked-down office networks. A TURN server relays the WebRTC data channel as a last resort — it still can\'t read your data, since Relay\'s DTLS-encrypted channel passes straight through. Leave blank unless invites keep failing to connect.'}));
  const turnUrl=el('input',{class:'input', placeholder:'turn:turn.example.com:3478', value: localStorage.getItem('relay.turn.url')||''});
  const turnUser=el('input',{class:'input', placeholder:'username', value: localStorage.getItem('relay.turn.username')||''});
  const turnCred=el('input',{class:'input', type:'password', placeholder:'credential', value: localStorage.getItem('relay.turn.credential')||''});
  const turnUrlField=el('div',{class:'field', style:'margin-top:8px'}); turnUrlField.append(el('label',{text:'TURN URL'}), turnUrl);
  const turnRow=el('div',{style:'display:flex;gap:10px;flex-wrap:wrap'});
  const turnUserField=el('div',{class:'field', style:'flex:1;min-width:140px'}); turnUserField.append(el('label',{text:'Username'}), turnUser);
  const turnCredField=el('div',{class:'field', style:'flex:1;min-width:140px'}); turnCredField.append(el('label',{text:'Credential'}), turnCred);
  turnRow.append(turnUserField, turnCredField);
  const saveTurn=el('button',{class:'btn sm', html:`${icon('check')} Save`,
    onclick:()=>{
      localStorage.setItem('relay.turn.url', turnUrl.value.trim());
      localStorage.setItem('relay.turn.username', turnUser.value.trim());
      localStorage.setItem('relay.turn.credential', turnCred.value.trim());
      toast('Transport updated',{kind:'ok'});
    }});
  adv.append(turnUrlField, turnRow, saveTurn, el('div',{class:'divider'}));

  // -- Rendezvous (auto-discovery) --
  const stColor = st==='online'?'var(--success)':st==='connecting'?'var(--warning)':st==='error'?'var(--danger)':'var(--text-3)';
  adv.append(el('div',{class:'section-title', style:'margin:4px 0 4px', html:`
    <h2 style="font-size:13px">Auto-discovery (rendezvous)</h2><div class="sp"></div>
    <span class="conn-state" style="color:${stColor}"><span class="dot" style="background:${stColor}"></span>${st}</span>`}));
  adv.append(el('p',{class:'muted tiny', html:'Point Relay at your deployed relay URL and pick a shared room. Peers in the same room auto-connect — no invite blobs to exchange.'}));
  const rurl=el('input',{class:'input', placeholder:'wss://relay-rendezvous.you.workers.dev', value:Rendezvous.url});
  const rroom=el('input',{class:'input', placeholder:'team-polecat', value:Rendezvous.room});
  const uf=el('div',{class:'field', style:'margin-top:8px'}); uf.append(el('label',{text:'Rendezvous URL'}), rurl);
  const rf=el('div',{class:'field'}); rf.append(el('label',{text:'Room'}), rroom);
  const connected = st==='online'||st==='connecting';
  const actionBtn = connected
    ? el('button',{class:'btn danger', html:`${icon('x')} Disconnect`, onclick:async()=>{
        if(await confirmDialog('Disconnect rendezvous',"You'll stop auto-connecting to peers in this room until you reconnect.",{danger:true,okLabel:'Disconnect'})){
          Rendezvous.disconnect(); toast('Left rendezvous',{kind:'ok'}); renderSettings(root,ctx); } }})
    : el('button',{class:'btn primary', html:`${icon('broadcast')} Connect`, onclick:()=>{
        if(!rurl.value.trim()||!rroom.value.trim()){ toast('URL and room required',{kind:'err'}); return; }
        Rendezvous.connect(rurl.value, rroom.value); toast('Connecting to rendezvous…',{kind:'ok'}); renderSettings(root,ctx); }});
  adv.append(uf, rf, actionBtn);

  // -- Local folder sync (sync locations, phase 1) --
  adv.append(el('div',{class:'divider'}));
  const lfBlock=el('div',{class:'lf-block'});
  const lfStatus = { connected:['connected','var(--success)'], error:['error','var(--danger)'],
    'needs-permission':['needs permission','var(--warning)'], unsupported:['unsupported','var(--text-3)'],
    off:['off','var(--text-3)'] }[LocalFolder.state] || [LocalFolder.state,'var(--text-3)'];
  lfBlock.append(el('div',{class:'section-title', style:'margin:4px 0 4px', html:`
    <h2 style="font-size:13px">Sync locations · local folder</h2><div class="sp"></div>
    <span class="conn-state" style="color:${lfStatus[1]}"><span class="dot" style="background:${lfStatus[1]}"></span>${lfStatus[0]}</span>`}));
  lfBlock.append(el('p',{class:'muted tiny', html:`Point Relay at a folder on this device — a snapshot syncs there on every change, and loads back whenever you open the app, even if no peer is online.
    <b>Tip:</b> pick a folder your Dropbox / Google Drive / iCloud desktop app already syncs for free cross-device backup, no keys needed.
    ${LocalFolder.isSupported()?'':' Needs a Chromium browser (Chrome / Edge) — not available in this browser.'}`}));
  const lfRow=el('div',{style:'display:flex;gap:10px;flex-wrap:wrap;align-items:center'});
  if(LocalFolder.state==='connected'){
    lfRow.append(
      el('span',{class:'chip', text:LocalFolder.folderName}),
      el('span',{class:'muted tiny', text: LocalFolder.lastSync?`synced ${ago(LocalFolder.lastSync)}`:'syncing…'}),
      el('button',{class:'btn danger sm', html:`${icon('x')} Disconnect`, onclick:async()=>{
        if(await confirmDialog('Disconnect local folder',"You'll need to re-choose the folder to resume syncing here.",{danger:true,okLabel:'Disconnect'})){
          LocalFolder.disconnect(); renderSettings(root,ctx); } }}));
  }else if(LocalFolder.state==='needs-permission'){
    lfRow.append(
      el('span',{class:'chip', text:LocalFolder.folderName}),
      el('button',{class:'btn primary sm', html:`${icon('folder')} Reconnect`, onclick:async()=>{ await LocalFolder.reconnect(); renderSettings(root,ctx); }}));
  }else{
    lfRow.append(el('button',{class:'btn primary sm', html:`${icon('folder')} Choose folder`, disabled:!LocalFolder.isSupported(),
      onclick:async()=>{ const okd=await LocalFolder.connect(); if(okd) toast('Folder connected — synced',{kind:'ok'}); renderSettings(root,ctx); }}));
  }
  lfBlock.append(lfRow);
  adv.append(lfBlock);

  // -- S3-compatible sync (sync locations, phase 2) --
  adv.append(el('div',{class:'divider'}));
  const s3Block=el('div',{class:'s3-block'});
  const s3Status = { connected:['connected','var(--success)'], error:['error','var(--danger)'],
    unsupported:['unsupported','var(--text-3)'], off:['off','var(--text-3)'] }[S3Sync.state] || [S3Sync.state,'var(--text-3)'];
  s3Block.append(el('div',{class:'section-title', style:'margin:4px 0 4px', html:`
    <h2 style="font-size:13px">Sync locations · S3-compatible</h2><div class="sp"></div>
    <span class="conn-state" style="color:${s3Status[1]}"><span class="dot" style="background:${s3Status[1]}"></span>${s3Status[0]}</span>`}));
  s3Block.append(el('p',{class:'muted tiny', html:`Point Relay at any S3-compatible bucket (Cloudflare R2, Backblaze B2, AWS S3...) — a snapshot syncs there on every change, signed
    right from this browser (no server). See <span class="kbd">docs/sync-providers.md</span> for signup steps and the CORS rule the bucket needs.
    ${S3Sync.isSupported()?'':' Needs a browser with Web Crypto support.'}`}));
  if(S3Sync.state==='connected'){
    const s3Row=el('div',{style:'display:flex;gap:10px;flex-wrap:wrap;align-items:center'});
    s3Row.append(
      el('span',{class:'chip', text:S3Sync.cfg.bucket}),
      el('span',{class:'muted tiny', text: S3Sync.lastSync?`synced ${ago(S3Sync.lastSync)}`:'syncing…'}),
      el('button',{class:'btn danger sm', html:`${icon('x')} Disconnect`, onclick:async()=>{
        if(await confirmDialog('Disconnect S3 bucket',"You'll need to re-enter the bucket details to resume syncing here.",{danger:true,okLabel:'Disconnect'})){
          S3Sync.disconnect(); renderSettings(root,ctx); } }}));
    s3Block.append(s3Row);
  }else{
    const cfg = S3Sync.cfg || {};
    const epIn=el('input',{class:'input', placeholder:'https://<accountid>.r2.cloudflarestorage.com', value:cfg.endpoint||''});
    const bkIn=el('input',{class:'input', placeholder:'my-relay-bucket', value:cfg.bucket||''});
    const rgIn=el('input',{class:'input', placeholder:'auto', value:cfg.region||''});
    const pfIn=el('input',{class:'input', placeholder:'(optional) team-workspace', value:cfg.prefix||''});
    const akIn=el('input',{class:'input', placeholder:'access key id', value:cfg.accessKeyId||''});
    const skIn=el('input',{class:'input', type:'password', placeholder:'secret access key', value:cfg.secretAccessKey||''});
    const grid=el('div',{style:'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px 12px'});
    const field=(label,input)=>{ const f=el('div',{class:'field',style:'margin:0'}); f.append(el('label',{text:label}), input); return f; };
    grid.append(
      (()=>{ const f=field('Endpoint', epIn); f.style.gridColumn='1 / -1'; return f; })(),
      field('Bucket', bkIn), field('Region', rgIn),
      field('Access key ID', akIn), field('Secret access key', skIn),
      (()=>{ const f=field('Prefix / folder', pfIn); f.style.gridColumn='1 / -1'; return f; })());
    s3Block.append(grid);
    s3Block.append(el('button',{class:'btn primary sm', style:'margin-top:4px', html:`${icon('broadcast')} Connect bucket`, disabled:!S3Sync.isSupported(),
      onclick:async()=>{
        const oks3=await S3Sync.connect({ endpoint:epIn.value.trim(), bucket:bkIn.value.trim(), region:rgIn.value.trim()||'auto',
          prefix:pfIn.value.trim(), accessKeyId:akIn.value.trim(), secretAccessKey:skIn.value.trim() });
        if(oks3) toast('Bucket connected — synced',{kind:'ok'});
        renderSettings(root,ctx);
      }}));
  }
  adv.append(s3Block);

  // -- WebDAV sync (sync locations, phase 3) --
  adv.append(el('div',{class:'divider'}));
  const wdBlock=el('div',{class:'wd-block'});
  const wdStatus = { connected:['connected','var(--success)'], error:['error','var(--danger)'],
    unsupported:['unsupported','var(--text-3)'], off:['off','var(--text-3)'] }[WebDAVSync.state] || [WebDAVSync.state,'var(--text-3)'];
  wdBlock.append(el('div',{class:'section-title', style:'margin:4px 0 4px', html:`
    <h2 style="font-size:13px">Sync locations · WebDAV</h2><div class="sp"></div>
    <span class="conn-state" style="color:${wdStatus[1]}"><span class="dot" style="background:${wdStatus[1]}"></span>${wdStatus[0]}</span>`}));
  wdBlock.append(el('p',{class:'muted tiny', html:`Point Relay at a WebDAV folder (Nextcloud, ownCloud, any self-hosted WebDAV) — a snapshot syncs there on every change,
    authenticated right from this browser (no server). See <span class="kbd">docs/sync-providers.md</span> for setup and the CORS headers the server needs.
    Use an app password, not your main account password.`}));
  if(WebDAVSync.state==='connected'){
    const wdRow=el('div',{style:'display:flex;gap:10px;flex-wrap:wrap;align-items:center'});
    wdRow.append(
      el('span',{class:'chip', text:WebDAVSync.cfg.username}),
      el('span',{class:'muted tiny', text: WebDAVSync.lastSync?`synced ${ago(WebDAVSync.lastSync)}`:'syncing…'}),
      el('button',{class:'btn danger sm', html:`${icon('x')} Disconnect`, onclick:async()=>{
        if(await confirmDialog('Disconnect WebDAV',"You'll need to re-enter the server details to resume syncing here.",{danger:true,okLabel:'Disconnect'})){
          WebDAVSync.disconnect(); renderSettings(root,ctx); } }}));
    wdBlock.append(wdRow);
  }else{
    const cfg = WebDAVSync.cfg || {};
    const urlIn=el('input',{class:'input', placeholder:'https://cloud.example.com/remote.php/dav/files/you/relay', value:cfg.url||''});
    const userIn=el('input',{class:'input', placeholder:'username', value:cfg.username||''});
    const passIn=el('input',{class:'input', type:'password', placeholder:'app password', value:cfg.password||''});
    const grid=el('div',{style:'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px 12px'});
    const field=(label,input)=>{ const f=el('div',{class:'field',style:'margin:0'}); f.append(el('label',{text:label}), input); return f; };
    grid.append(
      (()=>{ const f=field('Server URL', urlIn); f.style.gridColumn='1 / -1'; return f; })(),
      field('Username', userIn), field('Password', passIn));
    wdBlock.append(grid);
    wdBlock.append(el('button',{class:'btn primary sm', style:'margin-top:4px', html:`${icon('broadcast')} Connect WebDAV`, disabled:!WebDAVSync.isSupported(),
      onclick:async()=>{
        const okwd=await WebDAVSync.connect({ url:urlIn.value.trim(), username:userIn.value.trim(), password:passIn.value });
        if(okwd) toast('WebDAV connected — synced',{kind:'ok'});
        renderSettings(root,ctx);
      }}));
  }
  adv.append(wdBlock);

  // -- Dropbox sync (sync locations, phase 4 — OAuth) --
  adv.append(el('div',{class:'divider'}));
  const dbBlock=el('div',{class:'db-block'});
  const dbStatus = { connected:['connected','var(--success)'], error:['error','var(--danger)'],
    unsupported:['unsupported','var(--text-3)'], off:['off','var(--text-3)'] }[Dropbox.state] || [Dropbox.state,'var(--text-3)'];
  dbBlock.append(el('div',{class:'section-title', style:'margin:4px 0 4px', html:`
    <h2 style="font-size:13px">Sync locations · Dropbox</h2><div class="sp"></div>
    <span class="conn-state" style="color:${dbStatus[1]}"><span class="dot" style="background:${dbStatus[1]}"></span>${dbStatus[0]}</span>`}));
  dbBlock.append(el('p',{class:'muted tiny', html:`Click-to-authorize — a snapshot syncs to your Dropbox on every change. Uses OAuth with PKCE, so
    no secret ever touches this browser; you just need an <b>app key</b>. See <span class="kbd">docs/sync-providers.md</span> for creating the app and
    registering this page's URL as its redirect URI.`}));
  if(Dropbox.state==='connected'){
    const dbRow=el('div',{style:'display:flex;gap:10px;flex-wrap:wrap;align-items:center'});
    dbRow.append(
      el('span',{class:'chip', text:Dropbox.cfg.email||'connected'}),
      el('span',{class:'muted tiny', text: Dropbox.lastSync?`synced ${ago(Dropbox.lastSync)}`:'syncing…'}),
      el('button',{class:'btn danger sm', html:`${icon('x')} Disconnect`, onclick:async()=>{
        if(await confirmDialog('Disconnect Dropbox',"You'll need to reconnect and re-authorize to resume syncing here.",{danger:true,okLabel:'Disconnect'})){
          Dropbox.disconnect(); renderSettings(root,ctx); } }}));
    dbBlock.append(dbRow);
  }else{
    const keyIn=el('input',{class:'input', placeholder:'app key', value:(Dropbox.cfg&&Dropbox.cfg.appKey)||''});
    const field=(label,input)=>{ const f=el('div',{class:'field',style:'margin:0'}); f.append(el('label',{text:label}), input); return f; };
    dbBlock.append(field('App key', keyIn));
    dbBlock.append(el('button',{class:'btn primary sm', style:'margin-top:8px', html:`${icon('broadcast')} Connect Dropbox`, disabled:!Dropbox.isSupported(),
      onclick:()=>{ Dropbox.connect(keyIn.value.trim()); }}));
  }
  adv.append(dbBlock);

  // -- Google Drive sync (sync locations, phase 5 — OAuth token model) --
  adv.append(el('div',{class:'divider'}));
  const gdBlock=el('div',{class:'gd-block'});
  const gdStatus = { connected:['connected','var(--success)'], error:['error','var(--danger)'],
    'needs-permission':['needs permission','var(--warning)'], unsupported:['unsupported','var(--text-3)'],
    off:['off','var(--text-3)'] }[GoogleDrive.state] || [GoogleDrive.state,'var(--text-3)'];
  gdBlock.append(el('div',{class:'section-title', style:'margin:4px 0 4px', html:`
    <h2 style="font-size:13px">Sync locations · Google Drive</h2><div class="sp"></div>
    <span class="conn-state" style="color:${gdStatus[1]}"><span class="dot" style="background:${gdStatus[1]}"></span>${gdStatus[0]}</span>`}));
  gdBlock.append(el('p',{class:'muted tiny', html:`Click-to-authorize — a snapshot syncs to a single app-created file in your Drive on every change.
    Uses the <span class="kbd">drive.file</span> scope (Relay only ever sees that one file, never the rest of your Drive) and no client secret ever
    touches this browser; you just need an <b>OAuth Client ID</b>. See <span class="kbd">docs/sync-providers.md</span> for creating it.`}));
  if(GoogleDrive.state==='connected'){
    const gdRow=el('div',{style:'display:flex;gap:10px;flex-wrap:wrap;align-items:center'});
    gdRow.append(
      el('span',{class:'chip', text:'connected'}),
      el('span',{class:'muted tiny', text: GoogleDrive.lastSync?`synced ${ago(GoogleDrive.lastSync)}`:'syncing…'}),
      el('button',{class:'btn danger sm', html:`${icon('x')} Disconnect`, onclick:async()=>{
        if(await confirmDialog('Disconnect Google Drive',"You'll need to reconnect and re-authorize to resume syncing here.",{danger:true,okLabel:'Disconnect'})){
          GoogleDrive.disconnect(); renderSettings(root,ctx); } }}));
    gdBlock.append(gdRow);
  }else if(GoogleDrive.state==='needs-permission'){
    gdBlock.append(el('button',{class:'btn primary sm', style:'margin-top:8px', html:`${icon('broadcast')} Reconnect`,
      onclick:async()=>{ await GoogleDrive.reconnect(); renderSettings(root,ctx); }}));
  }else{
    const keyIn=el('input',{class:'input', placeholder:'OAuth Client ID', value:(GoogleDrive.cfg&&GoogleDrive.cfg.clientId)||''});
    const field=(label,input)=>{ const f=el('div',{class:'field',style:'margin:0'}); f.append(el('label',{text:label}), input); return f; };
    gdBlock.append(field('OAuth Client ID', keyIn));
    gdBlock.append(el('button',{class:'btn primary sm', style:'margin-top:8px', html:`${icon('broadcast')} Connect Google Drive`, disabled:!GoogleDrive.isSupported(),
      onclick:async()=>{ const okgd=await GoogleDrive.connect(keyIn.value.trim()); if(okgd) toast('Google Drive connected — synced',{kind:'ok'}); renderSettings(root,ctx); }}));
  }
  adv.append(gdBlock);

  // keep it open if the user already configured it, so state is visible
  if(Rendezvous.configured()||connected||LocalFolder.state!=='off'||S3Sync.state!=='off'||WebDAVSync.state!=='off'||Dropbox.state!=='off'||GoogleDrive.state!=='off') adv.open=true;
  wrap.append(adv);

  // ---- data ------------------------------------------------------------
  const dataCard=el('div',{class:'card', style:'margin-top:16px'});
  dataCard.innerHTML=`<div class="section-title" style="margin-top:0"><h2 style="font-size:14px">Data</h2></div>
    <p class="muted tiny">Your entire workspace lives in this browser's localStorage. Export a portable snapshot, import one from a peer, or reset to the seed data.</p>`;
  const btns=el('div',{style:'display:flex;gap:10px;flex-wrap:wrap'});
  btns.append(
    el('button',{class:'btn', html:`${icon('download')} Export workspace`, onclick:exportWorkspace}),
    el('button',{class:'btn', html:`${icon('upload')} Import workspace`, onclick:()=>importWorkspace(ctx)}),
    el('button',{class:'btn danger', html:`${icon('trash')} Reset to demo`, onclick:async()=>{
      if(await confirmDialog('Reset workspace','This replaces all entities and records with the seed demo data. This cannot be undone.',{danger:true,okLabel:'Reset'})){
        Store.reset(); toast('Workspace reset',{kind:'ok'}); ctx.go('home'); }
    }}));
  dataCard.append(btns);
  wrap.append(dataCard);

  // ---- admin / invites -------------------------------------------------
  const admCard=el('div',{class:'card', style:'margin-top:16px'});
  admCard.innerHTML=`<div class="section-title" style="margin-top:0"><h2 style="font-size:14px">Admin &amp; invites</h2></div>
    <p class="muted tiny">${Access.isAdmin()?'Admin is unlocked on this device — mint invite links to share.':'Hold an admin token? Unlock the admin area to mint invite links for others.'}</p>`;
  admCard.append(el('button',{class:'btn'+(Access.isAdmin()?' primary':''),
    html:`${icon('key')} ${Access.isAdmin()?'Open admin area':'Unlock admin'}`, onclick:()=>ctx.go('admin')}));
  wrap.append(admCard);

  root.append(wrap);
}

export function exportWorkspace(){
  const blob=new Blob([Store.export()],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=el('a',{href:url, download:`relay-workspace-${Store.identity.name}.json`});
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  toast('Workspace exported',{kind:'ok'});
}

export function importWorkspace(ctx){
  const inp=el('input',{type:'file', accept:'application/json,.json', style:'display:none'});
  inp.onchange=()=>{
    const f=inp.files[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{ try{ Store.import(r.result,{merge:true}); toast('Workspace imported',{kind:'ok'}); ctx&&ctx.refresh&&ctx.refresh(); }
      catch(e){ toast('Import failed',{body:e.message,kind:'err'}); } };
    r.readAsText(f);
  };
  document.body.append(inp); inp.click(); inp.remove();
}
