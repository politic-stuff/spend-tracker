# Inbox matcher — operating procedure (for the scheduled local loop)

Runs **locally** on a machine with Claude-for-Chrome connected and the
`competitives@fight.agency` tab open (cloud can't see the logged-in inbox).
Cadence: ~20–30 min. Each run is read-only on Gmail (never delete/modify mail).

## 1. Scope the new mail
- Date bound: **Jan 2025 → today** only.
- Process only mail newer than the last run. Use Gmail search with a date floor,
  e.g. `#search/after:YYY/MM/DD` (set to last-run date), newest first.
- Skip noise: "AdImpact Login Code", "AdImpact Closed …", pure newsletters.

## 2. Find what's relevant (two passes)
1. **Known spenders/candidates** — search the 87 names in `data/spender-dictionary.json`
   plus our tracked candidates/opponents. These map straight to a race.
2. **New spenders** — search by our **races/markets** (state + district/office, and
   the DMA cities, e.g. "NY CD 12", "Philadelphia … PA", "Detroit … MI Senate").
   Any advertiser named in one of our races but NOT in the dictionary is a **new spender**.

## 3. Extract (text first, attachments only when needed)
- **Station "NEW POLITICAL ORDERS" / rep emails** (FOX/CBS/NBC/Disney/Ampersand):
  station, advertiser, district ("X for NY (NY CD 12)"), amount, flight — all inline.
- **Nexstar "… Comp - <advertiser>" / Tegna "Competitive: …"** → data in `.xlsx`.
  Download to ~/Downloads (user OK'd, use judgment — don't grab unrelated ones),
  parse locally. `image001.png` = an order screenshot; read it if no text figure.

## 4. Build the queue → `data/inbox-queue.json`
One object per buy/figure (the agent does the smart reading; the script applies it):
```json
{ "spend": [
  { "advertiser":"…", "amount":123456, "side":"D|R|I",
    "raceKey":"PA-7-2026", "districtHint":"PA CD-07",  // raceKey preferred; hint is fallback
    "kind":"candidate|group", "station":"WPVI", "flight":"6/16-6/23",
    "source":"competitive inbox (WPVI, 6/16-6/23)",
    "sourceKey":"stable-id-per-recurring-buy",          // same key on later corrections
    "correction": false }
]}
```
Then: `node scripts/inbox-ingest.js && git add -A && git commit -m "inbox sync $(date +%F\ %H:%M)" && git push`.

## 5. Rules the engine enforces (see `scripts/inbox-ingest.js`)
- **Candidate buys** → that candidate's `spend[]` as `confirmed-inbox` (beats FEC/AdImpact).
- **PAC/group, known** → attaches an `inbox` figure to the AdImpact spender (doesn't clobber the cumulative).
- **PAC/group, NEW** → added to the race's spenders, `isNew:true`, and **flagged in "What changed"** + a 🆕 line. This is the priority case (new groups appear suddenly).
- **Corrections** → reuse the same `sourceKey` (or set `correction:true`) → the prior inbox figure is **overwritten**, not double-counted. Logged as a revision.
- **Unmatched** advertisers (can't resolve a race) are listed in the run output **for review** — never silently dropped.

## 6. Judgment (per user)
- Don't download every attachment — only those matching our field.
- Most figures are in text; reach for `.xlsx` only when the text lacks the number.
- Aggregation: a consolidated comp (Nexstar) is cumulative; individual station
  "orders" are per-flight. Prefer the consolidated figure per advertiser when available;
  otherwise note the flight so figures aren't conflated across weeks.

## Future
- Link a spend row → the actual ad creative via AdImpact RACE SUMMARY's
  **TELEVISION / DIGITAL CREATIVE** tabs.
