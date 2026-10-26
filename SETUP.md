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

Stay inside the free tiers by using saved searches with a daily refresh, not a live search on every keystroke.
Example: 5 saved searches refreshed once a day ≈ 150 JSearch requests/month.

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

Quota guard: 6 JSearch queries/day ≈ 180/month, inside the 200 free tier.

## Next pieces (not yet built)
- Native alert-email import for Naukri/Wellfound.
- Applied tracker export.
