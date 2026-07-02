// Stamp the changelog's timestamps — run by the self-improve workflow (and
// safe to run by hand) whenever js/changelog.js changes.
//
// Two jobs, both derived from real time so nothing is ever fabricated:
//   1. If the top entry's `ts` is empty (the loop leaves it ''), fill it with
//      the real ship time (now, UTC ISO-8601).
//   2. Regenerate every entry's `date` from its `ts` — a human-readable Central
//      Time string kept as a backward-compat alias for fleet consumers that
//      read `date` rather than `ts`. Because it's always derived, it can never
//      drift from `ts`.
//
// The file is rewritten deterministically, so re-running with no ts change is a
// no-op diff.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FILE = path.join(process.cwd(), 'js/changelog.js');

function fmtCT(iso){
  const d = new Date(iso);
  if(isNaN(d)) return '';
  return d.toLocaleString('en-US',{ timeZone:'America/Chicago',
    month:'short', day:'numeric', year:'numeric',
    hour:'numeric', minute:'2-digit' }) + ' CT';
}

const { CHANGELOG } = await import(pathToFileURL(FILE).href);

// 1. fill an empty top `ts` with the real time
if(CHANGELOG.length && !CHANGELOG[0].ts){
  CHANGELOG[0].ts = new Date().toISOString();
}
// 2. derive `date` from `ts` on every entry
for(const e of CHANGELOG){ e.date = fmtCT(e.ts); }

// preserve the file's header comment, regenerate the data deterministically
const original = fs.readFileSync(FILE, 'utf8');
const header = original.slice(0, original.indexOf('export const CHANGELOG'));

const s = (v) => JSON.stringify(v);
const entry = (e) => `  {
    v: ${e.v},
    title: ${s(e.title)},
    ts: ${s(e.ts)},
    date: ${s(e.date)},
    items: [
${e.items.map(i => `      ${s(i)},`).join('\n')}
    ],
  },`;

const out = header +
  'export const CHANGELOG = [\n' +
  CHANGELOG.map(entry).join('\n') + '\n' +
  '];\n\n' +
  'export const LATEST_VERSION = CHANGELOG[0]?.v ?? 0;\n';

fs.writeFileSync(FILE, out);
console.log(`Stamped changelog: top v${CHANGELOG[0]?.v} ts=${CHANGELOG[0]?.ts} date="${CHANGELOG[0]?.date}"`);
