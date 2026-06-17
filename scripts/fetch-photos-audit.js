#!/usr/bin/env node
// Overwrite fuzzy-matched candidate photos with research-verified URLs (audit pass
// after Jeff Warren->Elizabeth Warren and Poindexter wrong-namesake matches were found).
// Removes photos for candidates with no verified public photo.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const photoDir = path.join(__dirname, '..', 'assets', 'photos');
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
const slug = n => (n || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept': 'image/*,*/*' };

const PHOTOS = {
  'Jeff Warren': 'https://images.squarespace-cdn.com/content/v1/698f62f4b78c31457a2062d7/0f932ba8-08e6-4c6a-b3bc-b9ab203904ea/JW+Headshot.jpg',
  'Max Miller': 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Max_Miller%2C_official_portrait_%28119th_Congress%29.jpg',
  'James Hayes': 'https://npr.brightspotcdn.com/dims4/default/04071bd/2147483647/strip/true/crop/2074x1556+0+0/resize/880x660!/quality/90/?url=http%3A%2F%2Fnpr-brightspot.s3.amazonaws.com%2F53%2F01%2F14bd0111442fb30daa9f82094543%2Fjames-hayes-headshot.png',
  'Eric Jones': 'https://images.squarespace-cdn.com/content/v1/68b763db97b0ee4d447fcc40/da9df5b0-c19e-4603-be8b-104645d7a405/IMG_0281.jpg',
  'Robert White': 'https://upload.wikimedia.org/wikipedia/commons/0/0c/Member_of_the_Council_of_the_District_of_Columbia_Robert_C._White_Jr_%28cropped%29.jpg',
  'Rosemary Brown': 'https://senatorbrown40.com/wp-content/uploads/sites/175/2026/01/SenatorSameSize-Brown.webp',
  'Jane Kim': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/SupervisorJaneKim.png/250px-SupervisorJaneKim.png',
  'Ben Allen': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Ben_Allen%2C_2021.jpg/250px-Ben_Allen%2C_2021.jpg',
  'Michael Allen': 'https://michaelallenforcolorado.com/wp-content/uploads/Michael-Allen-Headshot-scaled-e1781213170534.webp',
  'Joseph Hernandez': 'https://hernandezforny.com/wp-content/uploads/2025/11/jh-stocks-731x1024.png',
  'Julie Won': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Julie_Won_%2854199169237%29_%28cropped%29.jpg/250px-Julie_Won_%2854199169237%29_%28cropped%29.jpg',
  'George Conway': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/George_Conway_crop.png/250px-George_Conway_crop.png',
  'Michael Farrell': 'https://www.deseret.com/resizer/v2/X3BEPC6Z2NHHNAI4QFMF5OGOHI.JPG?auth=1eea706c5ebbe7353fa1b7f6580f1e75582e5bdbe26db3a44f99da296f8e2a21&focal=0%2C0&width=800&height=526',
  'Riley Owen': 'https://assets.nationbuilder.com/rileyowenforutah/pages/108/features/original/MeetRiley2.jpeg?1771606113',
  'Donavan McKinney': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/State_Rep_Donavan_McKinney_Swearing_In_12.12.22_%2852565631658%29_%28cropped%29.jpg/250px-State_Rep_Donavan_McKinney_Swearing_In_12.12.22_%2852565631658%29_%28cropped%29.jpg',
  'Naz Hassan': 'https://nazhassanforwsuboard.com/wp-content/uploads/2025/08/DrNaz_Original-1-2-e1754908480392.jpg',
  'Brent Taylor': 'https://brenttaylorforcongress.com/wp-content/uploads/2026/05/Brent-Taylor_Open-Graph_v1.jpg',
  'Click Bishop': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Click_Bishop_portrait%2C_2019_%283X4_crop%29.jpg/250px-Click_Bishop_portrait%2C_2019_%283X4_crop%29.jpg',
  'Mike Rogers': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Mike-Rogers-Head-Shot-2_%283x4_cropped%29.jpg/250px-Mike-Rogers-Head-Shot-2_%283x4_cropped%29.jpg',
  'Angie Nixon': 'https://upload.wikimedia.org/wikipedia/commons/5/54/Angie_Nixon_newer.jpg',
  'Jennifer Jenkins': 'https://npr.brightspotcdn.com/47/9c/350ee29c48318d28c6faa9b64c39/546368636-1344067227728359-7104221885584875045-n-1.jpg',
  'Keith Faber': 'https://ohioauditor.gov/about/img/Auditor_KeithFaber.jpg',
  'Crisanta Duran': 'https://upload.wikimedia.org/wikipedia/commons/5/54/Crisanta_Duran_%28cropped%29.JPG',
  'Rachel Howard': 'https://ogden_images.s3.amazonaws.com/www.miningjournal.net/images/2025/10/06153519/Rachel_Professional-981x840.jpg',
  'London Lamar': 'https://upload.wikimedia.org/wikipedia/commons/0/0b/London_Lamar_Headshot.jpg',
  'David Crowley': 'https://upload.wikimedia.org/wikipedia/commons/e/e2/David_Crowley.jpg',
};
const NO_PHOTO = ["Patrick D. O'Connell", 'David Leslie']; // verified: no public photo -> remove wrong fuzzy match

function imgExt(buf) {
  if (buf.length < 1500) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  if (buf.slice(4, 8).toString() === 'ftyp' && /avif|avis|mif1|heic/.test(buf.slice(8, 12).toString())) return 'avif';
  return null;
}
const rmAll = name => { for (const e of ['jpg', 'png', 'gif', 'webp', 'avif']) { const p = path.join(photoDir, slug(name) + '.' + e); if (fs.existsSync(p)) fs.unlinkSync(p); } };

(async () => {
  const found = {};
  for (const [name, url] of Object.entries(PHOTOS)) {
    try {
      const r = await fetch(url, { headers: UA, redirect: 'follow' });
      if (!r.ok) { console.log(`  ✗ ${name}: HTTP ${r.status}`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      const ext = imgExt(buf);
      if (!ext) { console.log(`  ✗ ${name}: not an image (${r.headers.get('content-type')})`); continue; }
      rmAll(name);
      const file = slug(name) + '.' + ext;
      fs.writeFileSync(path.join(photoDir, file), buf);
      found[name] = 'assets/photos/' + file;
      console.log(`  ✓ ${name} (${(buf.length / 1024).toFixed(0)}KB)`);
    } catch (e) { console.log(`  ✗ ${name}: ${e.message}`); }
  }
  let updated = 0, removed = 0;
  for (const c of data.candidates) {
    if (found[c.name]) { c.photo = found[c.name]; updated++; }
    if (NO_PHOTO.includes(c.name) && c.photo) { rmAll(c.name); delete c.photo; removed++; }
  }
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 2));
  require('./wrap.js');
  console.log(`\nVerified ${Object.keys(found).length}/${Object.keys(PHOTOS).length}, updated ${updated} records, removed ${removed} (no public photo).`);
})();
