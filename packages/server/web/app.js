// Vanilla browser script — no build step. Talks to the local Jobhound server.

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  // sidebar
  statusDot: $('status-dot'),
  statusLabel: $('status-label'),
  statusDetail: $('status-detail'),
  btnStart: $('btn-start'),
  btnStop: $('btn-stop'),
  btnRunOnce: $('btn-run-once'),


  // overview KPIs
  ovSubtitle: $('ov-subtitle'),
  searches: $('m-searches'),
  tokens: $('m-tokens'),
  tokensDetail: $('m-tokens-detail'),
  cost: $('m-cost'),
  costDetail: $('m-cost-detail'),
  cycles: $('m-cycles'),
  lcWhen: $('lc-when'),
  lastCycle: $('last-cycle'),
  lcId: $('lc-id'),
  lcDuration: $('lc-duration'),
  lcSearches: $('lc-searches'),
  lcCost: $('lc-cost'),
  lcFound: $('lc-found'),
  lcScored: $('lc-scored'),
  lcInserted: $('lc-inserted'),
  lcErrored: $('lc-errored'),
  lcTokens: $('lc-tokens'),

  // activity
  filterKnown: $('filter-known'),
  btnClear: $('btn-clear'),
  cycleMeta: $('cycle-meta'),
  cycleStatePill: $('cycle-state-pill'),
  stageFound:    $('stage-found'),
  stageNew:      $('stage-new'),
  stageAnalyzed: $('stage-analyzed'),
  stageScored:   $('stage-scored'),
  stageInserted: $('stage-inserted'),
  stageKnown:    $('stage-known'),
  stageFiltered: $('stage-filtered'),
  stageErrored:  $('stage-errored'),
  stageCost:     $('stage-cost'),
  feed: $('feed'),
  feedEmpty: $('feed-empty'),

  // cycles
  cyclesBody: $('cycles-body'),

  // jobs
  navJobsCount: $('nav-jobs-count'),
  jobsList: $('jobs-list'),
  jobsEmpty: $('jobs-empty'),
  jobsDetail: $('jobs-detail'),
  jobsListMeta: $('jobs-list-meta'),
  jobsSearch: $('jobs-search'),
  jobsRefresh: $('btn-jobs-refresh'),
  jobsExport: $('btn-jobs-export'),
  jobsDatePills: $('jobs-date-pills'),
  jobsDateRange: $('jobs-date-range'),
  jobsDateFrom: $('jobs-date-from'),
  jobsDateTo: $('jobs-date-to'),
  jobsDateCustomLabel: $('jobs-date-custom-label'),

  // settings — json editor
  settingsEditor: $('settings-editor'),
  settingsStatus: $('settings-status'),
  btnSettingsReload: $('btn-settings-reload'),
  btnSettingsSave: $('btn-settings-save'),

  // settings — api keys panel
  keysOpenai: $('keys-openai'),
  keysSerpList: $('keys-serp-list'),
  keysStatus: $('keys-status'),
  btnKeysSave: $('btn-keys-save'),
  btnKeysAddSerp: $('btn-keys-add-serp'),

  // setup
  setupForm: $('setup-form'),
  setupStatus: $('setup-status'),
  setupResumeFile: $('setup-resume-file'),
  setupResumeFilename: $('setup-resume-filename'),
};

const ROUTES = ['overview', 'jobs', 'jobs/cycles', 'tailor', 'resume', 'settings', 'setup'];
let isConfigured = false;
let tailorEnabled = true;
const MAX_FEED_ITEMS = 300;
const MAX_JOBS_ROWS = 500;

// per-job aggregated state, keyed by job_id. Built from /api/jobs + live SSE.
const jobsById = new Map();
let jobsQuery = '';
let jobsDateRange = 'today';   // 'today' | '24h' | '7d' | '30d' | 'all' | 'custom'
let jobsDateFrom = '';         // YYYY-MM-DD when jobsDateRange === 'custom'
let jobsDateTo = '';
let selectedJobId = null;      // master/detail selection

const cycleCounts = blankCounts();
let activeCycleId = null;

function blankCounts() {
  return { found: 0, new: 0, known: 0, analyzed: 0, scored: 0, filtered: 0, errored: 0, inserted: 0, tokens: 0, cost: 0 };
}

const STATUS_COLORS = {
  paused:   'bg-ink-900 opacity-40',
  idle:     'bg-ink-900',
  running:  'bg-ink-900 animate-pulse-soft',
  stopping: 'bg-ink-900 animate-pulse-soft',
};

// ---------- router ----------

function currentRoute() {
  const hash = location.hash.replace(/^#\//, '');
  const fallback = isConfigured ? 'overview' : 'setup';
  if (!ROUTES.includes(hash)) return fallback;
  if (!isConfigured && hash !== 'setup') return 'setup';
  if (hash === 'tailor' && !tailorEnabled) return fallback;
  return hash;
}

function showRoute(route) {
  $$('[data-page]').forEach((sec) => {
    sec.classList.toggle('hidden', sec.dataset.page !== route);
  });
  const navRoute = route.split('/')[0];
  $$('.nav-item').forEach((el) => {
    const active = el.dataset.route === navRoute;
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  if (route === 'jobs/cycles') refreshCycles();
  if (route === 'settings') refreshSettings();
  if (route === 'jobs') refreshJobs();
  if ((route === 'tailor' || route === 'resume') && typeof window.refreshTailor === 'function') window.refreshTailor();
}

window.addEventListener('hashchange', () => showRoute(currentRoute()));

// ---------- controls ----------

els.btnStart.addEventListener('click', () => post('/api/start'));
els.btnStop.addEventListener('click', () => post('/api/stop'));
els.btnRunOnce.addEventListener('click', () => post('/api/run-once'));
els.btnClear.addEventListener('click', () => {
  els.feed.innerHTML = '';
  els.feedEmpty.hidden = false;
});
if (els.btnSettingsReload) els.btnSettingsReload.addEventListener('click', () => refreshSettings());
if (els.btnSettingsSave) els.btnSettingsSave.addEventListener('click', () => saveSettings());
if (els.btnKeysSave) els.btnKeysSave.addEventListener('click', () => saveKeys());
if (els.btnKeysAddSerp) els.btnKeysAddSerp.addEventListener('click', () => addSerpKeyRow(''));
if (els.keysSerpList) {
  els.keysSerpList.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.key-serp-remove');
    if (removeBtn) removeSerpKeyRow(removeBtn);
    const toggleBtn = e.target.closest('.key-toggle');
    if (toggleBtn) toggleKeyVisibility(toggleBtn);
  });
}
document.addEventListener('click', (e) => {
  const toggleBtn = e.target.closest('.key-toggle[data-target="keys-openai"]');
  if (toggleBtn) toggleKeyVisibility(toggleBtn);
});
if (els.setupForm) els.setupForm.addEventListener('submit', submitSetup);
if (els.setupResumeFile && els.setupResumeFilename) {
  els.setupResumeFile.addEventListener('change', () => {
    const f = els.setupResumeFile.files?.[0];
    els.setupResumeFilename.textContent = f ? f.name : 'Click to upload your resume PDF';
  });
}

if (els.jobsRefresh) els.jobsRefresh.addEventListener('click', () => refreshJobs());
if (els.jobsExport) els.jobsExport.addEventListener('click', () => exportJobsCsv());
if (els.jobsSearch) {
  els.jobsSearch.addEventListener('input', (e) => {
    jobsQuery = e.target.value || '';
    paintJobs();
  });
}
if (els.jobsDatePills) {
  els.jobsDatePills.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-date]');
    if (!btn) return;
    jobsDateRange = btn.dataset.date;
    els.jobsDatePills.querySelectorAll('[data-date]').forEach((c) => c.classList.toggle('active', c === btn));
    if (els.jobsDateRange) {
      els.jobsDateRange.classList.toggle('hidden', jobsDateRange !== 'custom');
      els.jobsDateRange.classList.toggle('flex',  jobsDateRange === 'custom');
    }
    if (els.jobsDateCustomLabel) {
      els.jobsDateCustomLabel.textContent =
        jobsDateRange === 'custom' && (jobsDateFrom || jobsDateTo)
          ? `${jobsDateFrom || '…'} → ${jobsDateTo || '…'}`
          : 'Custom';
    }
    paintJobs();
  });
}
const onCustomDate = () => {
  jobsDateFrom = els.jobsDateFrom?.value || '';
  jobsDateTo   = els.jobsDateTo?.value   || '';
  if (els.jobsDateCustomLabel) {
    els.jobsDateCustomLabel.textContent =
      (jobsDateFrom || jobsDateTo) ? `${jobsDateFrom || '…'} → ${jobsDateTo || '…'}` : 'Custom';
  }
  paintJobs();
};
if (els.jobsDateFrom) els.jobsDateFrom.addEventListener('change', onCustomDate);
if (els.jobsDateTo)   els.jobsDateTo.addEventListener('change',   onCustomDate);

async function post(path) {
  try {
    const res = await fetch(path, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) console.warn(`${path} → ${res.status}`, data);
  } catch (err) {
    console.error(`${path} failed`, err);
  }
}

// ---------- state ----------

async function refreshState() {
  try {
    const res = await fetch('/api/state');
    if (!res.ok) return;
    applyState(await res.json());
  } catch (err) {
    console.error('state fetch failed', err);
  }
}

function applyState(state) {
  const status = state.status || 'paused';

  // sidebar status pill
  els.statusDot.className = `h-2 w-2 rounded-full ${STATUS_COLORS[status] || STATUS_COLORS.paused}`;
  els.statusLabel.textContent = status;
  els.statusLabel.className = 'capitalize text-ink-800 flex-1 truncate';
  if (status === 'running' && state.current_cycle_id) {
    els.statusDetail.textContent = `Cycle #${shortId(state.current_cycle_id)} in progress`;
  } else if (status === 'running') {
    els.statusDetail.textContent = 'Cycle in progress';
  } else if (status === 'stopping') {
    els.statusDetail.textContent = 'Finishing current cycle…';
  } else if (state.next_cycle_at) {
    els.statusDetail.textContent = `Next run ${formatRelative(state.next_cycle_at)} · ${formatTime(state.next_cycle_at)}`;
  } else if (status === 'idle') {
    els.statusDetail.textContent = 'Waiting for next cycle';
  } else {
    els.statusDetail.textContent = 'No schedule active';
  }

  // buttons
  els.btnStart.disabled = status !== 'paused';
  els.btnStop.disabled = status === 'paused' || status === 'stopping';
  els.btnRunOnce.disabled = status === 'running' || status === 'stopping';

  // segmented-control primary highlight tracks the natural next action.
  setSegPrimary(els.btnStart,    status === 'paused');
  setSegPrimary(els.btnStop,     status === 'running' || status === 'idle');
  setSegPrimary(els.btnRunOnce,  false);

  // overview subtitle
  if (els.ovSubtitle) {
    els.ovSubtitle.textContent =
      status === 'running' && state.current_cycle_id
        ? `Cycle in flight · ${shortId(state.current_cycle_id)}`
        : status === 'idle' && state.next_cycle_at
          ? `Idle · next cycle ${formatRelative(state.next_cycle_at)}`
          : status === 'stopping'
            ? 'Stopping — draining current cycle.'
            : 'Server is paused. Start it from the sidebar.';
  }

  // cycle pipeline (activity page)
  els.cycleStatePill.textContent = status === 'running' ? 'running' : status;
  els.cycleStatePill.className =
    'text-[10px] uppercase tracking-wider font-semibold text-ink-500';
  if (status === 'running' && state.current_cycle_id) {
    els.cycleMeta.textContent = `cycle ${shortId(state.current_cycle_id)} · started ${formatTime(state.current_cycle_started_at)}`;
  } else if (status === 'idle' && state.next_cycle_at) {
    els.cycleMeta.textContent = `idle · next cycle ${formatRelative(state.next_cycle_at)}`;
  } else if (status === 'paused') {
    els.cycleMeta.textContent = 'Paused. Hit Start to begin the cycle loop.';
  } else {
    els.cycleMeta.textContent = '';
  }

  if (state.features != null) {
    const enabled = state.features.tailor_resume !== false;
    if (enabled !== tailorEnabled) {
      tailorEnabled = enabled;
      const tailorNavItem = document.querySelector('[data-route="tailor"]');
      if (tailorNavItem) tailorNavItem.classList.toggle('hidden', !tailorEnabled);
      if (!tailorEnabled && currentRoute() === 'tailor') {
        location.hash = '#/overview';
      }
    }
  }

  if (state.month_usage) renderUsage(state.month_usage);
  if (state.last_cycle) renderLastCycle(state.last_cycle);
}

function renderUsage(usage) {
  els.searches.textContent = usage.searches ?? 0;
  els.tokens.textContent = formatNumber(usage.tokens ?? 0);
  els.cost.textContent = (usage.cost_usd ?? 0).toFixed(4);
  els.cycles.textContent = usage.cycles ?? 0;
  if (usage.month) {
    els.tokensDetail.textContent = `${usage.month}`;
    els.costDetail.textContent = `${usage.month} · USD`;
  }
}

function renderLastCycle(c) {
  els.lastCycle.hidden = false;
  els.lcWhen.textContent = `finished ${formatTime(c.timestamp)} · ${formatDurationMs(c.duration_ms)}`;
  els.lcId.textContent = c.cycle_id;
  els.lcDuration.textContent = formatDurationMs(c.duration_ms);
  els.lcSearches.textContent = c.searches_used ?? 0;
  els.lcCost.textContent = (c.cost_usd ?? 0).toFixed(4);
  els.lcTokens.textContent = formatNumber(c.tokens_used);
  els.lcFound.textContent = `${c.found} / ${c.new} / ${c.known}`;
  els.lcScored.textContent = `${c.scored} / ${c.filtered}`;
  els.lcInserted.textContent = `${c.inserted} / ${c.updated}`;
  els.lcErrored.textContent = c.errored;
}

// ---------- cycles ----------

async function refreshCycles() {
  try {
    const res = await fetch('/api/cycles?limit=50');
    if (!res.ok) return;
    const { cycles } = await res.json();
    renderCyclesTable(cycles);
  } catch (err) {
    console.error('cycles fetch failed', err);
  }
}

function renderCyclesTable(cycles) {
  if (!cycles.length) {
    els.cyclesBody.innerHTML = '<tr><td colspan="10" class="px-4 py-6 text-center text-ink-400">No cycles recorded yet.</td></tr>';
    return;
  }
  els.cyclesBody.innerHTML = cycles
    .map(
      (c) => `<tr class="hover:bg-white/[.08] transition-colors">
        <td class="px-4 py-2.5 tabular text-ink-700" title="${escapeAttr(c.cycle_id)}">${formatTime(c.timestamp)}</td>
        <td class="px-4 py-2.5 tabular text-ink-500">${formatDurationMs(c.duration_ms)}</td>
        <td class="px-4 py-2.5 tabular text-right text-ink-800">${c.found}</td>
        <td class="px-4 py-2.5 tabular text-right text-ink-800">${c.new}</td>
        <td class="px-4 py-2.5 tabular text-right text-ink-800">${c.inserted}</td>
        <td class="px-4 py-2.5 tabular text-right ${c.filtered ? 'text-ink-800 font-semibold' : 'text-ink-500'}">${c.filtered}</td>
        <td class="px-4 py-2.5 tabular text-right ${c.errored ? 'text-ink-800 font-semibold underline decoration-ink-800/60 underline-offset-2' : 'text-ink-500'}">${c.errored}</td>
        <td class="px-4 py-2.5 tabular text-right text-ink-700">${c.searches_used}</td>
        <td class="px-4 py-2.5 tabular text-right text-ink-700">${formatNumber(c.tokens_used)}</td>
        <td class="px-4 py-2.5 tabular text-right text-ink-800">$${(c.cost_usd ?? 0).toFixed(4)}</td>
      </tr>`,
    )
    .join('');
}

// ---------- setup + settings ----------

async function checkSetupStatus() {
  try {
    const res = await fetch('/api/setup/status');
    if (!res.ok) return;
    const body = await res.json();
    isConfigured = !!body.configured;
  } catch (err) {
    console.error('setup status fetch failed', err);
  }
}

async function submitSetup(ev) {
  ev.preventDefault();
  if (!els.setupForm) return;
  const form = new FormData(els.setupForm);
  const file = els.setupResumeFile?.files?.[0];
  if (!file) {
    els.setupStatus.textContent = 'please select your resume PDF first';
    return;
  }
  const openaiKey = String(form.get('openai_key') ?? '').trim();
  if (!openaiKey) {
    els.setupStatus.textContent = 'OpenAI key is required to parse the resume';
    return;
  }
  const model = String(form.get('model') ?? '').trim() || 'gpt-4o-mini';

  try {
    els.setupStatus.textContent = 'parsing resume…';
    const uploadUrl = `/api/resume/upload?filename=${encodeURIComponent(file.name)}&openai_key=${encodeURIComponent(openaiKey)}&model=${encodeURIComponent(model)}`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/pdf' },
      body: file,
    });
    const uploadBody = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok) {
      els.setupStatus.textContent = uploadBody.error || `resume parse failed (${uploadRes.status})`;
      return;
    }

    els.setupStatus.textContent = 'saving config…';
    const payload = buildSetupPayload(form);
    const setupRes = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const setupBody = await setupRes.json().catch(() => ({}));
    if (!setupRes.ok) {
      els.setupStatus.textContent = setupBody.error || `save failed (${setupRes.status})`;
      return;
    }

    const d = setupBody.derived || {};
    els.setupStatus.textContent = `saved — derived ${d.skills?.length ?? 0} skills, ${d.role_titles?.length ?? 0} role titles, ${d.years_experience ?? 0}y experience. Redirecting…`;
    isConfigured = true;
    location.hash = '#/resume';
  } catch (err) {
    els.setupStatus.textContent = `save failed: ${err.message}`;
  }
}

function buildSetupPayload(form) {
  const queries = String(form.get('queries') ?? '')
    .split('\n')
    .map((q) => q.trim())
    .filter(Boolean);
  const seniority = String(form.get('seniority') ?? '').trim();

  return {
    cycle: { queries },
    serpapi: {
      country: String(form.get('country') ?? '').trim().toLowerCase(),
      language: String(form.get('language') ?? '').trim().toLowerCase(),
    },
    openai: { model: String(form.get('model') ?? '').trim() || 'gpt-4o-mini' },
    secrets: {
      serpapi_keys: [String(form.get('serpapi_key') ?? '').trim()].filter(Boolean),
      openai_key: String(form.get('openai_key') ?? '').trim(),
    },
    profile: { seniority: seniority || null },
  };
}

async function refreshSettings() {
  if (!els.settingsEditor) return;
  els.settingsStatus.textContent = 'loading…';
  try {
    const res = await fetch('/api/config');
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      els.settingsStatus.textContent = body.error || `failed to load (${res.status})`;
      return;
    }
    const cfg = await res.json();
    els.settingsEditor.value = JSON.stringify(cfg, null, 2);
    els.settingsStatus.textContent = '';
    populateKeysPanel(cfg);
  } catch (err) {
    els.settingsStatus.textContent = `load failed: ${err.message}`;
  }
}

function populateKeysPanel(cfg) {
  if (!els.keysOpenai || !els.keysSerpList) return;
  els.keysOpenai.value = cfg.secrets?.openai_key ?? '';
  els.keysSerpList.innerHTML = '';
  const keys = cfg.secrets?.serpapi_keys ?? [];
  const list = keys.length ? keys : [''];
  for (const k of list) addSerpKeyRow(k);
}

function addSerpKeyRow(value) {
  if (!els.keysSerpList) return;
  const row = document.createElement('div');
  row.className = 'key-serp-row flex items-center gap-2';
  row.innerHTML = `
    <input type="password" autocomplete="off" spellcheck="false"
      class="key-serp-input flex-1 text-sm font-mono rounded-md px-3 py-1.5" placeholder="sk-…" />
    <button type="button" class="key-toggle text-xs text-ink-400 hover:text-ink-700 px-2 py-1.5 shrink-0">show</button>
    <button type="button" class="key-serp-remove text-xs text-ink-400 hover:text-red-500 px-2 py-1.5 shrink-0" title="Remove">✕</button>
  `;
  row.querySelector('.key-serp-input').value = value;
  els.keysSerpList.appendChild(row);
  updateRemoveButtons();
}

function removeSerpKeyRow(btn) {
  btn.closest('.key-serp-row').remove();
  updateRemoveButtons();
}

function updateRemoveButtons() {
  if (!els.keysSerpList) return;
  const rows = els.keysSerpList.querySelectorAll('.key-serp-row');
  rows.forEach((r) => {
    r.querySelector('.key-serp-remove').disabled = rows.length === 1;
  });
}

function toggleKeyVisibility(btn) {
  const targetId = btn.dataset.target;
  const input = targetId ? document.getElementById(targetId) : btn.closest('.key-serp-row')?.querySelector('.key-serp-input');
  if (!input) return;
  const hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password';
  btn.textContent = hidden ? 'hide' : 'show';
}

async function saveKeys() {
  if (!els.keysOpenai || !els.keysSerpList) return;
  const openaiKey = els.keysOpenai.value.trim();
  const serpKeys = Array.from(els.keysSerpList.querySelectorAll('.key-serp-input'))
    .map((i) => i.value.trim())
    .filter(Boolean);

  if (!openaiKey) {
    els.keysStatus.textContent = 'OpenAI key is required';
    return;
  }
  if (!serpKeys.length) {
    els.keysStatus.textContent = 'at least one SerpAPI key is required';
    return;
  }

  els.keysStatus.textContent = 'saving…';
  try {
    const cfgRes = await fetch('/api/config');
    if (!cfgRes.ok) {
      els.keysStatus.textContent = 'could not load current config';
      return;
    }
    const cfg = await cfgRes.json();
    cfg.secrets = { ...cfg.secrets, serpapi_keys: serpKeys, openai_key: openaiKey };

    const saveRes = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    const body = await saveRes.json().catch(() => ({}));
    if (!saveRes.ok) {
      els.keysStatus.textContent = body.error || `save failed (${saveRes.status})`;
      return;
    }
    els.keysStatus.textContent = 'saved';
    if (els.settingsEditor) els.settingsEditor.value = JSON.stringify(cfg, null, 2);
    setTimeout(() => { if (els.keysStatus.textContent === 'saved') els.keysStatus.textContent = ''; }, 1500);
  } catch (err) {
    els.keysStatus.textContent = `save failed: ${err.message}`;
  }
}

async function saveSettings() {
  if (!els.settingsEditor) return;
  let parsed;
  try {
    parsed = JSON.parse(els.settingsEditor.value);
  } catch (err) {
    els.settingsStatus.textContent = `invalid JSON: ${err.message}`;
    return;
  }
  els.settingsStatus.textContent = 'saving…';
  try {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      els.settingsStatus.textContent = body.error || `save failed (${res.status})`;
      return;
    }
    els.settingsStatus.textContent = 'saved';
    isConfigured = true;
    setTimeout(() => { if (els.settingsStatus.textContent === 'saved') els.settingsStatus.textContent = ''; }, 1500);
  } catch (err) {
    els.settingsStatus.textContent = `save failed: ${err.message}`;
  }
}

// ---------- jobs ----------

async function refreshJobs() {
  try {
    const res = await fetch('/api/jobs-store');
    if (!res.ok) return;
    const { jobs } = await res.json();
    jobsById.clear();
    for (const j of jobs) jobsById.set(j.job_id, j);
    paintJobs();
  } catch (err) {
    console.error('jobs fetch failed', err);
  }
}

function isErrored(j) {
  return typeof j.rationale === 'string' && j.rationale.startsWith('errored:');
}

function parseDDMMYYYY(s) {
  if (!s || typeof s !== 'string') return NaN;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return Date.parse(s);
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
}

function currentJobsView() {
  const all = Array.from(jobsById.values());
  const q = jobsQuery.trim().toLowerCase();
  const win = dateWindow();
  const filtered = all.filter((j) => {
    if (win) {
      const t = parseDDMMYYYY(j.first_seen);
      if (!Number.isFinite(t)) return false;
      if (t < win.from || t >= win.to) return false;
    }
    if (!q) return true;
    return (
      (j.title    && j.title.toLowerCase().includes(q)) ||
      (j.company  && j.company.toLowerCase().includes(q)) ||
      (j.source   && j.source.toLowerCase().includes(q)) ||
      (j.location && j.location.toLowerCase().includes(q))
    );
  });
  filtered.sort((a, b) => {
    const ta = parseDDMMYYYY(a.last_seen);
    const tb = parseDDMMYYYY(b.last_seen);
    if (ta !== tb) return tb - ta;
    return (b.score ?? -1) - (a.score ?? -1);
  });
  return { all, filtered };
}

function paintJobs() {
  const all = Array.from(jobsById.values());
  if (els.navJobsCount) els.navJobsCount.textContent = all.length ? String(all.length) : '';

  const { filtered } = currentJobsView();
  const trimmed = filtered.slice(0, MAX_JOBS_ROWS);
  if (els.jobsListMeta) els.jobsListMeta.textContent =
    `${trimmed.length} shown${filtered.length > trimmed.length ? ` of ${filtered.length}` : ''}`;

  if (!trimmed.length) {
    els.jobsList.innerHTML = '';
    els.jobsList.classList.add('hidden');
    els.jobsEmpty.hidden = false;
    selectedJobId = null;
    paintJobDetail(null);
    return;
  }
  els.jobsList.classList.remove('hidden');
  els.jobsEmpty.hidden = true;

  if (!selectedJobId || !trimmed.find((j) => j.job_id === selectedJobId)) {
    selectedJobId = trimmed[0].job_id;
  }

  els.jobsList.innerHTML = trimmed.map(renderJobCard).join('');
  paintJobDetail(jobsById.get(selectedJobId) || null);
}

els.jobsList?.addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  const card = e.target.closest('[data-job-id]');
  if (!card) return;
  const id = card.dataset.jobId;
  if (id === selectedJobId) return;
  selectedJobId = id;
  els.jobsList.querySelectorAll('[data-job-id]').forEach((el) => {
    el.classList.toggle('is-selected', el.dataset.jobId === id);
  });
  paintJobDetail(jobsById.get(id) || null);
});

const ICON_PLATFORM = `<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
const ICON_LOCATION = `<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s-7-6-7-12a7 7 0 0114 0c0 6-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>`;
const ICON_SALARY = `<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`;

const AXIS_LABELS = {
  skills_match: 'Skills',
  seniority_match: 'Seniority',
  location_match: 'Location',
  comp_match: 'Compensation',
  domain_match: 'Domain',
  recency: 'Recency',
};

function badge(icon, text) {
  return `<span class="badge">${icon}<span>${escapeText(text)}</span></span>`;
}

function renderJobCard(j) {
  const score = typeof j.score === 'number' ? Math.round(j.score) : null;
  const cls = scoreClass(score);
  const ring = `<div class="score-ring ${cls} h-10 w-10 rounded-full flex items-center justify-center shrink-0" style="--pct:${score ?? 0}">
    <div class="h-[30px] w-[30px] rounded-full flex items-center justify-center" style="background:var(--bg-app)">
      <span class="text-[11.5px] font-semibold tabular ${cls}">${score ?? '—'}</span>
    </div>
  </div>`;

  const selectedCls = j.job_id === selectedJobId ? ' is-selected' : '';

  const badges = [
    j.source   ? badge(ICON_PLATFORM, j.source)   : '',
    j.location ? badge(ICON_LOCATION, j.location) : '',
  ].filter(Boolean).join('');

  return `<li class="job-card${selectedCls} rounded-lg p-3 flex items-start gap-3" data-job-id="${escapeAttr(j.job_id)}">
    ${ring}
    <div class="min-w-0 flex-1">
      <div class="flex items-start justify-between gap-2">
        <div class="text-[13px] font-semibold leading-snug truncate flex-1">${escapeText(j.title || '(untitled)')}</div>
        <span class="text-[10.5px] text-ink-400 tabular shrink-0 whitespace-nowrap">${escapeText(j.first_seen || '—')}</span>
      </div>
      <div class="mt-0.5 text-[11.5px] text-ink-500 truncate font-medium">${escapeText(j.company || '—')}</div>
      ${badges ? `<div class="mt-1.5 flex flex-wrap gap-1">${badges}</div>` : ''}
    </div>
  </li>`;
}

function paintJobDetail(j) {
  if (!j) {
    els.jobsDetail.innerHTML = `
      <div class="px-6 py-16 text-center flex-1 flex flex-col items-center justify-center">
        <div class="mx-auto h-10 w-10 rounded-full bg-ink-200/60 flex items-center justify-center mb-3">
          <svg class="h-5 w-5 text-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h6M12 9v6"/><circle cx="12" cy="12" r="9"/></svg>
        </div>
        <div class="text-sm font-medium text-ink-700">No job selected</div>
        <div class="text-xs text-ink-400 mt-1">Pick a posting from the list.</div>
      </div>`;
    return;
  }

  const score = typeof j.score === 'number' ? Math.round(j.score) : null;
  const cls = scoreClass(score);
  const ring = `<div class="score-ring ${cls} h-12 w-12 rounded-full flex items-center justify-center shrink-0" style="--pct:${score ?? 0}">
    <div class="h-[38px] w-[38px] rounded-full flex items-center justify-center" style="background:var(--bg-app)">
      <span class="text-[13px] font-semibold tabular ${cls}">${score ?? '—'}</span>
    </div>
  </div>`;

  const badges = [
    j.source   ? badge(ICON_PLATFORM, j.source)   : '',
    j.location ? badge(ICON_LOCATION, j.location) : '',
    formatSalary(j) ? badge(ICON_SALARY, formatSalary(j)) : '',
  ].filter(Boolean).join('');

  const errored = isErrored(j);
  const rationale = errored ? j.rationale.replace(/^errored:\s*/, '') : j.rationale;

  let breakdown = null;
  if (j.breakdown) {
    try { breakdown = JSON.parse(j.breakdown); } catch { breakdown = null; }
  }

  const meta = detailSection('Posting', detailKv([
    ['Work mode',  j.work_mode || '—'],
    ['Seniority',  j.seniority || '—'],
    ['Posted',     j.posted_date || '—'],
    ['Status',     j.status || '—'],
    ['First seen', j.first_seen || '—'],
    ['Last seen',  j.last_seen || '—'],
  ]));

  const rationaleSection = rationale
    ? detailSection(errored ? 'Error' : 'Rationale',
        `<p class="text-[13px] leading-relaxed ${errored ? 'text-ink-800 font-semibold' : 'text-ink-700'}">${escapeText(rationale)}</p>`)
    : '';

  const breakdownSection = breakdown ? renderBreakdownSection(breakdown) : '';

  const idSection = detailSection('Identifiers', `
    <dl class="grid grid-cols-[100px_1fr] gap-x-4 gap-y-1.5 text-[12px]">
      <dt class="text-ink-500">job_id</dt>
      <dd class="font-mono text-ink-800 break-all">${escapeText(j.job_id)}</dd>
      ${j.apply_url ? `
        <dt class="text-ink-500">apply_url</dt>
        <dd class="text-ink-800 break-all"><a href="${escapeAttr(j.apply_url)}" target="_blank" rel="noopener" class="text-ink-800 underline decoration-ink-800/50 underline-offset-2">${escapeText(j.apply_url)}</a></dd>
      ` : ''}
    </dl>
  `);

  const footer = j.apply_url
    ? `<div class="px-6 py-4 border-t border-ink-200/60 shrink-0">
        <a href="${escapeAttr(j.apply_url)}" target="_blank" rel="noopener" class="btn-primary w-full inline-flex items-center justify-center gap-2">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5"/></svg>
          Open posting
        </a>
      </div>`
    : `<div class="px-6 py-4 border-t border-ink-200/60 text-center text-xs text-ink-400 shrink-0">No apply link on this posting.</div>`;

  els.jobsDetail.innerHTML = `
    <div class="px-6 pt-5 pb-4 border-b border-ink-200/60 flex items-start gap-4 shrink-0">
      ${ring}
      <div class="min-w-0 flex-1">
        <h2 class="text-base font-semibold leading-snug break-words">${escapeText(j.title || '(untitled)')}</h2>
        <div class="text-[12.5px] text-ink-600 mt-0.5 truncate">${escapeText(j.company || '—')}</div>
        ${badges ? `<div class="mt-2 flex flex-wrap gap-1.5">${badges}</div>` : ''}
      </div>
    </div>
    <div class="px-6 py-5 space-y-6 overflow-y-auto flex-1">
      ${meta}
      ${rationaleSection}
      ${breakdownSection}
      ${idSection}
    </div>
    ${footer}
  `;
}

function renderBreakdownSection(b) {
  const axes = b.axes || {};
  const rows = Object.keys(AXIS_LABELS)
    .filter((k) => axes[k])
    .map((k) => {
      const a = axes[k];
      const s = Math.max(0, Math.min(100, Math.round(a.score ?? 0)));
      return `<div class="space-y-1">
        <div class="flex items-center justify-between text-[12px]">
          <span class="text-ink-700 font-medium">${AXIS_LABELS[k]}</span>
          <span class="tabular text-ink-500">${s}</span>
        </div>
        <div class="axis-bar"><span style="width:${s}%"></span></div>
        ${a.note ? `<div class="text-[11.5px] text-ink-500 leading-relaxed">${escapeText(a.note)}</div>` : ''}
      </div>`;
    })
    .join('');

  const deal = (b.deal_breakers && b.deal_breakers.length)
    ? `<div class="mt-4 rounded-md bg-ink-50 border border-ink-900 px-3 py-2.5">
        <div class="text-[10px] uppercase tracking-wider text-ink-800 font-semibold mb-1">Deal-breakers</div>
        <ul class="text-[12px] text-ink-700 space-y-0.5 list-disc pl-4">${b.deal_breakers.map((d) => `<li>${escapeText(d)}</li>`).join('')}</ul>
      </div>`
    : '';

  const head = `<div class="flex items-center justify-between mb-3 text-[12px]">
    <span class="text-ink-500">Final score</span>
    <span class="tabular font-semibold text-ink-800">${Math.round(b.final_score ?? 0)} · ${escapeText(b.confidence || '—')} confidence</span>
  </div>`;

  return detailSection('Score breakdown', head + `<div class="space-y-3.5">${rows}</div>` + deal);
}

function detailSection(title, bodyHtml) {
  return `<section>
    <div class="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2.5">${escapeText(title)}</div>
    ${bodyHtml}
  </section>`;
}

function detailKv(rows) {
  return `<dl class="grid grid-cols-[110px_1fr] gap-x-4 gap-y-1.5 text-[13px]">${rows
    .map(([k, v]) => `<dt class="text-ink-500">${escapeText(k)}</dt><dd class="text-ink-800">${escapeText(v)}</dd>`)
    .join('')}</dl>`;
}

function formatSalary(j) {
  if (j.salary_min == null && j.salary_max == null) return '';
  if (j.salary_min != null && j.salary_max != null) return `${formatNumber(j.salary_min)}–${formatNumber(j.salary_max)}`;
  return formatNumber(j.salary_min ?? j.salary_max);
}

function exportJobsCsv() {
  const { filtered } = currentJobsView();
  const cols = ['job_id', 'title', 'company', 'location', 'work_mode', 'salary_min', 'salary_max', 'seniority', 'source', 'apply_url', 'posted_date', 'score', 'status', 'rationale', 'first_seen', 'last_seen'];
  const rows = [cols.join(',')];
  for (const j of filtered) {
    rows.push(cols.map((c) => csvCell(j[c])).join(','));
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jobhound-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function dateWindow() {
  const now = Date.now();
  if (jobsDateRange === 'all') return null;
  if (jobsDateRange === 'today') {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return { from: start.getTime(), to: now + 1 };
  }
  if (jobsDateRange === '24h') return { from: now - 24 * 3600_000,      to: now + 1 };
  if (jobsDateRange === '7d')  return { from: now - 7  * 24 * 3600_000, to: now + 1 };
  if (jobsDateRange === '30d') return { from: now - 30 * 24 * 3600_000, to: now + 1 };
  if (jobsDateRange === 'custom') {
    const from = jobsDateFrom ? new Date(jobsDateFrom + 'T00:00:00').getTime() : -Infinity;
    const to   = jobsDateTo   ? new Date(jobsDateTo   + 'T23:59:59.999').getTime() : Infinity;
    if (!Number.isFinite(from) && !Number.isFinite(to)) return null;
    return { from, to };
  }
  return null;
}

function scoreClass(score) {
  if (score == null) return 'score-none';
  if (score >= 80) return 'score-strong';
  if (score >= 60) return 'score-good';
  if (score >= 40) return 'score-mid';
  return 'score-weak';
}

// ---------- pipeline counters ----------

function resetPipelineCounters() {
  Object.assign(cycleCounts, blankCounts());
  paintPipeline();
}

function paintPipeline() {
  els.stageFound.textContent    = cycleCounts.found;
  els.stageNew.textContent      = cycleCounts.new;
  els.stageAnalyzed.textContent = cycleCounts.analyzed;
  els.stageScored.textContent   = cycleCounts.scored;
  els.stageInserted.textContent = cycleCounts.inserted;
  els.stageKnown.textContent    = cycleCounts.known;
  els.stageFiltered.textContent = cycleCounts.filtered;
  els.stageErrored.textContent  = cycleCounts.errored;
  els.stageCost.textContent     = cycleCounts.cost.toFixed(4);
}

function bumpFromJobEvent(p) {
  switch (p.action) {
    case 'found':         cycleCounts.found++; cycleCounts.new++; break;
    case 'skipped-known': cycleCounts.found++; cycleCounts.known++; break;
    case 'analyzed':      cycleCounts.analyzed++; break;
    case 'scored':        cycleCounts.scored++; break;
    case 'filtered':      cycleCounts.filtered++; break;
    case 'errored':       cycleCounts.errored++; break;
  }
  if (typeof p.tokens === 'number') cycleCounts.tokens += p.tokens;
  if (typeof p.cost_usd === 'number') cycleCounts.cost += p.cost_usd;
  paintPipeline();
}

function applyCycleFinishToCounters(c) {
  cycleCounts.inserted = c.inserted ?? cycleCounts.inserted;
  cycleCounts.filtered = c.filtered ?? cycleCounts.filtered;
  cycleCounts.errored  = c.errored  ?? cycleCounts.errored;
  cycleCounts.cost     = c.cost_usd ?? cycleCounts.cost;
  paintPipeline();
}

// ---------- feed ----------

function pushFeed({ action, title, sub, meta }) {
  if (action === 'skipped-known' && !els.filterKnown.checked) return;
  els.feedEmpty.hidden = true;
  const ts = new Date().toISOString().slice(11, 19);
  const li = document.createElement('li');
  li.className = 'px-6 py-2.5 grid grid-cols-[64px_110px_1fr_auto] gap-3 items-center text-xs';
  li.innerHTML = `
    <span class="font-mono text-[11px] text-ink-400 tabular">${ts}</span>
    <span class="text-[11px] text-ink-500 font-medium uppercase tracking-wider truncate">${escapeText(action)}</span>
    <div class="min-w-0">
      <div class="truncate text-ink-800 font-medium"></div>
      <div class="truncate text-ink-400 text-[11px]"></div>
    </div>
    <span class="text-ink-500 font-mono text-[11px] tabular text-right whitespace-nowrap"></span>
  `;
  const [titleEl, subEl] = li.querySelectorAll('div > div');
  titleEl.textContent = title || '—';
  subEl.textContent = sub || '';
  li.lastElementChild.textContent = meta || '';
  els.feed.prepend(li);
  while (els.feed.childElementCount > MAX_FEED_ITEMS) {
    els.feed.removeChild(els.feed.lastElementChild);
  }
}

// ---------- SSE ----------

function connectStream() {
  const src = new EventSource('/api/events');
  src.addEventListener('open', () => {});
  src.addEventListener('error', () => {});

  src.addEventListener('state', (ev) => {
    applyState({ month_usage: null, ...JSON.parse(ev.data) });
    refreshState();
  });

  src.addEventListener('cycle:start', (ev) => {
    const p = JSON.parse(ev.data);
    activeCycleId = p.cycle_id;
    resetPipelineCounters();
    els.cycleMeta.textContent = `cycle ${shortId(p.cycle_id)} · ${p.queries} queries · ${p.model}`;
    pushFeed({
      action: 'cycle start',
      title: `started cycle ${shortId(p.cycle_id)}`,
      sub: `${p.queries} queries · ${p.model}`,
    });
  });

  src.addEventListener('cycle:finish', (ev) => {
    const p = JSON.parse(ev.data);
    applyCycleFinishToCounters(p);
    activeCycleId = null;
    pushFeed({
      action: 'cycle done',
      title: `finished cycle ${shortId(p.cycle_id)}`,
      sub: `found ${p.found} · new ${p.new} · inserted ${p.inserted} · filtered ${p.filtered} · errored ${p.errored}`,
      meta: `${formatDurationMs(p.duration_ms)} · $${(p.cost_usd ?? 0).toFixed(4)}`,
    });
    if (currentRoute() === 'cycles') refreshCycles();
    refreshJobs();
    refreshState();
  });

  src.addEventListener('cycle:error', (ev) => {
    const p = JSON.parse(ev.data);
    activeCycleId = null;
    pushFeed({
      action: 'cycle error',
      title: p.error,
      sub: shortId(p.cycle_id),
    });
  });

  src.addEventListener('job', (ev) => {
    const p = JSON.parse(ev.data);
    bumpFromJobEvent(p);
    const where = [p.company, p.via].filter(Boolean).join(' · ');
    const title = p.title || p.job_id || '(no title)';
    pushFeed({ action: p.action, title, sub: where, meta: jobEventMeta(p) });
  });

  src.addEventListener('usage', (ev) => {
    renderUsage(JSON.parse(ev.data));
  });
}

function jobEventMeta(p) {
  const bits = [];
  if (typeof p.score === 'number') bits.push(`score ${Math.round(p.score)}`);
  if (typeof p.tokens === 'number') bits.push(`${formatNumber(p.tokens)} tok`);
  if (typeof p.cost_usd === 'number') bits.push(`$${p.cost_usd.toFixed(4)}`);
  if (p.error) bits.push(p.error);
  return bits.join(' · ');
}

// ---------- helpers ----------

function setSegPrimary(btn, primary) {
  btn.classList.toggle('seg-primary', primary);
  btn.classList.toggle('text-ink-600', !primary);
}

function shortId(id) { return id ? id.slice(-6) : '—'; }
function formatNumber(n) {
  if (n == null) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
function formatDuration(seconds) {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
function formatDurationMs(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
function formatRelative(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'soon';
  if (ms < 60_000) return `in ${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `in ${Math.round(ms / 60_000)}m`;
  return `in ${(ms / 3_600_000).toFixed(1)}h`;
}
function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escapeText(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ---------- boot ----------

(async () => {
  await checkSetupStatus();
  if (!isConfigured) location.hash = '#/setup';
  else if (!location.hash) location.hash = '#/overview';
  showRoute(currentRoute());
  refreshState();
  refreshJobs();
  connectStream();
  setInterval(refreshState, 30_000);
})();
