#!/usr/bin/env node
// Import harvested AdMo creatives (data/admo-creatives.json) into the tracker.
// Builds race.creativesByAdvertiser{advertiser:[{thumb,link,title,type}]} so the
// detail page can expand a spender row into its actual ad creatives.
// Thumbnail + playable video are public S3 objects keyed by the creative UUID:
//   thumb  = https://pdfweb.s3.amazonaws.com/videos/<uuid>.webp
//   video  = https://pdfweb.s3.amazonaws.com/videos/<uuid>.mp4
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const harvest = JSON.parse(fs.readFileSync(path.join(dir, 'admo-creatives.json'), 'utf8'));
const S3 = 'https://pdfweb.s3.amazonaws.com/videos/';

let totalCr = 0, totalRaces = 0;
const report = [];
for (const [rk, creatives] of Object.entries(harvest)) {
  const race = data.races[rk];
  if (!race) { report.push(`  ?? ${rk}: race not found, skipped`); continue; }
  const byAdv = {};
  for (const c of creatives) {
    if (!c.uuid) continue;
    (byAdv[c.advertiser] = byAdv[c.advertiser] || []).push({
      thumb: S3 + c.uuid + '.webp',
      link: S3 + c.uuid + '.mp4',
      title: c.title || 'Ad creative',
      type: 'Video',
    });
  }
  race.creativesByAdvertiser = byAdv;
  totalRaces++; totalCr += creatives.length;
  // coverage: how many creative-advertisers match a spender name
  const spNames = new Set((race.spenders || []).map(s => s.name));
  const advs = Object.keys(byAdv);
  const matched = advs.filter(a => spNames.has(a));
  const unmatched = advs.filter(a => !spNames.has(a));
  report.push(`  ${rk}: ${creatives.length} creatives, ${advs.length} advertisers — ${matched.length} match a spender${unmatched.length ? `, ${unmatched.length} no-spend: ${unmatched.slice(0, 4).join('; ')}${unmatched.length > 4 ? '…' : ''}` : ''}`);
}

data.lastUpdated = new Date().toISOString().slice(0, 10);
data.changelog = data.changelog || [];
data.changelog.unshift({ ts: data.lastUpdated, note: `AdMo creatives: ${totalCr} ad creatives across ${totalRaces} races (click a spender to watch)` });
data.changelog = data.changelog.slice(0, 40);
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2));
require('./wrap.js');
console.log(`Imported ${totalCr} creatives across ${totalRaces} races:`);
console.log(report.join('\n'));
