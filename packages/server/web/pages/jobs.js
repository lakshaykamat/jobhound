export function renderJobs() {
  return /* html */ `
    <section data-page="jobs" class="hidden px-8 py-8 space-y-6">
      <header class="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Discoveries</div>
          <h1 class="text-2xl font-semibold tracking-tight mt-1.5">Jobs</h1>
          <p class="text-sm text-ink-500 mt-1.5">Every posting your cycles have surfaced.</p>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-jobs-export" class="btn-ghost inline-flex items-center gap-1.5">
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
            Export CSV
          </button>
          <button id="btn-jobs-refresh" class="btn-ghost inline-flex items-center gap-1.5">
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 11-2.34-5.66L20 9"/><path d="M20 4v5h-5"/></svg>
            Refresh
          </button>
        </div>
      </header>

      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-1.5 flex-wrap">
          <div class="flex items-center gap-1.5" id="jobs-date-pills">
            <button class="chip active" data-date="today">Today</button>
            <button class="chip" data-date="24h">24h</button>
            <button class="chip" data-date="7d">7d</button>
            <button class="chip" data-date="30d">30d</button>
            <button class="chip" data-date="all">All time</button>
            <button class="chip" data-date="custom" id="jobs-date-custom-chip">
              <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              <span id="jobs-date-custom-label">Custom</span>
            </button>
          </div>
          <div id="jobs-date-range" class="hidden items-center gap-1.5 ml-1">
            <input id="jobs-date-from" type="date" class="text-xs px-2 py-1 rounded-md tabular" />
            <span class="text-ink-400 text-xs">→</span>
            <input id="jobs-date-to" type="date" class="text-xs px-2 py-1 rounded-md tabular" />
          </div>
        </div>
        <div class="relative">
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input id="jobs-search" type="text" placeholder="Search title, company, source…" class="pl-8 pr-3 py-1.5 w-72 text-xs rounded-md" />
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)] gap-4 items-start">
        <div class="space-y-2 min-w-0">
          <div class="flex items-center justify-between px-1">
            <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold flex items-center gap-3">
              <span>Recent discoveries</span>
              <span class="text-ink-300">·</span>
              <span class="tabular text-ink-500" id="jobs-list-meta">0 shown</span>
            </div>
            <div class="text-[11px] text-ink-400">latest first</div>
          </div>
          <ul id="jobs-list" class="space-y-2"></ul>
          <div id="jobs-empty" class="surface rounded-xl px-6 py-16 text-center">
            <div class="mx-auto h-10 w-10 rounded-full bg-ink-200/60 flex items-center justify-center mb-3">
              <svg class="h-5 w-5 text-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </div>
            <div class="text-sm font-medium text-ink-700">No jobs yet</div>
            <div class="text-xs text-ink-400 mt-1">Run a cycle from the sidebar — postings appear here as soon as they're scored.</div>
          </div>
        </div>

        <div class="min-w-0 lg:sticky lg:top-6 self-start">
          <div id="jobs-detail" class="surface rounded-xl overflow-hidden flex flex-col max-h-[calc(100vh-3rem)]"></div>
        </div>
      </div>
    </section>
  `;
}
