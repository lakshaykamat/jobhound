export function renderTailor() {
  return /* html */ `
    <section data-page="tailor" class="hidden px-8 py-8 space-y-6">
      <header class="flex items-end justify-between gap-4 flex-wrap">
        <div class="min-w-0">
          <div class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Resume</div>
          <h1 class="text-2xl font-semibold tracking-tight mt-1.5">Tailor</h1>
          <p class="text-sm text-ink-500 mt-1.5 max-w-2xl">Paste a job description and Jobhound updates the stored resume text directly, keeping the existing resume structure intact.</p>
        </div>
        <a href="#/resume" class="btn-secondary">Edit base resume</a>
      </header>

      <div id="tailor-needs-resume" class="surface rounded-xl px-6 py-10 text-center hidden">
        <div class="text-sm font-medium text-ink-700">No base resume yet</div>
        <div class="text-xs text-ink-400 mt-1 mb-4">Upload one on the Resume page, then come back here to tailor it.</div>
        <a href="#/resume" class="btn-primary">Go to Resume</a>
      </div>

      <div id="tailor-run" class="tailor-workspace hidden">
        <div class="surface rounded-xl px-6 py-5 space-y-4 flex flex-col min-w-0">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Tailor to a job</div>
              <div class="text-xs text-ink-500 mt-1 max-w-xl">Paste the full JD. Jobhound edits summary, skills, and existing bullets only.</div>
            </div>
            <button id="btn-tailor-run" class="btn-primary shrink-0" type="button">Tailor</button>
          </div>
          <textarea id="tailor-jd" placeholder="Paste the job description here..." class="tailor-textarea w-full flex-1 text-sm font-mono rounded-md px-3 py-2 leading-relaxed"></textarea>
          <div class="flex items-center justify-between gap-3 text-xs text-ink-400">
            <div id="tailor-run-status" class="min-h-[18px]" role="status" aria-live="polite"></div>
            <div class="hidden sm:block">Stored resume updates after tailoring</div>
          </div>
        </div>
      </div>

      <div id="tailor-result" class="hidden space-y-5">
        <div id="tailor-ats" class="surface rounded-xl px-6 py-5 hidden">
          <div class="flex items-start justify-between gap-6 flex-wrap">
            <div class="min-w-0">
              <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold">ATS keyword match</div>
              <div class="text-xs text-ink-500 mt-1">Before vs. updated stored resume, against the JD's must-have keywords.</div>
              <div class="text-[11px] text-ink-400 mt-2 tabular" id="tailor-cost">—</div>
            </div>
            <div class="ats-summary ml-auto">
              <div class="text-right">
                <div class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Before</div>
                <div class="text-2xl font-semibold tabular text-ink-500 mt-1" id="tailor-ats-pct-base">—</div>
                <div class="text-[10px] tabular text-ink-400 mt-0.5" id="tailor-ats-fraction-base">—</div>
              </div>
              <div class="text-ink-400 text-lg ats-arrow">→</div>
              <div class="text-right">
                <div class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">After</div>
                <div class="text-4xl font-semibold tabular mt-1" id="tailor-ats-pct">—</div>
                <div class="text-[10px] tabular text-ink-400 mt-0.5" id="tailor-ats-fraction">—</div>
              </div>
              <div class="text-right">
                <div class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Δ</div>
                <div class="text-2xl font-semibold tabular mt-1" id="tailor-ats-delta">—</div>
              </div>
              <div class="ats-actions flex flex-col gap-2 pl-5 border-l border-ink-200/60">
                <button id="btn-tailor-undo" class="btn-ghost">Undo changes</button>
              </div>
            </div>
          </div>
          <div id="tailor-ats-missing-wrap" class="mt-5 hidden">
            <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold mb-2">Still missing</div>
            <div id="tailor-ats-missing" class="flex flex-wrap gap-1.5"></div>
          </div>
          <div id="tailor-ats-matched-wrap" class="mt-4 hidden">
            <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold mb-2">Matched</div>
            <div id="tailor-ats-matched" class="flex flex-wrap gap-1.5"></div>
          </div>
        </div>

        <div id="tailor-diff" class="space-y-4"></div>
      </div>
    </section>
  `;
}
