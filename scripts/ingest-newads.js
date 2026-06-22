#!/usr/bin/env node
// "New-ad radar" ingest. Reads data/newads-queue.json — a list of newly-spotted
// ads from ANY source (AdImpact Twitter via a Grok task, the competitive-inbox
// Ad Alerts, manual) — and routes each onto the right race as a creative under
// its advertiser. Reuses the existing creative cards + active-airing-first sort,
// so a fresh ad shows up first in its advertiser's strip with a NEW badge.
//
// Queue entry shape (all but raceKey/advertiser/link optional):
// { raceKey, advertiser, title, link, type ("TV"|"Digital"|"Video"),
//   start ("YYYY-MM-DD"), opposes, supports, party ("D"|"R"), source, note }
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const queue = JSON.parse(fs.readFileSync(path.join(dir, 'newads-queue.json'), 'utf8'));
const fmtD = ds => { if (!ds) return ''; const [y, m, d] = ds.split('-').map(Number); return m + '/' + d + (y !== 2026 ? '/' + String(y).slice(2) : ''); };

let added = 0, dupe = 0, miss = 0;
for (const e of queue) {
  if (e._done) continue;                          // already ingested (kept for audit)
  const race = data.races[e.raceKey];
  if (!race || !e.advertiser || !e.link) { miss++; continue; }
  // ensure a spender row exists so the advertiser renders
  race.spenders = race.spenders || [];
  let sp = race.spenders.find(s => s.name === e.advertiser);
  if (!sp) { sp = { name: e.advertiser, amount: 0, side: e.party === 'R' ? 'r' : e.party === 'D' ? 'd' : '', isNew: true }; race.spenders.push(sp); }
  race.creativesByAdvertiser = race.creativesByAdvertiser || {};
  const list = race.creativesByAdvertiser[e.advertiser] = race.creativesByAdvertiser[e.advertiser] || [];
  if (list.some(c => c.link === e.link)) { dupe++; continue; }   // dedupe by link
  list.unshift({
    title: e.title || 'New ad', link: e.link, thumb: e.thumb || '',
    type: e.type || 'Video', sub: e.source || 'New ad',
    flightStart: e.start || '', flightEnd: e.start || '', flightPresent: true,
    aired: e.start ? 'Aired ' + fmtD(e.start) + ' – present' : 'New — now airing',
    isNew: true, source: e.source || '', oppose: e.opposes || '', note: e.note || ''
  });
  added++;
  e._done = new Date ? undefined : undefined;     // (timestamp stamped by caller if desired)
}
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2));
require('./wrap.js');
console.log(`New-ad ingest: ${added} added, ${dupe} already present, ${miss} unmatched.`);
