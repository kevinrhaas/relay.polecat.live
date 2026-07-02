// Smoke test for CI: serve the repo, load the landing page and the app (with
// the invite gate pre-granted), and fail on any console/page error or if the
// app shell doesn't render. Keeps the hourly self-improvement loop safe.
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

const fail = (m) => { console.error('SMOKE FAIL:', m); process.exit(1); };

await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch();
const errors = [];
try {
  const ctx = await browser.newContext();
  // pre-grant the invite gate so the app boots in CI
  await ctx.addInitScript(`try{localStorage.setItem('relay.access',JSON.stringify({grantedAt:Date.now(),via:'ci'}));}catch(e){}`);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // landing
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 30000 });
  const hasHero = await page.$('h1');
  if (!hasHero) fail('landing page has no <h1>');

  // app
  await page.goto(`http://localhost:${PORT}/app/`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1200);
  const railItems = await page.$$eval('.rail-item', (els) => els.length).catch(() => 0);
  if (railItems < 3) fail('app nav (.rail-item) did not render');

  // click through the main sections; each must render without error
  for (const sec of ['home', 'table', 'messages', 'peers', 'activity', 'settings']) {
    const el = await page.$(`.rail-item[data-sec="${sec}"]`);
    if (el) { await el.click(); await page.waitForTimeout(400); }
  }
  await page.waitForTimeout(500);

  if (errors.length) fail(errors.join('\n'));
  console.log(`SMOKE OK — landing + app render, ${railItems} nav items, no console errors.`);
} finally {
  await browser.close();
  server.close();
}
