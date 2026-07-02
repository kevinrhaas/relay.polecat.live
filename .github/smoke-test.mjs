// Functional smoke suite for CI. Serves the repo and drives the REAL app end
// to end; the hourly self-improvement loop only commits/deploys if every check
// here passes. This is a GROWING list — when a feature ships, add a check.
//
// Local run:  PW_EXECUTABLE=/path/to/chrome node .github/smoke-test.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const PORT = 8177;
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  fs.readFile(file, (e, d) => {
    if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(d);
  });
});

const errors = [];
let failed = false;
const base = `http://localhost:${PORT}`;
const fail = (m) => { failed = true; console.error('  ✗ ' + m); };
const ok   = (m) => console.log('  ✓ ' + m);
async function check(name, fn) {
  try { const r = await fn(); if (r === false) fail(name); else ok(name); }
  catch (e) { fail(`${name} — ${e.message}`); }
}

await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  // pre-grant the invite gate so the app boots in CI
  await ctx.addInitScript(`try{localStorage.setItem('relay.access',JSON.stringify({grantedAt:Date.now(),via:'ci'}));}catch(e){}`);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const $ = (s) => page.$(s);
  const count = (s) => page.$$eval(s, (e) => e.length).catch(() => 0);

  console.log('Landing');
  await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 30000 });
  await check('landing renders a headline', async () => !!(await $('h1')));
  await check('landing has a Launch link to /app/', async () =>
    (await page.$$eval('a', (as) => as.some((a) => /\/app\/?$/.test(a.getAttribute('href') || '')))));

  console.log('App shell');
  await page.goto(`${base}/app/`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await check('nav rail renders (>=5 sections)', async () => (await count('.rail-item')) >= 5);
  for (const sec of ['home', 'table', 'messages', 'peers', 'activity', 'settings']) {
    await check(`section "${sec}" opens`, async () => {
      const el = await $(`.rail-item[data-sec="${sec}"]`); if (!el) return false;
      await el.click(); await page.waitForTimeout(350);
      return (await count('#view *')) > 0;
    });
  }

  console.log('Tables — create / row / edit / field / delete');
  await (await $('.rail-item[data-sec="table"]')).click(); await page.waitForTimeout(300);
  await check('create a new table', async () => {
    await (await $('.topbar .btn.primary')).click(); await page.waitForTimeout(300);
    await page.fill('.modal input', 'Smoke Table');
    await page.click('.modal button:has-text("Create")'); await page.waitForTimeout(500);
    return await page.$$eval('.entity-tab', (t) => t.some((x) => /smoke table/i.test(x.textContent)));
  });
  await check('add a row', async () => {
    await page.click('button:has-text("Row")'); await page.waitForTimeout(300);
    return (await count('tbody tr')) >= 1;
  });
  await check('edit a cell (persists to store)', async () => {
    const cell = await $('tbody tr td[contenteditable]'); if (!cell) return false;
    await cell.click(); await page.keyboard.type('smoke-value'); await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    return await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('relay.workspace.v1'))).includes('smoke-value'));
  });
  await check('edit-table modal (rename/delete) opens', async () => {
    await page.click('button:has-text("Edit table")'); await page.waitForTimeout(300);
    const has = !!(await page.$('.modal button:has-text("Delete table")'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200); return has;
  });
  await check('field (column header) modal opens', async () => {
    const th = await $('th.col-head'); if (!th) return false;
    await th.click(); await page.waitForTimeout(300);
    const has = !!(await page.$('.modal button:has-text("Delete field")'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200); return has;
  });
  await check('delete a table (store + UI update)', async () => {
    await page.evaluate(async () => {
      const { Store } = await import('/js/store.js');
      const k = Store.entityNames().find((n) => Store.entity(n).label === 'Smoke Table');
      if (k) Store.deleteEntity(k);
    });
    await page.waitForTimeout(400);
    return !(await page.$$eval('.entity-tab', (t) => t.some((x) => /smoke table/i.test(x.textContent))));
  });

  console.log('Messaging');
  await (await $('.rail-item[data-sec="messages"]')).click(); await page.waitForTimeout(300);
  await check('send a message appears in the feed', async () => {
    const ta = await $('.composer textarea'); if (!ta) return false;
    await ta.click(); await page.keyboard.type('smoke hello'); await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    return await page.$$eval('.msg .text', (m) => m.some((x) => x.textContent.includes('smoke hello')));
  });

  console.log('Peers — progressive sharing controls');
  await check('seed a known offline peer', async () => {
    await page.evaluate(async () => {
      const { Sync } = await import('/js/sync.js');
      Sync._rememberPeer('smoke-peer-uid', 'Smoke Peer');
    });
    await page.goto(`${base}/app/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    await (await $('.rail-item[data-sec="peers"]')).click(); await page.waitForTimeout(300);
    return await page.$$eval('.peer .peer-head b', (bs) => bs.some((b) => b.textContent === 'Smoke Peer'));
  });
  await check('sharing summary defaults to "Everything"', async () => {
    const card = await $('.peer'); if (!card) return false;
    const btns = await card.$$('.sharing-seg button');
    if (btns.length !== 3) return false;
    return await btns[0].evaluate((b) => b.classList.contains('on') && b.textContent.trim() === 'Everything');
  });
  await check('clicking "Nothing" revokes all sharing for that peer', async () => {
    const btns = await (await $('.peer')).$$('.sharing-seg button');
    await btns[2].click(); await page.waitForTimeout(300);
    const btns2 = await (await $('.peer')).$$('.sharing-seg button');
    const nothingOn = await btns2[2].evaluate((b) => b.classList.contains('on') && b.textContent.trim() === 'Nothing');
    const canRead = await page.evaluate(async () => {
      const { Sync } = await import('/js/sync.js'); return Sync.can('smoke-peer-uid', 'read', 'tasks');
    });
    return nothingOn && canRead === false;
  });
  await check('"Custom" expands the per-table grid and toggles persist', async () => {
    const btns = await (await $('.peer')).$$('.sharing-seg button');
    await btns[1].click(); await page.waitForTimeout(300);
    const rows = await (await $('.peer')).$$('.perm-grid .perm-row');
    if (!rows.length) return false;
    const toggles = await (await $('.peer')).$$('.perm-grid .perm-row:first-child .toggle');
    await toggles[0].click(); await page.waitForTimeout(300);
    const btns2 = await (await $('.peer')).$$('.sharing-seg button');
    return await btns2[1].evaluate((b) => b.classList.contains('on'));
  });

  console.log('What\'s new');
  await check('what\'s new panel opens, lists entries, searches', async () => {
    await (await $('.wn-btn')).click(); await page.waitForTimeout(300);
    if (!(await $('.sheet-overlay.show'))) return false;
    if ((await count('.wn-entry')) < 1) return false;
    await page.fill('.sheet .input', 'zzzznomatch'); await page.waitForTimeout(250);
    const none = (await count('.wn-entry')) === 0;
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    return none;
  });

  console.log('Settings');
  await (await $('.rail-item[data-sec="settings"]')).click(); await page.waitForTimeout(300);
  await check('advanced (rendezvous) disclosure present', async () => !!(await $('details.adv')));

  if (errors.length) { console.error('\nConsole/page errors:\n' + errors.join('\n')); failed = true; }
} catch (e) {
  console.error('SUITE CRASH: ' + e.message); failed = true;
} finally {
  await browser.close();
  server.close();
}

if (failed) { console.error('\nSMOKE FAILED — not publishing.'); process.exit(1); }
console.log('\nSMOKE OK — all functional checks passed.');
