#!/usr/bin/env node
// Parse a competitive-buy DIGEST email body (e.g. "NEW POLITICAL ORDERS THIS WEEK",
// "Ampersand Political Competitive Update", "Nexstar Political Comp") OR a per-buy
// station email body into attributed TV-buy rows for our tracked races.
//
// Reusable engine for the scheduled inbox loop. Usage:
//   node scripts/parse-digest.js data/inbox-digests/*.txt        # parse files -> stdout JSON
//   echo "<digest text>" | node scripts/parse-digest.js -        # parse stdin
// Returns {raceKey:[{advertiser,market,station,flightStart,flightEnd,amount,week,source}]}.
//
// Attribution is intentionally CONSERVATIVE — an explicit race tag in the advertiser
// string ("(NY CD 12)", "for ME Senate") wins; otherwise only DISTINCTIVE surnames
// match (common ones like Brown/Miller/Taylor are excluded to avoid false hits).
const fs = require('fs');
const path = require('path');
const GENERAL = new Date('2026-11-03');

const OUR_RACES = new Set(require(path.join(__dirname, '..', 'data', 'data.json')).races ? Object.keys(require(path.join(__dirname, '..', 'data', 'data.json')).races) : []);
// races AdMo already covers — skip to avoid double-counting their spend
let HARVESTED = new Set();
try { HARVESTED = new Set(Object.keys(require(path.join(__dirname, '..', 'data', 'admo-creatives.json')))); } catch {}

// distinctive surname -> raceKey (common surnames deliberately omitted)
const SURNAME = {
  ramirez:'IL-3-2026', oakley:'IL-3-2026', poindexter:'OH-7-2026', hayes:'PA-12-2026',
  kulewicz:'OH-AG-2026', faber:'OH-AG-2026', emrick:'PA-HD137-2026', wrightson:'PA-SD40-2026',
  warshaw:'NY-Comptroller-2026', dinapoli:'NY-Comptroller-2026', goyle:'NY-Comptroller-2026',
  lander:'NY-10-2026', goldman:'NY-10-2026', valdez:'NY-7-2026', reynoso:'NY-7-2026',
  lasher:'NY-12-2026', bores:'NY-12-2026', schlossberg:'NY-12-2026', schwalbe:'NY-12-2026',
  blouin:'UT-1-2026', mcadams:'UT-1-2026', seligman:'CO-AG-2026', griswold:'CO-AG-2026',
  dougherty:'CO-AG-2026', laubacher:'CO-4-2026', boebert:'CO-4-2026', mckinney:'MI-13-2026',
  thanedar:'MI-13-2026', onwenu:'MI-SD1-2026', aiyash:'MI-SD1-2026', pearson:'TN-9-2026',
  lamar:'TN-9-2026', barnes:'WI-Gov-2026', crowley:'WI-Gov-2026', roys:'WI-Gov-2026',
  tiffany:'WI-Gov-2026', kreisstomkins:'AK-Gov-2026', mujica:'FL-Sen-2026', vindman:'FL-Sen-2026',
  moody:'FL-Sen-2026', casar:'TX-37-2026', stratton:'IL-Sen-2026',
};

function raceFromAdvertiser(adv) {
  const a = (adv || '').toLowerCase();
  // explicit race tags
  let m = a.match(/\(?([a-z]{2})\s*cd[\s-]*0*(\d{1,2})\)?/);          // "NY CD 12", "(CA CD-04)"
  if (m) { const rk = `${m[1].toUpperCase()}-${+m[2]}-2026`; if (OUR_RACES.has(rk)) return rk; }
  m = a.match(/\bfor\s+([a-z]{2})\s+senate\b/) || a.match(/\b([a-z]{2})\s+senate\b/);
  if (m) { const rk = `${m[1].toUpperCase()}-Sen-2026`; if (OUR_RACES.has(rk)) return rk; }
  m = a.match(/\b([a-z]{2})\s+governor\b/) || a.match(/\bfor\s+([a-z]{2})\s+gov\b/);
  if (m) { const rk = `${m[1].toUpperCase()}-Gov-2026`; if (OUR_RACES.has(rk)) return rk; }
  // distinctive surname
  const clean = a.replace(/[^a-z\s'-]/g, ' ');
  for (const [sn, rk] of Object.entries(SURNAME)) {
    if (new RegExp(`\\b${sn}\\b`).test(clean.replace(/[''-]/g, ''))) return rk;
  }
  return null;
}

function tueOnOrBefore(d) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 5) % 7)); return x; }
function mediaWeek(start) {
  if (!start) return null;
  const anchor = tueOnOrBefore(GENERAL); anchor.setDate(anchor.getDate() - 7);
  return Math.round((anchor - tueOnOrBefore(start)) / (7 * 864e5)) + 1;
}
function iso(mdY) { const m = mdY.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; return `${y}-${String(+m[1]).padStart(2,'0')}-${String(+m[2]).padStart(2,'0')}`; }

// parse digest/email text -> raw buy rows
function parseRows(text) {
  const flat = (text || '').replace(/\s+/g, ' ');
  const rows = [];
  const re = /([A-Z]{3,5}(?:-TV)?)\s+(.+?)\s+(\d{2,7})\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+\$([\d,]+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(flat))) {
    const adv = m[2].trim();
    if (/^(orders?|new|property|advertiser|highlighted)/i.test(adv)) continue; // header noise
    rows.push({ station: m[1], advertiser: adv, flightStart: iso(m[4]), flightEnd: iso(m[5]), amount: Math.round(+m[6].replace(/,/g, '')) });
  }
  return rows;
}

function attribute(rows) {
  const out = {};
  const seen = new Set();
  for (const r of rows) {
    const rk = raceFromAdvertiser(r.advertiser);
    if (!rk || HARVESTED.has(rk)) continue;            // only un-harvested tracked races
    const key = [rk, r.station, r.flightStart, r.flightEnd, r.amount].join('|');
    if (seen.has(key)) continue; seen.add(key);        // dedup identical re-reports
    (out[rk] = out[rk] || []).push({
      advertiser: r.advertiser.replace(/\s*-\s*:?\d+s?.*$/, '').replace(/\s*\(.*?\)\s*$/, '').trim(),
      side: 'D', market: r.station, station: r.station,
      flightStart: r.flightStart, flightEnd: r.flightEnd, amount: r.amount,
      week: mediaWeek(r.flightStart), source: 'confirmed-inbox',
    });
  }
  return out;
}

module.exports = { parseRows, attribute, raceFromAdvertiser };

if (require.main === module) {
  const args = process.argv.slice(2);
  let text = '';
  if (args.length === 1 && args[0] === '-') text = fs.readFileSync(0, 'utf8');
  else for (const f of args) text += '\n' + fs.readFileSync(f, 'utf8');
  const result = attribute(parseRows(text));
  console.log(JSON.stringify(result, null, 2));
}
