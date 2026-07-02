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
1. **Sync locations — remaining adapters.** Phase 1 (local folder) is done —
   see Done below. Next adapters, same `js/storage/` contract (`isSupported`,
   `connect`/`reconnect`/`disconnect`/`autostart`, `state`, snapshot merge via
   `Store.import(json,{merge:true})`, debounced write via `Store.export()`):
   1. **S3-compatible** (Cloudflare R2 / Backblaze B2 / AWS S3) via signed
      `fetch` (SigV4) — key id + secret + bucket + endpoint.
   2. **WebDAV** (Nextcloud, etc.) — URL + user + pass.
   3. **Dropbox / Google Drive** (OAuth) — heavier; do last.
   Settings → Advanced already hosts the "Sync locations" section; add each
   adapter as its own sub-card there. See `docs/sync-providers.md` for the
   signup/keys help to link from the UI. Note the client-side-credentials caveat
   in the UI.
2. **Tree / side-panel table navigation.** A DBeaver-style but *sexier* browse
   experience: a collapsible tree of entities (and, expandable, their fields) in
   a secondary left panel; selecting a row opens an animated **record editor in a
   right-hand side panel** (field-by-field, typed inputs) instead of only inline
   cell editing. Panels resizable, readable, and responsive (stack on mobile).
3. **Keep the public site sexy.** Periodically refresh the landing page (`/`) to
   showcase current features — updated screenshots, subtle animations, short
   loops/GIFs, feature highlights. It should always reflect what the app can do.

## Next
- Per-thread unread counts in Messages.
- Column types / simple validation (text, number, bool, date, select) with nicer editors.
- Sort & filter rows; search within a table.
- Presence cursors / "who's viewing this table".
- Import CSV → new entity.
- TURN fallback guidance for strict NATs.
- Optional "always-on peer" (headless) for 24/7 availability without a DB.

## Later
- End-to-end encryption of records at rest / in transit beyond DTLS.
- Conflict view (show competing edits) instead of silent LWW.
- Multiple workspaces / workspace switcher.

## Done
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
