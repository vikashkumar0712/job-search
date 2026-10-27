# Setup — completely free

## Run locally
```bash
python3 -m http.server 8000
# open http://localhost:8000
```
Opening `index.html` directly also works, but a local server is more reliable for API calls.

## Free API keys (browser-only, never committed)
1. **JSearch** — RapidAPI, free tier 200 requests/month.
   Paste the key in the app under “Free API keys”. It is stored only in your browser's localStorage.
2. **Adzuna** — free tier 250 calls/day, 2,500/month.
   Paste App ID + App Key in the app, same browser-only storage.

## Efficiency (how free stays best, not just cheap)
- Broad India queries, not one query per city. City/remote filtering is free in the app.
- Freshness first: daily run fetches only last-3-days jobs, so quota is not spent re-fetching week-old jobs.
- Seen-dedupe: `scripts/fetch-jobs.mjs` keeps the previous 7 days of jobs in `jobs.json` but marks only first-seen jobs `is_new`. The app shows a NEW badge for those.
- Quota split: JSearch for LinkedIn/Indeed depth, Adzuna for breadth (its free tier is far larger).
- Live browser search is 1 request per click — use the cached daily feed first, live search only for a new role/location.

## What is free, and what is not
- Free: this app, JSearch/Adzuna free tiers, GitHub Pages hosting, local resume parsing.
- Not free at scale: paid API tiers, Bright Data, large Apify usage — none are used here.
- Not covered by a free API: Naukri and Wellfound. Use section 4 (manual import) and native job alerts for those.

## Rules built into v1
- No auto-apply. Every “Apply on source” link opens the original posting for you to review and submit.
- No login bypass, no CAPTCHA bypass, no platform passwords stored.
- Salary is shown only when the source states it. Adzuna salary can be predicted — verify on the source.
- Sample mode jobs are labelled `SAMPLE DEMO — not a real listing` and must never be presented as real jobs.
- Experience fit is a ranking from job text, not an exact filter: many postings state no year range, and those are labelled “Unclear”.

## Daily automation (GitHub Actions)
`.github/workflows/daily-jobs.yml` runs every day at 08:00 IST and writes `jobs.json`.
The live app loads that file automatically as the daily cached feed.

Enable it:
1. Repo → Settings → Secrets and variables → Actions → New repository secret.
   Add `JSEARCH_KEY` (and optionally `ADZUNA_ID` + `ADZUNA_KEY`). Secrets are never committed.
2. Repo → Actions → “Daily job digest” → Run workflow, to test it once manually.
3. Without secrets the workflow still runs but writes an empty feed — live search in the browser still works with keys saved there.

Quota guard per daily run (2026-10-27 decision: JSearch is secondary, not main): JSearch 2 queries x 1 page = 2 requests/day ≈ 60/month (inside the 200 free tier). Adzuna MAIN: 12 queries/day = 360/month (inside the 2,500 free tier). Raw volume per run: up to 20 JSearch + 240 Adzuna jobs before dedupe; deduped, recent, and new-only counts will be lower. Real India volume comes from native Naukri/LinkedIn alerts + company ATS feeds (free, unlimited), imported manually in section 4.

## Next pieces (not yet built)
- Native alert-email import for Naukri/Wellfound.
- Applied tracker export.
