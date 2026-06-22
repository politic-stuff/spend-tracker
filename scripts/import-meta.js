#!/usr/bin/env node
// Merge Meta Ad Library summaries (data/meta.json) into candidate.ads as a Meta
// summary card linking to the Ad Library (creatives aren't embeddable — fbcdn
// expires/hotlink-protected). One card per candidate: ad count + top impressions.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
const adLib = q => 'https://www.facebook.com/ads/library/?active_status=active&ad_type=political_and_issue_ads&country=US&q=' + encodeURIComponent(q) + '&search_type=keyword_unordered';

const byName = {};
for (const c of data.candidates) (byName[c.name] = byName[c.name] || []).push(c);
let set = 0; const usedNames = new Set();
for (const [name, m] of Object.entries(meta)) {
  if (name.startsWith('_')) continue;
  const cs = byName[name];
  if (!cs) continue;                        // not a candidate — may be a spender (handled below)
  usedNames.add(name);
  if (!m.n) continue;                       // 0 active ads → no card
  const last = name.split(' ').slice(-1)[0];
  for (const c of cs) {
    c.ads = (c.ads || []).filter(a => a.platform !== 'Meta');
    c.ads.push({ platform: 'Meta', title: m.n + ' Meta/Instagram political ads',
      sub: 'ads mentioning ' + last + (m.imp ? ' · top ' + m.imp + ' impressions' : ''),
      url: adLib(m.q || name), type: 'Meta' });
  }
  set++;
}

// Attach to spender rows (PACs/outside groups render as advertiser rows, not
// candidate blocks). Match meta.json key to spender.name; skip 0-ad entries.
let spSet = 0;
for (const rk in data.races) {
  for (const s of (data.races[rk].spenders || [])) {
    const m = meta[s.name];
    if (m && m.n) { s.metaAds = { n: m.n, imp: m.imp, url: adLib(m.q || s.name) }; spSet++; usedNames.add(s.name); }
    else if (s.metaAds) delete s.metaAds;
    if (m) usedNames.add(s.name);
  }
}
const missing = Object.keys(meta).filter(n => !n.startsWith('_') && !usedNames.has(n));
data.lastUpdated = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2));
require('./wrap.js');
console.log(`Meta cards set for ${set} candidates + ${spSet} spender rows.${missing.length ? ' Name not found: ' + missing.join(', ') : ''}`);
