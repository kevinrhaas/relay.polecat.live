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
1. **Keep the public site sexy.** Periodically refresh the landing page (`/`) to
   showcase current features — updated screenshots, subtle animations, short
   loops/GIFs, feature highlights. It should always reflect what the app can do.

## Next
- The row-selection checkboxes (`selected` in `js/views/table.js`) now power
  both bulk delete and bulk export. Natural next step on the same selection:
  bulk-set a single field's value across every checked row (e.g. mark a batch
  of rows "Done" in one action instead of editing each cell).
- Google Drive sync's silent token renewal (`prompt:''`) depends on an active
  Google session + third-party-cookie access to accounts.google.com — Safari
  ITP or strict Firefox cookie blocking will force a "needs permission" state
  more often than Dropbox's refresh-token flow does. Falls back to a one-click
  Reconnect, but worth watching for complaints.
- Optional "always-on peer" (headless) for 24/7 availability without a DB.

## Later
- End-to-end encryption of records at rest / in transit beyond DTLS.
- Conflict view (show competing edits) instead of silent LWW.
- Multiple workspaces / workspace switcher.

## Done
- 2026-07-03 — Bulk-export selected rows to CSV: the bulk-select action bar
  (added alongside the bulk-delete feature) gained an "Export selected"
  button next to "Delete selected". Reuses `exportCsv()` — now accepting an
  optional row list — against the checked rows instead of the toolbar's
  filtered/sorted view, so pulling out a handful of flagged rows no longer
  requires exporting (or filtering down to) the whole table first. The
  downloaded filename gets a `_selected` suffix so it's distinguishable from
  a full-table export of the same table. Added a smoke check that selects two
  rows, exports, and verifies the downloaded CSV contains exactly those rows.
- 2026-07-03 — Bulk-select and delete rows: every row in the table grid now has
  a checkbox (plus a header "select all" that respects whatever filter/sort is
  active), and checking one or more shows a "Delete selected" action bar with a
  live count — the only way to remove several rows used to be one confirm
  dialog per row. Deletes still tombstone individually via a new
  `Store.removeMany()` (single persist/emit for the batch, same pattern as
  `upsertMany()`), so they propagate to peers exactly like a single-row delete.
  Selection is ephemeral UI state (module-scoped, not persisted), cleared on
  entity switch and pruned against live records so a peer deleting a selected
  row elsewhere never leaves a stale checkbox. While building this, found and
  fixed a real pre-existing mobile bug: `.table-shell`'s `align-items:flex-start`
  (needed for the desktop side-by-side tree/table layout) was left in place
  when the layout stacks to a single column under 720px, so the table column's
  width shrink-to-fit the wide data grid instead of the viewport — pushing the
  toolbar's rightmost buttons (and now the bulk-delete button) off-canvas with
  no way to reach them. Mobile now overrides it to `align-items:stretch`, and
  the toolbar/bulk-bar wrap onto multiple lines within the actual viewport
  width instead. Added two smoke checks: one exercising select-all/partial-
  select/bulk-delete end to end, one asserting the toolbar and bulk bar stay
  within the viewport at a 390px mobile width.
- 2026-07-03 — Landing page refresh: the hero screenshot and copy hadn't kept
  pace with several recent shipped features (per-table live presence, CSV
  export, typed/dropdown fields with sort). Re-captured the hero shot to show
  the current Tables view mid-sort on a dropdown-typed column, with the
  "Export CSV" button and a live presence badge (a peer avatar next to the
  table name and in the tree row, plus the topbar online count) all visible
  at once. Swapped the hero "what's new" pill from the now-old CSV-import
  callout to live presence, and touched up three feature cards ("Dynamic JSON
  tables", "Live chat & presence", "Yours to keep") plus the meta/OG
  descriptions to mention typed fields, sort/filter, per-table presence, and
  CSV export alongside import.
- 2026-07-03 — Chunked CSV import for large files: confirming an import used to
  run every row through `Store.upsert` (a full workspace persist + re-render
  event, one per row) in a single synchronous pass — flagged as a known risk
  in this file, since a very large CSV (tens of thousands of rows) would both
  freeze the tab for the whole import and get progressively slower per row as
  the table grew. `openImportPreview` in `js/views/table.js` now processes
  rows in fixed-size (300-row) chunks via a new `Store.upsertMany()` (one
  persist/emit per chunk instead of per row), yielding to the main thread
  (`await new Promise(r=>setTimeout(r,0))`) between each chunk so the tab
  stays responsive no matter the file size. The "Import N rows" button
  disables and a small progress bar + live "Importing X/Y rows…" label (new
  `.import-progress-*` styles) show for the duration; Cancel disables too
  since the table's already been created and partially populated by that
  point. Added a smoke check that imports a 6000-row CSV, confirms the
  progress bar advances (and the button stays disabled) across two
  back-to-back reads — deterministic thanks to the HTML spec's nested-
  `setTimeout` clamp, not a timing guess — then verifies every row lands
  correctly once the import finishes.
- 2026-07-03 — TURN server fallback for strict NATs: Settings → Advanced gained
  a TURN server field (URL, username, credential) alongside the existing STUN
  field. STUN alone can't traverse symmetric NATs or many corporate/campus
  firewalls, which left WebRTC invites and rendezvous auto-discovery unable to
  connect in those environments with no way to recover. `Sync._iceServers()`
  (shared by manual invites, `rendezvous.js`, and `Sync.rtcConfig()`) now
  appends the configured TURN server to the ICE server list whenever a URL is
  set; the relay only ever sees the already-DTLS-encrypted data channel, never
  plaintext records. Persisted the same way as the STUN setting
  (`localStorage`), left blank by default. Added a smoke check that fills in
  the fields, saves, and verifies both the persisted values and that
  `Sync.rtcConfig().iceServers` carries the TURN entry with credentials.
- 2026-07-03 — Presence: "who's viewing this table". Every peer currently
  looking at a table now shows as a small live avatar badge — in the Tables
  tree row for that entity, and next to the table name in the toolbar.
  Hovering lists names; it updates instantly as peers open, switch, or close
  a table, and clears the moment they navigate away or drop offline. This is
  a purely ephemeral signal (`Sync.setViewing()`/`viewersOf()` in `js/sync.js`)
  broadcast over the existing mesh/WebRTC transports as a new lightweight
  `presence` message (also piggybacked on the periodic `hello`/`welcome`
  heartbeat so a late-joining peer learns the current view immediately) —
  nothing is written to the Store or synced as data. `js/views/table.js`
  paints the badges in place via a targeted `Sync.on('peers', …)` listener
  (same pattern as the Messages thread-pill live-patch) so it never disturbs
  an in-progress filter/edit with a full re-render. Added a smoke check that
  injects a synthetic peer's presence messages straight through `Sync`'s real
  routing (two same-origin tabs would collide on identity, since they'd share
  `localStorage`) and confirms both badges appear and clear on departure.
- 2026-07-03 — CSV import per-column field types: the import preview modal
  (`openImportPreview` in `js/views/table.js`) now shows a Type picker
  (Auto/Text/Number/Yes-No/Date/Dropdown — the same `FIELD_TYPES` list used
  everywhere else) for every column, instead of only ever running the
  value-based auto-typing rules. A new `suggestColumnType()` pre-selects
  Dropdown, with its options filled in, for any column that looks like a
  short repeated set of string values (2–8 distinct values, each repeating
  on average) — an all-boolean or all-numeric column is left on Auto since
  those already type themselves correctly. Confirming the import now runs
  each column through `coerceImportValue()` (explicit types bypass
  `inferValue`'s guessing — e.g. forcing Text keeps `"007"`-style values as
  strings) and calls `Store.setFieldType()` for any column left off Auto, so
  imported dropdowns/dates/booleans get the same dedicated grid + record-panel
  editors as a manually-typed field. Added a smoke check that imports a CSV
  with a repeated "status" column and an all-numeric "age" column, confirms
  the preview suggests Dropdown with the right options for the former and
  leaves the latter on Auto, overrides "age" to Text, and verifies both the
  stored field types and values after import.
- 2026-07-03 — Keyboard-focus polish: two icon-only buttons that only revealed
  themselves on mouse hover — a table row's delete (trash) button and a
  tree-panel field-name button (`.row-actions`, `.tree-field` in
  `css/styles.css`) — were invisible to keyboard users, since `opacity:0`
  had no `:focus-visible` counterpart to the existing `:hover` rule (every
  other icon-only trigger in the app, e.g. `.col-edit-btn`, already had one).
  Tabbing to either now reveals it with the same focus ring used everywhere
  else (`var(--ring)`). Verified by driving real Tab-key navigation in a
  headless browser and screenshotting the focused state — no smoke check
  added since this is pure CSS with no new behavior for `.github/smoke-test.mjs`
  to exercise beyond what already passes.
- 2026-07-03 — Column types with nicer editors: any field can now be given an
  explicit type — Text, Number, Yes/No, Date, or Dropdown (fixed list of
  options) — from the field's edit modal (column header's pencil icon, or the
  tree panel's field list) or right when adding a new field. An explicit type
  overrides the previous purely value-based guessing and swaps in a dedicated
  control in both the table grid and the record side-panel: a toggle for
  Yes/No, a native `<input type=date>` for Date, and a `<select>` for
  Dropdown (prepending the field's current value as an extra option if it
  isn't in the configured list, so retyping a field never silently drops
  data). Number fields keep the grid's plain-text cell but now validate on
  commit — non-numeric input is rejected with a toast and the cell reverts,
  instead of silently coercing to a string. "Auto" (the default, unset) keeps
  the exact original behavior of inferring the editor from whatever value is
  present. Field types are entity-level metadata (`Store.fieldTypes`,
  alongside label/icon) so they sync to peers the same way, and survive
  rename/delete-field. A small badge on the column header shows a field's
  type. Added seven smoke checks covering boolean/dropdown/number/date field
  creation through the UI, persistence, the record panel rendering matching
  controls, and clearing a type back to Auto.
- 2026-07-03 — Confirm before disconnecting a sync location: every other
  destructive action in the app (delete row/table/field, revoke/remove invite,
  reset workspace) goes through the shared `confirmDialog`, but the six
  "Disconnect" buttons in Settings → Advanced (rendezvous, local folder, S3,
  WebDAV, Dropbox, Google Drive) fired immediately on click — a stray tap
  could drop a configured connection and force re-entering credentials or
  re-authorizing. All six now confirm first, with a message naming what gets
  lost. Also gave the WebRTC invite modal's "Join with invite" tab an
  autofocus on its offer textarea (every other modal/sheet with an input
  already autofocuses it; this one was the odd one out, leaving users to
  click before they could paste). Updated the five existing sync-location
  disconnect smoke checks to click through the new confirm step, and added a
  smoke check for the invite-modal autofocus.
- 2026-07-03 — Drag-to-resize the Tables tree panel: the left-hand tree/
  side-panel (entities + fields) was collapsible but fixed at 220px, which
  cramped long table or field names. A drag handle on its right edge (mirrors
  the rail nav's own resize handle in `js/shell.js`) now lets it stretch from
  180px to 420px; double-clicking the handle snaps back to the 220px default.
  Width is persisted to `localStorage` (`relay.tree.width`) and restored on
  reload, same pattern as the rail's width. Disabled on mobile (≤720px) where
  the panel is already forced full-width above the table. Added a smoke check
  that drags the handle and verifies both the rendered width and the
  persisted value change together.
- 2026-07-03 — CSV export: an "Export CSV" button in the Tables toolbar
  downloads the current table as a `.csv` file — same field columns CSV
  import creates (no `id`/meta columns), and it honors whatever filter/sort
  is currently applied so the download always matches what's on screen.
  Values round-trip through the same typing rules as inline edits/import
  (`inferValue`/`cellText`), and fields containing a comma, quote, or newline
  are quoted per RFC4180. Refactored the row-filter/sort logic `refreshRows`
  already had into a shared `visibleRows()` so export can't drift from the
  on-screen view. Added a smoke check that exports the sorted smoke table
  and verifies the downloaded file's header and row order.
- 2026-07-03 — Landing page refresh: copy and the hero screenshot were stale
  (the shot still showed the old horizontal entity tabs, pre-dating the
  tree/side-panel navigation; "what's new" and the meta description only
  mentioned local folder/S3/WebDAV backups, missing Dropbox and Google Drive).
  Re-captured the app screenshot to show the current Tables view — collapsible
  tree with an expanded table's fields, the live row filter box, and the
  "Edit table" affordance. Hero "what's new" pill, meta/OG description, and
  the "Yours to keep" / "Bring your own backup" feature cards now reflect CSV
  import and the full five-provider backup lineup (local folder, S3, WebDAV,
  Dropbox, Google Drive).
- 2026-07-03 — Import CSV → new table. A new upload-icon button next to "New
  table" in the Tables tree header opens a file picker; the CSV is parsed
  client-side (a small RFC4180-ish parser handling quoted fields, embedded
  commas/newlines, and `""` escapes — no library), then a preview modal shows
  the detected field names, row/field counts, and the first 5 rows alongside
  an editable table-name field (defaulted from the filename). Confirming
  creates the entity and upserts every row, reusing the same auto-typing
  rules inline cell edits already use (booleans, numbers, JSON, else string)
  — refactored that logic out of `commitCell` into a shared `inferValue()` so
  both paths stay in sync. Added a smoke check that imports a 2-row CSV and
  verifies both the tree entry and the typed field values in the store.
- 2026-07-03 — Per-thread unread counts in Messages: each thread pill (General
  and every DM) now shows its own unread badge, computed from a persisted
  per-thread last-read timestamp (`Sync.markRead`/`unreadCount`/`totalUnread`
  in `js/sync.js`, `localStorage['relay.chat-read.v1']`) rather than a
  session-only counter — the Messages nav badge is now just the sum across
  threads, so it survives reloads and reflects reality instead of resetting
  whenever you glanced at the section. Also fixed a real rough edge this
  surfaced: a message landing in a thread you weren't viewing used to
  trigger a full `renderMessages()` re-render (dropping any in-progress
  composer draft) — it now only patches that thread's pill badge in place.
  Added a smoke check covering both the per-thread badge and the nav total.
- 2026-07-03 — Fixed the flaky smoke check (`"Custom" expands the per-table
  grid and toggles persist`, ~1 in 3 local runs, "Element is not attached to
  the DOM") and its real-world cause: every sync-location adapter's `_set(s)`
  state helper (`js/rendezvous.js`, `js/storage/*.js`) unconditionally
  emitted `'state'` even when the state hadn't changed. `Rendezvous._open()`'s
  2500ms auto-reconnect retry loop re-enters `'connecting'` twice per attempt
  (once from `_open()`, once from its own `onclose` handler), and each emit
  triggers a full re-render of whatever section is open (`js/app.js`) — so a
  user sitting on Peers or Settings while a connection retries got the whole
  panel silently rebuilt under them roughly every 1.25s, which is exactly
  what raced Playwright's click-stability check. All six `_set()` helpers now
  no-op when the incoming state equals the current one. Separately collapsed
  a real (smaller) redundant double-render in `js/views/peers.js`: permission
  toggles called `Sync.setPerm`/`setAllPerms` (which already emits `'perms'`
  and triggers a re-render via `js/app.js`) and then *also* called their own
  local `rerender()` — now a single render path per click, with the
  `expanded`-set mutation reordered before the emit-triggering call so the
  synchronous re-render sees the right expand/collapse state. 10/10 clean
  local smoke runs after the fix (was failing roughly 1 in 3 before).
- 2026-07-03 — Sort & filter rows; search within a table. Tables toolbar gained
  a live filter box (matches any field value or the row id, case-insensitive)
  that only rebuilds the row area — the input never loses focus or cursor
  position, even across a remote sync landing mid-keystroke. Column headers
  are now click-to-sort (asc → desc → unsorted, typed comparison for
  numbers/booleans/text) with a direction indicator; the previous "click
  header to rename" affordance moved to a small dedicated edit-pencil button
  in the header so sort and rename don't collide. Added smoke checks for
  both.
- 2026-07-03 — Sync locations, phase 5 (final adapter): Google Drive. Unlike
  Dropbox, Google requires a client secret for its redirect-based
  authorization-code flow even with PKCE on "Web application" credentials —
  there's no truly secret-free redirect option for a static site — so this
  adapter instead uses Google Identity Services' token model: click-to-
  authorize with just an OAuth Client ID, a short-lived (1hr) access token
  with no secret, and silent (`prompt:''`) renewal whenever it's stale, which
  succeeds without any UI as long as the browser still has an active Google
  session and prior consent. Falls back to a one-click Reconnect (rather than
  a hard error) if silent renewal fails. Same connect-on-load / debounced-
  write-on-change / LWW-merge contract as the other four adapters. New
  `js/storage/google-drive.js`; `docs/sync-providers.md` §4 rewritten from
  "planned" to real setup steps (Cloud Console → OAuth client ID → Drive
  API); added three smoke checks stubbing `google.accounts.oauth2` and the
  Drive REST endpoints.
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
