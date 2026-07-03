// Changelog powering the in-app "What's new" panel. Newest first.
// The hourly self-improvement loop appends a new entry at the TOP for each
// user-visible change (bump `v`, short `title`, 1–4 `items`). Leave `ts` as an
// empty string on the new entry — the workflow stamps it with the real commit
// time so timestamps are never fabricated. `ts` is an ISO-8601 UTC string; the
// What's new panel formats it to the reader's local time (shown as CT).
//
// `date` is a derived, human-readable Central Time alias of `ts`, kept only for
// backward-compat with fleet consumers that read `date`. Do NOT hand-edit it —
// .github/stamp-changelog.mjs regenerates every `date` from its `ts`.
export const CHANGELOG = [
  {
    v: 25,
    title: 'Messages: per-thread unread badges',
    ts: '2026-07-03T05:18:49.083Z',
    date: 'Jul 3, 2026, 12:18 AM CT',
    items: [
      'Each DM/General thread pill now shows its own unread count, so you can tell at a glance which conversation has something new without leaving the one you\'re reading.',
      'The Messages nav badge now reflects real unread messages across every thread (and persists across reloads) instead of just resetting whenever you opened Messages.',
      'A message landing in a thread you\'re not viewing no longer rebuilds the whole panel — it just updates that thread\'s badge, so an in-progress draft in the composer is never lost.',
    ],
  },
  {
    v: 24,
    title: 'Fix: flickering/unstable Peers & Settings while auto-connect retries',
    ts: '2026-07-03T03:54:58.725Z',
    date: 'Jul 2, 2026, 10:54 PM CT',
    items: [
      'The rendezvous auto-connect relay (and each Sync location adapter) re-announced its own status even when it hadn\'t actually changed — most noticeably every ~2.5s while it retried a failed connection — causing the whole Peers or Settings panel to silently rebuild under your cursor.',
      'Status changes now only fire when the status actually changes, so those panels stay stable while you\'re clicking around.',
      'Also collapsed a redundant double-rebuild on every sharing-permission click on the Peers page.',
    ],
  },
  {
    v: 23,
    title: 'Tables: search, filter & sort',
    ts: '2026-07-03T02:19:41.300Z',
    date: 'Jul 2, 2026, 9:19 PM CT',
    items: [
      'A filter box in the table toolbar narrows rows to ones matching your search, across every field.',
      'Click a column header to sort by it — click again to reverse, a third click clears the sort.',
      'Renaming/deleting a field moved to a small pencil button in the header so it doesn’t collide with the new sort click.',
    ],
  },
  {
    v: 22,
    title: 'Sync locations: Google Drive',
    ts: '2026-07-03T01:16:15.055Z',
    date: 'Jul 2, 2026, 8:16 PM CT',
    items: [
      'Settings → Advanced → Sync locations now has a Google Drive option — click "Connect Google Drive" with just an OAuth Client ID (no client secret, ever) and approve once.',
      'A snapshot syncs to a single app-created file in your Drive on every change, same as the other sync locations (Local folder, S3, WebDAV, Dropbox) — Relay only ever sees that one file, never the rest of your Drive.',
      'If your Google session ever needs re-approving, Settings shows a one-click Reconnect instead of an error.',
    ],
  },
  {
    v: 21,
    title: 'Fix: pasting into a table cell no longer keeps rich formatting',
    ts: '2026-07-03T00:28:48.210Z',
    date: 'Jul 2, 2026, 7:28 PM CT',
    items: [
      'Pasting from Excel, Sheets, or Word into a table cell now always inserts plain text — previously the pasted fonts/colors/links stuck around visually until the table happened to fully re-render.',
    ],
  },
  {
    v: 20,
    title: 'Tables: tree navigation + record side panel',
    ts: '2026-07-03T00:01:11.370Z',
    date: 'Jul 2, 2026, 7:01 PM CT',
    items: [
      'Tables now browse like a DBeaver-style tree in a collapsible left panel — expand a table to see its fields, collapse the whole panel down to icons when you need the room.',
      'Open any row for a slide-in record editor with a proper input per field (text, number, an on/off toggle, or JSON) instead of only inline cell editing.',
      'Both panels stack full-width on mobile.',
    ],
  },
  {
    v: 19,
    title: 'Easier-to-tap star on Home',
    ts: '2026-07-02T22:57:33.306Z',
    date: 'Jul 2, 2026, 5:57 PM CT',
    items: [
      'The pin/star on each "your tables" card is bigger and easier to tap, especially on a phone.',
      'It now sits flush against the right edge of the card instead of crowding the table name.',
    ],
  },
  {
    v: 18,
    title: 'Sync locations: Dropbox',
    ts: '2026-07-02T17:36:28.172Z',
    date: 'Jul 2, 2026, 12:36 PM CT',
    items: [
      'Click-to-authorize Dropbox sync — connect with just an app key, no secrets or manual keys to copy.',
      'Uses OAuth with PKCE end to end, so nothing sensitive ever needs to live in this browser.',
      'Same backup behavior as the other sync locations: loads your latest snapshot on connect, writes a fresh one on every change.',
    ],
  },
  {
    v: 17,
    title: 'Home cards now work from the keyboard',
    ts: '2026-07-02T16:36:27.331Z',
    date: 'Jul 2, 2026, 11:36 AM CT',
    items: [
      'The quick-action tiles and "your tables" cards on Home can now be reached with Tab and activated with Enter or Space.',
      'They also show a clear focus ring, matching the rest of the app.',
    ],
  },
  {
    v: 16,
    title: 'Landing page: sync locations',
    ts: '2026-07-02T13:28:08.306Z',
    date: 'Jul 2, 2026, 8:28 AM CT',
    items: [
      'The front page now shows off "bring your own backup" — sync to a local folder, S3-compatible storage, or WebDAV.',
      'The "what\'s new" highlight and page description point at it too.',
    ],
  },
  {
    v: 15,
    title: 'Sync locations: WebDAV',
    ts: '2026-07-02T13:15:04Z',
    date: 'Jul 2, 2026, 8:15 AM CT',
    items: [
      'Settings → Advanced → "Sync locations" now has a WebDAV option — Nextcloud, ownCloud, or any self-hosted WebDAV server.',
      'Enter a server URL, username, and app password; Relay authenticates itself (no SDK, no server) and keeps a live snapshot there.',
      'Same convergence as every other sync location: it loads whatever changed on connect and re-writes a fresh snapshot after every local edit.',
      'See docs/sync-providers.md for the Nextcloud URL shape and the CORS headers your server needs.',
    ],
  },
  {
    v: 14,
    title: 'Sync locations: S3-compatible storage',
    ts: '2026-07-02T12:38:11Z',
    date: 'Jul 2, 2026, 7:38 AM CT',
    items: [
      'Settings → Advanced → "Sync locations" now has an S3-compatible option — Cloudflare R2, Backblaze B2, AWS S3, MinIO, or anything else that speaks the S3 API.',
      'Enter an endpoint, bucket, and a scoped access key; Relay signs requests itself (no SDK, no server) and keeps a live snapshot in the bucket.',
      'Same convergence as every other sync location: it loads whatever changed on connect and re-writes a fresh snapshot after every local edit.',
      'See docs/sync-providers.md for sign-up steps and the one CORS rule the bucket needs.',
    ],
  },
  {
    v: 13,
    title: 'Screen-reader polish',
    ts: '2026-07-02T11:51:41Z',
    date: 'Jul 2, 2026, 6:51 AM CT',
    items: [
      'Icon-only buttons (close, delete row, pin, icon pickers, remove invite) now announce what they do to screen readers, not just "button".',
      'Pin/unpin now reports its actual state instead of a static label.',
    ],
  },
  {
    v: 12,
    title: 'Sync locations: local folder',
    ts: '2026-07-02T10:14:53Z',
    date: 'Jul 2, 2026, 5:14 AM CT',
    items: [
      'Settings → Advanced → "Sync locations" — point Relay at a folder on your device (no credentials) and it keeps a live snapshot there.',
      'Reopening the app (or a peer opening theirs) pulls in whatever changed, even if no one was online at the same time.',
      'Tip: pick a folder your Dropbox / Google Drive / iCloud desktop app already syncs, for free cross-device backup.',
      'First of several planned sync-location adapters — S3, WebDAV, and Dropbox/Drive are next.',
    ],
  },
  {
    v: 11,
    title: 'Calmer Peers page',
    ts: '2026-07-02T08:11:40Z',
    date: 'Jul 2, 2026, 3:11 AM CT',
    items: [
      'Each peer now shows one simple control — Everything / Custom / Nothing — instead of a full grid of toggles.',
      '"Custom" opens a per-table sharing grid only when you need it.',
      'Online and saved/offline peers are now grouped separately, so the page stays scannable as your network grows.',
    ],
  },
  {
    v: 10,
    title: 'Landing page refresh',
    ts: '2026-07-02T06:24:53Z',
    date: 'Jul 2, 2026, 1:24 AM CT',
    items: [
      'The front page now actually shows what Relay can do: invite-only access, live P2P chat, and on-the-fly table/field management.',
      'A "what\'s new" highlight links straight into the app.',
      'Sections gently fade in as you scroll.',
    ],
  },
  {
    v: 9,
    title: 'What\'s new panel',
    ts: '2026-07-02T04:04:16Z',
    date: 'Jul 1, 2026, 11:04 PM CT',
    items: [
      'This panel — a searchable, slide-in changelog with a version badge and timestamp for every update.',
      'A dot appears on the ✨ button when there\'s something you haven\'t seen yet.',
      'Fully usable on mobile (full-height sheet).',
    ],
  },
  {
    v: 8,
    title: 'Autonomous improvement + roadmap',
    ts: '2026-07-02T04:04:16Z',
    date: 'Jul 1, 2026, 11:04 PM CT',
    items: [
      'Relay now improves itself: an hourly job builds the next roadmap item (or does a polish pass) and opens a reviewed pull request.',
      'Added a public roadmap and provider help for upcoming file-system "sync locations".',
    ],
  },
  {
    v: 7,
    title: 'Manage your tables and fields',
    ts: '2026-07-02T02:50:33Z',
    date: 'Jul 1, 2026, 9:50 PM CT',
    items: [
      'Rename a table, change its icon, or delete it from "Edit table".',
      'Click any column header to rename or delete that field across all rows.',
      'Deletes propagate to peers and stay deleted — no resurrection.',
    ],
  },
  {
    v: 6,
    title: 'Sync just works now',
    ts: '2026-07-02T02:30:59Z',
    date: 'Jul 1, 2026, 9:30 PM CT',
    items: [
      'Everything syncs automatically: on connect it pulls the whole workspace down, and edits push live.',
      'Removed the manual Sync buttons — the top bar now shows "N online · live" so you can trust it.',
      'A quiet background reconcile keeps peers converged.',
    ],
  },
  {
    v: 5,
    title: 'Auto-connect across the internet',
    ts: '2026-07-02T01:10:09Z',
    date: 'Jul 1, 2026, 8:10 PM CT',
    items: [
      'Optional rendezvous relay (a free Cloudflare Worker) lets invited people auto-connect — no copy/paste handshake.',
      'One-command deploy and one-click setup links; it only brokers the connection, never your data.',
    ],
  },
  {
    v: 4,
    title: 'Direct messages + durable peers',
    ts: '2026-07-01T23:21:36Z',
    date: 'Jul 1, 2026, 6:21 PM CT',
    items: [
      '1:1 private message threads alongside the broadcast room.',
      'Your peers and their permissions now survive reloads and updates.',
      'Invite links can be revoked; the app got a proper mobile nav drawer.',
    ],
  },
  {
    v: 3,
    title: 'Messaging + invite-only access',
    ts: '2026-07-01T22:41:22Z',
    date: 'Jul 1, 2026, 5:41 PM CT',
    items: [
      'Live peer-to-peer chat.',
      'Invite-only gate with signed invite links and an Admin area to mint them.',
    ],
  },
  {
    v: 2,
    title: 'Landing page + auto-discovery',
    ts: '2026-07-01T22:24:55Z',
    date: 'Jul 1, 2026, 5:24 PM CT',
    items: [
      'A proper marketing landing page at the front door.',
      'Local-mesh + WebRTC peer discovery; fixed duplicate demo records on sync.',
    ],
  },
  {
    v: 1,
    title: 'Relay is born',
    ts: '2026-07-01T21:57:49Z',
    date: 'Jul 1, 2026, 4:57 PM CT',
    items: [
      'A serverless, peer-to-peer collaborative table: UUID-keyed dynamic JSON rows that sync directly between browsers.',
      'Collapsible rail navigation, dark/light themes, export/import.',
    ],
  },
];

export const LATEST_VERSION = CHANGELOG[0]?.v ?? 0;
