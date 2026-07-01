export function renderSettings() {
  return /* html */ `
    <section data-page="settings" class="hidden px-8 py-8 max-w-4xl mx-auto space-y-6">
      <header>
        <div class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Configuration</div>
        <h1 class="text-2xl font-semibold tracking-tight mt-1.5">Settings</h1>
      </header>

      <!-- API Keys card -->
      <div class="surface rounded-xl px-6 py-5 space-y-5">
        <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold">API Keys</div>

        <label class="block text-xs text-ink-500">OpenAI key
          <div class="mt-1.5 flex items-center gap-2">
            <input id="keys-openai" type="password" autocomplete="off" spellcheck="false"
              class="flex-1 text-sm font-mono rounded-md px-3 py-1.5" placeholder="sk-…" />
            <button type="button" class="key-toggle text-xs text-ink-400 hover:text-ink-700 px-2 py-1.5 shrink-0"
              data-target="keys-openai">show</button>
          </div>
        </label>

        <div>
          <div class="text-xs text-ink-500 mb-2">SerpAPI keys <span class="text-ink-400">(if one quota runs out, the next is tried)</span></div>
          <div id="keys-serp-list" class="space-y-2"></div>
          <button id="btn-keys-add-serp" type="button"
            class="mt-2 text-xs text-ink-500 hover:text-ink-800 flex items-center gap-1">
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            Add another key
          </button>
        </div>

        <div class="flex items-center gap-3 pt-1">
          <div id="keys-status" class="text-xs text-ink-400 mr-auto min-h-[18px]"></div>
          <button id="btn-keys-save" class="btn-primary">Save Keys</button>
        </div>
      </div>

      <!-- JSON editor card -->
      <div class="surface rounded-xl px-6 py-5 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Advanced Config (JSON)</div>
            <p class="text-[11px] text-ink-400 mt-1">Full config saved to <code class="font-mono text-ink-700">.data/config.json</code>; re-read each cycle.</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button id="btn-settings-reload" class="btn-secondary">Reload</button>
            <button id="btn-settings-save" class="btn-primary">Save</button>
          </div>
        </div>
        <div id="settings-status" class="text-xs text-ink-400 min-h-[18px]"></div>
        <textarea id="settings-editor" rows="30" spellcheck="false"
          class="w-full text-[12.5px] font-mono leading-relaxed rounded-xl px-4 py-3"></textarea>
      </div>
    </section>
  `;
}
