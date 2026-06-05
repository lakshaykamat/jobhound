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
  sseStatus: $('sse-status'),
  sseDot: $('sse-dot'),

  // overview KPIs
  ovSubtitle: $('ov-subtitle'),
  searches: $('m-searches'),
  searchesBar: $('m-searches-bar'),
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

  // config
  cfgContent: $('cfg-content'),
  btnReloadConfig: $('btn-reload-config'),
};

const ROUTES = ['overview', 'activity', 'cycles', 'config'];
const MAX_FEED_ITEMS = 300;

const cycleCounts = blankCounts();
let activeCycleId = null;

function blankCounts() {
  return { found: 0, new: 0, known: 0, analyzed: 0, scored: 0, filtered: 0, errored: 0, inserted: 0, tokens: 0, cost: 0 };
}

const STATUS_COLORS = {
  paused:   'bg-ink-300',
  idle:     'bg-sky-500',
  running:  'bg-emerald-500 animate-pulse-soft',
  stopping: 'bg-amber-500 animate-pulse-soft',
};

const STATUS_LABEL_COLOR = {
  paused:   'text-ink-700',
  idle:     'text-sky-700',
  running:  'text-emerald-700',
  stopping: 'text-amber-700',
};

const ACTION_BADGES = {
  found:           'bg-sky-50 text-sky-700 ring-sky-200',
  'skipped-known': 'bg-ink-50 text-ink-500 ring-ink-200',
  analyzed:        'bg-violet-50 text-violet-700 ring-violet-200',
  scored:          'bg-emerald-50 text-emerald-700 ring-emerald-200',
  filtered:        'bg-amber-50 text-amber-700 ring-amber-200',
  errored:         'bg-rose-50 text-rose-700 ring-rose-200',
  'cycle:start':   'bg-sky-50 text-sky-700 ring-sky-200',
  'cycle:finish':  'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'cycle:error':   'bg-rose-50 text-rose-700 ring-rose-200',
};

// ---------- router ----------

function currentRoute() {
  const hash = location.hash.replace(/^#\//, '');
  return ROUTES.includes(hash) ? hash : 'overview';
}

function showRoute(route) {
  $$('[data-page]').forEach((sec) => {
    sec.classList.toggle('hidden', sec.dataset.page !== route);
  });
  $$('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === route);
  });
  if (route === 'cycles') refreshCycles();
  if (route === 'config') refreshConfig();
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
els.btnReloadConfig.addEventListener('click', () => refreshConfig());

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
  els.statusLabel.className = `capitalize ${STATUS_LABEL_COLOR[status] || 'text-ink-700'}`;
  if (status === 'running' && state.current_cycle_id) {
    els.statusDetail.textContent = shortId(state.current_cycle_id);
  } else if (status === 'idle' && state.next_cycle_at) {
    els.statusDetail.textContent = formatRelative(state.next_cycle_at);
  } else {
    els.statusDetail.textContent = '';
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
    'text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded-md ' +
    (status === 'running'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'stopping'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-ink-100 text-ink-500');
  if (status === 'running' && state.current_cycle_id) {
    els.cycleMeta.textContent = `cycle ${shortId(state.current_cycle_id)} · started ${formatTime(state.current_cycle_started_at)}`;
  } else if (status === 'idle' && state.next_cycle_at) {
    els.cycleMeta.textContent = `idle · next cycle ${formatRelative(state.next_cycle_at)}`;
  } else if (status === 'paused') {
    els.cycleMeta.textContent = 'Paused. Hit Start to begin the cycle loop.';
  } else {
    els.cycleMeta.textContent = '';
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
  const pct = Math.min(100, ((usage.searches ?? 0) / 100) * 100);
  els.searchesBar.style.width = `${pct}%`;
  els.searchesBar.className =
    'h-full transition-all duration-500 ' +
    (pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-ink-900');
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
      (c) => `<tr class="hover:bg-ink-50/60">
        <td class="px-4 py-2.5 tabular text-ink-700" title="${escapeAttr(c.cycle_id)}">${formatTime(c.timestamp)}</td>
        <td class="px-4 py-2.5 tabular text-ink-500">${formatDurationMs(c.duration_ms)}</td>
        <td class="px-4 py-2.5 tabular text-right text-ink-800">${c.found}</td>
        <td class="px-4 py-2.5 tabular text-right text-ink-800">${c.new}</td>
        <td class="px-4 py-2.5 tabular text-right text-ink-800">${c.inserted}</td>
        <td class="px-4 py-2.5 tabular text-right ${c.filtered ? 'text-amber-600' : 'text-ink-500'}">${c.filtered}</td>
        <td class="px-4 py-2.5 tabular text-right ${c.errored ? 'text-rose-600 font-semibold' : 'text-ink-500'}">${c.errored}</td>
        <td class="px-4 py-2.5 tabular text-right text-ink-700">${c.searches_used}</td>
        <td class="px-4 py-2.5 tabular text-right text-ink-700">${formatNumber(c.tokens_used)}</td>
        <td class="px-4 py-2.5 tabular text-right text-ink-800">$${(c.cost_usd ?? 0).toFixed(4)}</td>
      </tr>`,
    )
    .join('');
}

// ---------- config page ----------

async function refreshConfig() {
  els.cfgContent.innerHTML = '<div class="rounded-xl bg-white border border-ink-200/70 px-6 py-8 text-sm text-ink-400">Loading config…</div>';
  try {
    const res = await fetch('/api/config');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      els.cfgContent.innerHTML = `<div class="rounded-xl bg-rose-50 border border-rose-200 px-6 py-5 text-sm text-rose-700">Failed to load config: ${escapeText(err.error || res.statusText)}</div>`;
      return;
    }
    renderConfig(await res.json());
  } catch (err) {
    els.cfgContent.innerHTML = `<div class="rounded-xl bg-rose-50 border border-rose-200 px-6 py-5 text-sm text-rose-700">${escapeText(String(err))}</div>`;
  }
}

function renderConfig(cfg) {
  const cards = [];

  // Cycle + server
  cards.push(card('Cycle & server', kvGrid([
    ['Queries', String(cfg.cycle.queries.length)],
    ['Score threshold', String(cfg.cycle.score_threshold)],
    ['Max pages / query', String(cfg.cycle.max_pages_per_query)],
    ['Max job age (days)', String(cfg.cycle.max_job_age_days)],
    ['Dedup strategy', monoSpan(cfg.cycle.dedup_strategy)],
    ['Poll interval', formatDuration(cfg.server.poll_interval_seconds)],
    ['HTTP port', String(cfg.server.http_port)],
  ])));

  // Queries
  cards.push(card('Search queries',
    `<ul class="space-y-1.5 text-sm">${cfg.cycle.queries.map((q) => `<li class="font-mono text-ink-800 px-3 py-1.5 rounded bg-ink-50/70">${escapeText(q)}</li>`).join('')}</ul>`,
  ));

  // OpenAI + SerpApi
  cards.push(card('Providers', kvGrid([
    ['OpenAI model', monoSpan(cfg.openai.model)],
    ['LLM concurrency', String(cfg.openai.llm_concurrency)],
    ['SerpApi country', monoSpan(cfg.serpapi.country)],
    ['SerpApi language', monoSpan(cfg.serpapi.language)],
    ['Platform filter', cfg.serpapi.platforms.length
      ? `<div class="flex flex-wrap gap-1.5">${cfg.serpapi.platforms.map(pillTag).join('')}</div>`
      : '<span class="text-ink-400 italic">no filter</span>'],
  ])));

  // Scoring
  const axisRows = Object.entries(cfg.scoring.axis_weights)
    .map(([k, v]) => `<div class="flex items-center justify-between text-sm py-1">
        <span class="text-ink-500">${escapeText(k)}</span>
        <span class="tabular font-medium text-ink-800">${v}</span>
      </div>`).join('');
  cards.push(card('Scoring', `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <div class="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">Axis weights</div>
        ${axisRows}
      </div>
      <div>${kvGrid([
        ['Dealbreaker cap', String(cfg.scoring.dealbreaker_score_cap)],
        ['Recency full days', String(cfg.scoring.recency_full_days)],
        ['Recency decay days', String(cfg.scoring.recency_decay_days)],
      ])}</div>
    </div>
  `));

  // Profile
  const p = cfg.profile;
  cards.push(card('Fit profile', `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 text-sm">
      <div>
        <div class="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">Identity</div>
        ${kvGrid([
          ['Seniority', monoSpan(p.seniority ?? '—')],
          ['Years', String(p.years_experience ?? '—')],
          ['Min salary', p.min_annual_salary != null ? `${p.compensation_currency?.toUpperCase() ?? ''} ${formatNumber(p.min_annual_salary)}` : '<span class="text-ink-400 italic">—</span>'],
          ['Authorization', tagList(p.work_authorization)],
          ['Work mode', tagList(p.work_mode_preference)],
          ['Company size', tagList(p.preferred_company_size)],
          ['Relocation', p.relocation_open ? 'yes' : 'no'],
          ['Availability', p.availability ?? '<span class="text-ink-400 italic">—</span>'],
        ])}
      </div>
      <div class="space-y-4">
        <div>
          <div class="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">Role titles</div>
          ${tagList(p.role_titles)}
        </div>
        <div>
          <div class="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">Locations</div>
          ${tagList(p.locations)}
        </div>
        <div>
          <div class="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">Domains</div>
          ${tagList(p.domains)}
        </div>
      </div>
    </div>
    <div class="mt-6 pt-5 border-t border-ink-100">
      <div class="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">Skills (${(p.skills || []).length})</div>
      ${tagList(p.skills)}
    </div>
    ${p.highlights && p.highlights.length ? `
      <div class="mt-6 pt-5 border-t border-ink-100">
        <div class="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">Highlights</div>
        <ul class="space-y-1.5 text-sm text-ink-700 list-disc pl-5">${p.highlights.map((h) => `<li>${escapeText(h)}</li>`).join('')}</ul>
      </div>` : ''}
    ${p.notes ? `
      <div class="mt-6 pt-5 border-t border-ink-100">
        <div class="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">Notes</div>
        <p class="text-sm text-ink-700 leading-relaxed">${escapeText(p.notes)}</p>
      </div>` : ''}
  `));

  els.cfgContent.innerHTML = cards.join('');
}

function card(title, bodyHtml) {
  return `<div class="rounded-xl bg-white border border-ink-200/70">
    <div class="px-6 py-4 border-b border-ink-100"><h2 class="text-sm font-semibold">${escapeText(title)}</h2></div>
    <div class="px-6 py-5">${bodyHtml}</div>
  </div>`;
}

function kvGrid(rows) {
  return `<dl class="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">${rows
    .map(([k, v]) => `<dt class="text-ink-500">${escapeText(k)}</dt><dd class="text-ink-800 tabular">${v}</dd>`)
    .join('')}</dl>`;
}

function tagList(items) {
  if (!items || !items.length) return '<span class="text-ink-400 italic">—</span>';
  return `<div class="flex flex-wrap gap-1.5">${items.map(pillTag).join('')}</div>`;
}

function pillTag(s) {
  return `<span class="inline-flex items-center rounded-md bg-ink-50 border border-ink-200/70 px-2 py-0.5 text-[11px] font-medium text-ink-700">${escapeText(s)}</span>`;
}

function monoSpan(s) {
  return `<span class="font-mono">${escapeText(s)}</span>`;
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

function pushFeed({ kind, action, title, sub, meta, accent }) {
  if (action === 'skipped-known' && !els.filterKnown.checked) return;
  els.feedEmpty.hidden = true;
  const ts = new Date().toISOString().slice(11, 19);
  const li = document.createElement('li');
  li.className = 'px-6 py-2.5 grid grid-cols-[64px_110px_1fr_auto] gap-3 items-center text-xs';
  li.innerHTML = `
    <span class="font-mono text-[11px] text-ink-400 tabular">${ts}</span>
    <span class="inline-flex items-center justify-center rounded-md ring-1 ring-inset px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ACTION_BADGES[kind] || 'bg-ink-50 text-ink-500 ring-ink-200'}">${escapeText(action)}</span>
    <div class="min-w-0">
      <div class="truncate ${accent ?? 'text-ink-800'} font-medium"></div>
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
  src.addEventListener('open', () => {
    els.sseStatus.textContent = 'live';
    els.sseStatus.className = 'text-emerald-600';
    els.sseDot.className = 'h-1.5 w-1.5 rounded-full bg-emerald-500';
  });
  src.addEventListener('error', () => {
    els.sseStatus.textContent = 'reconnecting…';
    els.sseStatus.className = 'text-amber-600';
    els.sseDot.className = 'h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse-soft';
  });

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
      kind: 'cycle:start',
      action: 'cycle start',
      title: `started cycle ${shortId(p.cycle_id)}`,
      sub: `${p.queries} queries · ${p.model}`,
      accent: 'text-sky-700',
    });
  });

  src.addEventListener('cycle:finish', (ev) => {
    const p = JSON.parse(ev.data);
    applyCycleFinishToCounters(p);
    activeCycleId = null;
    pushFeed({
      kind: 'cycle:finish',
      action: 'cycle done',
      title: `finished cycle ${shortId(p.cycle_id)}`,
      sub: `found ${p.found} · new ${p.new} · inserted ${p.inserted} · filtered ${p.filtered} · errored ${p.errored}`,
      meta: `${formatDurationMs(p.duration_ms)} · $${(p.cost_usd ?? 0).toFixed(4)}`,
      accent: 'text-emerald-700',
    });
    if (currentRoute() === 'cycles') refreshCycles();
    refreshState();
  });

  src.addEventListener('cycle:error', (ev) => {
    const p = JSON.parse(ev.data);
    activeCycleId = null;
    pushFeed({
      kind: 'cycle:error',
      action: 'cycle error',
      title: p.error,
      sub: shortId(p.cycle_id),
      accent: 'text-rose-700',
    });
  });

  src.addEventListener('job', (ev) => {
    const p = JSON.parse(ev.data);
    bumpFromJobEvent(p);
    const where = [p.company, p.via].filter(Boolean).join(' · ');
    const title = p.title || p.job_id || '(no title)';
    pushFeed({ kind: p.action, action: p.action, title, sub: where, meta: jobEventMeta(p) });
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

if (!location.hash) location.hash = '#/overview';
showRoute(currentRoute());
refreshState();
connectStream();
setInterval(refreshState, 30_000);
