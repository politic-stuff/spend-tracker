#!/usr/bin/env node
// Merge researched support/oppose attribution (data/affiliations.json) into
// data.json as race.affiliations{advertiser:{supports|opposes:candidateName}}.
// The detail page's affiliate() checks this before the party-side heuristic, so
// primary PACs land under the specific candidate they back. Validates names.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const aff = JSON.parse(fs.readFileSync(path.join(dir, 'affiliations.json'), 'utf8'));

const report = [];
for (const [rk, map] of Object.entries(aff)) {
  if (rk.startsWith('_')) continue;
  const race = data.races[rk];
  if (!race) { report.push(`  ?? ${rk}: not a tracked race`); continue; }
  const candNames = new Set(data.candidates.filter(c => c.raceKey === rk).map(c => c.name));
  const spenderNames = new Set((race.spenders || []).map(s => s.name));
  const clean = {};
  let ok = 0, badCand = [], noSpend = [];
  for (const [adv, v] of Object.entries(map)) {
    const target = v.supports || v.opposes;
    if (!candNames.has(target)) { badCand.push(`${adv}→${target}`); continue; }
    if (!spenderNames.has(adv)) noSpend.push(adv);   // attribution kept, but advertiser not in current spend data
    clean[adv] = v.supports ? { supports: v.supports } : { opposes: v.opposes };
    ok++;
  }
  race.affiliations = clean;
  report.push(`  ${rk}: ${ok} attributions set${badCand.length ? ` — BAD CANDIDATE NAME: ${badCand.join(', ')}` : ''}${noSpend.length ? ` — (not in spenders, ignored at render: ${noSpend.join(', ')})` : ''}`);
}
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2));
require('./wrap.js');
console.log('Affiliations merged:');
console.log(report.join('\n'));
