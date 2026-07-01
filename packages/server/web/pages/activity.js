export function renderActivity() {
  return /* html */ `
    <section data-page="activity" class="hidden px-8 py-8 space-y-6">
      <header class="flex items-end justify-between">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Live</div>
          <h1 class="text-2xl font-semibold tracking-tight mt-1.5">Activity</h1>
          <p class="text-sm text-ink-500 mt-1.5">Cycle pipeline + per-job events, streamed over SSE.</p>
        </div>
        <div class="flex items-center gap-3">
          <label class="text-xs text-ink-500 flex items-center gap-1.5 cursor-pointer">
            <input id="filter-known" type="checkbox" class="rounded border-ink-300 text-ink-900 focus:ring-ink-500" />
            include skipped
          </label>
          <button id="btn-clear" class="btn-ghost text-xs">Clear</button>
        </div>
      </header>

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

function stage(label, id) {
  return `
    <div class="rounded-xl py-4 px-3 text-center border border-ink-300/40" style="background:rgba(255,255,255,.04)">
      <div class="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-semibold">${label}</div>
      <div class="mt-2 text-2xl font-semibold tabular" id="${id}">0</div>
    </div>
  `;
}
