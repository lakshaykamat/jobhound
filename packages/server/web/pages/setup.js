export function renderSetup() {
  const seniorities = ['intern', 'junior', 'mid', 'senior', 'lead', 'principal'];
  return /* html */ `
    <section data-page="setup" class="hidden px-8 py-8 max-w-2xl mx-auto space-y-6">
      <header>
        <div class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">First-run</div>
        <h1 class="text-2xl font-semibold tracking-tight mt-1.5">Setup</h1>
        <p class="text-sm text-ink-500 mt-1.5">Configure API keys and search basics. Saved to <code class="font-mono text-[12px] text-ink-700">.data/config.json</code> on this server.</p>
      </header>

      <form id="setup-form" class="space-y-5">
        <div class="surface rounded-xl px-6 py-5 space-y-4">
          <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold">API keys</div>
          ${field('SerpApi key', `<input name="serpapi_key" type="password" required autocomplete="off" class="mt-1.5 w-full text-sm rounded-md px-3 py-1.5" />`)}
          ${field('OpenAI key', `<input name="openai_key" type="password" required autocomplete="off" class="mt-1.5 w-full text-sm rounded-md px-3 py-1.5" />`)}
          ${field('OpenAI model', `<input name="model" type="text" value="gpt-4o-mini" class="mt-1.5 w-full text-sm rounded-md px-3 py-1.5" />`)}
        </div>

        <div class="surface rounded-xl px-6 py-5 space-y-4">
          <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Search</div>
          ${field('Queries (one per line)', `<textarea name="queries" rows="4" required placeholder="backend engineer remote india&#10;senior software engineer bengaluru" class="mt-1.5 w-full text-sm font-mono rounded-md px-3 py-2"></textarea>`)}
          <div class="grid grid-cols-2 gap-3">
            ${field('Country (ISO-2)', `<input name="country" type="text" value="in" maxlength="2" class="mt-1.5 w-full text-sm rounded-md px-3 py-1.5" />`)}
            ${field('Language', `<input name="language" type="text" value="en" maxlength="3" class="mt-1.5 w-full text-sm rounded-md px-3 py-1.5" />`)}
          </div>
        </div>

        <div class="surface rounded-xl px-6 py-5 space-y-4">
          <div>
            <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Resume &amp; targeting</div>
            <div class="text-[11px] text-ink-400 mt-1">We'll parse your resume to derive skills, role titles, and years of experience automatically.</div>
          </div>
          <label for="setup-resume-file" class="block border border-dashed border-ink-300 rounded-lg px-6 py-7 cursor-pointer hover:bg-ink-200/30 transition-colors text-center">
            <div class="text-xs text-ink-500"><span class="font-semibold text-ink-700" id="setup-resume-filename">Click to upload your resume PDF</span></div>
            <div class="text-[11px] text-ink-400 mt-1">Max 5 MB · text-based PDFs only</div>
          </label>
          <input id="setup-resume-file" name="resume" type="file" accept="application/pdf" required class="hidden" />
          ${field('Seniority you\'re targeting', `
            <select name="seniority" class="mt-1.5 w-full text-sm rounded-md px-3 py-1.5">
              <option value="">(unspecified)</option>
              ${seniorities.map((s) => `<option value="${s}">${s}</option>`).join('')}
            </select>
          `)}
        </div>

        <div class="flex items-center justify-end gap-3">
          <div id="setup-status" class="text-xs text-ink-400 mr-auto min-h-[18px]"></div>
          <button type="submit" class="btn-primary disabled:opacity-40">Save &amp; continue</button>
        </div>
      </form>
    </section>
  `;
}

function field(label, control) {
  return `<label class="block text-xs text-ink-500">${label}${control}</label>`;
}
