#!/usr/bin/env node
// Second-pass photo fetch for candidates still missing a headshot.
// (1) Wikipedia SEARCH (handles disambiguation like "Mike Rogers (Michigan politician)")
//     → summary → use thumbnail if the page is political + last name matches.
// (2) Fallback: Ballotpedia og:image (good down-ballot coverage), skipping placeholders.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const photoDir = path.join(__dirname, '..', 'assets', 'photos');
fs.mkdirSync(photoDir, { recursive: true });
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const slug = n => (n || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { 'User-Agent': 'spend-tracker/1.0 (race tracker; contact flippypdf@gmail.com)' };
const POL = /politician|senator|representative|congress|governor|attorney general|mayor|assembly|legislator|candidate|lieutenant|comptroller|secretary of state|nominee|commissioner|council|lawmaker/i;

async function get(url, opts) { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, opts); if (r.ok) return r; if (r.status === 404) return null; } catch {} await sleep(1200 * (i + 1)); } return null; }

async function fromWikipedia(name, last) {
  // search for the right page (with "politician" hint)
  const s = await get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name + ' politician')}&srlimit=3&format=json`, { headers: UA });
  if (!s) return null;
  const hits = (await s.json())?.query?.search || [];
  for (const h of hits.slice(0, 3)) {
    if (!h.title.toLowerCase().includes(last)) continue;
    const r = await get('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(h.title), { headers: UA });
    if (!r) continue;
    const j = await r.json();
    const desc = (j.description || '') + ' ' + (j.extract || '').slice(0, 200);
    if (j.type !== 'disambiguation' && POL.test(desc) && j.thumbnail?.source) return j.thumbnail.source;
  }
  return null;
}
async function fromBallotpedia(name) {
  const r = await get('https://ballotpedia.org/' + name.replace(/\s+/g, '_'), { headers: UA });
  if (!r) return null;
  const html = await r.text();
  const m = html.match(/<meta property="og:image" content="([^"]+)"/i);
  if (!m) return null;
  const img = m[1];
  if (/placeholder|silhouette|default|ballotpedia-logo|generic/i.test(img)) return null;
  return img;
}

(async () => {
  const seen = new Set(), targets = [];
  for (const c of data.candidates) { if (c.photo || seen.has(c.name)) continue; seen.add(c.name); targets.push(c); }
  console.log(`${targets.length} candidates missing photos`);
  const photos = {}; let got = 0;
  for (const c of targets) {
    const last = c.name.replace(/\b(Jr|Sr|Dr|III|II)\.?\b/g, '').replace(/[^A-Za-z\s'-]/g, '').trim().split(/\s+/).pop().toLowerCase();
    let img = null, src = '';
    try { img = await fromWikipedia(c.name, last); if (img) src = 'wiki'; } catch {}
    if (!img) { try { img = await fromBallotpedia(c.name); if (img) src = 'bp'; } catch {} }
    if (img) {
      try {
        const buf = Buffer.from(await (await fetch(img, { headers: UA })).arrayBuffer());
        if (buf.length > 1500) { const file = slug(c.name) + '.jpg'; fs.writeFileSync(path.join(photoDir, file), buf); photos[c.name] = 'assets/photos/' + file; got++; console.log(`  ✓ ${c.name} (${src})`); }
      } catch {}
    } else console.log(`  – ${c.name}`);
    await sleep(300);
  }
  for (const c of data.candidates) if (photos[c.name]) c.photo = photos[c.name];
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2));
  require('./wrap.js');
  console.log(`\nPass 2: +${got} photos. Now ${data.candidates.filter(c=>c.photo).length}/${data.candidates.length} candidate-records have one.`);
})();
