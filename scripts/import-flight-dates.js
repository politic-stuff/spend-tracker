#!/usr/bin/env node
// Attach AdImpact flight windows to each creative. data/flight-raw.json is the
// harvested uuid -> {s,e} map (first/last airing within the cycle-wide date
// range). We match by the 8-char uuid prefix embedded in each creative's thumb/
// link URL, then write a human "Aired M/D – M/D" / "– present" string.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const raw = JSON.parse(fs.readFileSync(path.join(dir, 'flight-raw.json'), 'utf8'));

const pfx = {};
let maxEnd = '';
for (const k in raw) { pfx[k.slice(0, 8)] = raw[k]; if (raw[k].e > maxEnd) maxEnd = raw[k].e; }

const fmt = ds => { const [y, m, d] = ds.split('-').map(Number); return m + '/' + d + (y !== 2026 ? '/' + String(y).slice(2) : ''); };
const uuidOf = c => (((c.thumb || '') + (c.link || '')).match(/([a-f0-9]{8})-[a-f0-9]{4}-/) || [])[1];

let matched = 0, miss = 0, present = 0;
for (const rk in data.races) {
  const by = data.races[rk].creativesByAdvertiser || {};
  for (const adv in by) for (const c of by[adv]) {
    const u = uuidOf(c), fd = u && pfx[u];
    if (!fd) { delete c.aired; delete c.flightEnd; miss++; continue; }
    const isPresent = fd.e >= maxEnd;
    c.flightStart = fd.s; c.flightEnd = fd.e; c.flightPresent = isPresent;
    c.aired = 'Aired ' + fmt(fd.s) + (fd.s === fd.e ? '' : ' – ' + (isPresent ? 'present' : fmt(fd.e)));
    matched++; if (isPresent) present++;
  }
}
data.flightDataDate = maxEnd;
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2));
require('./wrap.js');
console.log(`Flight dates: ${matched} creatives tagged (${present} still airing), ${miss} unmatched. Latest data ${maxEnd}.`);
