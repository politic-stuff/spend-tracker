# Race Spend Tracker

A static "war room" dashboard that mirrors the races on the
[primary-countdown](https://politic-stuff.github.io/primary-countdown/) site and
tracks, per race: **ad spend** (candidate / outside groups) and **links to the
ad creatives currently running** — refreshed a few times a day from **free**
public sources. No paid APIs.

Live data is split into tiers so you always know what's confirmed vs. estimated:

| Confidence | Meaning | Source |
|---|---|---|
| `FEC` | Filed with the FEC | OpenFEC API (federal races only) |
| `Confirmed` | From the competitive inbox | You, via Chrome extension |
| `Estimate` | Public-source estimate | Meta/AdImpact public, etc. |
| `Sample` | Placeholder, not real | seed only — overwritten on first run |

## How it's wired

```
                 ┌─ CLOUD (scheduled, unattended) ────────────┐
 FEC OpenFEC API │  scripts/feed-fec.js     federal spend     │
 YouTube RSS      │  scripts/feed-youtube.js new ad creatives  │ → data/data.json
 AdImpact public  │  (manual/agent read)     reference         │ → wrap → data/data.js
                 └────────────────────────────────────────────┘ → git commit → Pages
                 ┌─ LOCAL (your Mac, Chrome extension) ───────┐
 Competitive inbox│  open tab, extension reads → spend rows    │
 AdImpact (paid)  │  open tab, extension reads → spend rows    │  (see INGESTION.md)
 Meta Ad Library  │  public UI, extension reads → ad creatives │
                 └────────────────────────────────────────────┘
```

- **`data/data.json`** — canonical store. Feeders edit it.
- **`data/data.js`** — `window.TRACKER_DATA = …` wrapper the dashboard loads
  (regenerated from `data.json` by `scripts/wrap.js`; works on `file://`).
- **`index.html`** — the dashboard. Never edited by the feeders.

## Data sources (researched + verified June 2026)

| Source | Gives | Coverage | Access | Freshness |
|---|---|---|---|---|
| **FEC OpenFEC** | candidate disbursements; independent expenditures for/against | **federal only** | free key | totals lag to last quarterly filing; **IEs file in 24–48 h** |
| **YouTube RSS** | new ad uploads (title + link) | fed + state | none | minutes |
| **Meta Ad Library** | online ad creatives + spend ranges | fed + state | public UI (ext.) | ~daily |
| **Google Political Ads (BigQuery)** | online creatives + spend | fed + state | free sandbox (phase 2) | ~daily |
| **FCC Public Files** | TV/radio ad buys | broadcast | free API (phase 2) | days |
| **CA CAL-ACCESS / CO TRACER** | state campaign finance | those states | free bulk (phase 2) | daily |
| **AdImpact** | race-level spend you already check | all | paid login (ext.) / public projections | varies |

> `FollowTheMoney` was evaluated and **rejected** — its free API only runs
> through the 2024 cycle, so it's useless for live 2026 tracking.

## Run the feeders

```bash
# federal spend — needs a free key (https://api.open.fec.gov/developers/)
FEC_API_KEY=your_key node scripts/feed-fec.js
LIMIT=3 node scripts/feed-fec.js          # test a few on DEMO_KEY

# new ad creatives — no key
node scripts/feed-youtube.js

# rebuild seed from the countdown site (rarely; resets live data)
node scripts/extract-races.js && node scripts/build-data.js
```

## Local preview

```bash
python3 -m http.server 4178   # then open http://localhost:4178
```

## Setup checklist

- [ ] Get a free FEC API key → store as `FEC_API_KEY`
- [ ] Create `politic-stuff/spend-tracker` repo, enable GitHub Pages
- [ ] Register the cloud scheduled feeder (see `scheduled-task.md`)
- [ ] Install Claude for Chrome; set up the inbox/AdImpact/Meta reads (see `INGESTION.md`)
