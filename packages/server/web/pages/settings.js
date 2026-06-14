export function renderSettings() {
  return /* html */ `
    <section data-page="settings" class="hidden px-8 py-8 max-w-4xl mx-auto space-y-6">
      <header class="flex items-center justify-between">
        <div>
          <div class="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">Configuration</div>
          <h1 class="text-2xl font-semibold tracking-tight mt-1.5">Settings</h1>
          <p class="text-sm text-ink-500 mt-1.5">Edit the full config as JSON. Saved to <code class="font-mono text-[12px] text-ink-700">.data/config.json</code>; re-read each cycle.</p>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-settings-reload" class="text-xs font-medium text-ink-700 px-3 py-1.5 rounded-md border border-ink-200 bg-white hover:bg-ink-100 transition-colors">Reload</button>
          <button id="btn-settings-save" class="text-xs font-semibold text-ink-100 bg-ink-900 px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity">Save</button>
        </div>
      </header>
      <div id="settings-status" class="text-xs text-ink-400 min-h-[18px]"></div>
      <textarea id="settings-editor" rows="36" spellcheck="false" class="w-full text-[12.5px] font-mono leading-relaxed bg-white border border-ink-200 rounded-xl px-4 py-3"></textarea>
    </section>
  `;
}
