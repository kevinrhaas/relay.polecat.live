# relay.polecat.live — agent guide

A serverless, peer-to-peer collaborative workspace (dynamic tables + P2P
messaging) that runs entirely in the browser. Vanilla HTML/CSS/JS — no build
step, no framework, no runtime deps. Landing page at `/`; the app lives at
`/app/` (`js/*`, `css/styles.css`). Read `README.md` and `ROADMAP.md` first.

## The app frame runs on Polecat Shell (vendored — READ-ONLY)

`vendor/polecat-shell/` is a versioned verbatim copy of the shared fleet UI
library from `kevinrhaas/polecat-platform` (see its docs/SHELL-API.md). It
powers the left rail, top bar, mobile drawer, right panel (What's-New), the
app-switcher waffle, and theming (`data-palette` × `data-theme`, stored at
`relay.theme`; rail state at `relay.rail.open` / `relay.rail.width`).
**Never edit files under `vendor/polecat-shell/`** — changes there belong in
the platform repo and arrive via `chore: polecat-shell vX.Y.Z` sync PRs
(MANIFEST.json sha256 hashes are drift-checked by fleet sweeps). Relay-side
skinning lives in `css/styles.css` (the `ps-` skin section); shell wiring in
`js/app.js`. `js/ui.js` / `js/icons.js` are still app-local (see ROADMAP.md
for the consolidation slice).

## House rules

- **Static-first.** Plain HTML + ES modules + CSS. No bundlers, no deps.
- **The changelog contract is sacred.** `js/changelog.js` is fleet-format,
  literal style, parsed live by Manager and the launcher. New entries go on
  TOP with an empty `ts`; stamp with `node .github/stamp-changelog.mjs` (never
  hand-write timestamps) and validate with `node .github/check-changelog.mjs`.
- **Smoke before push**: `node .github/smoke-test.mjs` — Playwright, drives the
  real app end-to-end, zero pageerrors. Mobile is a release gate.
- **Sync-safe.** Anything touching shared state must converge across peers
  (last-writer-wins, tombstoned deletes — see `js/store.js` / `js/sync.js`).
- **Deploys**: merge/push to main → `deploy.yml` publishes Pages.
  `auto-revert.yml` ("Guard main") self-heals a broken main — smoke is
  advisory, never a deploy gate. `self-improve.yml` is a dispatch-only
  fallback superseded by polecat-platform's steward.
- **One unit of high-quality work per run.** Ask when direction is ambiguous.
