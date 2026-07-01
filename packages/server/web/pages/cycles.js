export function renderCycles() {
  const cols = ['When', 'Duration', 'Found', 'New', 'Inserted', 'Filtered', 'Errored', 'Searches', 'Tokens', 'Cost'];
  return /* html */ `
    <section data-page="jobs/cycles" class="hidden px-8 py-8 space-y-6">
      <header class="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div class="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">
            <a href="#/jobs" class="hover:text-ink-600 transition-colors">Jobs</a>
            <span>/</span>
            <span>History</span>
          </div>
          <h1 class="text-2xl font-semibold tracking-tight mt-1.5">Cycles</h1>
          <p class="text-sm text-ink-500 mt-1.5">All cycles recorded to <code class="font-mono text-[12px] text-ink-700">.data/cycles.jsonl</code>.</p>
        </div>
        <a href="#/jobs" class="btn-ghost inline-flex items-center gap-1.5">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Back to Jobs
        </a>
      </header>
      <div class="surface rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full text-xs">
            <thead class="text-ink-500 border-b border-ink-300/40">
              <tr>
                ${cols.map((c, i) => `<th class="${i < 2 ? 'text-left' : 'text-right'} font-semibold uppercase tracking-[0.18em] text-[10px] px-4 py-2.5">${c}</th>`).join('')}
              </tr>
            </thead>
            <tbody id="cycles-body" class="divide-y divide-ink-200/60">
              <tr><td colspan="10" class="px-4 py-6 text-center text-ink-400">Loading…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}
