#!/usr/bin/env node
// Builds data/data.js (the living data file the dashboard reads and the
// scheduled agent rewrites) from the extracted race seed. Run once to seed;
// after that the feeder agent maintains data.js directly.
const fs = require('fs');
const path = require('path');
const seed = require(path.join(__dirname, '..', 'data', 'races.seed.json'));

// Seed a few CLEARLY-LABELLED sample rows on one active race so the UI has
// something to show before the live feeders run. confidence:'sample' → the
// dashboard badges these as placeholder and the first real run overwrites them.
const samples = {
  'Abdul El-Sayed': {
    spend: [
      { actor: 'Abdul For Senate (candidate)', type: 'candidate', amount: 0, source: 'FEC', confidence: 'sample', asOf: null },
      { actor: 'Outside groups (IE)', type: 'outside', amount: 0, source: 'FEC Schedule E', confidence: 'sample', asOf: null },
    ],
    ads: [
      { title: 'Sample ad — replaced on first feeder run', url: 'https://www.youtube.com/@abdulelsayed', platform: 'YouTube', source: 'YouTube RSS', firstSeen: null },
    ],
  },
};

for (const c of seed.candidates) {
  const s = samples[c.name];
  if (s) { c.spend = s.spend; c.ads = s.ads; }
}

const data = {
  // NOTE: timestamps are set by the feeder agent at run time (scripts can't
  // call Date.now() in some contexts); left null on initial seed.
  lastUpdated: null,
  cycle: '2026',
  sources: {
    federalSpend: 'FEC OpenFEC API (api.open.fec.gov)',
    adCreatives: ['YouTube channel RSS', 'Meta Ad Library (public, via Chrome ext.)'],
    reference: 'AdImpact public projections',
    manual: ['Competitive inbox (via Chrome ext.)', 'AdImpact paid account (via Chrome ext.)'],
  },
  changelog: [
    { ts: null, note: 'Initial seed from primary-countdown. No live data pulled yet.' },
  ],
  counts: seed.counts,
  candidates: seed.candidates,
};

const dir = path.join(__dirname, '..', 'data');
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2));
require('./wrap.js'); // regenerate the browser wrapper from data.json
console.log(`Seeded data/data.json + data/data.js — ${data.candidates.length} candidates`);
