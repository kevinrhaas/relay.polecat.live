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
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // The rendezvous relay is optional and external; a failed WebSocket to it
    // (offline sandbox, relay blip) is benign and must not gate a deploy.
    if (/WebSocket connection to .*rendezvous/i.test(t) || /net::ERR_/.test(t)) return;
    errors.push('console: ' + t);
  });
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
  await check('icon-only buttons expose an accessible label', async () => {
    const delRow = await $('tbody tr .row-actions');
    const delOk = delRow && (await delRow.getAttribute('aria-label'));
    await (await $('.rail-item[data-sec="home"]')).click(); await page.waitForTimeout(200);
    const pin = await $('.pin-btn'); const pinOk = pin && (await pin.getAttribute('aria-label'));
    await (await $('.rail-item[data-sec="table"]')).click(); await page.waitForTimeout(200);
    return !!(delOk && pinOk);
  });
  await check('home quick-action card is keyboard-activatable (Enter)', async () => {
    await (await $('.rail-item[data-sec="home"]')).click(); await page.waitForTimeout(300);
    const card = page.locator('.qa', { hasText: 'Open a table' });
    if (!(await card.getAttribute('tabindex'))) return false;
    await card.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    return !!(await $('.rail-item[data-sec="table"].active'));
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
    // timestamps must be real (formatted from ISO ts to Central Time), not blank
    const dateText = await page.evaluate(() => {
      const d = document.querySelector('.wn-entry .wn-date');
      return d ? d.textContent.trim() : '';
    });
    if (!/\bCT$/.test(dateText)) return false;
    await page.fill('.sheet .input', 'zzzznomatch'); await page.waitForTimeout(250);
    const none = (await count('.wn-entry')) === 0;
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    return none;
  });

  console.log('Settings');
  await page.evaluate(() => {
    // stub the File System Access API with an in-memory folder so the
    // local-folder sync-location flow can be driven headlessly (no native
    // OS picker in CI)
    const files = {};
    window.__fakeDirFiles = files;
    window.showDirectoryPicker = async () => ({
      name: 'smoke-folder',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      getFileHandle: async (name, opts) => {
        if (!(name in files)) {
          if (!(opts && opts.create)) throw new Error('NotFoundError');
          files[name] = '';
        }
        return {
          getFile: async () => ({ text: async () => files[name] }),
          createWritable: async () => ({ write: async (d) => { files[name] = d; }, close: async () => {} }),
        };
      },
    });
  });
  await (await $('.rail-item[data-sec="settings"]')).click(); await page.waitForTimeout(300);
  await check('advanced (rendezvous) disclosure present', async () => !!(await $('details.adv')));
  await check('local folder sync: connect writes a snapshot', async () => {
    let details = await $('details.adv'); if (!details) return false;
    if (!(await details.evaluate((d) => d.open))) { await (await details.$('summary')).click(); await page.waitForTimeout(250); }
    const btn = await details.$('.lf-block button:has-text("Choose folder")'); if (!btn) return false;
    await btn.click(); await page.waitForTimeout(400);   // renderSettings() rebuilds the DOM — re-query below
    details = await $('details.adv'); if (!details) return false;
    const chip = await details.$('.lf-block .chip');
    const chipText = chip ? (await chip.evaluate((c) => c.textContent)).trim() : '';
    const wrote = await page.evaluate(() => (window.__fakeDirFiles['relay-workspace.json'] || '').includes('"entities"'));
    return chipText === 'smoke-folder' && wrote;
  });
  await check('local folder sync: local edit re-writes the snapshot', async () => {
    await page.evaluate(() => { window.__fakeDirFiles['relay-workspace.json'] = ''; });
    await page.evaluate(async () => {
      const { Store } = await import('/js/store.js');
      Store.createEntity('Smoke Sync Entity');
    });
    await page.waitForTimeout(1800);
    return await page.evaluate(() => (window.__fakeDirFiles['relay-workspace.json'] || '').includes('Smoke Sync Entity'));
  });
  await check('local folder sync: disconnect', async () => {
    let details = await $('details.adv'); if (!details) return false;
    const btn = await details.$('.lf-block button:has-text("Disconnect")'); if (!btn) return false;
    await btn.click(); await page.waitForTimeout(300);   // renderSettings() rebuilds the DOM — re-query below
    details = await $('details.adv'); if (!details) return false;
    return !!(await details.$('.lf-block button:has-text("Choose folder")'));
  });

  await page.evaluate(() => {
    // stub fetch with an in-memory bucket so the S3-compatible sync-location
    // flow (signed requests) can be driven headlessly (no real bucket in CI)
    const objects = {};
    window.__fakeS3Objects = objects;
    const realFetch = window.fetch.bind(window);
    window.fetch = async (url, opts = {}) => {
      const u = new URL(url, location.href);
      if (!u.hostname.includes('fake-s3-smoke')) return realFetch(url, opts);
      if (!opts.headers || !opts.headers['Authorization']) return new Response('missing signature', { status: 403 });
      const method = (opts.method || 'GET').toUpperCase();
      if (method === 'PUT') { objects[u.pathname] = opts.body; return new Response('', { status: 200 }); }
      if (method === 'GET') { const b = objects[u.pathname]; return b != null ? new Response(b, { status: 200 }) : new Response('', { status: 404 }); }
      return new Response('', { status: 405 });
    };
  });
  await check('S3 sync: connect signs a request and writes a snapshot', async () => {
    let details = await $('details.adv'); if (!details) return false;
    if (!(await details.evaluate((d) => d.open))) { await (await details.$('summary')).click(); await page.waitForTimeout(250); }
    const inputs = await details.$$('.s3-block input'); if (inputs.length < 6) return false;
    const [epIn, bkIn, , akIn, skIn] = inputs;
    await epIn.fill('https://fake-s3-smoke.test');
    await bkIn.fill('smoke-bucket');
    await akIn.fill('AKIAFAKESMOKE');
    await skIn.fill('sekritFakeKey123');
    const btn = await details.$('.s3-block button:has-text("Connect bucket")'); if (!btn) return false;
    await btn.click(); await page.waitForTimeout(400);   // renderSettings() rebuilds the DOM — re-query below
    details = await $('details.adv'); if (!details) return false;
    const chip = await details.$('.s3-block .chip');
    const chipText = chip ? (await chip.evaluate((c) => c.textContent)).trim() : '';
    const wrote = await page.evaluate(() => Object.values(window.__fakeS3Objects).some((v) => (v || '').includes('"entities"')));
    return chipText === 'smoke-bucket' && wrote;
  });
  await check('S3 sync: local edit re-writes the snapshot', async () => {
    await page.evaluate(() => { for (const k in window.__fakeS3Objects) window.__fakeS3Objects[k] = ''; });
    await page.evaluate(async () => {
      const { Store } = await import('/js/store.js');
      Store.createEntity('Smoke S3 Entity');
    });
    await page.waitForTimeout(1800);
    return await page.evaluate(() => Object.values(window.__fakeS3Objects).some((v) => (v || '').includes('Smoke S3 Entity')));
  });
  await check('S3 sync: disconnect', async () => {
    let details = await $('details.adv'); if (!details) return false;
    const btn = await details.$('.s3-block button:has-text("Disconnect")'); if (!btn) return false;
    await btn.click(); await page.waitForTimeout(300);   // renderSettings() rebuilds the DOM — re-query below
    details = await $('details.adv'); if (!details) return false;
    return !!(await details.$('.s3-block button:has-text("Connect bucket")'));
  });

  await page.evaluate(() => {
    // stub fetch with an in-memory file so the WebDAV sync-location flow
    // (Basic auth) can be driven headlessly (no real WebDAV server in CI)
    const files = {};
    window.__fakeWebdavFiles = files;
    const realFetch = window.fetch.bind(window);
    window.fetch = async (url, opts = {}) => {
      const u = new URL(url, location.href);
      if (!u.hostname.includes('fake-webdav-smoke')) return realFetch(url, opts);
      if (!opts.headers || !opts.headers['Authorization']) return new Response('missing auth', { status: 401 });
      const method = (opts.method || 'GET').toUpperCase();
      if (method === 'PUT') { files[u.pathname] = opts.body; return new Response('', { status: 201 }); }
      if (method === 'GET') { const b = files[u.pathname]; return b != null ? new Response(b, { status: 200 }) : new Response('', { status: 404 }); }
      return new Response('', { status: 405 });
    };
  });
  await check('WebDAV sync: connect authenticates and writes a snapshot', async () => {
    let details = await $('details.adv'); if (!details) return false;
    if (!(await details.evaluate((d) => d.open))) { await (await details.$('summary')).click(); await page.waitForTimeout(250); }
    const inputs = await details.$$('.wd-block input'); if (inputs.length < 3) return false;
    const [urlIn, userIn, passIn] = inputs;
    await urlIn.fill('https://fake-webdav-smoke.test/remote.php/dav/files/smoke/relay');
    await userIn.fill('smoke-user');
    await passIn.fill('sekritAppPass123');
    const btn = await details.$('.wd-block button:has-text("Connect WebDAV")'); if (!btn) return false;
    await btn.click(); await page.waitForTimeout(400);   // renderSettings() rebuilds the DOM — re-query below
    details = await $('details.adv'); if (!details) return false;
    const chip = await details.$('.wd-block .chip');
    const chipText = chip ? (await chip.evaluate((c) => c.textContent)).trim() : '';
    const wrote = await page.evaluate(() => Object.values(window.__fakeWebdavFiles).some((v) => (v || '').includes('"entities"')));
    return chipText === 'smoke-user' && wrote;
  });
  await check('WebDAV sync: local edit re-writes the snapshot', async () => {
    await page.evaluate(() => { for (const k in window.__fakeWebdavFiles) window.__fakeWebdavFiles[k] = ''; });
    await page.evaluate(async () => {
      const { Store } = await import('/js/store.js');
      Store.createEntity('Smoke WebDAV Entity');
    });
    await page.waitForTimeout(1800);
    return await page.evaluate(() => Object.values(window.__fakeWebdavFiles).some((v) => (v || '').includes('Smoke WebDAV Entity')));
  });
  await check('WebDAV sync: disconnect', async () => {
    let details = await $('details.adv'); if (!details) return false;
    const btn = await details.$('.wd-block button:has-text("Disconnect")'); if (!btn) return false;
    await btn.click(); await page.waitForTimeout(300);   // renderSettings() rebuilds the DOM — re-query below
    details = await $('details.adv'); if (!details) return false;
    return !!(await details.$('.wd-block button:has-text("Connect WebDAV")'));
  });

  if (errors.length) { console.error('\nConsole/page errors:\n' + errors.join('\n')); failed = true; }
} catch (e) {
  console.error('SUITE CRASH: ' + e.message); failed = true;
} finally {
  await browser.close();
  server.close();
}

if (failed) { console.error('\nSMOKE FAILED — not publishing.'); process.exit(1); }
console.log('\nSMOKE OK — all functional checks passed.');
