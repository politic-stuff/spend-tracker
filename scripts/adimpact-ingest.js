#!/usr/bin/env node
// AdImpact race-totals ingest. The local Chrome-extension routine cycles the
// AdImpact RACE dropdown, reads each race's three headline figures (Dem side /
// total / Rep side), and writes them to data/adimpact-queue.json:
//   [ { "raceKey":"MI-Sen-2026", "demSide":..., "repSide":..., "total":..., "asOf":"YYYY-MM-DD" } ]
// This merges them into races[rk].adimpact + logs a changelog line, then archives the queue.
//
// Mapping (tracker raceKey -> AdImpact race name in the "Fight Agency Political
// Campaign Comp 2026" workbook) — the 12 of our races this workbook covers:
//   CA-22→"CA CD-22 2026"  CA-4→"CA CD-04 2026"  PA-8→"PA CD-08 2026"  PA-7→"PA CD-07 2026"
//   NE-Sen→"NE Senate 2026"  ME-Sen→"ME Senate 2026"  MI-Sen→"MI Senate 2026"  MI-13→"MI CD-13 2026"
//   AK-Sen→"AK Senate 2026"  NY-13→"NY CD-13 2026"  NY-7→"NY CD-07 2026"  TX-Gov→"TX Governor 2026"
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const dataPath = path.join(dir, 'data.json');
const qPath = path.join(dir, 'adimpact-queue.json');
const today = new Date().toISOString().slice(0, 10);

if (!fs.existsSync(qPath)) { console.log('No adimpact-queue.json — nothing to ingest.'); process.exit(0); }
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const q = JSON.parse(fs.readFileSync(qPath, 'utf8'));
const notes = [];

for (const e of q) {
  const r = data.races[e.raceKey];
  if (!r) { console.log(`  ? unknown raceKey: ${e.raceKey}`); continue; }
  r.adimpact = {
    demSide: e.demSide ?? null, repSide: e.repSide ?? null,
    total: e.total ?? ((e.demSide || 0) + (e.repSide || 0) || null),
    asOf: e.asOf || today,
  };
  notes.push(`${e.raceKey}: D ${fmt(r.adimpact.demSide)} / R ${fmt(r.adimpact.repSide)}`);
}
function fmt(n){ return n==null?'—':(n>=1e6?'$'+(n/1e6).toFixed(1)+'M':'$'+Math.round(n).toLocaleString()); }

data.lastUpdated = today;
data.changelog = data.changelog || [];
if (notes.length) data.changelog.unshift({ ts: today, note: `AdImpact race totals: ${notes.slice(0,8).join(' · ')}` });
data.changelog = data.changelog.slice(0, 30);
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
require('./wrap.js');
fs.renameSync(qPath, path.join(dir, `adimpact-queue.${today}.done.json`));
console.log(`AdImpact ingest: ${notes.length} race(s) updated; queue archived.`);
