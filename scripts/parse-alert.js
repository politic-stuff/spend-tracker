#!/usr/bin/env node
// Parse an AdImpact "Ad Alert" email body -> {advertiser,title,election,tone,themes}
// and apply tone+themes onto matching creatives in data.json. This is the loop's
// enrichment step: each new Ad Alert email carries TONE + ISSUES per spot, which
// the Tone/Issue *filters* expose only via tedious per-value harvesting. The email
// is the clean per-creative source.
//
// Usage (loop): node scripts/parse-alert.js data/inbox-alerts/*.txt   # apply to data.json
//   each .txt = one Ad Alert email body (innerText).
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');

// AdImpact granular issue -> friendly theme (coworker's vocabulary); unmapped issues pass through.
const THEME_ALIAS = {
  'cost of living': 'Cost', 'taxes': 'Cost', 'inflation': 'Cost', 'economy': 'Cost', 'tariffs': 'Cost', 'prices': 'Cost',
  'health care': 'Healthcare', 'healthcare': 'Healthcare', 'medicaid': 'Healthcare', 'medicare': 'Healthcare', 'obamacare': 'Healthcare',
  'veterans': 'Veterans', 'military': 'Veterans',
  'fishing': 'Fish prices', 'fisheries': 'Fish prices', 'seafood': 'Fish prices',
  'biography': 'Bio', 'character': 'Bio', 'personal': 'Bio',
};
const theme = s => { const k = s.trim().toLowerCase(); return THEME_ALIAS[k] || s.trim(); };

function field(body, label) {
  // fields render as "LABEL\n<value>\n" in the email innerText
  const re = new RegExp(label + '\\s*\\n+\\s*([^\\n]+)', 'i');
  const m = body.match(re);
  return m ? m[1].trim() : null;
}
function parseAlert(body) {
  const advertiser = field(body, 'ADVERTISER');
  const title = field(body, 'SPOT TITLE');
  const election = field(body, 'ELECTION');
  const toneRaw = (field(body, 'TONE') || '').toLowerCase();
  const tone = /positive/.test(toneRaw) ? 'positive' : /negative/.test(toneRaw) ? 'negative' : /contrast|comparison/.test(toneRaw) ? 'contrast' : null;
  const issuesRaw = field(body, 'ISSUES') || '';
  const themes = [...new Set(issuesRaw.split(',').map(theme).filter(Boolean))];
  return { advertiser, title, election, tone, themes };
}

// ELECTION string ("AK Senate 2026 General") -> our raceKey
function electionToRace(el) {
  if (!el) return null;
  let m = el.match(/\b([A-Z]{2})\s+CD-?0*(\d+)\b/i); if (m) return `${m[1].toUpperCase()}-${+m[2]}-2026`;
  m = el.match(/\b([A-Z]{2})\s+Senate\b/i); if (m) return `${m[1].toUpperCase()}-Sen-2026`;
  m = el.match(/\b([A-Z]{2})\s+Governor\b/i); if (m) return `${m[1].toUpperCase()}-Gov-2026`;
  return null;
}
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function applyAlerts(bodies) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
  let applied = 0, unmatched = 0;
  for (const body of bodies) {
    const a = parseAlert(body);
    if (!a.advertiser || !a.title || (!a.tone && !a.themes.length)) continue;
    const rk = electionToRace(a.election);
    const race = rk && data.races[rk];
    if (!race || !race.creativesByAdvertiser) { unmatched++; continue; }
    let hit = false;
    for (const adv of Object.keys(race.creativesByAdvertiser)) {
      if (norm(adv) !== norm(a.advertiser)) continue;
      for (const c of race.creativesByAdvertiser[adv]) {
        if (norm(c.title) === norm(a.title)) {
          if (a.tone) c.tone = a.tone;
          if (a.themes.length) c.themes = a.themes;
          hit = true; applied++;
        }
      }
    }
    if (!hit) unmatched++;
  }
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2));
  require('./wrap.js');
  return { applied, unmatched };
}

module.exports = { parseAlert, electionToRace, applyAlerts };

if (require.main === module) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: parse-alert.js <alert.txt ...>'); process.exit(1); }
  const bodies = files.map(f => fs.readFileSync(f, 'utf8'));
  const r = applyAlerts(bodies);
  console.log(`Applied tone/themes to ${r.applied} creative(s); ${r.unmatched} alert(s) unmatched.`);
}
