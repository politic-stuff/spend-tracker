#!/usr/bin/env node
// Download hand-verified candidate headshots (URLs vetted by research agent against
// campaign/official sources) with magic-byte validation. Updates candidate.photo.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const photoDir = path.join(__dirname, '..', 'assets', 'photos');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const slug = n => (n || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept': 'image/*,*/*' };

const PHOTOS = {
  'Brian Poindexter': 'https://poindexterforcongress.com/wp-content/uploads/2025/12/bp-hardhat-4-5-scaled.jpg',
  'Bob Brooks': 'https://brooksforcongress.com/wp-content/uploads/2025/08/brooks-mobile-hero.jpg',
  'John Kulewicz': 'https://www.eriecountydems.org/wp-content/uploads/2025/09/Headshot-Kulewicz-201-Cropped-1-1024x799.jpg',
  'Brian Wrightson': 'https://wrightsonforsenate.net/wp-content/uploads/2025/03/brian-above-treeline-vert-copy-856x1024.jpg',
  'Darializa Avila Chevalier': 'https://run.imgix.net/bfe892f9-cbb8-4cd8-a0fa-d577b253aaee/67e29516-63ab-4731-a30e-c21e8cb896bc/67e29516-63ab-4731-a30e-c21e8cb896bc.png?ixlib=js-3.8.0&auto=compress%2Cformat&fit=fillmax&w=1024&q=80',
  'Drew Warshaw': 'https://cdn.prod.website-files.com/680f811813fe79f4326cf5ba/681026a399bd329433e2119e_8fe83942fb0e3f9d9ec33dd0c489996f_Drew_Vang_Portrairs_Nyc18772%201.avif',
  'Nate Blouin': 'https://le.utah.gov/images/legislator/BLOUIN.jpg',
  'David Seligman': 'https://static.wixstatic.com/media/ddc900_743226f1d3a04ad291941eeb129cbf9d~mv2.png',
  'Eileen Laubacher': 'https://images.squarespace-cdn.com/content/v1/681a4fa46e182e47cab3db76/549f4057-270f-41d6-8eb5-37f17457383b/EileenforColorado_HeroPhoto.jpg',
  'Justin Onwenu': 'https://i0.wp.com/www.bridgedetroit.com/wp-content/uploads/2025/10/Onwenu-Campaign-Headshot-.jpg?fit=780%2C520&ssl=1',
  'Hector Mujica': 'https://i0.wp.com/hectormujica.com/wp-content/uploads/2026/02/hector_sun-1.png?fit=768%2C454&ssl=1',
};

function imgExt(buf) {
  if (buf.length < 1500) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  if (buf.slice(4, 8).toString() === 'ftyp' && /avif|avis|mif1|heic/.test(buf.slice(8, 12).toString())) return 'avif';
  return null;
}

(async () => {
  const found = {};
  for (const [name, url] of Object.entries(PHOTOS)) {
    try {
      const r = await fetch(url, { headers: UA, redirect: 'follow' });
      if (!r.ok) { console.log(`  ✗ ${name}: HTTP ${r.status}`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      const ext = imgExt(buf);
      if (!ext) { console.log(`  ✗ ${name}: not a valid image (${r.headers.get('content-type')})`); continue; }
      const file = slug(name) + '.' + ext;
      // remove any stale photo with a different ext for this slug
      for (const e of ['jpg', 'png', 'gif', 'webp', 'avif']) { const p = path.join(photoDir, slug(name) + '.' + e); if (fs.existsSync(p)) fs.unlinkSync(p); }
      fs.writeFileSync(path.join(photoDir, file), buf);
      found[name] = 'assets/photos/' + file;
      console.log(`  ✓ ${name} -> ${file} (${(buf.length / 1024).toFixed(0)}KB)`);
    } catch (e) { console.log(`  ✗ ${name}: ${e.message}`); }
  }
  let updated = 0;
  for (const c of data.candidates) if (found[c.name]) { c.photo = found[c.name]; updated++; }
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2));
  require('./wrap.js');
  console.log(`\nDownloaded ${Object.keys(found).length}/11, updated ${updated} candidate records.`);
})();
