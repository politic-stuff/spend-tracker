#!/usr/bin/env node
// Merge AdImpact "Spending Recap" email data (data/inbox-recaps.json) into the tracker
// for races AdMo creatives didn't cover but AdImpact still tracks (e.g. NY CD-07).
// Recaps give clean per-advertiser election-to-date TOTALS (no weekly/market detail),
// so this sets race.spenders + race.adimpact totals, preserving candidates/FEC/buys.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const recaps = JSON.parse(fs.readFileSync(path.join(dir, 'inbox-recaps.json'), 'utf8'));

const report = [];
for (const [rk, r] of Object.entries(recaps)) {
  const race = data.races[rk];
  if (!race) { report.push(`  ?? ${rk}: not a tracked race`); continue; }
  race.spenders = r.spenders.map(s => ({ name: s.name, side: s.side, amount: s.total, source: 'inbox' }))
    .sort((a, z) => z.amount - a.amount);
  const dem = r.spenders.filter(s => s.side === 'D').reduce((a, s) => a + s.total, 0);
  const rep = r.spenders.filter(s => s.side === 'R').reduce((a, s) => a + s.total, 0);
  race.adimpact = { demSide: dem, repSide: rep, total: dem + rep, asOf: new Date().toISOString().slice(0, 10), source: r.source || 'Inbox (spending recap)' };
  report.push(`  ${rk}: ${r.spenders.length} advertisers, $${(dem + rep).toLocaleString()} (D $${dem.toLocaleString()} / R $${rep.toLocaleString()})`);
}
data.lastUpdated = new Date().toISOString().slice(0, 10);
data.changelog = data.changelog || [];
data.changelog.unshift({ ts: data.lastUpdated, note: `Inbox spending-recap backfill: ${Object.keys(recaps).join(', ')}` });
data.changelog = data.changelog.slice(0, 40);
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2));
require('./wrap.js');
console.log('Recap backfill:');
console.log(report.join('\n'));
