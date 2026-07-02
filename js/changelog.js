// Changelog powering the in-app "What's new" panel. Newest first.
// The hourly self-improvement loop appends a new entry at the TOP for each
// user-visible change (bump `v`, short `title`, 1–4 `items`). Leave `ts` as an
// empty string on the new entry — the workflow stamps it with the real commit
// time so timestamps are never fabricated. `ts` is an ISO-8601 UTC string; the
// What's new panel formats it to the reader's local time (shown as CT).
export const CHANGELOG = [
  {
    v: 16,
    title: 'Landing page: sync locations',
    ts: '2026-07-02T13:28:08.306Z',
    items: [
      'The front page now shows off "bring your own backup" — sync to a local folder, S3-compatible storage, or WebDAV.',
      'The "what\'s new" highlight and page description point at it too.',
    ],
  },
  {
    v: 15,
    title: 'Sync locations: WebDAV',
    ts: '2026-07-02T13:15:04Z',
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
    items: [
      'Icon-only buttons (close, delete row, pin, icon pickers, remove invite) now announce what they do to screen readers, not just "button".',
      'Pin/unpin now reports its actual state instead of a static label.',
    ],
  },
  {
    v: 12,
    title: 'Sync locations: local folder',
    ts: '2026-07-02T10:14:53Z',
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
    items: [
      'Relay now improves itself: an hourly job builds the next roadmap item (or does a polish pass) and opens a reviewed pull request.',
      'Added a public roadmap and provider help for upcoming file-system "sync locations".',
    ],
  },
  {
    v: 7,
    title: 'Manage your tables and fields',
    ts: '2026-07-02T02:50:33Z',
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
    items: [
      'Optional rendezvous relay (a free Cloudflare Worker) lets invited people auto-connect — no copy/paste handshake.',
      'One-command deploy and one-click setup links; it only brokers the connection, never your data.',
    ],
  },
  {
    v: 4,
    title: 'Direct messages + durable peers',
    ts: '2026-07-01T23:21:36Z',
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
    items: [
      'Live peer-to-peer chat.',
      'Invite-only gate with signed invite links and an Admin area to mint them.',
    ],
  },
  {
    v: 2,
    title: 'Landing page + auto-discovery',
    ts: '2026-07-01T22:24:55Z',
    items: [
      'A proper marketing landing page at the front door.',
      'Local-mesh + WebRTC peer discovery; fixed duplicate demo records on sync.',
    ],
  },
  {
    v: 1,
    title: 'Relay is born',
    ts: '2026-07-01T21:57:49Z',
    items: [
      'A serverless, peer-to-peer collaborative table: UUID-keyed dynamic JSON rows that sync directly between browsers.',
      'Collapsible rail navigation, dark/light themes, export/import.',
    ],
  },
];

export const LATEST_VERSION = CHANGELOG[0]?.v ?? 0;
