#!/usr/bin/env node
// Fetch candidate headshots from Wikipedia (REST summary API) → assets/photos/.
// SAFETY: only use a photo if the page description looks political AND the page
// title shares the candidate's last name — avoids wrong-person matches.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const photoDir = path.join(__dirname, '..', 'assets', 'photos');
fs.mkdirSync(photoDir, { recursive: true });
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const slug = n => (n || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const POL = /politician|senator|representative|congress|governor|attorney general|mayor|assembly|legislator|candidate|lieutenant|comptroller|secretary of state|official|nominee/i;

// de-dupe candidates by name (same person can appear in primary+general)
const seen = new Set(), targets = [];
for (const c of data.candidates) { if (seen.has(c.name)) continue; seen.add(c.name); targets.push(c); }

(async () => {
  let got = 0, skip = 0;
  const photos = {}; // name -> path
  for (const c of targets) {
    const last = c.name.replace(/\b(Jr|Sr|Dr|III|II)\.?\b/g, '').trim().split(/\s+/).pop().toLowerCase();
    try {
      let r;
      for (let attempt = 0; attempt < 3; attempt++) {
        r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(c.name),
          { headers: { 'User-Agent': 'spend-tracker/1.0 (race tracker)' } });
        if (r.ok) break;
        if (r.status === 404) break;        // no page — don't retry
        await sleep(1500 * (attempt + 1));  // backoff on 429/5xx
      }
      if (!r.ok) { skip++; continue; }
      const j = await r.json();
      const desc = (j.description || '') + ' ' + (j.extract || '').slice(0, 200);
      const titleOk = (j.title || '').toLowerCase().includes(last);
      const img = j.thumbnail && j.thumbnail.source;
      if (img && titleOk && POL.test(desc) && j.type !== 'disambiguation') {
        const buf = Buffer.from(await (await fetch(img)).arrayBuffer());
        const file = slug(c.name) + '.jpg';
        fs.writeFileSync(path.join(photoDir, file), buf);
        photos[c.name] = 'assets/photos/' + file;
        got++; console.log(`  ✓ ${c.name} — ${j.description}`);
      } else { skip++; }
      await sleep(350);
    } catch (e) { skip++; }
  }
  // apply photo paths to ALL candidate records with that name
  for (const c of data.candidates) if (photos[c.name]) c.photo = photos[c.name];
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2));
  require('./wrap.js');
  console.log(`\nPhotos: ${got} fetched, ${skip} skipped (initials avatar). ${Object.keys(photos).length} people.`);
})();
