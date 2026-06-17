# Local ingestion — competitive inbox, AdImpact, Meta Ad Library

These three sources need a real, logged-in browser, so they run **locally on
your Mac via Claude for Chrome**, not in the cloud scheduled job.

## One-time setup

1. Install **Claude for Chrome**.
2. Make a **dedicated Chrome profile** (e.g. "Tracker"). Log it into:
   - the competitive inbox (work-email SSO → manage account → competitive inbox),
   - AdImpact,
   - nothing else. This keeps the extension scoped to just these tabs and away
     from your main work tabs.
3. Leave those tabs open while running a session.

> Privacy note: the competitive inbox carries only public spend info, so this is
> low-risk. The dedicated profile is the safeguard — the extension never has
> reason to touch your main work session.

## Running it

Open a local Claude Code session in `~/spend-tracker` with the Chrome extension
connected and the tabs open, then:

1. **Inbox** — Claude walks unread messages, extracts `{candidate, actor,
   amount, note}` per spend report/correction, and writes them to
   `data/inbox-queue.json` (shape documented in `scripts/ingest.js`). It marks
   processed mail read/labeled so the next run only sees new mail.
2. **AdImpact** — Claude reads the race pages you already check and adds
   race-level spend rows to the same queue.
3. **Meta Ad Library** — Claude opens `facebook.com/ads/library`, searches each
   active candidate / known PAC, and adds running ad creatives (title + permalink)
   to the queue's `ads`.
4. Run the merge:
   ```bash
   node scripts/ingest.js          # merges queue → data.json, archives queue
   git add -A && git commit -m "inbox/manual ingest $(date +%F)" && git push
   ```

Inbox/AdImpact numbers land as **`confirmed-inbox`** (highest trust) and override
public estimates for the same actor.

## Automating the local run

Because it needs your browser, the recurring trigger is **local**, not the cloud
schedule. Options, fully hands-off once the tabs are open and the Mac is awake:
- `/loop` in a local session every few hours, or
- a macOS cron/launchd job that opens a local Claude session against this repo.

Pick one when we wire it; both keep the work on your machine.
