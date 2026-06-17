#!/usr/bin/env node
// INBOX MATCHER — apply engine. The scheduled loop (Claude + Chrome ext reading
// the competitive inbox) writes parsed items to data/inbox-queue.json; this
// applies them: resolves the race, routes to candidate vs PAC/group, flags NEW
// spenders, lets corrections OVERWRITE prior inbox figures, logs every change.
//
// Queue item shape (the loop/agent produces these — it does the smart reading):
//   {
//     "advertiser": "Securing American Greatness",   // as named in the email
//     "amount": 399608,                               // dollars
//     "side": "R",                                    // D|R|I (optional; inferred for known)
//     "raceKey": "PA-7-2026",                         // agent resolves; or use districtHint
//     "districtHint": "PA CD-07",                     // fallback for resolver
//     "kind": "group",                                // "candidate" | "group"
//     "station": "WPVI", "flight": "6/16-6/23",       // optional context
//     "source": "competitive inbox (WPVI, 6/16-6/23)",
//     "sourceKey": "ampersand-pa7-sag",               // stable id → corrections overwrite
//     "correction": false
//   }
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const dataPath = path.join(dir, 'data.json');
const qPath = path.join(dir, 'inbox-queue.json');
const today = new Date().toISOString().slice(0, 10);
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---- race resolver: build aliases from raceKeys (STATE-MIDDLE-2026) ----
function buildAliases(data) {
  const map = {}; // alias -> raceKey
  for (const rk of Object.keys(data.races)) {
    const p = rk.split('-'); const st = p[0].toLowerCase(), mid = p[1];
    const add = a => { map[norm(a)] = rk; };
    if (/^\d+$/.test(mid)) { // House district — match both "7" and zero-padded "07"
      for (const m of [mid, mid.padStart(2, '0')])
        for (const f of [`${st} cd ${m}`, `${st} cd-${m}`, `${st} cd${m}`, `${st}-${m}`, `${st} ${m}`]) add(f);
    } else if (mid === 'Sen') { add(`${st} senate`); add(`${st} us senate`); add(`${st} sen`); }
    else if (mid === 'Gov') { add(`${st} governor`); add(`${st} gov`); }
    else if (mid === 'AG') { add(`${st} attorney general`); add(`${st} ag`); }
    else if (mid === 'Comptroller') add(`${st} comptroller`);
    else if (mid === 'InsComm') add(`${st} insurance commissioner`);
    else if (/^SD/.test(mid)) { add(`${st} sd ${mid.slice(2)}`); add(`${st} state senate ${mid.slice(2)}`); }
    else if (/^HD/.test(mid)) { add(`${st} hd ${mid.slice(2)}`); add(`${st} state house ${mid.slice(2)}`); }
    else if (mid === 'Delegate') { add(`${st} delegate`); }
  }
  return map;
}
function resolveRace(item, aliases) {
  if (item.raceKey) return item.raceKey;
  const hint = norm(item.districtHint || '');
  if (!hint) return null;
  // longest-alias-first so "ny cd 12" beats "ny 12"
  const keys = Object.keys(aliases).sort((a, b) => b.length - a.length);
  for (const a of keys) if (hint.includes(a)) return aliases[a];
  return null;
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const aliases = buildAliases(data);
if (!fs.existsSync(qPath)) { console.log('No inbox-queue.json — nothing to ingest.'); process.exit(0); }
const items = JSON.parse(fs.readFileSync(qPath, 'utf8')).spend || JSON.parse(fs.readFileSync(qPath, 'utf8'));

const changes = [], newSpenders = [], unmatched = [];

for (const it of (Array.isArray(items) ? items : [])) {
  const rk = resolveRace(it, aliases);
  if (!rk || !data.races[rk]) { unmatched.push(`${it.advertiser} (${it.districtHint || '?'})`); continue; }
  const cands = data.candidates.filter(c => c.raceKey === rk);
  const cand = cands.find(c => norm(c.name).includes(norm(it.advertiser)) || norm(it.advertiser).includes(norm(c.name).split(' ').pop()));

  if (it.kind === 'candidate' || cand) {
    // route to the candidate's own spend (reconciles with FEC; inbox wins)
    const c = cand || cands.find(c => c.relationship === 'tracked');
    if (!c) { unmatched.push(`${it.advertiser} (no candidate in ${rk})`); continue; }
    c.spend = c.spend || [];
    const key = `inbox:${it.sourceKey || it.station || 'tv'}`;
    const i = c.spend.findIndex(s => s._key === key);
    const row = { _key: key, actor: it.advertiser, type: 'candidate', bucket: 'self',
      amount: it.amount || 0, source: it.source || 'competitive inbox', confidence: 'confirmed-inbox',
      asOf: today, flight: it.flight || null };
    if (i >= 0) { c.spend[i] = row; changes.push(`✎ ${it.advertiser} (${rk}) → $${(it.amount||0).toLocaleString()}${it.correction ? ' [correction]' : ''}`); }
    else { c.spend.push(row); changes.push(`+ ${it.advertiser} (${rk}) $${(it.amount||0).toLocaleString()}`); }
  } else {
    // PAC / outside group → race.spenders
    const r = data.races[rk]; r.spenders = r.spenders || [];
    const si = r.spenders.findIndex(s => norm(s.name) === norm(it.advertiser));
    if (si >= 0) {
      // known spender (likely from AdImpact) — attach/refresh the inbox figure (don't clobber AdImpact cumulative)
      r.spenders[si].inbox = { amount: it.amount || 0, flight: it.flight || null, source: it.source || 'inbox', asOf: today };
      changes.push(`✎ ${it.advertiser} (${rk}) inbox $${(it.amount||0).toLocaleString()}${it.correction ? ' [correction]' : ''}`);
    } else {
      // NEW spender — surfaced only via the inbox. Add + flag.
      r.spenders.push({ name: it.advertiser, amount: it.amount || 0, side: it.side || '?',
        source: 'inbox', isNew: true, flight: it.flight || null, asOf: today });
      r.spenders.sort((a, b) => (b.amount || 0) - (a.amount || 0));
      newSpenders.push(`${it.advertiser} in ${rk} ($${(it.amount||0).toLocaleString()}, ${it.side||'?'})`);
    }
  }
}

data.lastUpdated = today;
data.changelog = data.changelog || [];
if (newSpenders.length) data.changelog.unshift({ ts: today, note: `🆕 NEW spender(s) via inbox: ${newSpenders.slice(0,6).join(' · ')}` });
if (changes.length) data.changelog.unshift({ ts: today, note: `Inbox: ${changes.slice(0,8).join(' · ')}` });
data.changelog = data.changelog.slice(0, 40);
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
require('./wrap.js');
fs.renameSync(qPath, path.join(dir, `inbox-queue.${today}.done.json`));
console.log(`Inbox ingest: ${changes.length} change(s), ${newSpenders.length} NEW spender(s), ${unmatched.length} unmatched.`);
if (unmatched.length) console.log('  unmatched (need review): ' + unmatched.join(' | '));
