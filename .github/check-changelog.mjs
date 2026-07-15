// check-changelog.mjs — guard that js/changelog.js stays parseable by the rest
// of the fleet (manager's "Sync changelog" + the polecat.live launcher).
//
// It re-implements manager's EXACT parser (ingest.js: extractArrayLiteral +
// jsLiteralToJSON) and runs it against our published changelog. If manager
// couldn't parse it, this fails — so Guard main catches it within a minute
// instead of the owner finding out in manager. (Fleet pattern; see
// polecat-platform docs/AUTOMATION.md and autoselector's copy of this file.)
//
// The most common trap: a `, word:` or `{ word:` sequence INSIDE a title/item
// string. Manager quotes unquoted object keys with a regex that also matches
// inside string values, turning "…, quietly: free" into invalid JSON. We flag
// that pattern with a clear message.
import { readFile } from 'node:fs/promises';

// ---- verbatim copy of manager's parser (js/ingest.js) --------------------
function extractArrayLiteral(src, varName){
  const m = src.match(new RegExp(varName + '\\s*=\\s*\\['));
  if(!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0, inStr = null, esc = false;
  for(let i = start; i < src.length; i++){
    const c = src[i];
    if(inStr){ if(esc) esc = false; else if(c === '\\') esc = true; else if(c === inStr) inStr = null; continue; }
    if(c === '"' || c === "'" || c === '`'){ inStr = c; continue; }
    if(c === '[') depth++;
    else if(c === ']'){ depth--; if(depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}
function jsLiteralToJSON(lit){
  let out = '', i = 0; const n = lit.length; const esc = (ch) => ch === '"' ? '\\"' : ch;
  while(i < n){
    const c = lit[i];
    if(c === '/' && lit[i+1] === '/'){ while(i < n && lit[i] !== '\n') i++; continue; }
    if(c === "'" || c === '"'){
      const quote = c; i++; let s = '"';
      while(i < n){
        const ch = lit[i];
        if(ch === '\\' && i+1 < n){ const next = lit[i+1];
          if(next === '\\') s += '\\\\'; else if('ntrbf'.includes(next)) s += '\\' + next; else s += esc(next);
          i += 2; continue; }
        if(ch === quote){ i++; break; }
        s += esc(ch); i++;
      }
      out += s + '"'; continue;
    }
    out += c; i++;
  }
  out = out.replace(/,\s*([}\]])/g, '$1').replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');
  return JSON.parse(out);
}

// ---- our own stricter pre-check for the specific trap --------------------
// A comma/brace + spaces + one identifier + colon, appearing inside prose.
const TRAP = /[,{]\s*[A-Za-z_$][A-Za-z0-9_$]*\s*:/;
function proseStrings(arr){
  const out = [];
  for(const e of arr){
    if(e.title) out.push({ where:`entry ${e.v ?? ''} title`, s:String(e.title) });
    for(const [i,it] of (e.items||[]).entries()) out.push({ where:`entry ${e.v ?? ''} item ${i}`, s:String(it) });
    if(e.detail) out.push({ where:`entry "${e.title}" detail`, s:String(e.detail) });
  }
  return out;
}

let failed = false;
for(const [file, varName] of [['js/changelog.js','CHANGELOG']]){
  const src = await readFile(file, 'utf8');
  const lit = extractArrayLiteral(src, varName);
  if(!lit){ console.error(`❌ ${file}: no ${varName} array found (manager couldn't locate it)`); failed = true; continue; }

  // flag the trap first, with a helpful message
  let entries;
  try{ entries = new Function('return ' + lit)(); }
  catch(e){ console.error(`❌ ${file}: not valid JS (${e.message})`); failed = true; continue; }
  for(const { where, s } of proseStrings(entries)){
    if(TRAP.test(s)){
      const snip = s.match(/.{0,24}[,{]\s*[A-Za-z_$][A-Za-z0-9_$]*\s*:.{0,12}/)?.[0] || s;
      console.error(`❌ ${file}: ${where} contains a "…, word:" pattern that breaks manager's parser:\n     …${snip}…\n     → rephrase (use an em dash, not a colon after a comma-word).`);
      failed = true;
    }
  }

  // then confirm manager's exact parser succeeds
  try{ const arr = jsLiteralToJSON(lit); if(!Array.isArray(arr)) throw new Error('not an array');
    console.log(`✓ ${file}: manager parser OK (${arr.length} entries)`); }
  catch(e){ console.error(`❌ ${file}: manager's parser fails — ${e.message}`); failed = true; }
}

if(failed){ console.error('\n❌ changelog check FAILED — sibling apps could not sync this.'); process.exit(1); }
console.log('\n✅ changelog check passed — the fleet can sync it.');
