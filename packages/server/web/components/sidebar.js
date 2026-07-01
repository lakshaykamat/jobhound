export function renderSidebar() {
  return /* html */ `
    <aside class="sidebar fixed inset-y-0 left-0 w-60 flex flex-col z-20">
      <div class="px-5 pt-6 pb-5">
        <div class="flex items-center gap-3">
          <div class="brand-mark h-9 w-9 rounded-lg flex items-center justify-center shrink-0">
            <svg aria-hidden="true" class="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 7h12M4 11h12M4 15h7"/>
            </svg>
          </div>
          <div class="min-w-0">
            <div class="text-[15px] font-semibold tracking-tight leading-tight">Jobhound</div>
            <div class="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-semibold leading-tight mt-0.5">Discovery server</div>
          </div>
        </div>
      </div>

      <div class="px-5 pt-3 pb-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-400/80 font-semibold">Workspace</div>
      <nav class="px-3 space-y-0.5" aria-label="Primary">
        ${navItem('overview', 'Overview', '<path d="M3 12L12 4l9 8"/><path d="M5 10v10a1 1 0 001 1h4v-7h4v7h4a1 1 0 001-1V10"/>')}
        ${navItem('jobs', 'Jobs', '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M3 13h18"/>', { countId: 'nav-jobs-count' })}
        ${navItem('tailor', 'Tailor', '<path d="M14 4h5v5"/><path d="M19 4l-7 7"/><path d="M5 10v9a1 1 0 001 1h9"/><path d="M5 14h9"/>')}
        ${navItem('resume', 'Resume', '<path d="M6 2h9l5 5v15a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/>')}
        ${navItem('settings', 'Settings', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>')}
      </nav>

      <div class="mt-auto p-4 space-y-3">
        <div class="surface rounded-xl p-3 space-y-2">
          <div class="flex items-center gap-2">
            <span id="status-dot" class="h-2 w-2 rounded-full bg-ink-900 opacity-40 shrink-0"></span>
            <span id="status-label" class="text-[12px] font-semibold capitalize text-ink-800 flex-1 truncate">paused</span>
          </div>
          <div id="status-detail" class="text-[11px] text-ink-400 truncate leading-tight">No schedule active</div>
        </div>

        <div class="seg grid grid-cols-3 gap-1">
          <button id="btn-start" class="seg-primary rounded-md px-2 py-1.5 text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed">Start</button>
          <button id="btn-stop"  class="rounded-md px-2 py-1.5 text-[11px] font-semibold text-ink-600 disabled:opacity-40 disabled:cursor-not-allowed" disabled>Stop</button>
          <button id="btn-run-once" class="rounded-md px-2 py-1.5 text-[11px] font-semibold text-ink-600 disabled:opacity-40 disabled:cursor-not-allowed">Once</button>
        </div>

        <div class="text-[10px] text-ink-400 text-center">v0.1 · <a href="#/settings" class="hover:text-ink-700 transition-colors">settings</a></div>
      </div>
    </aside>
  `;
}

function navItem(route, label, iconPath, opts = {}) {
  const count = opts.countId ? `<span id="${opts.countId}" class="ml-auto text-[10px] font-semibold tabular text-ink-400"></span>` : '';
  return `
    <a href="#/${route}" data-route="${route}" class="nav-item flex items-center gap-3 rounded-lg pl-3 pr-7 py-2 text-[13.5px] font-medium text-ink-500">
      <svg aria-hidden="true" class="nav-icon h-[17px] w-[17px] text-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>
      <span>${label}</span>
      ${count}
    </a>
  `;
}
