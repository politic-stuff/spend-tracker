#!/usr/bin/env node
// Manual / local-layer ingest. The Chrome-extension session (reading the
// competitive inbox, AdImpact, or Meta Ad Library) writes parsed rows into
// data/inbox-queue.json, then runs this to merge them into data.json and clear
// the queue. Keeps a human-reviewable boundary between scraped and confirmed.
//
// data/inbox-queue.json shape:
//   { "spend": [ { "candidate":"Abdul El-Sayed", "actor":"AIPAC-aligned PAC",
//                  "type":"outside", "amount":750000, "source":"competitive inbox",
//                  "note":"anti-Abdul TV buy" } ],
//     "ads":   [ { "candidate":"Mandela Barnes", "title":"...", "url":"https://...",
//                  "platform":"Meta", "source":"Meta Ad Library" } ] }
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const dataPath = path.join(dir, 'data.json');
const queuePath = path.join(dir, 'inbox-queue.json');
const today = new Date().toISOString().slice(0, 10);

if (!fs.existsSync(queuePath)) { console.log('No inbox-queue.json — nothing to ingest.'); process.exit(0); }
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const q = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const byName = new Map(data.candidates.map(c => [c.name.toLowerCase(), c]));
const find = n => byName.get((n || '').toLowerCase()) ||
  data.candidates.find(c => c.name.toLowerCase().includes((n || '').toLowerCase()));
const notes = [];

for (const e of q.spend || []) {
  const c = find(e.candidate);
  if (!c) { console.log(`  ? no candidate match: ${e.candidate}`); continue; }
  c.spend = c.spend || [];
  const i = c.spend.findIndex(r => r.actor === e.actor);
  const row = { actor: e.actor, type: e.type || 'outside', amount: e.amount || 0,
    source: e.source || 'competitive inbox', confidence: 'confirmed-inbox', asOf: today, note: e.note || null };
  if (i >= 0) c.spend[i] = row; else c.spend.push(row);
  notes.push(`${c.name}: ${e.actor} $${(e.amount || 0).toLocaleString()} (confirmed)`);
}
for (const e of q.ads || []) {
  const c = find(e.candidate);
  if (!c) { console.log(`  ? no candidate match: ${e.candidate}`); continue; }
  c.ads = c.ads || [];
  if (!c.ads.some(a => a.url === e.url)) {
    c.ads.unshift({ title: e.title, url: e.url, platform: e.platform || 'web',
      source: e.source || 'manual', firstSeen: today });
    notes.push(`${c.name}: ad "${(e.title || '').slice(0, 40)}" (${e.platform || 'web'})`);
  }
}

data.lastUpdated = today;
data.changelog = data.changelog || [];
if (notes.length) data.changelog.unshift({ ts: today, note: `Inbox/manual: ${notes.slice(0, 6).join(' · ')}` });
data.changelog = data.changelog.slice(0, 30);
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
require('./wrap.js');

// archive the processed queue so nothing double-counts
fs.renameSync(queuePath, path.join(dir, `inbox-queue.${today}.done.json`));
console.log(`Ingested ${notes.length} item(s); queue archived.`);
