#!/usr/bin/env node
// Compare AdImpact Race Overview advertiser totals (data/adimpact-scrub.json) vs
// our spenders. Threshold for "big": >$100K abs diff AND (>25% or missing).
//   - AdImpact HIGHER (undercount in ours)  -> AUTO-RAISE / ADD   (the NY-7 case)
//   - AdImpact LOWER  (ours higher)          -> FLAG ONLY, don't lower (could be
//     candidate-committee total disbursements or inbox mail/digital AdImpact misses)
// Pass --apply to write the raises/adds into data.json.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const scrub = JSON.parse(fs.readFileSync(path.join(dir, 'adimpact-scrub.json'), 'utf8'));
const apply = process.argv.includes('--apply');
const fmt = n => (n < 0 ? '-' : '') + '$' + (Math.abs(n) >= 1e6 ? (Math.abs(n) / 1e6).toFixed(2) + 'M' : Math.round(Math.abs(n) / 1e3) + 'K');
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

let raised = 0, added = 0, flagged = 0;
const flags = [];
for (const rk in scrub) {
  if (rk.startsWith('_')) continue;
  const race = data.races[rk]; if (!race) { console.log(`\n${rk}: NOT IN DATA`); continue; }
  const ai = scrub[rk].advertisers || {};
  const sp = race.spenders = race.spenders || [];
  const byNorm = {}; sp.forEach(s => byNorm[norm(s.name)] = s);
  const raises = [], adds = [], lowers = [];
  for (const [name, aiAmt] of Object.entries(ai)) {
    const ours = byNorm[norm(name)];
    const ourAmt = ours ? (ours.amount || 0) : 0;
    const diff = aiAmt - ourAmt;
    const pct = ourAmt ? Math.abs(diff) / ourAmt : 1;
    if (Math.abs(diff) <= 100000) continue;            // small — leave
    if (diff > 0 && (pct > 0.25 || !ours)) {            // AdImpact higher → raise/add
      if (ours) { raises.push({ name, from: ourAmt, to: aiAmt }); if (apply) { ours.amount = aiAmt; ours.confidence = 'adimpact'; ours.source = 'AdImpact 2026-06-22 scrub'; } raised++; }
      else { adds.push({ name, to: aiAmt }); if (apply) sp.push({ name, amount: aiAmt, side: '', confidence: 'adimpact', source: 'AdImpact 2026-06-22 scrub' }); added++; }
    } else if (diff < 0 && pct > 0.25 && ours) {        // ours higher → flag only
      lowers.push({ name, ours: ourAmt, ai: aiAmt }); flagged++;
    }
  }
  if (raises.length || adds.length || lowers.length) {
    console.log(`\n=== ${rk}  (AdImpact total ${fmt(scrub[rk].total)} vs ours) ===`);
    raises.forEach(r => console.log(`  RAISE  ${r.name.padEnd(32)} ${fmt(r.from)} -> ${fmt(r.to)}  (+${fmt(r.to - r.from)})`));
    adds.forEach(r => console.log(`  ADD    ${r.name.padEnd(32)} ${fmt(r.to)}  [missing in ours]`));
    lowers.forEach(r => { console.log(`  FLAG   ${r.name.padEnd(32)} ours ${fmt(r.ours)} > AdImpact ${fmt(r.ai)}  (left as-is)`); flags.push(`${rk}: ${r.name} ours ${fmt(r.ours)} vs AdImpact ${fmt(r.ai)}`); });
  } else console.log(`\n${rk}: clean (within threshold)`);
}
console.log(`\n--- ${raised} raised, ${added} added, ${flagged} flagged-for-review ---`);
if (apply) { data.lastUpdated = '2026-06-22'; fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2)); require('./wrap.js'); console.log('APPLIED + wrapped.'); }
else console.log('(dry run — re-run with --apply to write raises/adds)');
