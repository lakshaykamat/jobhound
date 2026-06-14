import { renderSidebar } from './components/sidebar.js';
import { renderOverview } from './pages/overview.js';
import { renderActivity } from './pages/activity.js';
import { renderJobs } from './pages/jobs.js';
import { renderCycles } from './pages/cycles.js';
import { renderSetup } from './pages/setup.js';
import { renderResume } from './pages/resume.js';
import { renderTailor } from './pages/tailor.js';
import { renderSettings } from './pages/settings.js';

export function renderShell() {
  return /* html */ `
    ${renderSidebar()}
    <main id="main-content" class="app-main flex-1 min-w-0" tabindex="-1">
      ${renderOverview()}
      ${renderActivity()}
      ${renderJobs()}
      ${renderCycles()}
      ${renderSetup()}
      ${renderResume()}
      ${renderTailor()}
      ${renderSettings()}
    </main>
  `;
}
