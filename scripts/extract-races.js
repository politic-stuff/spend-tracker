#!/usr/bin/env node
// One-off: pull the canonical race/candidate list out of the primary-countdown
// site so the spend tracker stays in sync with it. Classifies each candidate
// federal (FEC-trackable) vs state (state-portal / manual) by office string.
const fs = require('fs');
const os = require('os');
const path = require('path');

const html = fs.readFileSync(path.join(os.homedir(), 'primary-countdown', 'index.html'), 'utf8');

function grab(varName) {
  const start = html.indexOf(`const ${varName} =`);
  if (start < 0) throw new Error(`${varName} not found`);
  // find the first bracket/brace after the '='
  const eq = html.indexOf('=', start);
  let open = eq + 1;
  while (html[open] !== '[' && html[open] !== '{') open++;
  const openCh = html[open], closeCh = openCh === '[' ? ']' : '}';
  // walk to the matching close
  let depth = 0, i = open;
  for (; i < html.length; i++) {
    if (html[i] === openCh) depth++;
    else if (html[i] === closeCh) { depth--; if (depth === 0) { i++; break; } }
  }
  const literal = html.slice(open, i);
  // eslint-disable-next-line no-new-func
  return Function(`return (${literal})`)();
}

const primaries = grab('primaries');
const generalElection = grab('generalElection');

const FED = /US (House|Senate)/i;
function level(office = '') { return FED.test(office) ? 'federal' : 'state'; }

const candidates = [];
const seen = new Set();
function add(c, state, raceDate, raceType) {
  const key = `${c.name}|${c.office}`;
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push({
    name: c.name,
    office: c.office,
    state,
    level: level(c.office),
    raceType,                 // 'primary' | 'general'
    raceDate,
    result: c.result || null, // won | lost | null
    links: { web: c.web || null, x: c.x || null, yt: c.yt || null,
             fb: c.fb || null, ig: c.ig || null, tk: c.tk || null },
    // live data the feeders fill in:
    spend: [],                // [{actor, type, amount, source, confidence, asOf}]
    ads: [],                  // [{title, url, platform, source, firstSeen}]
  });
}

for (const p of primaries) for (const c of p.candidates) add(c, p.state, p.date, 'primary');
for (const c of generalElection.candidates) add(c, c.state, generalElection.date, 'general');

const fed = candidates.filter(c => c.level === 'federal').length;
const out = {
  generatedFrom: 'primary-countdown/index.html',
  counts: { total: candidates.length, federal: fed, state: candidates.length - fed },
  candidates,
};
fs.writeFileSync(path.join(__dirname, '..', 'data', 'races.seed.json'), JSON.stringify(out, null, 2));
console.log(`Extracted ${candidates.length} candidates (${fed} federal, ${candidates.length - fed} state)`);
