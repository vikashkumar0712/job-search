// job-search v1 — completely free, browser-only.
// No keys, resumes or job data are sent to this repo. Keys live in localStorage only.
const $ = (id) => document.getElementById(id);
const LS = 'jobsearch_v1';
const SKILLS = ['aws','azure','gcp','kubernetes','docker','terraform','ansible','jenkins','gitlab','github actions','prometheus','grafana','linux','python','bash','helm','eks','ec2','s3','ci/cd','observability','postgres','nginx'];

let jobs = [];
let statuses = {}; // jobId -> saved|applied|rejected

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(LS) || '{}');
    statuses = s.statuses || {};
    ['jsearchKey','adzunaId','adzunaKey'].forEach(k => { if (s[k]) $(k).value = s[k]; });
  } catch (e) { /* fresh state */ }
}
function saveState() {
  localStorage.setItem(LS, JSON.stringify({
    statuses,
    jsearchKey: $('jsearchKey').value.trim(),
    adzunaId: $('adzunaId').value.trim(),
    adzunaKey: $('adzunaKey').value.trim(),
  }));
}
$('saveKeys').onclick = () => { saveState(); $('keyStatus').textContent = 'Saved in this browser only.'; };

function norm(s) { return (s || '').toLowerCase().trim(); }
function jobId(j) { return norm(j.title) + '|' + norm(j.company) + '|' + norm(j.location); }

function parseExperience(text, desc) {
  // Returns {min, max} in years, or null when the JD states no range.
  const m = (desc || '').match(/(\d+)\s*(?:\+|plus)?\s*(?:-|to|–)?\s*(\d+)?\s*(?:\+)?\s*years?/i);
  if (!m) return null;
  return { min: parseInt(m[1], 10), max: m[2] ? parseInt(m[2], 10) : null };
}
function experienceFit(userYears, desc) {
  const r = parseExperience('', desc);
  if (!r) return 'Unclear — JD states no range';
  if (r.max && userYears > r.max + 2) return 'Weak — JD asks more';
  if (userYears >= r.min - 1 && (!r.max || userYears <= r.max + 2)) return 'Strong';
  if (userYears >= r.min - 2) return 'Possible';
  return 'Weak — JD asks more';
}
function scoreJob(j) {
  const skills = $('skills').value.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const hay = norm(j.title + ' ' + (j.description || ''));
  const matched = skills.filter(s => hay.includes(s));
  let score = matched.length * 10;
  if (norm(j.title).includes(norm($('q').value).split(' ')[0])) score += 15;
  if (norm(j.location).includes(norm($('location').value)) || norm($('location').value) === '') score += 10;
  j.matchedSkills = matched;
  return score;
}
function dedupe(list) {
  const seen = new Set(); const out = [];
  for (const j of list) { const id = jobId(j); if (!seen.has(id)) { seen.add(id); j.id = id; out.push(j); } }
  return out;
}
function workplaceOf(j, fallback) {
  if (j.workplace) return j.workplace;
  if (/remote/i.test(j.location || '')) return 'Remote';
  if (/hybrid/i.test((j.description || '') + ' ' + (j.location || ''))) return 'Hybrid';
  return fallback || 'On-site (heuristic)';
}
function withinDays(j, days) {
  if (!j.posted) return true;
  return (Date.now() - new Date(j.posted).getTime()) <= days * 86400000;
}
function applyFilters(list) {
  const wp = $('workplace').value;
  const days = parseInt($('days').value, 10);
  const status = $('statusFilter').value;
  return list.filter(j => {
    if (wp !== 'any' && norm(workplaceOf(j)).indexOf(wp) === -1 && !(wp === 'onsite' && workplaceOf(j).startsWith('On-site'))) return false;
    if (!withinDays(j, days)) return false;
    const st = statuses[j.id] || 'new';
    if (status === 'new' && st !== 'new') return false;
    if (['saved','applied','rejected'].includes(status) && st !== status) return false;
    return true;
  }).sort((a, b) => scoreJob(b) - scoreJob(a)).slice(0, 50);
}
function render() {
  const list = applyFilters(jobs);
  $('resultsHeading').textContent = 'Results (' + list.length + ' shown)';
  $('results').innerHTML = list.length ? '' : '<p class="muted">No jobs yet. Search live, load sample mode, or add a job manually.</p>';
  for (const j of list) {
    const st = statuses[j.id] || 'new';
    const div = document.createElement('div');
    div.className = 'job';
    div.innerHTML = '<h3>' + escapeHtml(j.title) + '</h3>'
      + '<p>' + escapeHtml(j.company || 'Unknown company') + ' · ' + escapeHtml(j.location || '') + '</p>'
      + '<p><span class="badge">' + escapeHtml(j.source) + '</span>'
      + '<span class="badge">' + escapeHtml(workplaceOf(j)) + '</span>'
      + '<span class="badge">Fit: ' + escapeHtml(experienceFit(parseInt($('years').value || 0, 10), j.description || '')) + '</span>'
      + (j.sample ? '<span class="badge sample">SAMPLE DEMO — not a real listing</span>' : '') + '</p>'
      + '<p class="muted">' + escapeHtml((j.description || '').slice(0, 280)) + '</p>'
      + '<p class="muted">Matched skills: ' + escapeHtml((j.matchedSkills || []).join(', ') || 'none') + ' · Status: ' + st + '</p>';
    const apply = document.createElement('a');
    apply.href = j.url; apply.target = '_blank'; apply.rel = 'noopener'; apply.textContent = 'Apply on source →';
    div.appendChild(apply);
    ['saved','applied','rejected'].forEach(s => {
      const b = document.createElement('button');
      b.className = 'small secondary'; b.textContent = s[0].toUpperCase() + s.slice(1);
      b.onclick = () => { statuses[j.id] = s; saveState(); render(); };
      div.appendChild(b);
    });
    $('results').appendChild(div);
  }
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function readResumeFile(file) {
  if (!file) return '';
  if (file.name.endsWith('.pdf') && window.pdfjsLib) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join(' ') + '\n';
    }
    return text;
  }
  return await file.text();
}
$('parseResume').onclick = async () => {
  let text = $('resumeText').value;
  const file = $('resumeFile').files[0];
  if (file) text = await readResumeFile(file);
  if (!text.trim()) { $('resumeSummary').textContent = 'Paste resume text or choose a file first.'; return; }
  const lower = text.toLowerCase();
  const found = SKILLS.filter(s => lower.includes(s));
  $('skills').value = found.join(', ');
  const ym = text.match(/(\d+)\+?\s*years?/i);
  if (ym) $('years').value = ym[1];
  $('resumeSummary').textContent = 'Parsed (estimate — please correct): ' + found.length + ' skills found. Years and titles are editable above.';
};

function jsearchDate(days) { return days <= 1 ? 'today' : days <= 3 ? '3days' : days <= 7 ? 'week' : 'month'; }
async function searchLive() {
  const key = $('jsearchKey').value.trim();
  const adzId = $('adzunaId').value.trim(), adzKey = $('adzunaKey').value.trim();
  if (!key && !(adzId && adzKey)) {
    $('searchStatus').textContent = 'No free API key saved — loading sample mode instead. Add a key in section 2 for live results.';
    return loadSample();
  }
  $('searchStatus').textContent = 'Searching free tiers… (cached daily refresh is recommended: 5 saved searches/day ≈ 150 JSearch requests/month, inside the 200 free limit)';
  let out = [];
  try {
    if (key) {
      const q = encodeURIComponent($('q').value + ' ' + $('location').value);
      const url = 'https://jsearch.p.rapidapi.com/search?query=' + q + '&page=1&num_pages=1&country=in&date_posted=' + jsearchDate(parseInt($('days').value, 10)) + ($('workplace').value === 'remote' ? '&work_from_home=true' : '');
      const r = await fetch(url, { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' } });
      const d = await r.json();
      out = out.concat((d.data || []).map(x => ({
        title: x.job_title, company: x.employer_name, location: x.job_city || x.job_country || '',
        workplace: x.job_is_remote ? 'Remote' : undefined, posted: x.job_posted_at_datetime_utc,
        source: 'JSearch / ' + (x.job_publisher || 'web'), url: x.job_apply_link, description: x.job_description || ''
      })));
    }
    if (adzId && adzKey) {
      const url = 'https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=' + encodeURIComponent(adzId) + '&app_key=' + encodeURIComponent(adzKey)
        + '&results_per_page=20&what=' + encodeURIComponent($('q').value) + '&where=' + encodeURIComponent($('location').value)
        + '&max_days_old=' + $('days').value;
      const r = await fetch(url); const d = await r.json();
      out = out.concat((d.results || []).map(x => ({
        title: x.title, company: x.company?.display_name, location: x.location?.display_name,
        posted: x.created, source: 'Adzuna', url: x.redirect_url, description: x.description || ''
      })));
    }
  } catch (e) {
    $('searchStatus').textContent = 'Live search failed: ' + e.message + '. Check the key, then try sample mode.';
    return;
  }
  jobs = dedupe(out);
  jobs.forEach(j => { j.score = scoreJob(j); });
  $('searchStatus').textContent = 'Found ' + jobs.length + ' unique jobs (after dedupe). Verify on the source before applying.';
  render();
}
$('search').onclick = searchLive;

function loadSample() {
  jobs = dedupe([
    { title: 'DevOps Engineer', company: 'Sample Company', location: 'Bengaluru', workplace: 'Hybrid', posted: new Date().toISOString(), source: 'Sample', url: 'https://example.com', description: 'We are looking for a DevOps Engineer with 3-5 years of experience in AWS, Kubernetes and Terraform.', sample: true },
    { title: 'Site Reliability Engineer', company: 'Sample Company', location: 'Remote India', workplace: 'Remote', posted: new Date().toISOString(), source: 'Sample', url: 'https://example.com', description: 'SRE role requiring 2-4 years of experience with Prometheus, Grafana and Linux.', sample: true },
  ]);
  jobs.forEach(j => { j.score = scoreJob(j); });
  render();
}
$('sample').onclick = loadSample;

$('addManual').onclick = () => {
  const j = { title: $('manualTitle').value.trim(), company: $('manualCompany').value.trim(), location: $('manualLocation').value.trim(), url: $('manualUrl').value.trim() || '#', source: 'Manual import', posted: new Date().toISOString(), description: '' };
  if (!j.title || !j.url) { alert('Title and apply URL are needed.'); return; }
  j.id = jobId(j);
  jobs = dedupe([j, ...jobs]);
  render();
};
['workplace','days','statusFilter'].forEach(id => $(id).onchange = render);
$('years').onchange = render;

loadState();
render();
