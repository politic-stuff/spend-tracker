#!/usr/bin/env node
// YouTube feeder — the "new ad dropped" signal. For every candidate with a
// YouTube link, resolves the channel id once (cached), pulls the channel RSS
// (no API key, no quota), and records recent uploads as ad creatives. Campaign
// channels title their uploads as the ads themselves ("Stopwatch | X for Senate").
//   node scripts/feed-youtube.js
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'data.json');
const today = new Date().toISOString().slice(0, 10);
const RECENT_DAYS = 45;   // only surface uploads this fresh
const MAX_PER = 6;        // cap stored ads per candidate
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function channelId(c) {
  if (c.ytChannelId) return c.ytChannelId;
  const res = await fetch(c.links.yt, { headers: { 'User-Agent': UA } });
  const html = await res.text();
  const m = html.match(/channel_id=(UC[A-Za-z0-9_-]{22})/) || html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/);
  return m ? (c.ytChannelId = m[1]) : null;
}

async function feed(id) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: { 'User-Agent': UA } });
  const xml = await res.text();
  return (xml.match(/<entry>[\s\S]*?<\/entry>/g) || []).map(e => ({
    title: (e.match(/<title>([\s\S]*?)<\/title>/) || [])[1],
    url: (e.match(/<link rel="alternate" href="([^"]+)"/) || [])[1],
    published: ((e.match(/<published>([\s\S]*?)<\/published>/) || [])[1] || '').slice(0, 10),
  })).filter(v => v.title && v.url);
}

(async () => {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const cutoff = new Date(Date.now() - RECENT_DAYS * 864e5).toISOString().slice(0, 10);
  const withYT = data.candidates.filter(c => c.links && c.links.yt);
  const newAds = [];

  for (const c of withYT) {
    try {
      const id = await channelId(c);
      if (!id) { console.log(`  ? ${c.name}: no channel id`); continue; }
      const vids = (await feed(id)).filter(v => v.published >= cutoff);
      const existing = new Set((c.ads || []).filter(a => a.platform === 'YouTube').map(a => a.url));
      const fresh = vids.filter(v => !existing.has(v.url));
      // keep manual/non-YouTube ads, prepend new YouTube ones, cap
      const keptOther = (c.ads || []).filter(a => a.platform !== 'YouTube');
      const ytAds = [...fresh.map(v => ({ title: v.title, url: v.url, platform: 'YouTube', source: 'YouTube RSS', firstSeen: v.published })),
                     ...(c.ads || []).filter(a => a.platform === 'YouTube')]
                    .slice(0, MAX_PER);
      c.ads = [...ytAds, ...keptOther];
      if (fresh.length) { newAds.push(`${c.name}: ${fresh.length} new (${fresh[0].title.slice(0, 40)})`); }
      console.log(`  ✓ ${c.name}: ${vids.length} recent, ${fresh.length} new`);
      await sleep(150);
    } catch (e) {
      console.log(`  ! ${c.name}: ${e.message}`);
    }
  }

  data.lastUpdated = today;
  data.changelog = data.changelog || [];
  if (newAds.length) data.changelog.unshift({ ts: today, note: `New ad creatives: ${newAds.slice(0, 6).join(' · ')}` });
  data.changelog = data.changelog.slice(0, 30);

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  require('./wrap.js');
  console.log(`\nYouTube feeder done: ${withYT.length} channels checked, ${newAds.length} with new ads.`);
})();
