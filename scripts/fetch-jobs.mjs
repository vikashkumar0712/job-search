// Daily free-tier fetch for the job-search app. No dependencies, Node 20+.
// Keys come only from environment (GitHub Secrets in Actions). Never committed.
// Quota guard: 6 JSearch queries/day = ~180/month, inside the 200 free tier.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'jobs.json');
const JSEARCH_KEY = process.env.JSEARCH_KEY || '';
const ADZUNA_ID = process.env.ADZUNA_ID || '';
const ADZUNA_KEY = process.env.ADZUNA_KEY || '';

const SEARCHES = [
  { q: 'DevOps Engineer Delhi', location: 'Delhi' },
  { q: 'Site Reliability Engineer Delhi', location: 'Delhi' },
  { q: 'DevOps Engineer Remote India', location: 'Remote' },
  { q: 'Site Reliability Engineer Remote India', location: 'Remote' },
  { q: 'Platform Engineer Delhi', location: 'Delhi' },
  { q: 'AWS DevOps Engineer Gurugram', location: 'Gurugram' },
];

const norm = (s) => (s || '').toLowerCase().trim();
function dedupe(list) {
  const seen = new Set(); const out = [];
  for (const j of list) {
    const id = norm(j.title) + '|' + norm(j.company) + '|' + norm(j.location);
    if (!seen.has(id)) { seen.add(id); out.push(j); }
  }
  return out;
}
function withinDays(posted, days) {
  if (!posted) return true;
  return (Date.now() - new Date(posted).getTime()) <= days * 86400000;
}

let jobs = [];
if (JSEARCH_KEY) {
  for (const s of SEARCHES) {
    try {
      const url = 'https://jsearch.p.rapidapi.com/search?query=' + encodeURIComponent(s.q)
        + '&page=1&num_pages=1&country=in&date_posted=week';
      const r = await fetch(url, { headers: { 'X-RapidAPI-Key': JSEARCH_KEY, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' } });
      if (!r.ok) { console.log('JSearch failed for', s.q, r.status); continue; }
      const d = await r.json();
      jobs = jobs.concat((d.data || []).map(x => ({
        title: x.job_title, company: x.employer_name,
        location: x.job_city || x.job_country || s.location,
        workplace: x.job_is_remote ? 'Remote' : 'On-site (heuristic)',
        posted: x.job_posted_at_datetime_utc || null,
        source: 'JSearch / ' + (x.job_publisher || 'web'),
        url: x.job_apply_link, description: (x.job_description || '').slice(0, 280),
      })));
    } catch (e) { console.log('JSearch error for', s.q, e.message); }
  }
}
if (ADZUNA_ID && ADZUNA_KEY) {
  for (const s of SEARCHES.slice(0, 3)) {
    try {
      const url = 'https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=' + encodeURIComponent(ADZUNA_ID)
        + '&app_key=' + encodeURIComponent(ADZUNA_KEY) + '&results_per_page=20&what=' + encodeURIComponent(s.q)
        + '&where=' + encodeURIComponent(s.location) + '&max_days_old=7';
      const r = await fetch(url);
      if (!r.ok) { console.log('Adzuna failed for', s.q, r.status); continue; }
      const d = await r.json();
      jobs = jobs.concat((d.results || []).map(x => ({
        title: x.title, company: x.company?.display_name, location: x.location?.display_name,
        workplace: 'On-site (heuristic)', posted: x.created, source: 'Adzuna',
        url: x.redirect_url, description: (x.description || '').slice(0, 280),
      })));
    } catch (e) { console.log('Adzuna error for', s.q, e.message); }
  }
}

jobs = dedupe(jobs).filter(j => withinDays(j.posted, 7)).slice(0, 100);
const out = { generated_at: new Date().toISOString(), count: jobs.length, jobs };
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log('Wrote', outPath, 'with', jobs.length, 'jobs. Keys present: JSearch=', !!JSEARCH_KEY, 'Adzuna=', !!(ADZUNA_ID && ADZUNA_KEY));
