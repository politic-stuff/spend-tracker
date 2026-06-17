#!/usr/bin/env node
// Merge inbox-sourced TV buys (data/inbox-buys.json) into the tracker for races
// AdMo doesn't cover. Adds race.buys[] + rebuilds spenders + sets adimpact totals,
// preserving candidates/FEC. Buys are tagged confirmed-inbox. Idempotent (dedup by
// race|station|flight|amount). Source: scripts/parse-digest.js output / manual.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const buysByRace = JSON.parse(fs.readFileSync(path.join(dir, 'inbox-buys.json'), 'utf8'));
const GENERAL = new Date('2026-11-03');
const tueOnOrBefore = d => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 5) % 7)); return x; };
const mediaWeek = s => { if (!s) return null; const a = tueOnOrBefore(GENERAL); a.setDate(a.getDate() - 7); return Math.round((a - tueOnOrBefore(s)) / (7 * 864e5)) + 1; };

const report = [];
for (const [rk, buys] of Object.entries(buysByRace)) {
  const race = data.races[rk];
  if (!race) { report.push(`  ?? ${rk}: not a tracked race, skipped`); continue; }
  race.buys = race.buys || [];
  const seen = new Set(race.buys.map(b => [b.station || b.market, b.flightStart, b.flightEnd, b.amount].join('|')));
  let added = 0;
  for (const b of buys) {
    const key = [b.station || b.market, b.flightStart, b.flightEnd, b.amount].join('|');
    if (seen.has(key)) continue; seen.add(key);
    race.buys.push({ ...b, week: mediaWeek(b.flightStart), source: b.source || 'confirmed-inbox' });
    added++;
  }
  // rebuild spenders from all buys (advertiser totals)
  const spend = {};
  for (const b of race.buys) { const k = b.advertiser || '?'; (spend[k] = spend[k] || { side: b.side || 'D', amount: 0 }).amount += b.amount || 0; }
  race.spenders = Object.entries(spend).map(([name, v]) => ({ name, side: v.side, amount: Math.round(v.amount), source: 'inbox' })).sort((a, z) => z.amount - a.amount);
  const dem = race.buys.filter(b => b.side === 'D').reduce((s, b) => s + (b.amount || 0), 0);
  const rep = race.buys.filter(b => b.side === 'R').reduce((s, b) => s + (b.amount || 0), 0);
  race.adimpact = { demSide: Math.round(dem), repSide: Math.round(rep), total: Math.round(dem + rep), asOf: new Date().toISOString().slice(0, 10), source: 'Inbox (station buys)' };
  report.push(`  ${rk}: +${added} buys, ${race.spenders.length} advertiser(s), $${(dem + rep).toLocaleString()} TV tracked`);
}

data.lastUpdated = new Date().toISOString().slice(0, 10);
data.changelog = data.changelog || [];
data.changelog.unshift({ ts: data.lastUpdated, note: `Inbox TV-buy backfill: ${Object.keys(buysByRace).join(', ')}` });
data.changelog = data.changelog.slice(0, 40);
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2));
require('./wrap.js');
console.log('Inbox buys merged:');
console.log(report.join('\n'));
