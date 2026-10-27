// Daily free-tier fetch for the job-search app. No dependencies, Node 20+.
// Keys come only from environment (GitHub Secrets in Actions). Never committed.
//
// Efficiency design (free):
// - Broad India queries, not one query per city. City/remote filtering is free
//   and happens in the app, so it costs no extra API requests.
// - Freshness first: date_posted=3days / max_days_old=3, so the daily run does
//   not re-pay for the same week-old jobs every day.
// - Seen-dedupe: jobs already in the previous jobs.json are kept for 7 days
//   but are NOT counted as new. Only first-seen jobs get is_new=true.
// - Quota split across free tiers, not one tier:
//   JSearch is SECONDARY only (user decision 2026-10-27): 2 queries x 1 page
//   = 2 requests/day = ~60/month, well inside the 200 free tier. It is a
//   LinkedIn/Indeed cross-check, never the main source — 6 jobs/day would
//   not be worth automating, and JSearch India coverage is thin vs Naukri.
//   Adzuna is the MAIN API source: 12 queries/day = 360/month, well inside
//   its 2,500 free tier. Real India volume still comes from native
//   Naukri/LinkedIn alerts + company ATS feeds (free, unlimited, manual
//   import in the app) — no API can replace those in v1.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'jobs.json');
const JSEARCH_KEY = process.env.JSEARCH_KEY || '';
const ADZUNA_ID = process.env.ADZUNA_ID || '';
const ADZUNA_KEY = process.env.ADZUNA_KEY || '';

const JSEARCH_SEARCHES = [
  'DevOps Engineer India',
  'Site Reliability Engineer India',
];
const ADZUNA_SEARCHES = [
  'DevOps Engineer', 'Site Reliability Engineer', 'Platform Engineer',
  'Cloud Engineer', 'Kubernetes Engineer', 'AWS DevOps Engineer',
  'Infrastructure Engineer', 'DevOps', 'AWS Engineer',
  'Platform Engineer Delhi', 'DevOps Engineer Delhi', 'SRE Engineer',
];

const norm = (s) => (s || '').toLowerCase().trim();
const keyOf = (j) => norm(j.url) || (norm(j.title) + '|' + norm(j.company) + '|' + norm(j.location));
function dedupe(list) {
  const seen = new Set(); const out = [];
  for (const j of list) {
    const id = keyOf(j);
    if (!seen.has(id)) { seen.add(id); out.push(j); }
  }
  return out;
}
function withinDays(posted, days) {
  if (!posted) return true;
  return (Date.now() - new Date(posted).getTime()) <= days * 86400000;
}

// Previous feed: kept for 7 days so saved jobs do not vanish overnight.
let previous = [];
try {
  if (existsSync(outPath)) previous = JSON.parse(readFileSync(outPath, 'utf8')).jobs || [];
} catch (e) { previous = []; }
previous = previous.filter(j => withinDays(j.posted, 7));
const seenIds = new Set(previous.map(keyOf));

let fetched = [];
let jsearchRequests = 0, adzunaRequests = 0;
if (JSEARCH_KEY) {
  for (const q of JSEARCH_SEARCHES) {
    try {
      const url = 'https://jsearch.p.rapidapi.com/search?query=' + encodeURIComponent(q)
        + '&page=1&num_pages=1&country=in&date_posted=3days';
      const r = await fetch(url, { headers: { 'X-RapidAPI-Key': JSEARCH_KEY, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' } });
      jsearchRequests += 1; // secondary source: 1 page only, no x2 charge
      if (!r.ok) { console.log('JSearch failed for', q, r.status); continue; }
      const d = await r.json();
      fetched = fetched.concat((d.data || []).map(x => ({
        title: x.job_title, company: x.employer_name,
        location: x.job_city || x.job_country || 'India',
        workplace: x.job_is_remote ? 'Remote' : 'On-site (heuristic)',
        posted: x.job_posted_at_datetime_utc || null,
        source: 'JSearch / ' + (x.job_publisher || 'web'),
        url: x.job_apply_link, description: (x.job_description || '').slice(0, 280),
      })));
    } catch (e) { console.log('JSearch error for', q, e.message); }
  }
}
if (ADZUNA_ID && ADZUNA_KEY) {
  for (const q of ADZUNA_SEARCHES) {
    try {
      const url = 'https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=' + encodeURIComponent(ADZUNA_ID)
        + '&app_key=' + encodeURIComponent(ADZUNA_KEY) + '&results_per_page=20&what=' + encodeURIComponent(q)
        + '&where=India&max_days_old=3';
      const r = await fetch(url);
      adzunaRequests += 1;
      if (!r.ok) { console.log('Adzuna failed for', q, r.status); continue; }
      const d = await r.json();
      fetched = fetched.concat((d.results || []).map(x => ({
        title: x.title, company: x.company?.display_name, location: x.location?.display_name,
        workplace: 'On-site (heuristic)', posted: x.created, source: 'Adzuna',
        url: x.redirect_url, description: (x.description || '').slice(0, 280),
      })));
    } catch (e) { console.log('Adzuna error for', q, e.message); }
  }
}

fetched = dedupe(fetched).filter(j => withinDays(j.posted, 3));
const newJobs = fetched.filter(j => !seenIds.has(keyOf(j))).map(j => ({ ...j, is_new: true }));
const keptPrevious = previous
  .filter(j => !newJobs.some(n => keyOf(n) === keyOf(j)))
  .map(j => ({ ...j, is_new: false }));
const jobs = dedupe([...newJobs, ...keptPrevious])
  .sort((a, b) => new Date(b.posted || 0) - new Date(a.posted || 0))
  .slice(0, 100);

const out = {
  generated_at: new Date().toISOString(),
  count: jobs.length,
  new_count: newJobs.length,
  quota_estimate_per_run: { jsearch_requests: jsearchRequests, adzuna_requests: adzunaRequests },
  quota_note: 'JSearch SECONDARY: 2/day = ~60/month (free tier 200). Adzuna MAIN: 12/day = 360/month (free tier 2,500).',
  jobs,
};
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log('Wrote', outPath, 'with', jobs.length, 'jobs,', newJobs.length, 'new. Quota estimate:', out.quota_estimate_per_run);
