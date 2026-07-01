export function renderOverview() {
  return /* html */ `
    <section data-page="overview" class="hidden px-8 py-8 space-y-8">
      <header class="flex items-end justify-between">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Dashboard</div>
          <h1 class="text-2xl font-semibold tracking-tight mt-1.5">Overview</h1>
          <p class="text-sm text-ink-500 mt-1.5" id="ov-subtitle">Server is paused. Start it from the sidebar.</p>
        </div>
        <div class="flex items-center gap-3">
          <label class="text-xs text-ink-500 flex items-center gap-1.5 cursor-pointer">
            <input id="filter-known" type="checkbox" class="rounded border-ink-300 text-ink-900 focus:ring-ink-500" />
            include skipped
          </label>
          <button id="btn-clear" class="btn-ghost text-xs">Clear log</button>
        </div>
      </header>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${metric('Searches', '<span id="m-searches">—</span>', 'm-searches-detail', '', 'this month')}
        ${metric('Tokens', '<span id="m-tokens">—</span>', 'm-tokens-detail', '', 'this month')}
        ${metric('Spend', '$<span id="m-cost">—</span>', 'm-cost-detail', '', 'this month')}
        ${metric('Cycles', '<span id="m-cycles">—</span>', null, '<div class="mt-2 text-[11px] text-ink-400">completed this month</div>')}
      </div>

      <div class="surface rounded-xl">
        <div class="px-6 py-4 border-b border-ink-200/60 flex items-center justify-between">
          <div>
            <h2 class="text-sm font-semibold">Current cycle</h2>
            <div id="cycle-meta" class="text-xs text-ink-400 mt-0.5">No cycle in flight.</div>
          </div>
          <span id="cycle-state-pill" class="text-[10px] uppercase tracking-[0.18em] font-semibold px-2.5 py-1 rounded-md border border-ink-300 text-ink-500">idle</span>
        </div>
        <div class="px-6 py-5">
          <div class="grid grid-cols-5 gap-3 text-center">
            ${stage('Found', 'stage-found')}
            ${stage('New', 'stage-new')}
            ${stage('Analyzed', 'stage-analyzed')}
            ${stage('Scored', 'stage-scored')}
            ${stage('Inserted', 'stage-inserted')}
          </div>
          <div class="mt-3 grid grid-cols-4 gap-3 text-center text-[11px]">
            <div><span class="text-ink-400">Skipped</span> <span class="tabular text-ink-700 font-semibold" id="stage-known">0</span></div>
            <div><span class="text-ink-400">Filtered</span> <span class="tabular text-ink-700 font-semibold" id="stage-filtered">0</span></div>
            <div><span class="text-ink-400">Errored</span> <span class="tabular text-ink-700 font-semibold underline decoration-ink-700/60 underline-offset-2" id="stage-errored">0</span></div>
            <div><span class="text-ink-400">Cost</span> <span class="tabular text-ink-700 font-semibold">$<span id="stage-cost">0.0000</span></span></div>
          </div>
        </div>
      </div>

      <div class="surface rounded-xl">
        <div class="px-6 py-4 border-b border-ink-200/60">
          <h2 class="text-sm font-semibold">Last completed cycle</h2>
          <div class="text-xs text-ink-400 mt-0.5" id="lc-when">No cycles yet this run.</div>
        </div>
        <div id="last-cycle" hidden class="px-6 py-5">
          <dl class="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 text-sm">
            ${stat('Duration', 'lc-duration')}
            ${stat('Searches', 'lc-searches')}
            ${stat('Tokens', 'lc-tokens')}
            ${stat('Cost', 'lc-cost', '$')}
            ${stat('Found / new / known', 'lc-found')}
            ${stat('Scored / filtered', 'lc-scored')}
            ${stat('Inserted / updated', 'lc-inserted')}
            ${stat('Errored', 'lc-errored')}
          </dl>
          <div class="mt-4 pt-4 border-t border-ink-200/60 text-[11px] text-ink-400 flex items-center justify-between">
            <span>cycle <span class="font-mono" id="lc-id">—</span></span>
            <a href="#/cycles" class="text-ink-500 hover:text-ink-900 font-medium transition-colors">All cycles →</a>
          </div>
        </div>
      </div>

      <div class="surface rounded-xl">
        <div class="px-6 py-4 border-b border-ink-200/60">
          <h2 class="text-sm font-semibold">Pipeline log</h2>
          <div class="text-xs text-ink-400 mt-0.5">newest first · capped at 300</div>
        </div>
        <ul id="feed" class="divide-y divide-ink-200/60 max-h-[560px] overflow-y-auto"></ul>
        <div id="feed-empty" class="px-6 py-12 text-center text-xs text-ink-400">
          Waiting for activity. Hit <span class="font-semibold text-ink-700">Start</span> or
          <span class="font-semibold text-ink-700">Once</span> from the sidebar.
        </div>
      </div>
    </section>
  `;
}

function metric(label, valueHtml, detailId, extraHtml = '', detailText = '') {
  const detail = detailId ? `<div class="mt-2 text-[11px] text-ink-400" id="${detailId}">${detailText}</div>` : '';
  return `
    <div class="surface rounded-xl p-5">
      <div class="text-[10px] uppercase tracking-[0.16em] text-ink-400 font-semibold">${label}</div>
      <div class="mt-3 text-3xl font-semibold tabular">${valueHtml}</div>
      ${extraHtml}
      ${detail}
    </div>
  `;
}

function stat(label, id, prefix = '') {
  return `<div><dt class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">${label}</dt><dd class="mt-1 tabular text-ink-800">${prefix}<span id="${id}">—</span></dd></div>`;
}

function stage(label, id) {
  return `
    <div class="rounded-xl py-4 px-3 text-center border border-ink-300/40" style="background:rgba(255,255,255,.04)">
      <div class="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-semibold">${label}</div>
      <div class="mt-2 text-2xl font-semibold tabular" id="${id}">0</div>
    </div>
  `;
}
