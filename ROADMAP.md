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
- Reverse links only show the raw record picked as the "linked from" chip label
  (whichever field happens to be first non-empty on that row) — fine since it
  matches the same `recordLabel()` heuristic used everywhere else a linked
  record is displayed, but worth a dedicated "primary field" concept someday if
  that heuristic ever picks a confusing column.
- Google Drive sync's silent token renewal (`prompt:''`) depends on an active
  Google session + third-party-cookie access to accounts.google.com — Safari
  ITP or strict Firefox cookie blocking will force a "needs permission" state
  more often than Dropbox's refresh-token flow does. Falls back to a one-click
  Reconnect, but worth watching for complaints.
- Optional "always-on peer" (headless) for 24/7 availability without a DB.
- CSV import's "Link to another table" column type (single or multi) matches
  by exact (case-insensitive) label text and silently leaves unmatched cells
  blank — no fuzzy matching, and duplicate labels in the target table resolve
  to whichever record happens to sort first. Fine for names/titles that are
  usually unique; worth a closer look if that turns out not to hold.
- Multi-link's grid-cell editor is a modal checklist (a compact cell has no
  room for an inline list); worth revisiting as a lighter popover if it feels
  heavy in practice.

## Later
- End-to-end encryption of records at rest / in transit beyond DTLS.
- Conflict view (show competing edits) instead of silent LWW.
- Multiple workspaces / workspace switcher.

## Done
- 2026-07-04 — Polish: `.perm-row` — the checkbox-row pattern shared by the new
  multi-link editor (`buildMultiLinkEditor()` in `js/views/table.js`), the
  invite modal's auto-connect checkbox (`admin.js`), and the Peers permission
  grid — had no `:hover` and no `:focus-visible` at all, and its raw
  `<input type=checkbox>` used the unstyled browser default instead of the
  app's branded accent color, unlike every other clickable-row pattern already
  polished (`.tree-row`, `input.row-check`). Barely noticeable at 1-2 rows in
  the older sharing panels, but the new multi-link editor turns `.perm-row`
  into a scrollable list of many rows (`.link-multi-list`, up to 220px tall)
  that's the primary interactive surface of its own modal/section, so the
  missing feedback is now much more visible — keyboard users tabbing through
  a multi-link checklist got no indication of which row was focused. Added
  `.perm-row:hover`, `.perm-row input[type=checkbox]` (branded `accent-color`),
  and `.perm-row input[type=checkbox]:focus-visible` (the same `var(--ring)`
  treatment used everywhere else) to `css/styles.css`. Pure CSS, no behavior
  change — verified all existing smoke checks still pass.
- 2026-07-04 — "Linked from" (reverse links): opening a record now shows a new
  "Linked from" section listing records in *other* tables whose Link field
  points at it — the natural complement to the forward Link field/picker
  shipped earlier today, since until now a link only showed on the side that
  picked it (e.g. a Task's "assignee" pointed at a Contact, but the Contact's
  record had no way to show which Tasks pointed back). Nothing new is stored:
  a new `backLinks(entity, id)` in `js/views/table.js` scans every entity's
  field types for a `link` field pointing at the target entity, then that
  entity's records for a value (single or multi) containing the id, so it can
  never drift out of sync with the forward links themselves. Grouped by
  source table + field as a row of chips (one per linked record, reusing the
  existing `recordLabel()` heuristic); clicking a chip closes the current
  panel and navigates to that record in its own table (`renderTable` gained
  an `openRecord` param so `ctx.go('table', {entity, openRecord})` can jump
  straight to a specific row's panel, not just the table). Added a smoke
  check that opens a seeded contact linked from two fields on another table,
  confirms both "Linked from" groups appear, and follows a chip back to
  confirm it opens the right record.
- 2026-07-04 — Multi-link fields: a "Link to another table" field can now be
  switched on to hold several linked records instead of just one, via a new
  "Allow linking multiple records" checkbox next to the link-target picker
  (Add field, Edit field, and CSV import's per-column type row all gained it) —
  the natural v2 this file called out after single-value Link fields shipped
  earlier today ("Tasks" linking several "Contacts" as owners was the
  motivating case). Value stored per record is now `Store.setFieldType`'s
  existing `{entity, multi}` config on the link field type; a plain array of
  ids for a multi field, same single id as before for a non-multi one. A
  compact grid cell has no room for a full checklist, so the grid renders a
  "Alice, Bob" chip button that opens a small modal with one checkbox per
  target-table record (new `buildMultiLinkEditor()`, reused by the grid
  picker, the record panel — which has room to show the checklist inline —
  and bulk "Set field…"); a linked id that no longer resolves to a live
  record is kept as a checked "(missing)" row so unchecking it still removes
  it from the value instead of it silently vanishing, same discipline the
  single-link "(missing)" option already followed. CSV export and every
  other place a link field's value is displayed/sorted/searched
  (`displayValue()`) join multiple resolved labels with "; "; CSV import's
  Link column type gained the same "Allow multiple" option, splitting a raw
  cell on ";" and matching each part independently. Added a smoke check that
  switches a field to multi-link, checks two contacts via the grid modal,
  and confirms the stored id array, the record panel's checklist, and the
  CSV export's joined label all agree.
- 2026-07-04 — Polish sweep: the Admin view's "No invites yet" and the Activity
  view's "No activity yet" were the last two empty states in the app still
  rendered as a plain line of muted text (`admin.js`, `activity.js`) — every
  other empty state (Peers, Messages, Tables) already used the shared
  `.empty` pattern (icon + centered message, `css/styles.css:449`). Both now
  use it too (`key` and `activity` icons respectively); added a
  `.monitor .empty` override so the message doesn't inherit the Activity
  log's monospace font. Also refreshed the landing page's "what's new" pill
  and the "Dynamic JSON tables" feature card/meta description, which still
  only referenced Undo even though Link fields, CSV-import linking, and
  field/table reordering had since shipped — now calls out Link fields as
  the headline and mentions reordering. Pure copy/markup, no new smoke
  check (the `.empty` pattern itself has no existing smoke coverage to
  extend, and the landing copy isn't asserted on by name).
- 2026-07-04 — CSV import "Link to another table" column type: the per-column
  type picker in the import preview (`openImportPreview` in `js/views/table.js`)
  now offers "link" alongside Auto/Text/Number/Yes-No/Date/Dropdown, the
  natural follow-up to today's Link fields feature and the item this file
  called out as deliberately excluded at the time ("no sane way to match a
  cell's text to an existing record id"). Picking Link for a column reveals a
  target-table picker (built lazily via the existing `buildLinkTargetSelect()`,
  same "only one <select> per row" discipline the Add/Edit-field modal already
  follows, so every other per-row `select` locator in the smoke suite keeps
  resolving to exactly one element); confirming the import builds a
  lowercased-label → record-id map of the target table once per column (new
  `labelToIdMap()`) and resolves each raw cell against it — a match stores
  the target row's id (readable everywhere `linkedRecordLabel()` already
  renders one), a miss leaves that cell blank rather than guessing. The
  import's success toast now names how many cells didn't match, if any. Only
  existing tables are ever offered as a target, since the table being
  imported into doesn't exist until the import actually runs. Added a smoke
  check that imports a two-row CSV with an "owner" column against the seeded
  Contacts table, matching one row by name and leaving the other's unmatched
  value blank.
- 2026-07-04 — Link fields: a new field type, "Link to another table", turns
  a column into a picker of another table's live records instead of free
  text — the natural next step after Text/Number/Yes-No/Date/Dropdown for a
  "dynamic tables" app, since until now the only way to relate two tables was
  to duplicate data by hand. Value stored per record is the linked row's id
  (`Store.setFieldType(entity, field, 'link', targetEntityKey)`, mirroring how
  Dropdown already overloads that slot for its options array); a new
  `linkedRecordLabel()`/`recordLabel()` in `js/views/table.js` resolves that id
  to the target row's first non-empty field (falling back to a short id, or
  "(deleted)" if the row — or its whole table — is gone) everywhere a human
  reads it: the grid cell, the record panel, bulk "Set field…", CSV export,
  and now also table sort/search (both silently sorted/matched on the raw
  uuid before this). The grid/record-panel/bulk editors are all a `<select>`
  populated from `Store.records(targetEntity)` via a shared `fillLinkOptions()`
  helper; a value pointing at a since-deleted row is kept as a trailing
  "(missing)" option rather than silently blanked. Self-links are allowed
  (e.g. a "reports to" hierarchy within the same table). Excluded deliberately
  from CSV import's per-column type picker (see Next) since there's no
  raw-string-to-record-id matching yet. The Add/Edit-field modals only ever
  render a second `<select>` (the link-target picker) once a field is actually
  switched to "link" — built lazily on that change event — so every other
  existing type-picking smoke check, which relies on exactly one `<select>`
  being present in those modals, keeps working untouched. Added a smoke check
  that links a field to the seeded Contacts table, picks a contact in the grid,
  and confirms both the record panel and a CSV export resolve it to that
  contact's name instead of its id.
- 2026-07-04 — Polish sweep: `.btn.primary` (the filled purple button used for
  Save/Create/Send/etc.) unconditionally set its own `box-shadow` for the drop
  shadow, which — at equal CSS specificity and later source order — silently
  beat the shared `.btn:focus-visible` ring, so keyboard focus was invisible
  on every primary button in the app even though every other button variant
  showed it fine. Added a `.btn.primary:focus-visible` rule that layers the
  ring alongside the existing drop shadow (same two-shadow pattern
  `.rail-toggle:focus-visible` already used). Also swept `css/styles.css` for
  selectors with no matching class in any `js/*.js`/`app/index.html` markup
  and removed four confirmed-dead rules left over from earlier refactors:
  `.rail-foot`, `.topbar .crumb`, and the two `.topbar-sync` responsive rules
  (an `.entity-tab` rule that only existed inside one of those media queries
  went with it). Pure CSS, no behavior change — verified all 68 existing
  smoke checks still pass.
- 2026-07-04 — Reorder tables: the Tables tree's list of tables can now be put
  in whatever order you like, the same itch as "Reorder fields" (shipped
  earlier today) but for the top-level table list instead of a table's
  columns. Every `.tree-row` gained a drag handle (grip icon) that reveals on
  hover/focus, reusing the exact pointer-drag engine and keyboard Up/Down
  fallback the field-reorder feature introduced (`wireFieldDrag`/
  `wireFieldDragKeys` in `js/views/table.js` were already generic over what's
  being dragged — this is their third caller, unchanged). The harder call was
  how a *workspace-wide* order should sync, since there was no existing
  workspace-level synced array to model it on (`pinned` is the closest shape
  but is explicitly local-only). Landed on giving each entity its own `order`
  number — new `Store.reorderEntities(orderedKeys)` stamps `order:index` (plus
  a fresh `_meta`) on every entity in the given order — so a reorder rides the
  exact same per-entity LWW sync `entityDefs()`/`ensureEntity()` already do for
  label/icon/fieldTypes/fieldOrder, no new sync path needed. New
  `Store.orderedEntityNames()` sorts by that optional `order` (entities that
  have never been touched, or were created since the last reorder, keep
  discovery order and sort after any that do — same shape as `columns()`'s
  `fieldOrder` fallback) and is now what the tree renders from and what a
  table-delete falls back to for picking the next table to show.
  `duplicateEntity()` leaves the copy's `order` unset (it lands at the end
  until dragged); `restoreEntity()` restores the deleted table's original
  `order` so undo puts it back exactly where it was. Added two smoke checks:
  one dragging a table's grip past a sibling and confirming the tree's visual
  order and each entity's persisted `order` match, one pressing the arrow key
  on a table's grip and confirming the same.
- 2026-07-04 — Reorder fields: columns can finally be put in the order you
  want instead of whatever `columns()` happened to discover them in. A drag
  handle (grip icon) on every grid column header and every tree-panel field
  row lets you drag a field to a new position — grip and drop don't move the
  DOM live (the grid's header and body cells would need to move in lockstep),
  they just track the nearest neighbor as you drag, highlight the drop point,
  and apply the whole new order through `Store` on release, same house style
  as the existing resize handles (pointer events, not native HTML5 drag-and-
  drop, so it works with touch too). Each grip is also a real, focusable
  `<button>` with a keyboard fallback — Left/Right in the grid, Up/Down in
  the tree — swapping the field with its immediate neighbor, since a
  drag-only interaction would have been a step backward for the app's
  accessibility track record. New `Store.reorderFields(entity, orderedKeys)`
  persists an entity-level `fieldOrder` array (mirrors `fieldTypes`'
  precedent): unset means the old discovery-order behavior; set, it sorts
  known fields by that order and appends any newly-discovered field at the
  end. Wired into `entityDefs()`/`ensureEntity()` for peer sync,
  `duplicateEntity()`/`restoreEntity()` so it survives table duplicate/
  undo-delete, and `renameField()`/`deleteField()` so renaming or deleting a
  field keeps the array consistent. Added two smoke checks: one dragging a
  grid column header's grip past a neighbor and confirming the visual order
  and persisted `fieldOrder` match, one pressing the arrow key on a tree
  field's grip and confirming the same.
- 2026-07-04 — Duplicate a row: every row's per-row action column (the trash
  button next to each row) gained a "Duplicate" button — the natural
  row-level counterpart to `duplicateEntity`'s table-level clone. New
  `Store.duplicateRecord(entity, id)` clones a single record's fields into a
  brand-new row (fresh id/`_meta`), so the copy syncs to peers like any other
  new row — nothing stays linked to the original. The open-record side panel
  got the same "Duplicate" button next to "Delete row"; clicking it closes
  the current panel and reopens on the new copy so the clone's fields are
  immediately editable. Added two smoke checks: one duplicating a row via
  its grid-row action and confirming the field value doubles, one duplicating
  from the record panel and confirming it reopens on the copy.
- 2026-07-04 — Landing page refresh: the hero screenshot and "what's new" pill
  hadn't kept pace with the last several shipped features (undo, bulk row
  actions, duplicate table). Re-captured the hero shot via a seeded demo table
  to show the Tables tree expanded with typed columns (dropdown/date/boolean
  badges) and two rows checked, with the bulk action bar ("Set field…",
  "Export selected", "Delete selected") front and center. Swapped the
  hero "what's new" pill from the now-old live-presence callout to Undo
  ("bring back a deleted row, table, or field in one click"), and touched up
  the "Dynamic JSON tables" feature card plus meta/OG descriptions to mention
  bulk row actions and undo alongside the existing typed-field/sort/filter
  copy.
- 2026-07-03 — Duplicate a table: the Edit table modal (rename/icon/delete)
  gained a "Duplicate" button that clones the table's fields, field types and
  current (non-deleted) rows into a brand-new entity named "<name> copy" (then
  "copy 2", "copy 3", ... if that's already taken). New
  `Store.duplicateEntity(key)` mirrors `createEntity`'s key-slugging (factored
  into a shared `_slugify` helper) but gives every copied row a fresh UUID and
  `_meta`, so the clone syncs to peers as an ordinary new table — nothing
  stays linked to the original, and deleted/tombstoned rows aren't carried
  over. Switches the view to the new table on completion. Added a smoke check
  that duplicates the column-types smoke table and verifies the copy's field
  type badges (number/date) and a row's values match the original while the
  original table is untouched.
- 2026-07-03 — Undo a table or field delete: the row-delete Undo pattern
  (confirmation toast with an "Undo" action button) now covers the two other
  destructive table operations that previously only warned via
  `confirmDialog` with no way back — deleting a whole table (Edit table →
  Delete table) and deleting a field (a field's edit modal → Delete field).
  New `Store.restoreEntity(key, snapshot)` and `Store.restoreField(entity,
  key, valuesById, fieldType)` mirror `restore()`/`restoreMany()`'s pattern:
  a fresh `updatedAt` newer than the delete wins LWW on peers the same way a
  brand-new table/field value would, so undo propagates exactly like the
  delete did. Table restore reuses the just-deleted entity object itself
  (label/icon/fieldTypes/records) rather than a deep clone — safe since
  nothing touches it once it's removed from the entities map — and
  re-pins it if it had been pinned; field restore snapshots each row's prior
  value and the field's type (if any) before deleting, so both come back
  together. Also dropped "This cannot be undone" from the delete-table
  confirm copy, since now it can be. Added two smoke checks driving the real
  Edit table / edit-field UI through delete → confirm → Undo and verifying
  the table (with its rows) and the field (with its value and type badge)
  both come back.
- 2026-07-03 — Keyboard accessibility polish, round 3: sorting a table by
  clicking a column header (`th.col-head` in `js/views/table.js`) was
  mouse-only — the `<th>` had an `onclick` but no `tabindex`, so keyboard
  users couldn't reach or trigger it at all (not just an invisible-focus
  case like the prior two rounds). It's now `tabindex="0"` with an
  Enter/Space handler (same guard pattern as Home's keyboard-activatable
  cards, so a keypress on the nested rename/delete pencil button doesn't
  double-fire the sort) and a proper `aria-sort` attribute plus a
  `:focus-visible` ring. Separately, the Peers page's per-entity
  read/write permission toggles (`js/views/peers.js`) were the one
  `.toggle` control in the app still missing `role="switch"`/`aria-checked`/
  `aria-label` — every other toggle (boolean fields, record panel) already
  had them. Also unified "This can't be undone" / "This cannot be undone"
  wording on the two destructive-delete confirm dialogs to the latter.
  Added a smoke check driving the column-sort via Tab+Enter (asserting
  `aria-sort` and the resulting row order match the mouse-click version),
  and extended the existing "Custom" permission-grid smoke check to assert
  the toggle's switch role/aria-checked/label.
- 2026-07-03 — Undo a row delete: deleting a row — from the grid's trash
  button, the record panel's "Delete row" button, or the bulk-select action
  bar's "Delete selected" — now shows an "Undo" button right on the
  confirmation toast (`toast()` in `js/ui.js` gained an optional `action`
  param). Clicking it un-tombstones the record(s) via new
  `Store.restore()`/`restoreMany()` (bump rev/updatedAt with `deleted:false`,
  mirroring how `remove()`/`removeMany()` already bump it to `deleted:true`),
  so the restore propagates to peers exactly like the delete did — nothing
  new to design there since deletes were already non-destructive tombstones
  under the hood, just with no UI path back. Added a smoke check that deletes
  a row, clicks Undo, and confirms the row count returns to its prior value.
- 2026-07-03 — Bulk-set a field's value on selected rows: the bulk-select
  action bar (`selected` in `js/views/table.js`) gained a "Set field…" button
  alongside "Delete selected" and "Export selected" — the natural next step
  on that same selection called out in this file's Next section. Opens a
  small modal with a field picker and a value editor that swaps to match the
  chosen field's type (toggle for Yes/No, dropdown for Dropdown fields, a
  native date input, a validated number input, or plain text) — the same
  controls the grid/record panel already use, so a typed field can't be
  bulk-set to a value it wouldn't otherwise accept. New
  `Store.setFieldMany(entity, ids, field, value)` mirrors `removeMany()`'s
  pattern: one persist/emit for the whole batch instead of one per row, so it
  syncs to peers as a single change. Added a smoke check that bulk-selects two
  rows and confirms the field updates on both while the unchecked row is
  untouched.
- 2026-07-03 — Keyboard-focus polish, round 2: the earlier keyboard-focus fix
  (trash button, tree-field button) only covered two controls; a sweep for
  every custom interactive element with a `:hover` style but no
  `:focus-visible` counterpart turned up seven more, several of them
  high-traffic — the primary nav rail buttons and its collapse toggle
  (`js/shell.js`, used on every page), the Home "pin/star table" button,
  the Tables tree's field-expand carets, every `.toggle` switch (peer
  sharing, boolean fields), segmented controls (`.seg button`), and the
  Messages thread-tab pills. All were real `<button>` elements — reachable
  by Tab already — just invisible while focused, so keyboard users had no
  way to tell which control was about to activate on Enter/Space. Added the
  same `box-shadow:var(--ring)` treatment already used everywhere else
  (`.btn`, `.tree-row`, `.col-edit-btn`, …); the nav rail uses an `inset`
  ring so it doesn't get clipped by the rail's own overflow, and the
  floating round collapse toggle layers the ring alongside its existing
  drop shadow. Pure CSS, no behavior change, so no new smoke check —
  verified all 60 existing checks still pass.
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
