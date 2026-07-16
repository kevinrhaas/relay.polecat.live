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
    v: 65,
    title: 'Landing page shows the new look',
    ts: '2026-07-16T02:49:17.331Z',
    date: 'Jul 15, 2026, 9:49 PM CT',
    items: [
      'The homepage hero screenshot now shows the app in its new Polecat Shell chrome — same Ctrl+K global search scene, fresh frame.',
    ],
  },
  {
    v: 64,
    title: 'Relay joins the Polecat Shell — app switcher, palettes, richer What\'s new',
    ts: '2026-07-15T20:52:34.822Z',
    date: 'Jul 15, 2026, 3:52 PM CT',
    items: [
      'The app frame (navigation rail, top bar, mobile drawer) now comes from the shared Polecat Shell used across the polecat.live suite — same drag-to-resize rail, now with the fleet\'s polish.',
      'New app-switcher waffle in the top bar jumps straight to any other Polecat app.',
      'Pick a color palette in Settings — Polecat (Relay\'s classic amber), Aurora, or Neon — alongside the existing dark/light/system modes. Your saved theme carries over.',
      'What\'s new moved into a slide-in panel with search and feature/polish/fix filters.',
    ],
  },
  {
    v: 63,
    title: 'Keyboard shortcuts help panel',
    ts: '2026-07-04T18:52:53.191Z',
    date: 'Jul 4, 2026, 1:52 PM CT',
    items: [
      'Press "?" anywhere (or click the new keyboard icon in the topbar) to see every shortcut the app supports, grouped by area.',
      'Covers global search, grid navigation and editing, drag-to-reorder, and messages.',
      '"?" only opens the panel when you\'re not typing in a field, so it never interrupts text entry.',
    ],
  },
  {
    v: 62,
    title: 'Ctrl+Arrow to navigate out of dropdown, date, and link cells',
    ts: '2026-07-04T18:23:04.712Z',
    date: 'Jul 4, 2026, 1:23 PM CT',
    items: [
      'Grid keyboard navigation now reaches every cell type: hold Ctrl (Cmd on Mac) with an arrow key to jump to the next cell from a dropdown, date, or linked-record cell.',
      'A plain arrow key still does what it always did in those cells — cycles a dropdown\'s value or nudges a date segment — so nothing native is lost.',
      'The multi-link "+ Link" button now also joins the other cell types in a plain arrow key moving you straight to the next cell.',
    ],
  },
  {
    v: 61,
    title: 'Keyboard navigation in the table grid',
    ts: '2026-07-04T17:40:25.643Z',
    date: 'Jul 4, 2026, 12:40 PM CT',
    items: [
      'Arrow keys now move between grid cells like a spreadsheet — Left/Right at the start or end of a cell\'s text, Up/Down from anywhere in it.',
      'Enter commits your edit and drops down to the same column in the row below.',
      'Escape cancels an in-progress edit and restores the cell\'s previous value.',
    ],
  },
  {
    v: 60,
    title: 'Polish: Advanced settings toggle now shows hover/focus feedback',
    ts: '2026-07-04T16:30:22.885Z',
    date: 'Jul 4, 2026, 11:30 AM CT',
    items: [
      'The "Advanced · connection & auto-discovery" disclosure in Settings gave no visual feedback at all when hovered or tabbed to — every other clickable control in the app already does.',
      'It now highlights in the brand color on hover and shows the same keyboard focus ring as the rest of the app.',
    ],
  },
  {
    v: 59,
    title: 'Global search now includes chat messages',
    ts: '2026-07-04T15:53:35.542Z',
    date: 'Jul 4, 2026, 10:53 AM CT',
    items: [
      'Ctrl+K search now also matches the text of General and DM messages, not just tables and records.',
      'Click a message result (or arrow-key + Enter) to jump straight to its thread — the matching message scrolls into view and briefly highlights.',
    ],
  },
  {
    v: 58,
    title: 'Landing page refresh: global search takes the spotlight',
    ts: '2026-07-04T15:01:56.162Z',
    date: 'Jul 4, 2026, 10:01 AM CT',
    items: [
      'The homepage hero now leads with Ctrl+K global search — the newest feature — with a fresh screenshot of the search palette finding the same person across two different tables.',
      'Touched up the feature copy and meta description to mention instant search and multi-record links.',
    ],
  },
  {
    v: 57,
    title: 'Global search — jump to any table or record',
    ts: '2026-07-04T13:38:42.425Z',
    date: 'Jul 4, 2026, 8:38 AM CT',
    items: [
      'Press Ctrl+K (or Cmd+K), or tap the new search icon in the top bar, to search every table and record at once — not just the current table.',
      'Matching tables and records show up grouped, with the matched text highlighted; click one (or arrow-key + Enter) to jump straight there.',
      'Opening a matching record takes you right into its record panel, ready to edit.',
    ],
  },
  {
    v: 56,
    title: 'Polish: checklist rows now show hover/focus feedback',
    ts: '2026-07-04T12:52:17.592Z',
    date: 'Jul 4, 2026, 7:52 AM CT',
    items: [
      'The checkbox rows used by multi-link fields (and the sharing/invite checklists they share styling with) now highlight on hover and show the app\'s focus ring when tabbed to — previously they gave no visual feedback at all.',
      'Checkboxes in those rows now use the app\'s branded accent color instead of the browser default.',
    ],
  },
  {
    v: 55,
    title: '"Linked from" — see the other side of a Link field',
    ts: '2026-07-04T12:08:36.300Z',
    date: 'Jul 4, 2026, 7:08 AM CT',
    items: [
      'Opening a record now shows a "Linked from" section listing any records in OTHER tables whose Link field points at it — the reverse of the existing forward Link picker.',
      'Click a linked record\'s chip to jump straight to it in its own table.',
    ],
  },
  {
    v: 54,
    title: 'Link fields can now hold multiple records',
    ts: '2026-07-04T11:35:07.507Z',
    date: 'Jul 4, 2026, 6:35 AM CT',
    items: [
      'A "Link to another table" field can be set to "Allow linking multiple records" — the grid cell and record panel show a checklist instead of a single picker.',
      'CSV import\'s Link column type gained the same option, splitting a cell into several matches by semicolon.',
      'CSV export and the grid cell join multiple linked records\' names with "; ".',
    ],
  },
  {
    v: 53,
    title: 'Polish sweep: empty states and fresher landing copy',
    ts: '2026-07-04T10:45:00.950Z',
    date: 'Jul 4, 2026, 5:45 AM CT',
    items: [
      'The Admin and Activity views now show a proper icon + message empty state (matching Peers, Messages, and Tables) instead of a plain line of muted text.',
      'The landing page\'s "what\'s new" pill and feature copy now call out Link fields and reordering instead of the older Undo callout.',
    ],
  },
  {
    v: 52,
    title: 'CSV import can link a column to another table',
    ts: '2026-07-04T09:52:06.813Z',
    date: 'Jul 4, 2026, 4:52 AM CT',
    items: [
      'Importing a CSV now offers "Link to another table" as a column type, matching each cell\'s text against an existing table\'s rows by name.',
      'A cell that doesn\'t match any row is left blank instead of guessing — you get a heads-up in the import toast if any didn\'t match.',
    ],
  },
  {
    v: 51,
    title: 'Link fields — reference rows in another table',
    ts: '2026-07-04T09:05:15.157Z',
    date: 'Jul 4, 2026, 4:05 AM CT',
    items: [
      'A new field type, "Link to another table", turns a column into a picker of another table\'s rows instead of free text — pick a contact, a task, whatever fits your schema.',
      'The grid, the record panel, and bulk "Set field…" all get the same live record picker.',
      'Sorting, searching, and CSV export show the linked row\'s own label (its first filled-in field), not a raw internal id.',
    ],
  },
  {
    v: 50,
    title: 'Focus-ring fix on primary buttons',
    ts: '2026-07-04T08:02:12.939Z',
    date: 'Jul 4, 2026, 3:02 AM CT',
    items: [
      'Tabbing to a filled purple "primary" button (Save, Create, Send, and the like) now shows the same keyboard focus ring every other control in the app already has — its own drop shadow was silently hiding it.',
    ],
  },
  {
    v: 49,
    title: 'Reorder tables',
    ts: '2026-07-04T06:47:40.965Z',
    date: 'Jul 4, 2026, 1:47 AM CT',
    items: [
      'Drag a table\'s grip handle in the Tables tree to put your tables in the order you want, the same way you can already reorder a table\'s fields.',
      'Works with a keyboard too — focus a grip and press the up/down arrow keys to swap it with its neighbor.',
      'The order syncs to your peers and survives table duplicate/undo like any other table setting.',
    ],
  },
  {
    v: 48,
    title: 'Reorder fields',
    ts: '2026-07-04T05:22:56.524Z',
    date: 'Jul 4, 2026, 12:22 AM CT',
    items: [
      'Drag a column\'s grip handle (in the grid header or the tree panel\'s field list) to put fields in the order you want.',
      'Works with a keyboard too — focus a grip and press the arrow keys to swap it with its neighbor.',
      'The order syncs to your peers and survives table duplicate/undo like any other table setting.',
    ],
  },
  {
    v: 47,
    title: 'Duplicate a row',
    ts: '2026-07-04T02:19:43.101Z',
    date: 'Jul 3, 2026, 9:19 PM CT',
    items: [
      'Every row now has a "Duplicate" action next to its delete button — clones its fields into a brand-new row with a fresh ID.',
      'The record panel (opened from a row) got the same "Duplicate" button, and reopens straight onto the new copy.',
      'Copies sync to peers like any other new row — nothing stays linked to the original.',
    ],
  },
  {
    v: 46,
    title: 'Landing page refresh',
    ts: '2026-07-04T00:26:08.767Z',
    date: 'Jul 3, 2026, 7:26 PM CT',
    items: [
      'Updated the hero screenshot to show the tree panel expanded with typed columns, plus two rows selected and the bulk set-field / export / delete action bar.',
      'Refreshed the "what\'s new" pill and copy to call out Undo (bring back a deleted row, table, or field) and bulk row actions.',
    ],
  },
  {
    v: 45,
    title: 'Duplicate a table',
    ts: '2026-07-03T23:54:42.341Z',
    date: 'Jul 3, 2026, 6:54 PM CT',
    items: [
      'Edit table now has a "Duplicate" button that clones the table\'s fields, field types and current rows into a new table, named "<name> copy".',
      'The copy gets fresh row IDs and syncs to peers like any other new table — nothing is linked back to the original.',
    ],
  },
  {
    v: 44,
    title: 'Undo a table or field delete',
    ts: '2026-07-03T23:24:39.823Z',
    date: 'Jul 3, 2026, 6:24 PM CT',
    items: [
      'Deleting a table now shows an "Undo" button right on the confirmation toast, restoring the table and every row exactly as it was.',
      'Deleting a field works the same way — undo brings back its value on every row, plus its type (Yes/No, Number, Date, Dropdown) if it had one.',
      'The "Delete table" confirmation no longer claims it can’t be undone, since now it can.',
    ],
  },
  {
    v: 43,
    title: 'Keyboard accessibility polish',
    ts: '2026-07-03T22:53:02.479Z',
    date: 'Jul 3, 2026, 5:53 PM CT',
    items: [
      'Table column headers can now be sorted with the keyboard (Tab to a header, Enter/Space to sort), not just a mouse click.',
      'Peer permission toggles now announce themselves properly to screen readers (which peer, which table, read or write, on or off).',
    ],
  },
  {
    v: 42,
    title: 'Undo a row delete',
    ts: '2026-07-03T22:33:28.835Z',
    date: 'Jul 3, 2026, 5:33 PM CT',
    items: [
      'Deleting a row (single or bulk) now shows an "Undo" button right on the confirmation toast.',
      'Click it to bring the row(s) straight back — no need to dig through Settings or ask a peer to resend the data.',
      'Works the same whether the row was removed from the grid, the record panel, or a multi-row bulk delete.',
    ],
  },
  {
    v: 41,
    title: 'Bulk-set a field on selected rows',
    ts: '2026-07-03T21:50:35.054Z',
    date: 'Jul 3, 2026, 4:50 PM CT',
    items: [
      'The bulk-select action bar gained a "Set field…" button next to "Delete selected" and "Export selected".',
      'Pick a field and a value once, and it applies to every checked row in one action — the value editor matches the field\'s type (toggle, dropdown, date, number, or text).',
      'Handy for things like marking a batch of rows "Done" without opening each one individually.',
    ],
  },
  {
    v: 40,
    title: 'More keyboard focus rings',
    ts: '2026-07-03T21:29:13.018Z',
    date: 'Jul 3, 2026, 4:29 PM CT',
    items: [
      'The nav rail, its collapse toggle, star/pin buttons, tree expand carets, toggle switches, segmented controls, and message thread tabs now show a focus ring when reached by keyboard, matching every other control in the app.',
    ],
  },
  {
    v: 39,
    title: 'Bulk-export selected rows to CSV',
    ts: '2026-07-03T20:47:58.356Z',
    date: 'Jul 3, 2026, 3:47 PM CT',
    items: [
      'The bulk-select action bar now has an "Export selected" button alongside "Delete selected".',
      'Downloads just the checked rows as a .csv — same column layout and typing rules as the regular Export CSV button.',
      'Handy for pulling out a subset (e.g. flagged rows) without exporting or filtering the whole table.',
    ],
  },
  {
    v: 38,
    title: 'Bulk-select and delete rows',
    ts: '2026-07-03T20:14:59.936Z',
    date: 'Jul 3, 2026, 3:14 PM CT',
    items: [
      'Every table row now has a checkbox; a header checkbox selects or clears all visible (filtered) rows at once.',
      'Selecting one or more rows shows a "Delete selected" action bar so you can clear out a batch of rows in one confirm instead of one at a time.',
      'Deletes still tombstone individually, so they propagate to peers exactly like a single-row delete.',
    ],
  },
  {
    v: 37,
    title: 'Landing page refresh',
    ts: '2026-07-03T19:29:50.337Z',
    date: 'Jul 3, 2026, 2:29 PM CT',
    items: [
      'New hero screenshot showing live presence, typed dropdown fields, sorting, and CSV export.',
      'Updated the homepage copy to spotlight who\'s-viewing presence and the fuller table toolkit.',
    ],
  },
  {
    v: 36,
    title: 'Smoother large CSV imports',
    ts: '2026-07-03T19:16:10.780Z',
    date: 'Jul 3, 2026, 2:16 PM CT',
    items: [
      'Importing a big CSV now processes rows in chunks instead of freezing the tab while it works.',
      'A progress bar and row count show while a large import is in flight.',
    ],
  },
  {
    v: 35,
    title: 'TURN fallback for stubborn networks',
    ts: '2026-07-03T18:00:30.806Z',
    date: 'Jul 3, 2026, 1:00 PM CT',
    items: [
      'Added an optional TURN server field in Settings → Advanced, next to STUN.',
      'Helps WebRTC invites and auto-discovery connect through symmetric NATs and locked-down office networks where STUN alone can\'t punch through.',
      'The relay only ever passes through the already-encrypted connection — it still can\'t read your data.',
    ],
  },
  {
    v: 34,
    title: 'See who else is viewing a table',
    ts: '2026-07-03T16:37:56.809Z',
    date: 'Jul 3, 2026, 11:37 AM CT',
    items: [
      'Tables now show a small live badge of peers currently looking at the same table — in the tree list and next to the table name.',
      'Hover the badge to see who — updates instantly as people open, switch, or leave a table.',
      'Purely a live signal between connected peers — nothing is stored or synced to your data.',
    ],
  },
  {
    v: 33,
    title: 'CSV import suggests field types per column',
    ts: '2026-07-03T15:49:46.635Z',
    date: 'Jul 3, 2026, 10:49 AM CT',
    items: [
      'The CSV import preview now shows a type picker for every column — Auto, Text, Number, Yes/No, Date, or Dropdown — instead of only guessing from the values.',
      'Columns with a short repeated set of values (like a status or category column) are pre-set to Dropdown, with the choices filled in from the file.',
      'Override any column before importing, e.g. force a column of numeric-looking codes to stay Text instead of becoming numbers.',
    ],
  },
  {
    v: 32,
    title: 'Keyboard focus fixes for hidden buttons',
    ts: '2026-07-03T14:51:50.042Z',
    date: 'Jul 3, 2026, 9:51 AM CT',
    items: [
      'A table row’s delete button and a field name button in the Tables tree panel used to only appear on mouse hover — tabbing to them with a keyboard left them invisible.',
      'Both now show the same focus ring as every other control when reached by keyboard.',
    ],
  },
  {
    v: 31,
    title: 'Column types with nicer editors',
    ts: '2026-07-03T13:51:25.736Z',
    date: 'Jul 3, 2026, 8:51 AM CT',
    items: [
      'Give any field a type — Text, Number, Yes/No, Date, or Dropdown — from its edit menu or right when you add it.',
      'Typed fields get a dedicated control instead of plain text: a toggle for Yes/No, a native date picker for Date, and a dropdown for a fixed list of choices, both in the table grid and the record panel.',
      'Number fields reject non-numeric input instead of silently storing bad data.',
      'A small badge on the column header shows its type; switch back to Auto anytime to return to the original text-based editing.',
    ],
  },
  {
    v: 30,
    title: 'Confirm before disconnecting a sync location',
    ts: '2026-07-03T11:50:59.714Z',
    date: 'Jul 3, 2026, 6:50 AM CT',
    items: [
      'Disconnecting rendezvous, local folder, S3, WebDAV, Dropbox, or Google Drive sync now asks you to confirm first, matching every other destructive action in the app.',
      'Prevents losing a configured connection (and needing to re-enter credentials) from a stray click.',
    ],
  },
  {
    v: 29,
    title: 'Drag-to-resize the Tables tree panel',
    ts: '2026-07-03T10:53:55.899Z',
    date: 'Jul 3, 2026, 5:53 AM CT',
    items: [
      'The tree panel on the left of the Tables view can now be dragged wider or narrower from its right edge — handy for long table or field names.',
      'Double-click the divider to snap back to the default width.',
      'Your chosen width is remembered across visits.',
    ],
  },
  {
    v: 28,
    title: 'Export a table to CSV',
    ts: '2026-07-03T09:39:03.495Z',
    date: 'Jul 3, 2026, 4:39 AM CT',
    items: [
      'A new "Export CSV" button next to "Edit table" downloads the current table as a .csv file, ready to open in Excel, Sheets, or re-import elsewhere.',
      'If you\'ve filtered or sorted the table, the download matches exactly what you\'re looking at.',
    ],
  },
  {
    v: 27,
    title: 'Landing page refresh',
    ts: '2026-07-03T08:05:29.270Z',
    date: 'Jul 3, 2026, 3:05 AM CT',
    items: [
      'Re-shot the app screenshot on the homepage — it was still showing the old horizontal table tabs from before the tree/side-panel navigation shipped.',
      'The hero highlight and feature cards now call out CSV import, and the backup card lists all five sync locations (local folder, S3, WebDAV, Dropbox, Google Drive).',
    ],
  },
  {
    v: 26,
    title: 'Import CSV → new table',
    ts: '2026-07-03T06:45:32.471Z',
    date: 'Jul 3, 2026, 1:45 AM CT',
    items: [
      'A new "Import CSV" button next to "New table" lets you turn a .csv file straight into a table — pick a file and it shows a preview (field names, row count, first few rows) before creating anything.',
      'Values are auto-typed the same way inline cell edits are: numbers, true/false, and JSON all come in as their real type instead of plain text.',
      'The suggested table name comes from the filename, but you can rename it before importing.',
    ],
  },
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
