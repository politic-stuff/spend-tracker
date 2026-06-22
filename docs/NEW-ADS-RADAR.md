# New-Ad Radar — staying on top of newly-launched ads

Goal: whenever a new ad starts running in one of our races, it shows up on the
site fast — first in its advertiser's strip, with a green **NEW** badge and a
"● Aired M/D – present" line, linked to where you can watch it.

## How it flows

```
SOURCES  ──►  data/newads-queue.json  ──►  scripts/ingest-newads.js  ──►  data.json (creativesByAdvertiser)  ──►  site
(any of:)                                   (routes each to its race +        (reuses creative cards +
 • AdImpact Twitter (@AdImpact_Pol)          advertiser, dedupes by link)      active-airing-first sort)
 • competitive-inbox Ad Alert emails
 • AdMo "most recent" feed (per race)
 • manual
```

Run `node scripts/ingest-newads.js` after adding entries to the queue. It's
idempotent (dedupes by `link`), creates the advertiser's spender row if missing,
and the new ad sorts to the front automatically (it's marked still-airing).

## Queue entry shape (`data/newads-queue.json`)

```json
{
  "raceKey": "ME-Sen-2026",                 // must match a race key in data.json
  "advertiser": "Pine Tree Results PAC",     // the PAC/campaign paying
  "title": "Chris Kyle / Nazi tattoo",       // short ad name
  "type": "TV",                              // TV | Digital | Video
  "start": "2026-06-22",                     // first-aired date (YYYY-MM-DD)
  "opposes": "Graham Platner",               // or "supports": "<candidate>"
  "party": "R",                              // D | R (for the side dot)
  "link": "https://x.com/AdImpact_Pol/status/...",  // watch/source URL
  "source": "AdImpact Twitter",
  "note": "free-text context (future reservations, the quote, etc.)"
}
```

## The three feeds

### 1. AdImpact Twitter (@AdImpact_Pol) — via a Grok scheduled Task
AdImpact tweets nearly every new ad with the PAC, race, the attack, and future
reservations. The tools here can't read X, but a **Grok Task** (you have Super)
can. Set up a recurring Grok Task with this prompt:

> Every 6 hours, check the latest posts from @AdImpact_Pol on X. For each post
> announcing a NEW political ad in any of these races — **ME-Sen, MI-Sen, AK-Sen,
> NY-7, NY-10, NY-12, NY-13, CA-4, CA-22, TX-Gov, TX-37, WI-Gov, CO-AG, NE-Sen,
> FL-Sen** (add/trim as needed) — output one JSON object per ad with exactly
> these fields: `raceKey` (e.g. "ME-Sen-2026"), `advertiser`, `title`, `type`
> ("TV"/"Digital"), `start` (the post date, YYYY-MM-DD), `opposes` OR `supports`
> (candidate full name), `party` ("D"/"R"), `link` (the tweet URL), `source`
> ("AdImpact Twitter"), `note` (the quote + any future-reservation figures).
> Return a JSON array only — no prose. Skip anything not in those races.

Then paste Grok's JSON array into `data/newads-queue.json` (or hand it to me) and
run the ingest. Each ad lands under its PAC in the right race.

### 2. Competitive-inbox Ad Alerts
AdImpact emails the **same** new-ad alerts (often with tone + issue) to the
competitive inbox. The inbox loop (the more-frequent one) should parse those into
the same queue shape — so the inbox and the Grok Task are redundant safety nets.

### 3. AdMo "most recent" feed (per race)
The classic AdMo view (host2.adimpact.com) lists newest active spots with media
type + active flag. A lower-frequency loop filters it by race and emits new uuids
into the queue. See the AdImpact playbook in project memory for the harvesting
details (CSS-pseudo-element parsing, chunked transfer, etc.).

## Cadence (suggested)
- Inbox Ad Alerts: with the main competitive-inbox loop (most frequent).
- Grok @AdImpact_Pol Task: every ~6 h.
- AdMo per-race + Meta count refresh: ~daily/weekly (slower-moving).
