export function renderOverview() {
  return /* html */ `
    <section data-page="overview" class="hidden px-8 py-8 space-y-8">
      <header>
        <div class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Dashboard</div>
        <h1 class="text-2xl font-semibold tracking-tight mt-1.5">Overview</h1>
        <p class="text-sm text-ink-500 mt-1.5" id="ov-subtitle">Server is paused. Start it from the sidebar.</p>
      </header>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-200/60 rounded-xl overflow-hidden border border-ink-200/60">
        ${metric('Searches', '<span id="m-searches">—</span><span class="text-sm text-ink-400 font-medium">/100</span>', 'm-searches-detail', `<div class="mt-2 h-1 rounded-full bg-ink-100 overflow-hidden"><div id="m-searches-bar" class="h-full bg-ink-900 transition-all duration-500" style="width: 0%"></div></div>`)}
        ${metric('Tokens', '<span id="m-tokens">—</span>', 'm-tokens-detail', '', 'this month')}
        ${metric('Spend', '$<span id="m-cost">—</span>', 'm-cost-detail', '', 'this month')}
        ${metric('Cycles', '<span id="m-cycles">—</span>', null, '<div class="mt-2 text-[11px] text-ink-400">completed this month</div>')}
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
    </section>
  `;
}

function metric(label, valueHtml, detailId, extraHtml = '', detailText = '') {
  const detail = detailId ? `<div class="mt-2 text-[11px] text-ink-400" id="${detailId}">${detailText}</div>` : '';
  return `
    <div class="bg-white p-5">
      <div class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">${label}</div>
      <div class="mt-2 text-2xl font-semibold tabular">${valueHtml}</div>
      ${extraHtml}
      ${detail}
    </div>
  `;
}

function stat(label, id, prefix = '') {
  return `<div><dt class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">${label}</dt><dd class="mt-1 tabular text-ink-800">${prefix}<span id="${id}">—</span></dd></div>`;
}
