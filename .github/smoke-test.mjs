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
  // The app auto-joins the baked-in default rendezvous room on boot (see
  // js/config.js) — that's the real, LIVE, shared production room. A runner
  // with internet egress would otherwise merge real peer data into the page
  // under test (and broadcast every fixture entity this suite creates right
  // back into that shared room). Stub WebSocket so rendezvous never actually
  // dials out; Rendezvous._open() already handles a failed connection
  // gracefully (state:'error', no console noise), so the suite stays hermetic
  // and deterministic regardless of the runner's network.
  await ctx.addInitScript(() => {
    window.WebSocket = class {
      constructor(){ setTimeout(() => { this.onerror && this.onerror(new Event('error')); this.onclose && this.onclose({ code: 1006 }); }, 0); }
      send(){} close(){} addEventListener(){} removeEventListener(){}
    };
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Belt-and-suspenders: a network hiccup unrelated to rendezvous (now
    // stubbed above) still shouldn't gate a deploy.
    if (/WebSocket connection to .*rendezvous/i.test(t) || /net::ERR_/.test(t)) return;
    errors.push('console: ' + t);
  });
  const $ = (s) => page.$(s);
  const count = (s) => page.$$eval(s, (e) => e.length).catch(() => 0);
  // Dismiss any open modal/sheet and WAIT for its overlay to actually detach.
  // A modal's hide() drops `.show` then removes the node ~220ms later; a blind
  // fixed wait races that under CI load and a lingering full-screen overlay
  // then intercepts the next click. Escape first; if something still lingers,
  // click the backdrop corner as a fallback.
  const OVERLAYS = '.overlay, .sheet-overlay, .ps-rpanel-back';
  const closeModal = async () => {
    await page.keyboard.press('Escape');
    const gone = () => page.waitForFunction(
      (sel) => !document.querySelector(sel), OVERLAYS, { timeout: 4000 }).then(() => true).catch(() => false);
    if (await gone()) return;
    const ov = await $(OVERLAYS);
    if (ov) await ov.click({ position: { x: 4, y: 4 } }).catch(() => {});
    await gone();
  };

  console.log('Landing');
  await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 30000 });
  await check('landing renders a headline', async () => !!(await $('h1')));
  await check('landing has a Launch link to /app/', async () =>
    (await page.$$eval('a', (as) => as.some((a) => /\/app\/?$/.test(a.getAttribute('href') || '')))));

  console.log('App shell');
  await page.goto(`${base}/app/`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await check('nav rail renders (>=5 sections)', async () => (await count('.ps-rail-item')) >= 5);
  for (const sec of ['home', 'table', 'messages', 'peers', 'activity', 'settings']) {
    await check(`section "${sec}" opens`, async () => {
      const el = await $(`.ps-rail-item[data-sec="${sec}"]`); if (!el) return false;
      await el.click(); await page.waitForTimeout(350);
      return (await count('#view *')) > 0;
    });
  }

  console.log('Home dashboard');
  await (await $('.ps-rail-item[data-sec="home"]')).click(); await page.waitForTimeout(300);
  await check('Entities/Records stat tiles link to Tables', async () => {
    const tiles = await page.$$('.stat');
    if (tiles.length < 4) return false;
    await tiles[0].click(); await page.waitForTimeout(350);
    return (await page.$eval('.ps-rail-item.active', (e) => e.getAttribute('data-sec')).catch(() => null)) === 'table';
  });
  await (await $('.ps-rail-item[data-sec="home"]')).click(); await page.waitForTimeout(300);
  await check('Peers online stat tile links to Peers', async () => {
    const tiles = await page.$$('.stat');
    await tiles[2].click(); await page.waitForTimeout(350);
    return (await page.$eval('.ps-rail-item.active', (e) => e.getAttribute('data-sec')).catch(() => null)) === 'peers';
  });
  await (await $('.ps-rail-item[data-sec="home"]')).click(); await page.waitForTimeout(300);
  await check('Synced stat tile links to Activity, and is keyboard-activatable', async () => {
    const tile = (await page.$$('.stat'))[3];
    await tile.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(350);
    return (await page.$eval('.ps-rail-item.active', (e) => e.getAttribute('data-sec')).catch(() => null)) === 'activity';
  });

  console.log('Global search (Ctrl+K)');
  await (await $('.ps-rail-item[data-sec="home"]')).click(); await page.waitForTimeout(300);
  await check('Ctrl+K opens the search palette, focused and ready to type', async () => {
    await page.keyboard.press('Control+k'); await page.waitForTimeout(250);
    const open = (await count('.overlay.show')) === 1;
    const focused = await page.evaluate(() => document.activeElement?.classList?.contains('input'));
    return open && focused;
  });
  await check('search matches a record by field value and jumps to it, opening its record panel', async () => {
    await page.keyboard.type('ada'); await page.waitForTimeout(250);
    const groups = await page.$$eval('.gsearch-group', (gs) => gs.map((g) => g.textContent));
    if (!groups.includes('Records')) return false;
    const row = page.locator('.gsearch-row', { hasText: 'Ada Lovelace' });
    if (!(await row.count())) return false;
    await row.click(); await page.waitForTimeout(600);
    const activeSec = await page.$eval('.ps-rail-item.active', (e) => e.getAttribute('data-sec')).catch(() => null);
    const activeTable = await page.$eval('.tree-row.active .tree-label', (e) => e.textContent.trim()).catch(() => null);
    const hasSheet = !!(await $('.record-sheet'));
    await closeModal();
    return activeSec === 'table' && activeTable === 'Contacts' && hasSheet;
  });
  await check('search matches a table by name (from the topbar button) and jumps there without opening a record', async () => {
    await page.click('button[title="Search everything (Ctrl+K)"]'); await page.waitForTimeout(250);
    await page.keyboard.type('assets'); await page.waitForTimeout(250);
    const groups = await page.$$eval('.gsearch-group', (gs) => gs.map((g) => g.textContent));
    if (!groups.includes('Tables')) return false;
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
    const activeTable = await page.$eval('.tree-row.active .tree-label', (e) => e.textContent.trim()).catch(() => null);
    return activeTable === 'Assets' && !(await $('.record-sheet'));
  });
  await check('search palette closes on Escape without navigating', async () => {
    await page.click('button[title="Search everything (Ctrl+K)"]'); await page.waitForTimeout(250);
    await page.keyboard.type('grace'); await page.waitForTimeout(250);
    await closeModal();
    return (await count('.overlay.show')) === 0;
  });

  console.log('Keyboard shortcuts help');
  await check('topbar button opens the shortcuts modal, listing grouped shortcuts', async () => {
    await page.click('button[title="Keyboard shortcuts (?)"]'); await page.waitForTimeout(250);
    const title = await page.$eval('.modal h3', (h) => h.textContent).catch(() => null);
    const groups = await count('.shortcuts-group');
    const rows = await count('.shortcut-row');
    await closeModal();
    return title === 'Keyboard shortcuts' && groups >= 3 && rows >= 5;
  });
  await check('pressing "?" outside any input opens the shortcuts modal, and Escape closes it', async () => {
    await page.click('body'); await page.keyboard.press('?'); await page.waitForTimeout(250);
    const open = (await count('.overlay.show')) === 1 && (await count('.shortcuts')) === 1;
    await closeModal();
    return open && (await count('.overlay.show')) === 0;
  });
  await check('pressing "?" while typing in a text field types the character instead of opening the modal', async () => {
    await page.click('button[title="Search everything (Ctrl+K)"]'); await page.waitForTimeout(250);
    await page.keyboard.type('who?'); await page.waitForTimeout(150);
    const value = await page.$eval('.gsearch-input input', (i) => i.value).catch(() => '');
    const onlyOneOverlay = (await count('.overlay.show')) === 1;
    await closeModal();
    return value === 'who?' && onlyOneOverlay;
  });

  console.log('Tables — create / row / edit / field / delete');
  await (await $('.ps-rail-item[data-sec="table"]')).click(); await page.waitForTimeout(300);
  await check('create a new table', async () => {
    await (await $('.ps-topbar .btn.primary')).click(); await page.waitForTimeout(300);
    await page.fill('.modal input', 'Smoke Table');
    await page.click('.modal button:has-text("Create")'); await page.waitForTimeout(500);
    return await page.$$eval('.tree-row .tree-label', (t) => t.some((x) => /smoke table/i.test(x.textContent)));
  });
  await check('add a row', async () => {
    await page.click('button:has-text("Row")'); await page.waitForTimeout(300);
    return (await count('tbody tr')) >= 1;
  });
  await check('tree panel: expanding the active table reveals its fields', async () => {
    const row = page.locator('.tree-row.active');
    if (!(await row.count())) return false;
    await row.locator('.tree-caret').click(); await page.waitForTimeout(250);
    return await page.$$eval('.tree-field', (f) => f.some((x) => x.textContent.trim() === 'name'));
  });
  await check('tree panel collapses to an icon rail and expands back', async () => {
    // renderTable() rebuilds the whole subtree on every toggle — re-query the
    // button each time rather than reusing a now-detached element handle.
    if (!(await $('.tree-toggle'))) return false;
    await (await $('.tree-toggle')).click(); await page.waitForTimeout(250);
    const collapsed = await page.evaluate(() => !document.querySelector('.tree-panel').classList.contains('open'));
    await (await $('.tree-toggle')).click(); await page.waitForTimeout(250);
    const expanded = await page.evaluate(() => document.querySelector('.tree-panel').classList.contains('open'));
    return collapsed && expanded;
  });
  await check('tree panel: drag the divider to resize, and it persists', async () => {
    const before = await page.evaluate(() => document.querySelector('.tree-panel').getBoundingClientRect().width);
    const handle = await $('.tree-resize'); if (!handle) return false;
    const box = await handle.boundingBox(); if (!box) return false;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up(); await page.waitForTimeout(200);
    const after = await page.evaluate(() => document.querySelector('.tree-panel').getBoundingClientRect().width);
    const stored = parseInt(await page.evaluate(() => localStorage.getItem('relay.tree.width')), 10);
    return after > before + 40 && Math.abs(stored - Math.round(after)) <= 1;
  });
  await check('row expander opens the record side panel with a typed field input', async () => {
    const btn = await $('tbody tr .row-open'); if (!btn) return false;
    await btn.click(); await page.waitForTimeout(300);
    return !!(await $('.record-sheet .record-field input'));
  });
  await check('editing a field in the record panel persists to the store', async () => {
    const input = await $('.record-sheet .record-field input'); if (!input) return false;
    await input.click({ clickCount: 3 }); await page.keyboard.type('panel-edit'); await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    const persisted = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('relay.workspace.v1'))).includes('panel-edit'));
    await closeModal();
    return persisted;
  });
  await check('record panel "Duplicate" clones the row and reopens on the copy', async () => {
    const before = await count('tbody tr');
    const openBtn = await $('tbody tr .row-open'); if (!openBtn) return false;
    await openBtn.click(); await page.waitForTimeout(300);
    const dupBtn = await $('.record-sheet button:has-text("Duplicate")'); if (!dupBtn) return false;
    await dupBtn.click(); await page.waitForTimeout(500);
    const grew = (await count('tbody tr')) === before + 1;
    const names = await page.$$eval('tbody tr td[contenteditable]', (tds) => tds.map((t) => t.textContent.trim()));
    const reopened = !!(await $('.record-sheet'));
    const cloned = names.filter((n) => n === 'panel-edit').length === 2;
    // delete the clone the panel reopened on — later checks assume this
    // table's exact row count, so leave it back at `before`
    const delBtn = await $('.record-sheet button.danger:has-text("Delete row")');
    if (delBtn) {
      await delBtn.click(); await page.waitForTimeout(200);
      await page.click('.modal button.danger:has-text("Delete")'); await page.waitForTimeout(300);
    }
    return grew && reopened && cloned && (await count('tbody tr')) === before;
  });
  await check('presence: a peer viewing the same table shows a live "who\'s viewing" badge, cleared when they leave', async () => {
    // Two real browser tabs would collide on identity (same-origin localStorage
    // means the same Store.identity.id), so simulate a distinct peer by feeding
    // a synthetic mesh message straight into Sync's real routing — exercises
    // the exact _route/_seePeer/viewersOf/paint path a real second peer would.
    const key = await page.evaluate(async () => {
      const { currentEntity } = await import('/js/views/table.js');
      return currentEntity();
    });
    if (!key) return false;
    await page.evaluate(async (k) => {
      const { Sync } = await import('/js/sync.js');
      Sync._onMesh({ kind: 'hello', from: 'smoke-peer-1', to: '*', uid: 'smoke-peer-uid-1', name: 'Static Peer', offers: [k], entity: null });
      Sync._onMesh({ kind: 'presence', from: 'smoke-peer-1', to: '*', uid: 'smoke-peer-uid-1', name: 'Static Peer', entity: k });
    }, key);
    await page.waitForTimeout(200);
    const shown = await page.evaluate(() => {
      const badge = document.querySelector('.tbl-viewers');
      const treeBadge = document.querySelector('.tree-row.active .tree-viewers');
      return !!(badge && badge.classList.contains('show') && badge.title.includes('Static Peer')
        && treeBadge && treeBadge.classList.contains('show'));
    });
    await page.evaluate(async () => {
      const { Sync } = await import('/js/sync.js');
      Sync._onMesh({ kind: 'bye', from: 'smoke-peer-1', to: '*' });
    });
    await page.waitForTimeout(200);
    const cleared = await page.evaluate(() => {
      const badge = document.querySelector('.tbl-viewers');
      return !badge || !badge.classList.contains('show');
    });
    return shown && cleared;
  });
  await check('icon-only buttons expose an accessible label', async () => {
    const delRow = await $('tbody tr .row-del-btn');
    const delOk = delRow && (await delRow.getAttribute('aria-label'));
    await (await $('.ps-rail-item[data-sec="home"]')).click(); await page.waitForTimeout(200);
    const pin = await $('.pin-btn'); const pinOk = pin && (await pin.getAttribute('aria-label'));
    await (await $('.ps-rail-item[data-sec="table"]')).click(); await page.waitForTimeout(200);
    return !!(delOk && pinOk);
  });
  await check('home quick-action card is keyboard-activatable (Enter)', async () => {
    await (await $('.ps-rail-item[data-sec="home"]')).click(); await page.waitForTimeout(300);
    const card = page.locator('.qa', { hasText: 'Open a table' });
    if (!(await card.getAttribute('tabindex'))) return false;
    await card.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    return !!(await $('.ps-rail-item[data-sec="table"].active'));
  });
  await check('edit a cell (persists to store)', async () => {
    const cell = await $('tbody tr td[contenteditable]'); if (!cell) return false;
    await cell.click(); await page.keyboard.type('smoke-value'); await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    return await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('relay.workspace.v1'))).includes('smoke-value'));
  });
  await check('pasting into a cell strips rich formatting to plain text', async () => {
    const sel = 'tbody tr td[contenteditable]';
    const cell = await $(sel); if (!cell) return false;
    await cell.click({ clickCount: 3 }); // select existing content so paste replaces it
    await page.evaluate((s) => {
      const node = document.querySelector(s); node.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', 'pasted-plain');
      dt.setData('text/html', '<b style="color:red">pasted-plain</b>');
      node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, sel);
    await page.keyboard.press('Tab'); await page.waitForTimeout(300);
    const html = await page.$eval(sel, (e) => e.innerHTML);
    return html.includes('pasted-plain') && !/<b|style=/i.test(html);
  });
  await check('edit-table modal (rename/delete) opens', async () => {
    await page.click('button:has-text("Edit table")'); await page.waitForTimeout(300);
    const has = !!(await page.$('.modal button:has-text("Delete table")'));
    await closeModal(); return has;
  });
  await check('modal traps Tab focus inside itself and restores it to the trigger on close', async () => {
    const trigger = await $('button:has-text("Edit table")');
    await trigger.click(); await page.waitForTimeout(300);
    const focusableCount = await page.$$eval(
      '.modal a[href],.modal button:not([disabled]),.modal textarea:not([disabled]),.modal input:not([disabled]),.modal select:not([disabled])',
      (els) => els.length);
    if (focusableCount < 2) return false;
    // A full cycle of `focusableCount` Tab presses must land back where it started — proving
    // Tab never escapes the modal to whatever's behind the overlay.
    const before = await page.evaluate(() => document.activeElement?.outerHTML);
    for (let i = 0; i < focusableCount; i++) await page.keyboard.press('Tab');
    const after = await page.evaluate(() => document.activeElement?.outerHTML);
    const cycled = !!before && before === after;
    await closeModal();
    const restored = await page.evaluate(() => document.activeElement?.textContent?.includes('Edit table'));
    return cycled && restored;
  });
  await check('field (column header) edit button opens the rename/delete modal', async () => {
    const btn = await $('.col-edit-btn'); if (!btn) return false;
    await btn.click(); await page.waitForTimeout(300);
    const has = !!(await page.$('.modal button:has-text("Delete field")'));
    await closeModal(); return has;
  });
  await check('search box filters rows by field value', async () => {
    // two more rows so filter/sort have something to distinguish
    await page.click('button:has-text("Row")'); await page.waitForTimeout(200);
    await page.click('button:has-text("Row")'); await page.waitForTimeout(200);
    if ((await count('tbody tr td[contenteditable]')) < 3) return false;
    const values = ['apple', 'mango', 'zebra'];
    // each edit's Store change triggers a full re-render, detaching prior
    // cell handles — re-query fresh before every click (see the tree-toggle
    // comment above for the same pattern)
    for (let i = 0; i < 3; i++) {
      const cells = await page.$$('tbody tr td[contenteditable]');
      if (cells.length < 3) return false;
      await cells[i].click({ clickCount: 3 });
      await page.keyboard.type(values[i]);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(150);
    }
    const input = await $('.tbl-search-input'); if (!input) return false;
    await input.click(); await page.keyboard.type('mango'); await page.waitForTimeout(250);
    const filtered = await page.$$eval('tbody tr td[contenteditable]', (tds) => tds.map((t) => t.textContent.trim()));
    await input.fill(''); await page.waitForTimeout(250);
    const restored = (await count('tbody tr')) === 3;
    return filtered.length === 1 && filtered[0] === 'mango' && restored;
  });
  await check('clicking a column header sorts rows, and toggles direction', async () => {
    let th = await $('th.col-head'); if (!th) return false;
    await th.click(); await page.waitForTimeout(250);
    const asc = await page.$$eval('tbody tr td[contenteditable]', (tds) => tds.map((t) => t.textContent.trim()));
    th = await $('th.col-head'); if (!th) return false;  // header was rebuilt by the sort click
    await th.click(); await page.waitForTimeout(250);
    const desc = await page.$$eval('tbody tr td[contenteditable]', (tds) => tds.map((t) => t.textContent.trim()));
    return asc.join() === 'apple,mango,zebra' && desc.join() === 'zebra,mango,apple';
  });
  await check('column header sort is keyboard-operable (Tab + Enter) and reports aria-sort', async () => {
    let th = await $('th.col-head'); if (!th) return false;
    if ((await th.getAttribute('tabindex')) !== '0') return false;
    await th.click(); await page.waitForTimeout(250); // was left desc by the check above; one more click clears it
    th = await $('th.col-head'); if (!th) return false;
    await th.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(250); // -> asc
    th = await $('th.col-head'); if (!th) return false;
    const ariaAsc = await th.getAttribute('aria-sort');
    const asc = await page.$$eval('tbody tr td[contenteditable]', (tds) => tds.map((t) => t.textContent.trim()));
    th = await $('th.col-head'); if (!th) return false;
    await th.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(250); // -> desc, matches state the checks below expect
    th = await $('th.col-head'); if (!th) return false;
    const ariaDesc = await th.getAttribute('aria-sort');
    const desc = await page.$$eval('tbody tr td[contenteditable]', (tds) => tds.map((t) => t.textContent.trim()));
    return ariaAsc === 'ascending' && ariaDesc === 'descending' &&
      asc.join() === 'apple,mango,zebra' && desc.join() === 'zebra,mango,apple';
  });
  await check('export CSV downloads the current (filtered/sorted) view', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export CSV")'),
    ]);
    const text = fs.readFileSync(await download.path(), 'utf8');
    const lines = text.trim().split('\r\n');
    // the sort check above left the table sorted by name, descending
    return lines.join('|') === ['name', 'zebra', 'mango', 'apple'].join('|');
  });
  await check('bulk-select "Export selected" downloads only the checked rows', async () => {
    // table still sorted desc from the sort check above: zebra, mango, apple
    // re-query checkboxes between clicks — each check re-renders the tbody
    // (refreshRows), which detaches any handle grabbed before the rebuild
    let rowChecks = await page.$$('tbody tr .row-check');
    if (rowChecks.length !== 3) return false;
    await rowChecks[0].click(); await page.waitForTimeout(150);
    rowChecks = await page.$$('tbody tr .row-check');
    await rowChecks[1].click(); await page.waitForTimeout(200);
    const bar = await $('.bulk-bar'); if (!bar) return false;
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('.bulk-bar button:has-text("Export selected")'),
    ]);
    const text = fs.readFileSync(await download.path(), 'utf8');
    const lines = text.trim().split('\r\n');
    await page.click('.bulk-bar button:has-text("Clear")'); await page.waitForTimeout(200);
    return lines.join('|') === ['name', 'zebra', 'mango'].join('|');
  });
  await check('bulk row selection: "select all" checks every row, unchecking one shows a live count, and Delete selected removes only the checked rows', async () => {
    // table is still sorted desc from the check above: zebra, mango, apple
    const selectAll = await $('th.chk-head .row-check'); if (!selectAll) return false;
    await selectAll.click(); await page.waitForTimeout(200);
    let bar = await $('.bulk-bar'); if (!bar) return false;
    if ((await page.$eval('.bulk-count', (e) => e.textContent)) !== '3 selected') return false;
    // uncheck one row — the count should drop without disturbing the other checks
    const rowChecks = await page.$$('tbody tr .row-check');
    if (rowChecks.length !== 3) return false;
    await rowChecks[0].click(); await page.waitForTimeout(200);
    if ((await page.$eval('.bulk-count', (e) => e.textContent)) !== '2 selected') return false;
    await page.click('.bulk-bar button:has-text("Delete selected")'); await page.waitForTimeout(250);
    await page.click('.modal button.danger:has-text("Delete")'); await page.waitForTimeout(400);
    const remaining = await page.$$eval('tbody tr td[contenteditable]', (tds) => tds.map((t) => t.textContent.trim()));
    return remaining.length === 1 && remaining[0] === 'zebra' && !(await $('.bulk-bar'));
  });
  await check('mobile layout: the toolbar and bulk-select bar stay within the viewport (no horizontal overflow)', async () => {
    // restore the desktop viewport even if a click throws mid-check — a
    // lingering 390px viewport would cascade failures through the whole suite
    try {
      await page.setViewportSize({ width: 390, height: 780 }); await page.waitForTimeout(250);
      const rowCheck = await $('tbody tr .row-check');
      if (!rowCheck) return false;
      await rowCheck.click(); await page.waitForTimeout(250);
      return await page.evaluate(() => {
        const vw = window.innerWidth;
        const bar = document.querySelector('.bulk-bar');
        const toolbar = document.querySelector('.tbl-toolbar');
        return !!bar && document.body.scrollWidth <= vw
          && bar.getBoundingClientRect().right <= vw + 1 && toolbar.getBoundingClientRect().right <= vw + 1;
      });
    } finally {
      await page.setViewportSize({ width: 1280, height: 860 }); await page.waitForTimeout(250);
    }
  });
  await check('bulk-select "Set field…" applies one field\'s value to every checked row', async () => {
    // the mobile-layout check above left "zebra" (the sole surviving row) checked
    if (await $('.bulk-bar')) { await page.click('.bulk-bar button:has-text("Clear")'); await page.waitForTimeout(150); }
    await page.click('button:has-text("Row")'); await page.waitForTimeout(200);
    await page.click('button:has-text("Row")'); await page.waitForTimeout(200);
    if ((await count('tbody tr')) !== 3) return false;
    // still sorted desc by name — "zebra" sorts above the two new blank rows
    let rowChecks = await page.$$('tbody tr .row-check');
    if (rowChecks.length !== 3) return false;
    await rowChecks[1].click(); await page.waitForTimeout(150);
    rowChecks = await page.$$('tbody tr .row-check');
    await rowChecks[2].click(); await page.waitForTimeout(150);
    const bar = await $('.bulk-bar'); if (!bar) return false;
    if ((await page.$eval('.bulk-count', (e) => e.textContent)) !== '2 selected') return false;
    await page.click('.bulk-bar button:has-text("Set field")'); await page.waitForTimeout(300);
    const valueInput = await $('.modal input[placeholder="New value for every selected row"]');
    if (!valueInput) return false;
    await valueInput.fill('kiwi');
    await page.click('.modal button:has-text("Apply")'); await page.waitForTimeout(300);
    const names = await page.$$eval('tbody tr td[contenteditable]', (tds) => tds.map((t) => t.textContent.trim()));
    return names.length === 3 && names.filter((n) => n === 'kiwi').length === 2
      && names.includes('zebra') && !(await $('.bulk-bar'));
  });
  await check('deleting a row shows an "Undo" toast that restores it', async () => {
    await page.waitForTimeout(400);   // let the previous check's re-render settle before grabbing a row handle
    const before = await count('tbody tr');
    const del = await $('.row-del-btn'); if (!del) return false;
    await del.click(); await page.waitForTimeout(200);
    await page.click('.modal button.danger:has-text("Delete")'); await page.waitForTimeout(300);
    if ((await count('tbody tr')) !== before - 1) return false;
    const undoBtn = await $('.toast-action'); if (!undoBtn) return false;
    await undoBtn.click(); await page.waitForTimeout(300);
    return (await count('tbody tr')) === before;
  });
  await check('"Duplicate row" (per-row action) clones a row\'s fields into a new row', async () => {
    const before = await count('tbody tr');
    const rows = await page.$$('tbody tr');
    let target = null;
    for (const r of rows) {
      const text = await r.$eval('td[contenteditable]', (td) => td.textContent.trim()).catch(() => '');
      if (text === 'zebra') { target = r; break; }
    }
    if (!target) return false;
    await target.$eval('.row-dup-btn', (b) => b.click());
    await page.waitForTimeout(300);
    if ((await count('tbody tr')) !== before + 1) return false;
    const names = await page.$$eval('tbody tr td[contenteditable]', (tds) => tds.map((t) => t.textContent.trim()));
    return names.filter((n) => n === 'zebra').length === 2;
  });
  await check('import CSV creates a new table with typed rows', async () => {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('button[title="Import CSV"]'),
    ]);
    await chooser.setFiles({ name: 'smoke-import.csv', mimeType: 'text/csv',
      buffer: Buffer.from('name,age,active\nAda,30,true\nAlan,41,false\n') });
    await page.waitForTimeout(300);
    if (!(await $('.modal input:visible'))) return false;
    await page.fill('.modal input:visible', 'Smoke CSV Table');
    await page.click('.modal button:has-text("Import 2 rows")');
    await page.waitForTimeout(400);
    const created = await page.$$eval('.tree-row .tree-label', (t) => t.some((x) => /smoke csv table/i.test(x.textContent)));
    if (!created) return false;
    return await page.evaluate(async () => {
      const { Store } = await import('/js/store.js');
      const k = Store.entityNames().find((n) => Store.entity(n).label === 'Smoke CSV Table');
      if (!k) return false;
      const rows = Store.records(k);
      return rows.length === 2 && rows.some((r) => r.fields.name === 'Ada' && r.fields.age === 30 && r.fields.active === true);
    });
  });
  await check('CSV import preview suggests Dropdown for a repeated column and lets you override another column\'s type', async () => {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('button[title="Import CSV"]'),
    ]);
    await chooser.setFiles({ name: 'smoke-import-types.csv', mimeType: 'text/csv',
      buffer: Buffer.from('name,status,age\nAda,Open,30\nAlan,Done,41\nGrace,Open,29\nKen,Open,25\nLin,Review,33\n') });
    await page.waitForTimeout(300);
    const statusRow = page.locator('.import-type-row', { hasText: 'status' });
    if (!(await statusRow.count())) return false;
    const statusType = await statusRow.locator('select').inputValue();
    const statusOpts = await statusRow.locator('.import-type-opts input').inputValue();
    if (statusType !== 'select' || statusOpts !== 'Open, Done, Review') return false;
    // "age" is all-numeric so it defaults to Auto; override it to Text so the
    // imported values stay strings instead of the usual auto-inferred numbers
    await page.locator('.import-type-row', { hasText: 'age' }).locator('select').selectOption('text');
    await page.fill('.modal input:visible', 'Smoke CSV Types Table');
    await page.click('.modal button:has-text("Import 5 rows")');
    await page.waitForTimeout(400);
    return await page.evaluate(async () => {
      const { Store } = await import('/js/store.js');
      const k = Store.entityNames().find((n) => Store.entity(n).label === 'Smoke CSV Types Table');
      if (!k) return false;
      const statusFt = Store.fieldType(k, 'status');
      if (!statusFt || statusFt.type !== 'select' || statusFt.options.join(',') !== 'Open,Done,Review') return false;
      const ageFt = Store.fieldType(k, 'age');
      if (!ageFt || ageFt.type !== 'text') return false;
      const rows = Store.records(k);
      return rows.some((r) => r.fields.status === 'Open' && r.fields.age === '30');
    });
  });
  await check('large CSV import chunks the work (main thread yields between chunks, no rows dropped)', async () => {
    const total = 6000; // 20 chunks of 300 — past the HTML spec's 5-deep nested-
    // setTimeout clamp (browsers force >=4ms once a chain nests 5+ deep), so the
    // import is guaranteed to still be mid-flight across two quick reads below
    // regardless of how fast the runner's CPU is — not a timing guess.
    const csv = 'id,val\n' + Array.from({ length: total }, (_, i) => `${i},row${i}`).join('\n') + '\n';
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('button[title="Import CSV"]'),
    ]);
    await chooser.setFiles({ name: 'smoke-import-big.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.waitForTimeout(300);
    await page.fill('.modal input:visible', 'Smoke Big Import');
    await page.click(`.modal button:has-text("Import ${total} rows")`);
    const readProgress = () => page.evaluate(() => {
      const fill = document.querySelector('.import-progress-fill');
      const btn = document.querySelector('.modal button.primary');
      return { width: fill ? parseInt(fill.style.width, 10) : NaN, disabled: btn ? btn.disabled : false };
    });
    const first = await readProgress();
    const second = await readProgress();
    if (!first.disabled || !(first.width >= 0 && first.width < 100)) return false;
    if (!(second.width >= first.width)) return false;
    await page.waitForTimeout(1500);
    const created = await page.$$eval('.tree-row .tree-label', (t) => t.some((x) => /smoke big import/i.test(x.textContent)));
    if (!created) return false;
    return await page.evaluate(async (n) => {
      const { Store } = await import('/js/store.js');
      const k = Store.entityNames().find((e) => Store.entity(e).label === 'Smoke Big Import');
      if (!k) return false;
      const rows = Store.records(k);
      return rows.length === n
        && rows.some((r) => r.fields.id === 0 && r.fields.val === 'row0')
        && rows.some((r) => r.fields.id === n - 1 && r.fields.val === `row${n - 1}`);
    }, total);
  });
  await check('CSV import "Link to another table" column type matches cell text to an existing row by name', async () => {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('button[title="Import CSV"]'),
    ]);
    await chooser.setFiles({ name: 'smoke-import-link.csv', mimeType: 'text/csv',
      buffer: Buffer.from('title,owner\nShip P2P sync,Ada Lovelace\nDesign rail nav,Someone Unknown\n') });
    await page.waitForTimeout(300);
    const ownerRow = page.locator('.import-type-row', { hasText: 'owner' });
    if (!(await ownerRow.count())) return false;
    await ownerRow.locator('select').selectOption('link');
    await page.waitForTimeout(150);
    const linkSel = ownerRow.locator('select.link-target-select');
    if (!(await linkSel.count())) return false;
    await linkSel.selectOption({ label: 'Contacts' });
    await page.fill('.modal input:visible', 'Smoke CSV Link Table');
    await page.click('.modal button:has-text("Import 2 rows")');
    await page.waitForTimeout(400);
    return await page.evaluate(async () => {
      const { Store } = await import('/js/store.js');
      const k = Store.entityNames().find((n) => Store.entity(n).label === 'Smoke CSV Link Table');
      if (!k) return false;
      const ft = Store.fieldType(k, 'owner');
      if (!ft || ft.type !== 'link' || ft.entity !== 'contacts') return false;
      const rows = Store.records(k);
      const matched = rows.find((r) => r.fields.title === 'Ship P2P sync');
      const unmatched = rows.find((r) => r.fields.title === 'Design rail nav');
      return matched?.fields.owner === 'seed-contact-ada' && !('owner' in (unmatched?.fields || {}));
    });
  });
  await check('delete a table (store + UI update)', async () => {
    await page.evaluate(async () => {
      const { Store } = await import('/js/store.js');
      const k = Store.entityNames().find((n) => Store.entity(n).label === 'Smoke Table');
      if (k) Store.deleteEntity(k);
    });
    await page.waitForTimeout(400);
    return !(await page.$$eval('.tree-row .tree-label', (t) => t.some((x) => /smoke table/i.test(x.textContent))));
  });

  console.log('Tables — grid keyboard navigation');
  // looked up by row id, not array position — Store.records() sorts
  // most-recently-updated first, and this check's whole point is committing
  // edits via keyboard nav, so position shuffles as the check runs.
  const smokeNavRecord = async (id) => page.evaluate(async (rid) => {
    const { Store } = await import('/js/store.js');
    const k = Store.entityNames().find((n) => Store.entity(n).label === 'Smoke Nav Table');
    return k ? Store.records(k).find((rec) => rec.id === rid)?.fields : null;
  }, id);
  await check('grid: arrow keys navigate between cells (committing on the way), Enter drops to the row below, Escape cancels', async () => {
    // isolated table so this doesn't disturb the fixed row/column shape other checks assume
    await (await $('.ps-topbar .btn.primary')).click(); await page.waitForTimeout(300);
    await page.fill('.modal input', 'Smoke Nav Table');
    await page.click('.modal button:has-text("Create")'); await page.waitForTimeout(500);
    await page.click('button:has-text("Row")'); await page.waitForTimeout(200); // seeds the default "name" field
    await page.click('button:has-text("Field")'); await page.waitForTimeout(300);
    await page.fill('.modal input:visible', 'note');
    await page.click('.modal button:has-text("Add field")'); await page.waitForTimeout(300);
    await page.click('button:has-text("Row")'); await page.waitForTimeout(200);
    if ((await count('tbody tr')) !== 2) return false;

    // by row id, not DOM position — the default (unsorted) view lists
    // most-recently-updated first, so committing an edit can itself move
    // the very row being edited to a new position.
    const cellById = (id, field) => $(`tbody tr[data-id="${id}"] td[data-field="${field}"]`);
    const activeField = () => page.evaluate(() => document.activeElement?.dataset?.field);
    const activeRowId = () => page.evaluate(() => document.activeElement?.closest('tr')?.dataset?.id);
    const rowId = (row) => page.$eval(`tbody tr:nth-child(${row})`, (tr) => tr.dataset.id);
    const row1Id = await rowId(1), row2Id = await rowId(2);

    // ArrowRight at the end of row 1's "name" cell commits it and moves into "note"
    let c = await cellById(row1Id, 'name'); if (!c) return false;
    await c.click(); await page.keyboard.type('left');
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
    if ((await activeField()) !== 'note' || (await activeRowId()) !== row1Id) return false;
    // ArrowLeft at the start of "note" (after Home) commits it and moves back to "name"
    await page.keyboard.type('right');
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(200);
    if ((await activeField()) !== 'name' || (await activeRowId()) !== row1Id) return false;
    const r1 = await smokeNavRecord(row1Id);
    if (r1?.name !== 'left' || r1?.note !== 'right') return false;

    // Enter commits and drops focus to the same column, row below
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    if ((await activeField()) !== 'name' || (await activeRowId()) !== row2Id) return false;
    await page.keyboard.type('bottom');
    // ArrowUp (from anywhere in the text, no boundary needed) commits and moves up a row
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(200);
    if ((await activeField()) !== 'name' || (await activeRowId()) !== row1Id) return false;
    const r2 = await smokeNavRecord(row2Id);
    if (r2?.name !== 'bottom') return false;

    // Escape reverts an in-progress edit instead of committing it
    c = await cellById(row1Id, 'name'); if (!c) return false;
    await c.click({ clickCount: 3 }); await page.keyboard.type('CHANGED');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const reverted = await c.evaluate((td) => td.textContent.trim());
    const r1After = await smokeNavRecord(row1Id);
    return reverted === 'left' && r1After?.name === 'left';
  });

  console.log('Tables — column types (nicer editors)');
  const smokeTypesRecord = async () => page.evaluate(async () => {
    const { Store } = await import('/js/store.js');
    const k = Store.entityNames().find((n) => Store.entity(n).label === 'Smoke Types Table');
    return k ? Store.records(k)[0]?.fields : null;
  });
  await check('create a table for column-type checks', async () => {
    await (await $('.ps-topbar .btn.primary')).click(); await page.waitForTimeout(300);
    await page.fill('.modal input', 'Smoke Types Table');
    await page.click('.modal button:has-text("Create")'); await page.waitForTimeout(500);
    await page.click('button:has-text("Row")'); await page.waitForTimeout(300); // seed a row so fields materialize
    return await page.$$eval('.tree-row .tree-label', (t) => t.some((x) => /smoke types table/i.test(x.textContent)));
  });
  await check('boolean field: Add field modal creates a grid toggle that persists on click', async () => {
    await page.click('button:has-text("Field")'); await page.waitForTimeout(300);
    await page.fill('.modal input:visible', 'active');
    await page.selectOption('.modal select', 'boolean');
    await page.click('.modal button:has-text("Add field")'); await page.waitForTimeout(300);
    const toggle = await $('tbody tr .bool-cell .toggle'); if (!toggle) return false;
    const before = await toggle.evaluate((b) => b.classList.contains('on'));
    await toggle.click(); await page.waitForTimeout(300);
    const after = (await smokeTypesRecord())?.active;
    return after === !before;
  });
  await check('dropdown field: Add field modal with options creates a grid select that persists a choice', async () => {
    await page.click('button:has-text("Field")'); await page.waitForTimeout(300);
    await page.fill('.modal input:visible', 'status');
    await page.selectOption('.modal select', 'select');
    await page.waitForTimeout(150);
    const optsInput = await page.$('.modal input[placeholder*="Comma-separated"]'); if (!optsInput) return false;
    await optsInput.fill('Open, In progress, Done');
    await page.click('.modal button:has-text("Add field")'); await page.waitForTimeout(300);
    const badges = await page.$$eval('.col-type-badge', (bs) => bs.map((b) => b.textContent.trim()));
    if (!badges.includes('list')) return false;
    const sel = await $('tbody tr .cell-select'); if (!sel) return false;
    await sel.selectOption('Done'); await page.waitForTimeout(300);
    return (await smokeTypesRecord())?.status === 'Done';
  });
  await check('number field: rejects non-numeric input and accepts valid numbers', async () => {
    await page.click('button:has-text("Field")'); await page.waitForTimeout(300);
    await page.fill('.modal input:visible', 'score');
    await page.selectOption('.modal select', 'number');
    await page.click('.modal button:has-text("Add field")'); await page.waitForTimeout(300);
    const cells = await page.$$('tbody tr td[contenteditable]');
    const cell = cells[cells.length - 1]; if (!cell) return false;
    await cell.click({ clickCount: 3 }); await page.keyboard.type('not-a-number'); await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    const rejectedText = await cell.evaluate((c) => c.textContent.trim());
    await cell.click({ clickCount: 3 }); await page.keyboard.type('42'); await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    return rejectedText === '' && (await smokeTypesRecord())?.score === 42;
  });
  await check('date field: renders a native date input that persists a value', async () => {
    await page.click('button:has-text("Field")'); await page.waitForTimeout(300);
    await page.fill('.modal input:visible', 'due');
    await page.selectOption('.modal select', 'date');
    await page.click('.modal button:has-text("Add field")'); await page.waitForTimeout(300);
    const dateInput = await $('tbody tr .cell-date'); if (!dateInput) return false;
    await dateInput.fill('2026-08-01'); await page.waitForTimeout(300);
    return (await smokeTypesRecord())?.due === '2026-08-01';
  });
  await check('record panel: typed fields render matching dedicated controls (toggle + dropdown)', async () => {
    const openBtn = await $('tbody tr .row-open'); if (!openBtn) return false;
    await openBtn.click(); await page.waitForTimeout(300);
    const hasToggle = !!(await page.$('.record-sheet .record-field .toggle'));
    const hasSelect = !!(await page.$('.record-sheet .record-field select'));
    await closeModal();
    return hasToggle && hasSelect;
  });
  await check('link field: Add field modal links to another table; the grid picker stores the linked record\'s id, and the record panel + CSV export resolve it to that record\'s label', async () => {
    await page.click('button:has-text("Field")'); await page.waitForTimeout(300);
    await page.fill('.modal input:visible', 'assignee');
    await page.selectOption('.modal select', 'link'); await page.waitForTimeout(150);
    const linkSel = await $('.modal select.link-target-select'); if (!linkSel) return false;
    await linkSel.selectOption({ label: 'Contacts' });
    await page.click('.modal button:has-text("Add field")'); await page.waitForTimeout(300);
    const badges = await page.$$eval('.col-type-badge', (bs) => bs.map((b) => b.textContent.trim()));
    if (!badges.includes('link')) return false;

    const colLabels = await page.$$eval('.col-head .col-label', (ls) => ls.map((l) => l.textContent.trim()));
    const idx = colLabels.indexOf('assignee'); if (idx < 0) return false;
    // 3 leading non-field cells (checkbox, open, row-id) come before the field columns
    await page.selectOption(`tbody tr:first-child td:nth-child(${4 + idx}) select`, { label: 'Ada Lovelace' });
    await page.waitForTimeout(300);
    if ((await smokeTypesRecord())?.assignee !== 'seed-contact-ada') return false;

    const openBtn = await $('tbody tr .row-open'); if (!openBtn) return false;
    await openBtn.click(); await page.waitForTimeout(300);
    const panelLabel = await page.$eval('.record-sheet .record-field:has-text("assignee") select',
      (s) => s.selectedOptions[0]?.textContent.trim()).catch(() => null);
    await closeModal();
    if (panelLabel !== 'Ada Lovelace') return false;

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export CSV")'),
    ]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    return csv.includes('Ada Lovelace');
  });
  await check('multi-link field: "Allow linking multiple records" stores an id array, the grid cell\'s popover picker commits live and updates the button label, the record panel checklist reflects it, and CSV export joins the labels with "; "', async () => {
    await page.click('button:has-text("Field")'); await page.waitForTimeout(300);
    await page.fill('.modal input:visible', 'reviewers');
    await page.selectOption('.modal select', 'link'); await page.waitForTimeout(150);
    const linkSel = await $('.modal select.link-target-select'); if (!linkSel) return false;
    await linkSel.selectOption({ label: 'Contacts' });
    const multiChk = page.locator('.modal .perm-row input[type="checkbox"]');
    if (!(await multiChk.count())) return false;
    await multiChk.check();
    await page.click('.modal button:has-text("Add field")'); await page.waitForTimeout(300);

    const colLabels = await page.$$eval('.col-head .col-label', (ls) => ls.map((l) => l.textContent.trim()));
    const idx = colLabels.indexOf('reviewers'); if (idx < 0) return false;
    const cellBtn = page.locator(`tbody tr:first-child td:nth-child(${4 + idx}) button.link-multi-btn`);
    await cellBtn.click(); await page.waitForTimeout(300);
    // a lightweight anchored popover, not a modal — no Save/Cancel, ticking a
    // box commits straight to the store like the single-link <select> does
    if (await count('.modal')) return false;
    const pop = page.locator('.popover.link-multi-pop');
    if (!(await pop.count())) return false;
    const adaRow = pop.locator('.link-multi-list label', { hasText: 'Ada Lovelace' });
    const alanRow = pop.locator('.link-multi-list label', { hasText: 'Alan Turing' });
    if (!(await adaRow.count()) || !(await alanRow.count())) return false;
    await adaRow.locator('input[type="checkbox"]').check(); await page.waitForTimeout(150);
    await alanRow.locator('input[type="checkbox"]').check(); await page.waitForTimeout(150);

    const btnLabel = (await cellBtn.textContent())?.trim();
    if (!/Ada Lovelace/.test(btnLabel) || !/Alan Turing/.test(btnLabel)) return false;

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.popover'), null, { timeout: 4000 }).catch(() => {});

    const ids = (await smokeTypesRecord())?.reviewers;
    if (!Array.isArray(ids) || ids.length !== 2 || !ids.includes('seed-contact-ada') || !ids.includes('seed-contact-alan')) return false;

    const openBtn = await $('tbody tr .row-open'); if (!openBtn) return false;
    await openBtn.click(); await page.waitForTimeout(300);
    const checkedCount = await page.locator('.record-sheet .record-field:has-text("reviewers") .link-multi-list input:checked').count();
    await closeModal();
    if (checkedCount !== 2) return false;

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export CSV")'),
    ]);
    const csv = fs.readFileSync(await download.path(), 'utf8');
    return csv.includes('Ada Lovelace; Alan Turing') || csv.includes('Alan Turing; Ada Lovelace');
  });
  await check('grid: Ctrl+Arrow forces cell-to-cell navigation out of select/date/link cells without disturbing their native bare-arrow behavior, and a plain arrow already moves out of the multi-link button', async () => {
    const activeField = () => page.evaluate(() => document.activeElement?.closest('td')?.dataset?.field);
    const dueInput = page.locator('tbody tr:first-child td[data-field="due"] input');
    if (!(await dueInput.count())) return false;

    // plain ArrowLeft on the date input nudges its segment — the cell stays put
    await dueInput.click(); await page.waitForTimeout(150);
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(150);
    if ((await activeField()) !== 'due') return false;

    // Ctrl+ArrowLeft forces a move into the previous cell (score)
    await page.keyboard.press('Control+ArrowLeft'); await page.waitForTimeout(150);
    if ((await activeField()) !== 'score') return false;

    // Ctrl+ArrowRight from due lands on assignee (a single-link <select>)
    await dueInput.click(); await page.waitForTimeout(150);
    await page.keyboard.press('Control+ArrowRight'); await page.waitForTimeout(150);
    if ((await activeField()) !== 'assignee') return false;

    // Ctrl+ArrowLeft out of the assignee link <select> lands back on due
    await page.keyboard.press('Control+ArrowLeft'); await page.waitForTimeout(150);
    if ((await activeField()) !== 'due') return false;

    // the multi-link button has no native arrow meaning, so a bare arrow
    // already moves out of it, same as the boolean toggle
    await page.$eval('tbody tr:first-child td[data-field="reviewers"] button.link-multi-btn', (b) => b.focus());
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(150);
    return (await activeField()) === 'assignee';
  });
  await check('record panel: "Linked from" shows records in other tables whose Link field points here, and a chip navigates there', async () => {
    const contactsRow = page.locator('.tree-row', { hasText: 'Contacts' });
    if (!(await contactsRow.count())) return false;
    await contactsRow.click(); await page.waitForTimeout(300);
    const adaRow = page.locator('tbody tr', { hasText: 'Ada Lovelace' });
    if (!(await adaRow.count())) return false;
    await adaRow.locator('.row-open').click(); await page.waitForTimeout(300);
    const groups = await page.$$eval('.record-backlinks .backlink-src', (els) => els.map((e) => e.textContent));
    if (!groups.some((g) => g.includes('Smoke Types Table') && g.includes('assignee'))) return false;
    if (!groups.some((g) => g.includes('Smoke Types Table') && g.includes('reviewers'))) return false;
    // an earlier CSV-import check also links Ada from a third table ("Smoke
    // CSV Link Table"), so scope the click to the assignee group specifically
    // rather than assuming it's the first chip on the page.
    const assigneeGroup = page.locator('.backlink-group', { has: page.locator('.backlink-src', { hasText: 'assignee' }) });
    if (!(await assigneeGroup.count())) return false;
    await assigneeGroup.locator('.backlink-chip').first().click(); await page.waitForTimeout(600);
    const activeLabel = await page.$eval('.tree-row.active .tree-label', (e) => e.textContent.trim()).catch(() => null);
    const reopened = !!(await $('.record-sheet'));
    await closeModal();
    return activeLabel === 'Smoke Types Table' && reopened;
  });
  await check('editField: switching a typed field back to Auto clears its type badge', async () => {
    const headers = await page.$$('.col-head');
    let btn = null;
    for (const h of headers) {
      const label = await h.$eval('.col-label', (n) => n.textContent.trim()).catch(() => '');
      if (label === 'status') { btn = await h.$('.col-edit-btn'); break; }
    }
    if (!btn) return false;
    await btn.click(); await page.waitForTimeout(300);
    await page.selectOption('.modal select', 'auto');
    await page.click('.modal button:has-text("Save")'); await page.waitForTimeout(300);
    const badges = await page.$$eval('.col-type-badge', (bs) => bs.map((b) => b.textContent.trim()));
    return !badges.includes('list') && badges.includes('y/n') && badges.includes('num') && badges.includes('date');
  });
  await check('deleting a field via its edit modal shows an "Undo" toast that restores its value and type', async () => {
    const before = await smokeTypesRecord();
    if (!before || before.score !== 42) return false;
    const headers = await page.$$('.col-head');
    let btn = null;
    for (const h of headers) {
      const label = await h.$eval('.col-label', (n) => n.textContent.trim()).catch(() => '');
      if (label === 'score') { btn = await h.$('.col-edit-btn'); break; }
    }
    if (!btn) return false;
    await btn.click(); await page.waitForTimeout(300);
    await page.click('.modal button.danger:has-text("Delete field")'); await page.waitForTimeout(200);
    // two modals are stacked now (the edit-field modal behind, the confirm on
    // top) and both have a same-labelled danger button — target the one in the
    // most-recently-opened overlay so we hit the confirm, not the trigger.
    await page.locator('.overlay').last().locator('button:has-text("Delete field")').click();
    await page.waitForTimeout(300);
    const afterDeleteBadges = await page.$$eval('.col-type-badge', (bs) => bs.map((b) => b.textContent.trim()));
    const afterDelete = await smokeTypesRecord();
    const undoBtn = await $('.toast-action'); if (!undoBtn) return false;
    await undoBtn.click(); await page.waitForTimeout(300);
    const restored = await smokeTypesRecord();
    const restoredBadges = await page.$$eval('.col-type-badge', (bs) => bs.map((b) => b.textContent.trim()));
    return !afterDeleteBadges.includes('num') && afterDelete?.score === undefined
      && restored?.score === 42 && restoredBadges.includes('num');
  });
  const smokeTypesFieldOrder = () => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('relay.workspace.v1'));
    const e = Object.values(raw.entities).find((x) => x.label === 'Smoke Types Table');
    return e && e.fieldOrder;
  });
  await check('grid: dragging a column header by its grip reorders fields, and it persists', async () => {
    const colLabels = () => page.$$eval('.col-head .col-label', (ls) => ls.map((l) => l.textContent.trim()));
    const before = await colLabels();
    const statusIdx = before.indexOf('status'), activeIdx = before.indexOf('active');
    if (statusIdx < 0 || activeIdx < 0) return false;
    const grip = (await page.$$('.col-grip'))[statusIdx]; if (!grip) return false;
    const targetHeader = (await page.$$('.col-head'))[activeIdx]; if (!targetHeader) return false;
    const gbox = await grip.boundingBox(); const tbox = await targetHeader.boundingBox();
    if (!gbox || !tbox) return false;
    await page.mouse.move(gbox.x + gbox.width / 2, gbox.y + gbox.height / 2);
    await page.mouse.down();
    await page.mouse.move(tbox.x + 4, tbox.y + tbox.height / 2, { steps: 6 });
    await page.mouse.up(); await page.waitForTimeout(200);
    const after = await colLabels();
    const persisted = await smokeTypesFieldOrder();
    return after.indexOf('status') < after.indexOf('active') && JSON.stringify(persisted) === JSON.stringify(after);
  });
  await check('tree panel: arrow key on a field’s grip swaps it with its neighbor, and it persists', async () => {
    const row = page.locator('.tree-row.active');
    if (!(await row.count())) return false;
    await row.locator('.tree-caret').click(); await page.waitForTimeout(250);
    const labelsBefore = await page.$$eval('.tree-field', (f) => f.map((x) => x.textContent.trim()));
    if (labelsBefore.length < 2) return false;
    const lastIdx = labelsBefore.length - 1;
    const grip = (await page.$$('.field-grip'))[lastIdx]; if (!grip) return false;
    await grip.focus();
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(200);
    const labelsAfter = await page.$$eval('.tree-field', (f) => f.map((x) => x.textContent.trim()));
    const persisted = await smokeTypesFieldOrder();
    const swapped = labelsAfter[lastIdx] === labelsBefore[lastIdx - 1] && labelsAfter[lastIdx - 1] === labelsBefore[lastIdx];
    return swapped && JSON.stringify(persisted) === JSON.stringify(labelsAfter);
  });
  await check('deleting a table via Edit table shows an "Undo" toast that restores it with its rows', async () => {
    await page.click('button:has-text("Edit table")'); await page.waitForTimeout(300);
    await page.click('.modal button.danger:has-text("Delete table")'); await page.waitForTimeout(200);
    await page.locator('.overlay').last().locator('button:has-text("Delete table")').click();
    await page.waitForTimeout(400);
    const gone = !(await page.$$eval('.tree-row .tree-label', (t) => t.some((x) => /smoke types table/i.test(x.textContent))));
    const undoBtn = await $('.toast-action'); if (!undoBtn) return false;
    await undoBtn.click(); await page.waitForTimeout(400);
    const restoredTree = await page.$$eval('.tree-row .tree-label', (t) => t.some((x) => /smoke types table/i.test(x.textContent)));
    const rec = await smokeTypesRecord();
    return gone && restoredTree && rec?.score === 42 && rec?.status === 'Done' && rec?.due === '2026-08-01' && typeof rec?.active === 'boolean';
  });
  await check('duplicating a table via Edit table clones its fields, types and rows into a new table', async () => {
    const before = await smokeTypesRecord();
    await page.click('button:has-text("Edit table")'); await page.waitForTimeout(300);
    await page.click('.modal button:has-text("Duplicate")'); await page.waitForTimeout(400);
    const treeLabels = await page.$$eval('.tree-row .tree-label', (t) => t.map((x) => x.textContent.trim()));
    if (!treeLabels.some((l) => /smoke types table$/i.test(l))) return false;   // original still present
    if (!treeLabels.some((l) => /smoke types table copy$/i.test(l))) return false;
    const dup = await page.evaluate(async () => {
      const { Store } = await import('/js/store.js');
      const k = Store.entityNames().find((n) => Store.entity(n).label === 'Smoke Types Table copy');
      return k ? { key: k, fields: Store.records(k)[0]?.fields } : null;
    });
    if (!dup) return false;
    const badges = await page.$$eval('.col-type-badge', (bs) => bs.map((b) => b.textContent.trim()));
    return dup.fields?.score === before?.score && dup.fields?.due === before?.due && dup.fields?.active === before?.active
      && badges.includes('num') && badges.includes('date');
  });
  const treeLabels = () => page.$$eval('.tree-row .tree-label', (ls) => ls.map((l) => l.textContent.trim()));
  const persistedEntityOrder = () => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('relay.workspace.v1'));
    const out = {};
    for (const e of Object.values(raw.entities)) out[e.label] = e.order;
    return out;
  });
  await check('tree: dragging a table by its grip reorders the table list, and it persists', async () => {
    const before = await treeLabels();
    const srcIdx = before.indexOf('Smoke Types Table copy');
    const dstIdx = before.indexOf('Smoke Types Table');
    if (srcIdx < 0 || dstIdx < 0 || srcIdx === dstIdx) return false;
    const grip = (await page.$$('.entity-grip'))[srcIdx]; if (!grip) return false;
    const targetRow = (await page.$$('.tree-row'))[dstIdx]; if (!targetRow) return false;
    await grip.scrollIntoViewIfNeeded(); await targetRow.scrollIntoViewIfNeeded();
    const gbox = await grip.boundingBox(); const tbox = await targetRow.boundingBox();
    if (!gbox || !tbox) return false;
    await page.mouse.move(gbox.x + gbox.width / 2, gbox.y + gbox.height / 2);
    await page.mouse.down();
    await page.mouse.move(tbox.x + tbox.width / 2, tbox.y + 4, { steps: 6 });
    await page.mouse.up(); await page.waitForTimeout(200);
    const after = await treeLabels();
    const orders = await persistedEntityOrder();
    return after.indexOf('Smoke Types Table copy') < after.indexOf('Smoke Types Table')
      && typeof orders['Smoke Types Table copy'] === 'number' && typeof orders['Smoke Types Table'] === 'number'
      && orders['Smoke Types Table copy'] < orders['Smoke Types Table'];
  });
  await check('tree: arrow key on a table’s grip swaps it with its neighbor, and it persists', async () => {
    const copyKey = await page.evaluate(async () => {
      const { Store } = await import('/js/store.js');
      return Store.entityNames().find((n) => Store.entity(n).label === 'Smoke Types Table copy');
    });
    if (!copyKey) return false;
    const before = await treeLabels();
    const copyIdx = before.indexOf('Smoke Types Table copy');
    if (copyIdx < 1) return false; // needs a row above it to swap with
    const aboveLabel = before[copyIdx - 1];
    const grip = await page.$(`.entity-grip[data-entity="${copyKey}"]`); if (!grip) return false;
    await grip.focus();
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(200);
    const after = await treeLabels();
    const orders = await persistedEntityOrder();
    const swapped = after[copyIdx - 1] === 'Smoke Types Table copy' && after[copyIdx] === aboveLabel;
    return swapped && orders['Smoke Types Table copy'] < orders[aboveLabel];
  });

  console.log('Messaging');
  await (await $('.ps-rail-item[data-sec="messages"]')).click(); await page.waitForTimeout(300);
  await check('send a message appears in the feed', async () => {
    const ta = await $('.composer textarea'); if (!ta) return false;
    await ta.click(); await page.keyboard.type('smoke hello'); await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    return await page.$$eval('.msg .text', (m) => m.some((x) => x.textContent.includes('smoke hello')));
  });
  await check('unread badge appears on an inactive DM thread and clears on open', async () => {
    // seed a known peer (no reload needed — the thread list is rebuilt from
    // Sync.knownPeers() on every render) then simulate them DMing us while
    // we're sitting on the General thread
    await page.evaluate(async () => {
      const { Sync } = await import('/js/sync.js');
      Sync._rememberPeer('smoke-thread-uid', 'Smoke Thread Peer');
    });
    await (await $('.ps-rail-item[data-sec="home"]')).click(); await page.waitForTimeout(150);
    await (await $('.ps-rail-item[data-sec="messages"]')).click(); await page.waitForTimeout(300);
    await page.evaluate(async () => {
      const { Sync } = await import('/js/sync.js');
      Sync._recvChat({ id: 'smoke-msg-1', from: 'smoke-peer-session', uid: 'smoke-thread-uid',
        name: 'Smoke Thread Peer', text: 'hi there', ts: Date.now(), to: Sync.uid });
    });
    await page.waitForTimeout(300);
    const pillSel = '.thread-pill[data-thread-key="smoke-thread-uid"]';
    const badgeBefore = await page.$eval(pillSel, (p) => p.querySelector('.pill-badge')?.textContent.trim());
    if (badgeBefore !== '1') return false;
    // the nav rail's own Messages badge should reflect the same unread total
    const railBadge = await page.$eval('.ps-rail-item[data-sec="messages"] .badge', (b) => b.hidden ? null : b.textContent.trim());
    if (railBadge !== '1') return false;
    await (await $(pillSel)).click(); await page.waitForTimeout(300);
    const badgeAfter = await page.$eval(pillSel, (p) => p.querySelector('.pill-badge'));
    return badgeAfter === null;
  });

  console.log('Global search — messages');
  await check('search matches a chat message by text and jumps to its thread, highlighting the message', async () => {
    await (await $('.ps-rail-item[data-sec="home"]')).click(); await page.waitForTimeout(200);
    await page.keyboard.press('Control+k'); await page.waitForTimeout(250);
    await page.keyboard.type('smoke hello'); await page.waitForTimeout(250);
    const groups = await page.$$eval('.gsearch-group', (gs) => gs.map((g) => g.textContent));
    if (!groups.includes('Messages')) return false;
    const row = page.locator('.gsearch-row', { hasText: 'smoke hello' });
    if (!(await row.count())) return false;
    await row.click(); await page.waitForTimeout(600);
    const activeSec = await page.$eval('.ps-rail-item.active', (e) => e.getAttribute('data-sec')).catch(() => null);
    const flashed = await page.$$eval('.msg.flash .text', (els) => els.some((x) => x.textContent.includes('smoke hello')));
    return activeSec === 'messages' && flashed;
  });

  console.log('Peers — progressive sharing controls');
  await check('seed a known offline peer', async () => {
    await page.evaluate(async () => {
      const { Sync } = await import('/js/sync.js');
      Sync._rememberPeer('smoke-peer-uid', 'Smoke Peer');
    });
    await page.goto(`${base}/app/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    await (await $('.ps-rail-item[data-sec="peers"]')).click(); await page.waitForTimeout(300);
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
    const before = await toggles[0].evaluate((b) => [b.getAttribute('role'), b.getAttribute('aria-checked'), !!b.getAttribute('aria-label')]);
    await toggles[0].click(); await page.waitForTimeout(300);
    const toggles2 = await (await $('.peer')).$$('.perm-grid .perm-row:first-child .toggle');
    const afterChecked = await toggles2[0].getAttribute('aria-checked');
    const btns2 = await (await $('.peer')).$$('.sharing-seg button');
    const segOn = await btns2[1].evaluate((b) => b.classList.contains('on'));
    return segOn && before[0] === 'switch' && before[2] && afterChecked !== before[1];
  });
  await check('WebRTC invite modal: "Join with invite" autofocuses the offer field', async () => {
    await page.click('button:has-text("WebRTC invite")'); await page.waitForTimeout(300);
    await page.click('.modal button:has-text("Join with invite")'); await page.waitForTimeout(150);
    const focused = await page.evaluate(() => document.activeElement?.placeholder || '');
    await closeModal();
    return focused.includes('offer');
  });

  console.log('What\'s new');
  await check('what\'s new panel opens, lists entries, searches', async () => {
    // The feed lives in the vendored shell's right panel (rightPanel +
    // initWhatsNew) since the Polecat Shell migration.
    await (await $('.wn-btn')).click(); await page.waitForTimeout(300);
    if (!(await $('.ps-rpanel.in'))) return false;
    if ((await count('.wn-entry')) < 1) return false;
    // timestamps must be real (formatted from ISO ts, Central Time per the
    // fleet contract): "Jul 4, 2026 · 2 weeks ago" — a year and the
    // relative-time separator, never blank
    const dateText = await page.evaluate(() => {
      const d = document.querySelector('.wn-entry .wn-date');
      return d ? d.textContent.trim() : '';
    });
    if (!/\b20\d\d\b/.test(dateText) || !dateText.includes('·')) return false;
    await page.fill('.ps-rpanel .input', 'zzzznomatch'); await page.waitForTimeout(250);
    const none = (await count('.wn-entry')) === 0;
    await closeModal();
    return none;
  });
  console.log('PWA');
  await check('installable: manifest is valid and the offline service worker activates', async () => {
    const man = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]'); if (!link) return false;
      const r = await fetch(link.href); if (!r.ok) return false;
      const j = await r.json();
      return j.name === 'Relay' && j.start_url === '/app/' && j.display === 'standalone';
    });
    if (!man) return false;
    // navigator.serviceWorker.ready never rejects — race it so a broken
    // registration fails the check instead of hanging it
    return await page.evaluate(() => Promise.race([
      navigator.serviceWorker.ready.then((reg) => !!reg.active),
      new Promise((res) => setTimeout(() => res(false), 8000)),
    ]));
  });

  // Fleet contract: other polecat apps ingest js/changelog.js by extracting the
  // CHANGELOG array literal and converting it to strict JSON (see manager's
  // ingest.js). That converter only requotes SINGLE-quoted strings, so a
  // double-quoted entry (or a // inside a string) makes it unparseable. Guard
  // it here with the same logic so a bad changelog can never ship.
  await check('changelog.js is ingestible by the fleet importer', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'js/changelog.js'), 'utf8');
    const m = src.match(/CHANGELOG\s*=\s*\[/); if (!m) return false;
    const start = m.index + m[0].length - 1;
    let depth = 0, inStr = null, esc = false, lit = null;
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === inStr) inStr = null; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) { lit = src.slice(start, i + 1); break; } }
    }
    if (!lit) return false;
    const json = lit
      .replace(/\/\/[^\n]*$/gm, '')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')
      .replace(/'((?:\\.|[^'\\])*)'/g, (_, s) => '"' + s.replace(/\\'/g, "'").replace(/"/g, '\\"') + '"');
    const arr = JSON.parse(json); // throws (→ check fails) if not ingestible
    return Array.isArray(arr) && arr.length > 0 && arr.every((e) => e.v && e.title && e.ts);
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
  await (await $('.ps-rail-item[data-sec="settings"]')).click(); await page.waitForTimeout(300);
  await check('advanced (rendezvous) disclosure present', async () => !!(await $('details.adv')));
  await check('TURN server: saving fields persists and feeds RTCPeerConnection config', async () => {
    let details = await $('details.adv'); if (!details) return false;
    if (!(await details.evaluate((d) => d.open))) { await (await details.$('summary')).click(); await page.waitForTimeout(250); }
    const inputs = await details.$$('.input');
    // STUN field is first; TURN url/username/credential follow it
    const [, turnUrl, turnUser, turnCred] = inputs;
    if (!turnUrl || !turnUser || !turnCred) return false;
    await turnUrl.fill('turn:turn.example.com:3478');
    await turnUser.fill('smoke-user');
    await turnCred.fill('smoke-secret');
    details = await $('details.adv');
    const saveBtns = await details.$$('button:has-text("Save")');
    await saveBtns[1].click(); await page.waitForTimeout(150);
    const stored = await page.evaluate(() => ({
      url: localStorage.getItem('relay.turn.url'),
      username: localStorage.getItem('relay.turn.username'),
      credential: localStorage.getItem('relay.turn.credential'),
    }));
    const servers = await page.evaluate(async () => {
      const { Sync } = await import('/js/sync.js');
      return Sync.rtcConfig().iceServers;
    });
    const turnEntry = servers.find((s) => s.urls === 'turn:turn.example.com:3478');
    return stored.url === 'turn:turn.example.com:3478' && stored.username === 'smoke-user'
      && stored.credential === 'smoke-secret' && !!turnEntry
      && turnEntry.username === 'smoke-user' && turnEntry.credential === 'smoke-secret';
  });
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
    await btn.click(); await page.waitForTimeout(200);   // opens a confirm dialog first
    const confirmBtn = await page.$('.modal button:has-text("Disconnect")'); if (!confirmBtn) return false;
    await confirmBtn.click(); await page.waitForTimeout(300);   // renderSettings() rebuilds the DOM — re-query below
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
    await btn.click(); await page.waitForTimeout(200);   // opens a confirm dialog first
    const confirmBtn = await page.$('.modal button:has-text("Disconnect")'); if (!confirmBtn) return false;
    await confirmBtn.click(); await page.waitForTimeout(300);   // renderSettings() rebuilds the DOM — re-query below
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
    await btn.click(); await page.waitForTimeout(200);   // opens a confirm dialog first
    const confirmBtn = await page.$('.modal button:has-text("Disconnect")'); if (!confirmBtn) return false;
    await confirmBtn.click(); await page.waitForTimeout(300);   // renderSettings() rebuilds the DOM — re-query below
    details = await $('details.adv'); if (!details) return false;
    return !!(await details.$('.wd-block button:has-text("Connect WebDAV")'));
  });

  await page.evaluate(async () => {
    // Dropbox's endpoints are fixed hostnames (not user-supplied like S3/
    // WebDAV), so stub fetch by pathname; also stub the OAuth redirect
    // itself (no real dropbox.com consent screen in CI) by rewriting the
    // URL with a fake ?code=&state= the way a real redirect-back would.
    const state = { file: null };
    window.__fakeDropbox = state;
    const realFetch = window.fetch.bind(window);
    window.fetch = async (url, opts = {}) => {
      const u = new URL(url, location.href);
      if (u.hostname === 'api.dropboxapi.com' && u.pathname === '/oauth2/token') {
        return new Response(JSON.stringify({ access_token: 'fake-access', refresh_token: 'fake-refresh', expires_in: 14400 }), { status: 200 });
      }
      if (u.hostname === 'api.dropboxapi.com' && u.pathname === '/2/users/get_current_account') {
        return new Response(JSON.stringify({ email: 'smoke@example.com' }), { status: 200 });
      }
      if (u.hostname === 'api.dropboxapi.com' && u.pathname === '/2/auth/token/revoke') {
        return new Response('', { status: 200 });
      }
      if (u.hostname === 'content.dropboxapi.com' && u.pathname === '/2/files/download') {
        return state.file != null ? new Response(state.file, { status: 200 }) : new Response('', { status: 409 });
      }
      if (u.hostname === 'content.dropboxapi.com' && u.pathname === '/2/files/upload') {
        state.file = opts.body;
        return new Response('{}', { status: 200 });
      }
      return realFetch(url, opts);
    };
    const { Dropbox } = await import('/js/storage/dropbox.js');
    window.__dropbox = Dropbox;
    Dropbox._navigate = (url) => {
      const authUrl = new URL(url);
      const params = new URLSearchParams(location.search);
      params.set('code', 'fake-code');
      params.set('state', authUrl.searchParams.get('state'));
      history.replaceState(null, '', location.pathname + '?' + params.toString() + location.hash);
    };
  });
  await check('Dropbox sync: connect completes OAuth and writes a snapshot', async () => {
    let details = await $('details.adv'); if (!details) return false;
    if (!(await details.evaluate((d) => d.open))) { await (await details.$('summary')).click(); await page.waitForTimeout(250); }
    const keyIn = await details.$('.db-block input'); if (!keyIn) return false;
    await keyIn.fill('smoke-app-key');
    const btn = await details.$('.db-block button:has-text("Connect Dropbox")'); if (!btn) return false;
    await btn.click(); await page.waitForTimeout(200);
    // stubbed _navigate() only rewrote the URL with ?code=&state=; simulate
    // the boot-time redirect handling a real reload would trigger
    await page.evaluate(() => window.__dropbox.autostart());
    await page.waitForTimeout(300);
    details = await $('details.adv'); if (!details) return false;
    const chip = await details.$('.db-block .chip');
    const chipText = chip ? (await chip.evaluate((c) => c.textContent)).trim() : '';
    const wrote = await page.evaluate(() => (window.__fakeDropbox.file || '').includes('"entities"'));
    return chipText === 'smoke@example.com' && wrote;
  });
  await check('Dropbox sync: local edit re-writes the snapshot', async () => {
    await page.evaluate(() => { window.__fakeDropbox.file = ''; });
    await page.evaluate(async () => {
      const { Store } = await import('/js/store.js');
      Store.createEntity('Smoke Dropbox Entity');
    });
    await page.waitForTimeout(1800);
    return await page.evaluate(() => (window.__fakeDropbox.file || '').includes('Smoke Dropbox Entity'));
  });
  await check('Dropbox sync: disconnect', async () => {
    let details = await $('details.adv'); if (!details) return false;
    const btn = await details.$('.db-block button:has-text("Disconnect")'); if (!btn) return false;
    await btn.click(); await page.waitForTimeout(200);   // opens a confirm dialog first
    const confirmBtn = await page.$('.modal button:has-text("Disconnect")'); if (!confirmBtn) return false;
    await confirmBtn.click(); await page.waitForTimeout(300);   // renderSettings() rebuilds the DOM — re-query below
    details = await $('details.adv'); if (!details) return false;
    return !!(await details.$('.db-block button:has-text("Connect Dropbox")'));
  });

  await page.evaluate(() => {
    // Google Drive uses Google Identity Services' token model (no redirect,
    // no client secret) rather than a code exchange, so there's no real
    // network call to fake a response for — stub the `google.accounts.oauth2`
    // global itself the way a loaded GIS script would expose it, then stub
    // the Drive REST endpoints the adapter talks to directly via fetch.
    window.__fakeDrive = { file: null, fileId: 'fake-file-id' };
    window.google = { accounts: { oauth2: { initTokenClient: (cfg) => ({
      requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'fake-token', expires_in: 3600 }), 0),
    }) } } };
    const realFetch = window.fetch.bind(window);
    window.fetch = async (url, opts = {}) => {
      const u = new URL(url, location.href);
      if (u.hostname === 'oauth2.googleapis.com' && u.pathname === '/revoke') return new Response('', { status: 200 });
      if (u.hostname !== 'www.googleapis.com') return realFetch(url, opts);
      const state = window.__fakeDrive;
      if (u.pathname === '/drive/v3/files' && (opts.method || 'GET').toUpperCase() === 'GET') {
        return new Response(JSON.stringify({ files: state.file != null ? [{ id: state.fileId }] : [] }), { status: 200 });
      }
      if (u.pathname === '/drive/v3/files' && (opts.method || 'GET').toUpperCase() === 'POST') {
        state.file = ''; // Drive creates an empty file immediately
        return new Response(JSON.stringify({ id: state.fileId }), { status: 200 });
      }
      if (u.pathname === `/drive/v3/files/${state.fileId}` && (opts.method || 'GET').toUpperCase() === 'GET') {
        return state.file != null ? new Response(state.file, { status: 200 }) : new Response('', { status: 404 });
      }
      if (u.pathname === `/upload/drive/v3/files/${state.fileId}` && (opts.method || 'GET').toUpperCase() === 'PATCH') {
        state.file = opts.body;
        return new Response('{}', { status: 200 });
      }
      return new Response('', { status: 404 });
    };
  });
  await check('Google Drive sync: connect authorizes and writes a snapshot', async () => {
    let details = await $('details.adv'); if (!details) return false;
    if (!(await details.evaluate((d) => d.open))) { await (await details.$('summary')).click(); await page.waitForTimeout(250); }
    const keyIn = await details.$('.gd-block input'); if (!keyIn) return false;
    await keyIn.fill('smoke-client-id.apps.googleusercontent.com');
    const btn = await details.$('.gd-block button:has-text("Connect Google Drive")'); if (!btn) return false;
    await btn.click(); await page.waitForTimeout(300);
    details = await $('details.adv'); if (!details) return false;
    const chip = await details.$('.gd-block .chip');
    const chipText = chip ? (await chip.evaluate((c) => c.textContent)).trim() : '';
    const wrote = await page.evaluate(() => (window.__fakeDrive.file || '').includes('"entities"'));
    return chipText === 'connected' && wrote;
  });
  await check('Google Drive sync: local edit re-writes the snapshot', async () => {
    await page.evaluate(() => { window.__fakeDrive.file = ''; });
    await page.evaluate(async () => {
      const { Store } = await import('/js/store.js');
      Store.createEntity('Smoke Drive Entity');
    });
    await page.waitForTimeout(1800);
    return await page.evaluate(() => (window.__fakeDrive.file || '').includes('Smoke Drive Entity'));
  });
  await check('Google Drive sync: disconnect', async () => {
    let details = await $('details.adv'); if (!details) return false;
    const btn = await details.$('.gd-block button:has-text("Disconnect")'); if (!btn) return false;
    await btn.click(); await page.waitForTimeout(200);   // opens a confirm dialog first
    const confirmBtn = await page.$('.modal button:has-text("Disconnect")'); if (!confirmBtn) return false;
    await confirmBtn.click(); await page.waitForTimeout(300);   // renderSettings() rebuilds the DOM — re-query below
    details = await $('details.adv'); if (!details) return false;
    return !!(await details.$('.gd-block button:has-text("Connect Google Drive")'));
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
