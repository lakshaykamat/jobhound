export function renderCycles() {
  const cols = ['When', 'Duration', 'Found', 'New', 'Inserted', 'Filtered', 'Errored', 'Searches', 'Tokens', 'Cost'];
  return /* html */ `
    <section data-page="cycles" class="hidden px-8 py-8 space-y-6">
      <header>
        <div class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">History</div>
        <h1 class="text-2xl font-semibold tracking-tight mt-1.5">Cycles</h1>
        <p class="text-sm text-ink-500 mt-1.5">All cycles recorded to <code class="font-mono text-[12px] text-ink-700">.data/cycles.jsonl</code>.</p>
      </header>
      <div class="surface rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full text-xs">
            <thead class="bg-ink-200/40 text-ink-500">
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
