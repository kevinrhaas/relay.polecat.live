# Relay — autonomous self-improvement run

You are improving **relay.polecat.live**, a serverless, peer-to-peer collaborative
workspace (dynamic tables + P2P messaging) that runs entirely in the browser.
This run should make ONE focused, high-quality improvement and stop.

## The product in one paragraph
Vanilla **HTML/CSS/JS, no build step, no framework**. Landing page at `/`
(`index.html`, `css/landing.css`); the app lives in `app/index.html` + `js/*`
+ `css/styles.css`, served at `/app/`. Data is UUID-keyed JSON records in
`localStorage` (`js/store.js`) with last-writer-wins sync. Peers connect over a
local `BroadcastChannel` mesh, manual-invite WebRTC, and an optional Cloudflare
Worker "rendezvous" for auto-discovery (`js/sync.js`, `js/rendezvous.js`).
Access is an invite-only gate using ECDSA-signed links (`js/access.js`); there's
an Admin area (`js/views/admin.js`). Read `README.md` and `ROADMAP.md` first.

## What to do this run
1. **Read `ROADMAP.md`.**
2. **If mode is `feature`:** pick the single highest-value item from the
   roadmap's "Now" section that isn't already done, and implement it well.
   Prefer finishing something over starting many things.
3. **If mode is `polish`:** don't add features. Make the app better — fix rough
   edges, improve responsiveness/animation/readability, tighten copy, remove
   dead code, improve accessibility, unify styles. Small, safe, high-taste.
   Roughly every other polish run, **refresh the public landing page (`/`)** so
   it showcases the current feature set — accurate copy, a highlight of a recent
   feature, tasteful motion. Keep it sexy and true to what the app now does.

## Hard rules
- Keep it **lean**: vanilla JS/HTML/CSS only. No frameworks, no bundlers, no npm
  runtime deps in the app. Match the existing code's patterns and style.
- Keep it **elegant, simple, understandable**. Animations and flows are welcome;
  every panel must be **readable and responsive (mobile-friendly)**.
- **Do not break the app.** `.github/smoke-test.mjs` is a functional suite that
  drives the real app; the run only deploys if EVERY check passes. Before you
  finish, mentally (or by running it) confirm your change keeps all checks green.
- **Grow the smoke suite.** For any new user-visible feature, ADD a `check(...)`
  to `.github/smoke-test.mjs` that exercises it end-to-end. The suite must always
  prove "everything still functions," and it should get more thorough over time,
  never less.
- **Do NOT touch**: `js/access.js` PUBLIC_KEY_B64, `CNAME`, `.github/workflows/*`,
  `js/config.js` (the deployed rendezvous default), or anything secret.
- Scope: **one focused change**, ideally a handful of files. Don't rewrite the app.
- **Update `ROADMAP.md`**: move what you did to "Done" with today's date; add any
  follow-ups you discovered to "Next".
- **Add a `CHANGELOG` entry** in `js/changelog.js` for anything user-visible: a
  new object at the TOP of the array with a bumped `v`, a short `title`, today's
  date/time, and 1–4 plain-language `items`. This feeds the in-app "What's new"
  panel.

## Taste bar
Think like a senior product engineer with strong design sense. Ship something
you'd be proud to show. When unsure between "more" and "cleaner", choose cleaner.
