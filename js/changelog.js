// Changelog powering the in-app "What's new" panel. Newest first.
// The hourly self-improvement loop appends a new entry at the TOP for each
// user-visible change (bump `v`, short `title`, today's date, 1–4 `items`).
export const CHANGELOG = [
  {
    v: 9,
    title: 'What\'s new panel',
    date: 'Jul 2, 2026, 9:40 PM CT',
    items: [
      'This panel — a searchable, slide-in changelog with a version badge and timestamp for every update.',
      'A dot appears on the ✨ button when there\'s something you haven\'t seen yet.',
      'Fully usable on mobile (full-height sheet).',
    ],
  },
  {
    v: 8,
    title: 'Autonomous improvement + roadmap',
    date: 'Jul 2, 2026, 9:20 PM CT',
    items: [
      'Relay now improves itself: an hourly job builds the next roadmap item (or does a polish pass) and opens a reviewed pull request.',
      'Added a public roadmap and provider help for upcoming file-system "sync locations".',
    ],
  },
  {
    v: 7,
    title: 'Manage your tables and fields',
    date: 'Jul 2, 2026, 8:55 PM CT',
    items: [
      'Rename a table, change its icon, or delete it from "Edit table".',
      'Click any column header to rename or delete that field across all rows.',
      'Deletes propagate to peers and stay deleted — no resurrection.',
    ],
  },
  {
    v: 6,
    title: 'Sync just works now',
    date: 'Jul 2, 2026, 8:30 PM CT',
    items: [
      'Everything syncs automatically: on connect it pulls the whole workspace down, and edits push live.',
      'Removed the manual Sync buttons — the top bar now shows "N online · live" so you can trust it.',
      'A quiet background reconcile keeps peers converged.',
    ],
  },
  {
    v: 5,
    title: 'Auto-connect across the internet',
    date: 'Jul 2, 2026, 7:10 PM CT',
    items: [
      'Optional rendezvous relay (a free Cloudflare Worker) lets invited people auto-connect — no copy/paste handshake.',
      'One-command deploy and one-click setup links; it only brokers the connection, never your data.',
    ],
  },
  {
    v: 4,
    title: 'Direct messages + durable peers',
    date: 'Jul 1, 2026, 11:30 PM CT',
    items: [
      '1:1 private message threads alongside the broadcast room.',
      'Your peers and their permissions now survive reloads and updates.',
      'Invite links can be revoked; the app got a proper mobile nav drawer.',
    ],
  },
  {
    v: 3,
    title: 'Messaging + invite-only access',
    date: 'Jul 1, 2026, 10:05 PM CT',
    items: [
      'Live peer-to-peer chat.',
      'Invite-only gate with signed invite links and an Admin area to mint them.',
    ],
  },
  {
    v: 2,
    title: 'Landing page + auto-discovery',
    date: 'Jul 1, 2026, 6:40 PM CT',
    items: [
      'A proper marketing landing page at the front door.',
      'Local-mesh + WebRTC peer discovery; fixed duplicate demo records on sync.',
    ],
  },
  {
    v: 1,
    title: 'Relay is born',
    date: 'Jul 1, 2026, 5:00 PM CT',
    items: [
      'A serverless, peer-to-peer collaborative table: UUID-keyed dynamic JSON rows that sync directly between browsers.',
      'Collapsible rail navigation, dark/light themes, export/import.',
    ],
  },
];

export const LATEST_VERSION = CHANGELOG[0]?.v ?? 0;
