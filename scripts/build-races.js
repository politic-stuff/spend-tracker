#!/usr/bin/env node
// Restructure into the RACE-FIELD model. Drives off the opponent research in
// data/_field/group*.json (one object per race) + the current tracked-candidate
// data (FEC/YouTube/AdImpact already pulled) in data/data.json.
//
// Output (data/data.json):
//   races: { raceKey: {state, office, primaryDate, generalDate, status, seatHeldBy,
//                      notes, confidence, adimpact:{demSide,repSide,total,asOf}} }
//   candidates: [ {name, party, relationship:'tracked'|'primary-opp'|'general-opp',
//                  raceKey, office, state, level, result, status, links, fecId, spend, ads} ]
// Flat candidates keep every feeder working unchanged; the dashboard groups by raceKey.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const fieldDir = path.join(dir, '_field');

const cur = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const research = [];
for (const f of fs.readdirSync(fieldDir).filter(f => /^group.*\.json$/.test(f))) {
  for (const r of JSON.parse(fs.readFileSync(path.join(fieldDir, f), 'utf8'))) {
    if (!r._skip && r.raceKey) research.push(r);
  }
}

const FULL = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',DC:'Washington, D.C.',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
const normState = s => FULL[s] || s; // accepts abbr or full
const isFed = office => /\bU\.?S\.?\s+(House|Senate)\b/i.test(office || '');
const norm = n => (n || '').toLowerCase().replace(/^(dr|mr|ms|mrs)\.?\s+/, '').trim();

const trackedByName = new Map(cur.candidates.map(c => [norm(c.name), c]));

const races = {};
const candidates = [];

for (const r of research) {
  const tracked = trackedByName.get(norm(r.ourCandidate));
  const status = (tracked && (tracked.result === 'won' || tracked.raceType === 'general')) ? 'general' : 'primary';
  const race = {
    raceKey: r.raceKey, state: normState(r.state), office: r.office,
    primaryDate: r.primaryDate || tracked?.raceDate || null, generalDate: '2026-11-03',
    status, seatHeldBy: r.seatHeldBy || null, notes: r.notes || null,
    confidence: r.confidence || 'med', adimpact: null,
  };

  // our tracked candidate — carry over FEC/YouTube data; lift any AdImpact rows to race level
  if (tracked) {
    const ai = (tracked.spend || []).filter(s => s.confidence === 'adimpact');
    if (ai.length) {
      const sup = ai.find(x => x.bucket === 'support'), opp = ai.find(x => x.bucket === 'oppose');
      race.adimpact = { demSide: sup?.amount ?? null, repSide: opp?.amount ?? null,
        total: (sup?.amount || 0) + (opp?.amount || 0) || null, asOf: sup?.asOf || opp?.asOf || null };
    }
    candidates.push({
      name: tracked.name, party: r.ourParty || 'D', relationship: 'tracked', raceKey: r.raceKey,
      office: r.office, state: normState(r.state), level: tracked.level, result: tracked.result || null,
      status: 'our candidate', links: tracked.links || {}, fecId: tracked.fecId || null,
      spend: (tracked.spend || []).filter(s => s.confidence !== 'adimpact'), ads: tracked.ads || [],
    });
  } else {
    candidates.push({ name: r.ourCandidate, party: r.ourParty || 'D', relationship: 'tracked', raceKey: r.raceKey,
      office: r.office, state: normState(r.state), level: isFed(r.office) ? 'federal' : 'state',
      result: null, status: 'our candidate', links: {}, fecId: null, spend: [], ads: [] });
  }

  const addOpp = (o, rel) => candidates.push({
    name: o.name, party: o.party || '?', relationship: rel, status: o.status || null, raceKey: r.raceKey,
    office: r.office, state: normState(r.state), level: isFed(r.office) ? 'federal' : 'state',
    result: null, links: {}, fecId: null, spend: [], ads: [],
  });
  for (const p of r.primaryOpponents || []) addOpp(p, 'primary-opp');
  for (const g of r.generalOpponents || []) addOpp(g, 'general-opp');
  races[r.raceKey] = race;
}

const fed = candidates.filter(c => c.level === 'federal').length;
const data = {
  lastUpdated: cur.lastUpdated, cycle: '2026', sources: cur.sources,
  counts: { races: Object.keys(races).length, candidates: candidates.length, federal: fed, state: candidates.length - fed },
  changelog: [{ ts: new Date().toISOString().slice(0, 10), note: `Restructured to race-field model: ${Object.keys(races).length} races, ${candidates.length} candidates (tracked + opponents).` }, ...(cur.changelog || [])].slice(0, 30),
  races, candidates,
};
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2));
require('./wrap.js');
console.log(`Race-field model: ${data.counts.races} races, ${data.counts.candidates} candidates (${fed} federal, ${candidates.length - fed} state)`);
