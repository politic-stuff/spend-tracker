# Cloud scheduled feeder (spec — register after repo + FEC key exist)

Mirrors the `primary-winner-check` pattern, but **auto-commits** (your choice),
writing a reviewable changelog so you can correct after the fact.

**Cadence:** 3×/day — ~8am / ~1pm / ~6pm ET (heaviest near filing deadlines).

**Each run, in `~/spend-tracker`:**
1. `gh auth switch --user politic-stuff` (commit author "politic-stuff").
2. `git pull`.
3. `FEC_API_KEY=… node scripts/feed-fec.js` — federal spend + independent expenditures.
4. `node scripts/feed-youtube.js` — new ad creatives.
5. **Fuzzy pass (the part that needs a model, not a script):**
   - web-search recent reporting for newly-dropped ads / big buys in the active
     races (reporter & AdImpact tweets surface these); add as `estimate` ad rows.
   - read AdImpact's public projections page for cycle/chamber reference numbers.
   - sanity-check feeder output (e.g. a 10× jump → flag in changelog, don't hide).
6. `git add -A && git commit -m "auto: spend+ads sync $(date +%F\ %H:%M)" && git push`.

**Guardrails (so auto-commit stays trustworthy):**
- Never overwrite `confirmed-inbox` rows with lower-confidence data.
- Every run appends one changelog entry — even "no changes" — so silence is visible.
- Tag every number with `source` + `confidence`; never present an estimate as filed.
- If a feeder errors or rate-limits, log it in the changelog and still commit the rest.

**Review loop:** you read the "What changed" panel on the dashboard; to correct
anything, edit `data/data.json` (or drop a row in `data/inbox-queue.json` and run
`scripts/ingest.js`) — confirmed values win on the next run.

> Only public, no-login sources run here. Inbox / AdImpact-paid / Meta are the
> local Chrome-extension job — see `INGESTION.md`.
