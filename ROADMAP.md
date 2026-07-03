# Relay — roadmap

The living plan the hourly self-improvement loop works from. Keep it honest:
when you finish something, move it to **Done** with the date; add discoveries to
**Next**.

## Principles
- **Lean:** vanilla HTML/CSS/JS, no build, no framework, no runtime deps.
- **Serverless & private by default.** Peer-to-peer; optional relay only brokers
  connections, never data.
- **Elegant, simple, understandable.** Strong design taste. Motion and flow are
  welcome, but never at the cost of clarity.
- **Mobile-first responsiveness.** Every panel must be readable and adaptable on
  a phone.
- **Sync-safe.** Anything that changes shared state must converge across peers
  (last-writer-wins; deletes use tombstones; entity/field ops sync).

## Now (highest value first)
1. **Google Drive sync location** (OAuth) — the last planned `js/storage/`
   adapter (Dropbox is done, see Done below). Same contract (`isSupported`,
   `connect`/`reconnect`/`disconnect`/`autostart`, `state`, snapshot merge via
   `Store.import(json,{merge:true})`, debounced write via `Store.export()`).
   Use an OAuth Client ID (Web) + the `drive.file` scope (limits access to
   files Relay itself creates — no broad Drive permission, no Google
   app-verification review needed). See `docs/sync-providers.md` §4.
2. **Keep the public site sexy.** Periodically refresh the landing page (`/`) to
   showcase current features — updated screenshots, subtle animations, short
   loops/GIFs, feature highlights. It should always reflect what the app can do.

## Next
- Per-thread unread counts in Messages.
- Drag-to-resize the Tables tree panel (currently collapsible but fixed-width).
- Column types / simple validation (text, number, bool, date, select) with nicer editors.
- Sort & filter rows; search within a table.
- Presence cursors / "who's viewing this table".
- Import CSV → new entity.
- TURN fallback guidance for strict NATs.
- Optional "always-on peer" (headless) for 24/7 availability without a DB.
- Flaky smoke check: `"Custom" expands the per-table grid and toggles persist`
  intermittently fails with "Element is not attached to the DOM" (~1 in 3 local
  runs, reproduces on plain `main` too — not caused by any single feature).
  Suspect: the permission-toggle `onclick` in `js/views/peers.js` calls
  `Sync.setPerm`/`setAllPerms` (which synchronously emits `'perms'`, and
  `js/app.js`'s listener does a full section re-render since we're always on
  the peers section when this fires) *and then* calls its own local
  `rerender()` right after — a redundant double full-rebuild of `.peer` on
  every click that likely races Playwright's click-stability check. Worth
  collapsing to a single render path (careful: the `expanded` set mutation
  order relative to the emit matters for correctness).

## Later
- End-to-end encryption of records at rest / in transit beyond DTLS.
- Conflict view (show competing edits) instead of silent LWW.
- Multiple workspaces / workspace switcher.

## Done
- 2026-07-03 — Fixed a table-cell editing rough edge: pasting into an editable
  cell (e.g. from Excel, Google Sheets, or Word) now always inserts plain text.
  Previously the browser's default rich paste kept the source's fonts/colors/
  links in the cell's DOM — `commitCell` only ever reads `textContent` back out
  for storage, so the *stored* value was fine, but the cell kept looking
  formatted (bold, colored, etc.) until the table happened to fully re-render.
  Added a smoke check that pastes HTML+plaintext clipboard data into a cell and
  asserts only the plain text lands.
- 2026-07-02 — Tree / side-panel table navigation: the horizontal entity tabs
  are now a collapsible left-hand tree (DBeaver-style) — each table expands to
  list its fields inline (click one to rename/delete it), and the whole panel
  collapses to a slim icon rail to reclaim space. Opening a row (new expander
  button per row) slides in a right-hand record editor with typed, field-by-
  field inputs (text/number/boolean toggle/JSON) instead of only inline cell
  editing; inline cell editing still works too. Both panels stack full-width on
  mobile. Also bumped the generic modal's z-index above the slide-in sheet so a
  confirm dialog (e.g. "Delete row" from the new record panel) never renders
  hidden behind an open sheet.
- 2026-07-02 — CI reliability: the hourly smoke suite was silently dialing out
  to the real, live production rendezvous room on every run (the app
  auto-joins the baked-in default room on boot — see `js/config.js`), merging
  in shared peer data and re-broadcasting each run's never-cleaned-up fixture
  entities right back into it. Once a fixture name landed in the shared room,
  every later run's `Store.createEntity()` for that same name collided with
  itself, which is what was intermittently failing CI (4 of the last 7 hourly
  runs). `.github/smoke-test.mjs` now stubs `WebSocket` so the suite never
  touches the live relay — hermetic and deterministic regardless of the
  runner's network. Also deleted the one stray fixture entity my local
  repro had synced into the shared room while diagnosing this.
- 2026-07-02 — Bumped the pin/star button's hit area on Home's "your tables"
  cards from ~24px to 40px and right-aligned it flush with the card edge
  (previously it trailed directly after the label with no separation).
- 2026-07-02 — Sync locations, phase 4: Dropbox via OAuth 2.0 + PKCE — click
  "Connect Dropbox" with just an app key (no client secret, ever) and approve
  once; Relay handles the redirect, token exchange, and silent refresh from
  then on. Same connect-on-load / debounced-write-on-change contract as the
  other adapters, so it converges the same way. `docs/sync-providers.md`
  updated with app-creation and redirect-URI setup steps.
- 2026-07-02 — Accessibility: Home's clickable cards (quick actions, "your
  tables" entries) are now reachable and activatable from the keyboard —
  `role="button"`, `tabindex="0"`, Enter/Space handling, and a focus-visible
  ring. Previously these were `<div onclick>` with no way to reach or trigger
  them without a mouse/touch.
- 2026-07-02 — Landing page: added a "Bring your own backup" feature card
  covering the local-folder / S3 / WebDAV sync locations, refreshed the hero
  "what's new" pill and meta description to match (previously only mentioned
  invite-only access and messaging, which had since been superseded by
  bigger features).
- 2026-07-02 — Sync locations, phase 3: WebDAV (Nextcloud, ownCloud, any
  self-hosted WebDAV server) via HTTP Basic auth `fetch` — no SDK, no server.
  Settings → Advanced → "Sync locations" gained a WebDAV sub-card (server URL,
  username, app password); same connect-on-load / debounced-write-on-change
  contract as the local-folder and S3 adapters, so it converges the same way.
  `docs/sync-providers.md` updated with the Nextcloud URL shape and CORS note.
- 2026-07-02 — Sync locations, phase 2: S3-compatible object storage (Cloudflare
  R2, Backblaze B2, AWS S3, MinIO...) via signed `fetch` requests (AWS SigV4,
  computed locally with Web Crypto — no SDK, no server). Settings → Advanced →
  "Sync locations" gained an S3-compatible sub-card (endpoint, bucket, region,
  access key id, secret, optional prefix); same connect-on-load /
  debounced-write-on-change contract as local folder sync, so it converges the
  same way. `docs/sync-providers.md` updated with the exact UI location.
- 2026-07-02 — Accessibility: icon-only buttons (modal close, delete row, pin,
  icon pickers, remove invite) now carry `aria-label`/`title` so screen readers
  announce their purpose instead of just "button"; pin/unpin state is announced
  via `aria-pressed` and updates live.
- 2026-07-02 — Sync locations, phase 1: local folder sync via the File System
  Access API (no credentials). Pluggable adapter interface in `js/storage/`;
  Settings → Advanced → "Sync locations" to connect a folder, which loads its
  snapshot on connect (LWW merge) and writes a fresh one on every local change
  (debounced), so a workspace stays backed up / reachable even with no peers
  online — point it at a Dropbox/Drive/iCloud-synced folder for free cross-
  device backup.
- 2026-07-02 — Simplified the Peers page: compact per-peer "Sharing: Everything / Custom / Nothing" control replaces the always-visible per-entity toggle grid, which now lives behind "Custom"; online/offline peers grouped separately.
- 2026-07-02 — Landing page refresh: copy now reflects messaging, invite-only access, and table/field management; added a "what's new" highlight pill and subtle scroll-reveal motion.
- 2026-07-02 — "What's new" changelog panel (slide-in, searchable, CT timestamps, mobile).
- 2026-07-02 — Hourly self-improvement loop (this file + `.github/`).
- 2026-07-02 — Table + field management (rename/delete, tombstone sync).
- 2026-07-02 — Auto-sync on connect + periodic reconcile; removed manual Sync buttons.
- 2026-07-02 — Default rendezvous relay; one-command deploy + `?rdv=` setup links.
- 2026-07-01 — 1:1 DMs; durable peers/permissions; invite revocation; mobile drawer; icon fixes.
- 2026-07-01 — P2P messaging; invite-only gate + admin area.
- 2026-07-01 — Marketing landing page; rendezvous auto-discovery; duplicate-records fix.
- 2026-07-01 — Initial serverless P2P collaborative-table app.
