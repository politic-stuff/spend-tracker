#!/usr/bin/env node
// FEC feeder — federal candidates only. Resolves each candidate's FEC id once
// (cached on the record), then pulls (a) their own disbursements and (b)
// independent expenditures FOR / AGAINST (Schedule E aggregate — the near-real-
// time outside-ad-money signal). Updates data/data.json in place + changelog.
//
//   FEC_API_KEY=xxxx node scripts/feed-fec.js        # full run
//   LIMIT=3 node scripts/feed-fec.js                 # test a few (DEMO_KEY ok)
//
// Get a free key at https://api.open.fec.gov/developers/ (lifts the DEMO_KEY
// ~30/hr cap to 1,000/hr).
const fs = require('fs');
const path = require('path');

const KEY = process.env.FEC_API_KEY || 'DEMO_KEY';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const BASE = 'https://api.open.fec.gov/v1';
const dataPath = path.join(__dirname, '..', 'data', 'data.json');
const today = new Date().toISOString().slice(0, 10);

const ST = {Alabama:'AL',Alaska:'AK',Arizona:'AZ',Arkansas:'AR',California:'CA',Colorado:'CO',Connecticut:'CT',Delaware:'DE',Florida:'FL',Georgia:'GA',Hawaii:'HI',Idaho:'ID',Illinois:'IL',Indiana:'IN',Iowa:'IA',Kansas:'KS',Kentucky:'KY',Louisiana:'LA',Maine:'ME',Maryland:'MD',Massachusetts:'MA',Michigan:'MI',Minnesota:'MN',Mississippi:'MS',Missouri:'MO',Montana:'MT',Nebraska:'NE',Nevada:'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND',Ohio:'OH',Oklahoma:'OK',Oregon:'OR',Pennsylvania:'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD',Tennessee:'TN',Texas:'TX',Utah:'UT',Vermont:'VT',Virginia:'VA',Washington:'WA','Washington, D.C.':'DC','West Virginia':'WV',Wisconsin:'WI',Wyoming:'WY'};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(p, params) {
  const u = new URL(BASE + p);
  u.searchParams.set('api_key', KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u);
  if (res.status === 429) { const e = new Error('RATE_LIMIT'); e.rateLimited = true; throw e; }
  if (!res.ok) throw new Error(`${p} → ${res.status}`);
  await sleep(250); // be polite
  return res.json();
}

async function resolveId(c) {
  if (c.fecId) return c.fecId;
  const office = /Senate/.test(c.office) ? 'S' : 'H';
  const last = c.name.replace(/^(Dr\.|Mr\.|Ms\.) /, '').split(' ').pop();
  const d = await api('/candidates/search/', {
    q: last, election_year: 2026, office, state: ST[c.state] || '', per_page: 5,
  });
  const hit = (d.results || [])[0];
  return hit ? (c.fecId = hit.candidate_id) : null;
}

(async () => {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const fed = data.candidates.filter(c => c.level === 'federal').slice(0, LIMIT);
  const changes = [];
  let ok = 0;

  for (const c of fed) {
    try {
      const id = await resolveId(c);
      if (!id) { console.log(`  ? ${c.name}: no FEC match`); continue; }

      const totals = await api(`/candidate/${id}/totals/`, { election_year: 2026, per_page: 1 });
      const own = (totals.results || [])[0]?.disbursements || 0;
      const cov = (totals.results || [])[0]?.coverage_end_date?.slice(0, 10) || null;

      const ie = await api('/schedules/schedule_e/by_candidate/', {
        candidate_id: id, cycle: 2026, election_full: true, per_page: 50,
      });
      let support = 0, oppose = 0;
      for (const r of ie.results || []) {
        if (r.support_oppose_indicator === 'S') support += r.total || 0;
        else if (r.support_oppose_indicator === 'O') oppose += r.total || 0;
      }

      const prev = (c.spend || []).reduce((s, x) => s + (x.amount || 0), 0);
      c.spend = [
        { actor: `${c.name} (candidate)`, type: 'candidate', amount: own, source: 'FEC', confidence: 'FEC', asOf: cov },
        { actor: 'Outside spending — supporting', type: 'outside', amount: support, source: 'FEC Schedule E', confidence: 'FEC', asOf: today },
        { actor: 'Outside spending — opposing', type: 'outside', amount: oppose, source: 'FEC Schedule E', confidence: 'FEC', asOf: today },
      ].filter(r => r.amount > 0 || r.type === 'candidate');
      c.fecUpdated = today;

      const now = c.spend.reduce((s, x) => s + (x.amount || 0), 0);
      if (Math.round(now) !== Math.round(prev)) {
        changes.push(`${c.name} (${c.office}): $${prev.toLocaleString()} → $${now.toLocaleString()}`);
      }
      console.log(`  ✓ ${c.name}: own $${own.toLocaleString()} | for $${support.toLocaleString()} | against $${oppose.toLocaleString()}`);
      ok++;
    } catch (e) {
      if (e.rateLimited) { console.log('  ! rate limited — saving progress and stopping (use a real FEC_API_KEY to avoid)'); break; }
      console.log(`  ! ${c.name}: ${e.message}`);
    }
  }

  data.lastUpdated = today;
  data.changelog = data.changelog || [];
  if (changes.length) {
    data.changelog.unshift({ ts: today, note: `FEC: ${changes.length} race(s) moved. ` + changes.slice(0, 5).join(' · ') });
  } else {
    data.changelog.unshift({ ts: today, note: `FEC sync: ${ok} federal races checked, no spend changes.` });
  }
  data.changelog = data.changelog.slice(0, 30);

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  require('./wrap.js');
  console.log(`\nFEC feeder done: ${ok}/${fed.length} federal candidates updated. ${changes.length} changed.`);
})();
