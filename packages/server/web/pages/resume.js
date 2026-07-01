export function renderResume() {
  return /* html */ `
    <section data-page="resume" class="hidden px-8 py-8 max-w-6xl mx-auto space-y-6">
      <header class="flex items-end justify-between gap-4 flex-wrap">
        <div class="min-w-0">
          <div class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Resume</div>
          <h1 class="text-2xl font-semibold tracking-tight mt-1.5">Base resume</h1>
          <p class="text-sm text-ink-500 mt-1.5">Upload once, edit anywhere. Auto-saves to <code class="font-mono text-[12px] text-ink-700">.data/resume.json</code> on every change. The Tailor page uses this as its source of truth.</p>
        </div>
        <a href="#/tailor" class="btn-secondary">Open tailor</a>
      </header>

        <div id="tailor-empty" class="surface rounded-xl px-6 py-16 text-center hidden">
        <div class="mx-auto h-12 w-12 rounded-full bg-ink-200/60 flex items-center justify-center mb-4">
          <svg class="h-6 w-6 text-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M5 21h14"/>
          </svg>
        </div>
        <div class="text-sm font-medium text-ink-700">No base resume yet</div>
        <div class="text-xs text-ink-400 mt-1 mb-5">Drop a PDF below or click to choose one. Parsed once via OpenAI into a structured record.</div>
        <label id="tailor-dropzone" for="tailor-file" class="block border border-dashed border-ink-300 rounded-lg px-6 py-10 cursor-pointer hover:bg-ink-200/30 transition-colors">
          <div class="text-xs text-ink-500"><span class="font-semibold text-ink-700">Click to upload</span> or drag a PDF here</div>
          <div class="text-[11px] text-ink-400 mt-1">Max 5 MB · text-based PDFs only</div>
        </label>
        <input id="tailor-file" type="file" accept="application/pdf" class="hidden" />
        <div id="tailor-upload-status" class="text-xs text-ink-400 mt-4 min-h-[18px]"></div>
      </div>

      <div id="tailor-editor" class="space-y-4 hidden">
        <div class="surface rounded-xl px-6 py-4 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Base resume</div>
            <div class="mt-1 text-sm font-medium text-ink-800 truncate" id="tailor-source-name">—</div>
            <div class="text-[11px] text-ink-400 mt-0.5">Parsed <span id="tailor-parsed-at">—</span></div>
          </div>
          <div class="flex items-center gap-2 flex-wrap justify-end">
            <button id="btn-tailor-save" class="btn-secondary" type="button">Save changes</button>
            <button id="btn-tailor-reupload" class="btn-ghost" type="button">Re-upload</button>
          </div>
        </div>

        <div class="surface rounded-xl px-6 py-5 space-y-4">
          <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Contact</div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3" id="tailor-contact-grid"></div>
          <div>
            <div class="text-[11px] text-ink-400 mb-1.5">Links</div>
            <div id="tailor-links" class="space-y-2"></div>
            <button id="btn-tailor-add-link" class="text-[11px] font-medium text-ink-500 hover:text-ink-800 mt-2 transition-colors">+ add link</button>
          </div>
        </div>

        <div class="surface rounded-xl px-6 py-5 space-y-3">
          <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Summary</div>
          <textarea data-bind="summary" rows="3" class="w-full text-sm rounded-md px-3 py-2"></textarea>
        </div>

        <div class="surface rounded-xl px-6 py-5 space-y-4">
          <div class="flex items-center justify-between">
            <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Experience</div>
            <button id="btn-tailor-add-job" class="text-[11px] font-medium text-ink-500 hover:text-ink-800 transition-colors">+ add job</button>
          </div>
          <div id="tailor-experience" class="space-y-4"></div>
        </div>

        <div class="surface rounded-xl px-6 py-5 space-y-4">
          <div class="flex items-center justify-between">
            <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Projects</div>
            <button id="btn-tailor-add-project" class="text-[11px] font-medium text-ink-500 hover:text-ink-800 transition-colors">+ add project</button>
          </div>
          <div id="tailor-projects" class="space-y-4"></div>
        </div>

        <div class="surface rounded-xl px-6 py-5 space-y-3">
          <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Skills</div>
          <div id="tailor-skills" class="flex flex-wrap gap-1.5"></div>
          <div class="flex gap-2">
            <input id="tailor-skill-input" type="text" placeholder="add skill, press enter" class="flex-1 text-xs rounded-md px-3 py-1.5" />
          </div>
        </div>

        <div class="surface rounded-xl px-6 py-5 space-y-4">
          <div class="flex items-center justify-between">
            <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Education</div>
            <button id="btn-tailor-add-edu" class="text-[11px] font-medium text-ink-500 hover:text-ink-800 transition-colors">+ add school</button>
          </div>
          <div id="tailor-education" class="space-y-4"></div>
        </div>

        <div id="tailor-save-status" class="text-xs text-ink-400 text-right min-h-[18px]" role="status" aria-live="polite"></div>
      </div>
    </section>
  `;
}
