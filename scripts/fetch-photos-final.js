#!/usr/bin/env node
// Robust photo (re)fetch for ALL candidates. Fixes the earlier corrupt downloads
// (Wikimedia returned HTML error pages because no User-Agent/Referer was sent).
// Sends proper headers, VERIFIES the bytes are a real image (JPEG/PNG/GIF/WebP),
// tries Wikipedia search→summary, then Ballotpedia og:image. Initials otherwise.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const photoDir = path.join(__dirname, '..', 'assets', 'photos');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const slug = n => (n || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WUA = { 'User-Agent': 'spend-tracker/1.0 (https://politic-stuff.github.io; flippypdf@gmail.com)', 'Referer': 'https://en.wikipedia.org/', 'Accept': 'image/*' };
const POL = /politician|senator|representative|congress|governor|attorney general|mayor|assembly|legislator|candidate|lieutenant|comptroller|secretary of state|nominee|commissioner|council|lawmaker|official/i;

function imgExt(buf) {
  if (buf.length < 2000) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null; // not a raster image (HTML/SVG/error)
}
async function get(url, headers) { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers }); if (r.ok) return r; if (r.status === 404) return null; } catch {} await sleep(1200 * (i + 1)); } return null; }
async function dl(imgUrl, base) {
  const r = await get(imgUrl, WUA); if (!r) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  const ext = imgExt(buf); if (!ext) return null;
  const file = base + '.' + ext; fs.writeFileSync(path.join(photoDir, file), buf); return 'assets/photos/' + file;
}
async function wiki(name, last) {
  const s = await get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name + ' politician')}&srlimit=3&format=json`, WUA);
  if (!s) return null;
  for (const h of ((await s.json())?.query?.search || []).slice(0, 3)) {
    if (!h.title.toLowerCase().includes(last)) continue;
    const r = await get('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(h.title), WUA);
    if (!r) continue; const j = await r.json();
    if (j.type !== 'disambiguation' && POL.test((j.description || '') + ' ' + (j.extract || '').slice(0, 200)) && j.thumbnail?.source) return j.thumbnail.source;
  }
  return null;
}
async function ballot(name) {
  const r = await get('https://ballotpedia.org/' + name.replace(/\s+/g, '_'), { 'User-Agent': WUA['User-Agent'] });
  if (!r) return null;
  const m = (await r.text()).match(/<meta property="og:image" content="([^"]+)"/i);
  if (m && !/placeholder|silhouette|default|logo|generic/i.test(m[1])) return m[1];
  return null;
}

(async () => {
  // wipe old (some are corrupt) and rebuild
  fs.rmSync(photoDir, { recursive: true, force: true }); fs.mkdirSync(photoDir, { recursive: true });
  for (const c of data.candidates) delete c.photo;
  const seen = new Set(), targets = [];
  for (const c of data.candidates) { if (seen.has(c.name)) continue; seen.add(c.name); targets.push(c); }
  const photos = {}; let got = 0;
  for (const c of targets) {
    const last = c.name.replace(/\b(Jr|Sr|Dr|III|II)\.?\b/g, '').replace(/[^A-Za-z\s'-]/g, '').trim().split(/\s+/).pop().toLowerCase();
    let p = null;
    try { const w = await wiki(c.name, last); if (w) p = await dl(w, slug(c.name)); } catch {}
    if (!p) { try { const b = await ballot(c.name); if (b) p = await dl(b, slug(c.name)); } catch {} }
    if (p) { photos[c.name] = p; got++; console.log(`  ✓ ${c.name}`); } else console.log(`  – ${c.name}`);
    await sleep(300);
  }
  for (const c of data.candidates) if (photos[c.name]) c.photo = photos[c.name];
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2));
  require('./wrap.js');
  console.log(`\nValid photos: ${got}/${targets.length} people. Files: ${fs.readdirSync(photoDir).length}`);
})();
