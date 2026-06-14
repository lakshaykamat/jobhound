// Tailor page: base resume upload + structured editor.
// Phase 1: upload PDF, parse via /api/resume/upload, edit, save.

(function () {
  const $ = (id) => document.getElementById(id);

  const emptyState = $('tailor-empty');
  const editor = $('tailor-editor');
  const needsResumeBanner = $('tailor-needs-resume');
  const runPanel = $('tailor-run');
  const resultPanel = $('tailor-result');
  const jdInput = $('tailor-jd');
  const runButton = $('btn-tailor-run');
  const runStatus = $('tailor-run-status');
  const previewFrame = $('tailor-preview');
  const previewStatus = $('tailor-preview-status');
  const droppedBox = $('tailor-dropped');
  const droppedList = $('tailor-dropped-list');
  const truncationWarning = $('tailor-truncation-warning');
  const tailorCostLabel = $('tailor-cost');
  const diffPanel = $('tailor-diff');
  const atsBox = $('tailor-ats');
  const atsPct = $('tailor-ats-pct');
  const atsPctBase = $('tailor-ats-pct-base');
  const atsFraction = $('tailor-ats-fraction');
  const atsFractionBase = $('tailor-ats-fraction-base');
  const atsDelta = $('tailor-ats-delta');
  const atsMissingWrap = $('tailor-ats-missing-wrap');
  const atsMissing = $('tailor-ats-missing');
  const atsMatchedWrap = $('tailor-ats-matched-wrap');
  const atsMatched = $('tailor-ats-matched');
  const uploadStatus = $('tailor-upload-status');
  const saveStatus = $('tailor-save-status');
  const fileInput = $('tailor-file');
  const dropzone = $('tailor-dropzone');
  const sourceName = $('tailor-source-name');
  const parsedAt = $('tailor-parsed-at');
  const contactGrid = $('tailor-contact-grid');
  const linksList = $('tailor-links');
  const experienceList = $('tailor-experience');
  const projectsList = $('tailor-projects');
  const educationList = $('tailor-education');
  const skillsList = $('tailor-skills');
  const skillInput = $('tailor-skill-input');

  let resume = null;
  let tailored = null;
  let lastPdfUrl = null;
  let renderTimer = null;

  // ----- fetch + render -----

  async function refreshTailor() {
    try {
      const res = await fetch('/api/resume');
      if (res.status === 404) {
        showEmpty();
        return;
      }
      if (!res.ok) {
        uploadStatus.textContent = `failed to load resume (${res.status})`;
        showEmpty();
        return;
      }
      resume = await res.json();
      showEditor();
      paintEditor();
    } catch (err) {
      uploadStatus.textContent = `failed to load resume: ${err.message}`;
      showEmpty();
    }
  }
  window.refreshTailor = refreshTailor;

  function showEmpty() {
    emptyState.classList.remove('hidden');
    editor.classList.add('hidden');
    runPanel.classList.add('hidden');
    resultPanel.classList.add('hidden');
    needsResumeBanner.classList.remove('hidden');
  }
  function showEditor() {
    emptyState.classList.add('hidden');
    editor.classList.remove('hidden');
    runPanel.classList.remove('hidden');
    needsResumeBanner.classList.add('hidden');
  }

  // ----- upload -----

  fileInput.addEventListener('change', (e) => uploadFile(e.target.files?.[0]));

  ['dragenter', 'dragover'].forEach((ev) => {
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('bg-ink-100/40'); });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('bg-ink-100/40'); });
  });
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) uploadFile(file);
  });

  async function uploadFile(file) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      uploadStatus.textContent = 'only PDF files are supported';
      return;
    }
    uploadStatus.textContent = 'parsing…';
    try {
      const res = await fetch(`/api/resume/upload?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/pdf' },
        body: file,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        uploadStatus.textContent = body.error || `upload failed (${res.status})`;
        return;
      }
      resume = body.resume;
      uploadStatus.textContent = '';
      showEditor();
      paintEditor();
    } catch (err) {
      uploadStatus.textContent = `upload failed: ${err.message}`;
    }
  }

  $('btn-tailor-reupload').addEventListener('click', () => {
    resume = null;
    fileInput.value = '';
    uploadStatus.textContent = '';
    showEmpty();
  });

  // ----- editor rendering -----

  function paintEditor() {
    sourceName.textContent = resume.source_pdf_name || '—';
    parsedAt.textContent = resume.parsed_at || '—';
    paintContact();
    paintLinks();
    paintTextarea('summary', resume.summary);
    paintExperience();
    paintProjects();
    paintSkills();
    paintEducation();
  }

  const CONTACT_FIELDS = [
    { key: 'name', label: 'Name', placeholder: 'Your name' },
    { key: 'email', label: 'Email', placeholder: 'you@example.com' },
    { key: 'phone', label: 'Phone', placeholder: '+91 …' },
    { key: 'location', label: 'Location', placeholder: 'City, Country' },
  ];

  function paintContact() {
    contactGrid.innerHTML = '';
    for (const f of CONTACT_FIELDS) {
      const label = el('label', 'block text-xs text-ink-400');
      label.textContent = f.label;
      const input = el('input', 'mt-1 w-full text-sm bg-ink-50/20 border border-ink-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ink-300');
      input.type = 'text';
      input.value = resume.contact[f.key] ?? '';
      input.placeholder = f.placeholder;
      input.addEventListener('input', () => { resume.contact[f.key] = input.value || (f.key === 'phone' || f.key === 'location' ? null : ''); });
      label.appendChild(input);
      contactGrid.appendChild(label);
    }
  }

  function paintLinks() {
    linksList.innerHTML = '';
    resume.contact.links = resume.contact.links || [];
    resume.contact.links.forEach((link, idx) => {
      const row = el('div', 'resume-link-row flex items-center gap-2');
      const labelIn = textInput(link.label, 'label', 'w-1/3');
      labelIn.addEventListener('input', () => { resume.contact.links[idx].label = labelIn.value; });
      const urlIn = textInput(link.url, 'https://…', 'flex-1');
      urlIn.addEventListener('input', () => { resume.contact.links[idx].url = urlIn.value; });
      row.appendChild(labelIn);
      row.appendChild(urlIn);
      row.appendChild(removeButton(() => { resume.contact.links.splice(idx, 1); paintLinks(); scheduleAutoSave(); }));
      linksList.appendChild(row);
    });
  }

  $('btn-tailor-add-link').addEventListener('click', () => {
    resume.contact.links = resume.contact.links || [];
    resume.contact.links.push({ label: '', url: '' });
    paintLinks();
    scheduleAutoSave();
  });

  function paintTextarea(key, value) {
    const ta = document.querySelector(`[data-bind="${key}"]`);
    ta.value = value || '';
    ta.oninput = () => { resume[key] = ta.value; };
  }

  function paintExperience() {
    experienceList.innerHTML = '';
    resume.experience = resume.experience || [];
    resume.experience.forEach((job, idx) => {
      experienceList.appendChild(jobCard(job, idx));
    });
  }

  $('btn-tailor-add-job').addEventListener('click', () => {
    resume.experience.push({ company: '', title: '', dates: '', location: null, bullets: [] });
    paintExperience();
    scheduleAutoSave();
  });

  function jobCard(job, idx) {
    const card = el('div', 'rounded-lg border border-ink-200 bg-ink-50/10 p-4 space-y-3');
    const header = el('div', 'grid grid-cols-2 gap-2');
    header.appendChild(labeled('Company', textInput(job.company, 'Acme', '', (v) => job.company = v)));
    header.appendChild(labeled('Title',   textInput(job.title,   'Senior Engineer', '', (v) => job.title = v)));
    header.appendChild(labeled('Dates',   textInput(job.dates,   'Jan 2023 – Present', '', (v) => job.dates = v)));
    header.appendChild(labeled('Location',textInput(job.location ?? '', 'Bengaluru', '', (v) => job.location = v || null)));
    card.appendChild(header);
    card.appendChild(bulletEditor(job.bullets, 'Bullets'));
    card.appendChild(removeRow('Remove job', () => { resume.experience.splice(idx, 1); paintExperience(); scheduleAutoSave(); }));
    return card;
  }

  function paintProjects() {
    projectsList.innerHTML = '';
    resume.projects = resume.projects || [];
    resume.projects.forEach((proj, idx) => {
      projectsList.appendChild(projectCard(proj, idx));
    });
  }

  $('btn-tailor-add-project').addEventListener('click', () => {
    resume.projects.push({ name: '', link: null, bullets: [] });
    paintProjects();
    scheduleAutoSave();
  });

  function projectCard(proj, idx) {
    const card = el('div', 'rounded-lg border border-ink-200 bg-ink-50/10 p-4 space-y-3');
    const header = el('div', 'grid grid-cols-2 gap-2');
    header.appendChild(labeled('Name', textInput(proj.name, 'Project name', '', (v) => proj.name = v)));
    header.appendChild(labeled('Link', textInput(proj.link ?? '', 'https://…', '', (v) => proj.link = v || null)));
    card.appendChild(header);
    card.appendChild(bulletEditor(proj.bullets, 'Bullets'));
    card.appendChild(removeRow('Remove project', () => { resume.projects.splice(idx, 1); paintProjects(); scheduleAutoSave(); }));
    return card;
  }

  function paintSkills() {
    skillsList.innerHTML = '';
    resume.skills = resume.skills || [];
    resume.skills.forEach((skill, idx) => {
      const chip = el('span', 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-ink-200/60 text-xs text-ink-800');
      chip.textContent = skill;
      const x = el('button', 'text-ink-500 hover:text-ink-900');
      x.textContent = '×';
      x.addEventListener('click', () => { resume.skills.splice(idx, 1); paintSkills(); scheduleAutoSave(); });
      chip.appendChild(x);
      skillsList.appendChild(chip);
    });
  }

  skillInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = skillInput.value.trim();
    if (!v) return;
    resume.skills = resume.skills || [];
    if (!resume.skills.includes(v)) resume.skills.push(v);
    skillInput.value = '';
    paintSkills();
    scheduleAutoSave();
  });

  function paintEducation() {
    educationList.innerHTML = '';
    resume.education = resume.education || [];
    resume.education.forEach((edu, idx) => {
      educationList.appendChild(eduCard(edu, idx));
    });
  }

  $('btn-tailor-add-edu').addEventListener('click', () => {
    resume.education.push({ school: '', degree: '', dates: '', details: null });
    paintEducation();
    scheduleAutoSave();
  });

  function eduCard(edu, idx) {
    const card = el('div', 'rounded-lg border border-ink-200 bg-ink-50/10 p-4 space-y-3');
    const header = el('div', 'grid grid-cols-2 gap-2');
    header.appendChild(labeled('School', textInput(edu.school, 'University', '', (v) => edu.school = v)));
    header.appendChild(labeled('Degree', textInput(edu.degree, 'BSc Computer Science', '', (v) => edu.degree = v)));
    header.appendChild(labeled('Dates',  textInput(edu.dates,  '2018 – 2022', '', (v) => edu.dates = v)));
    header.appendChild(labeled('Details',textInput(edu.details ?? '', 'GPA, honors…', '', (v) => edu.details = v || null)));
    card.appendChild(header);
    card.appendChild(removeRow('Remove school', () => { resume.education.splice(idx, 1); paintEducation(); scheduleAutoSave(); }));
    return card;
  }

  // ----- save (manual + debounced auto-save on edit) -----

  let autoSaveTimer = null;
  let autoSaveInFlight = false;

  async function saveResume() {
    if (!resume) return;
    saveStatus.textContent = 'saving…';
    autoSaveInFlight = true;
    try {
      const res = await fetch('/api/resume', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(resume),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        saveStatus.textContent = body.error || `save failed (${res.status})`;
        return;
      }
      saveStatus.textContent = 'saved';
      setTimeout(() => { if (saveStatus.textContent === 'saved') saveStatus.textContent = ''; }, 1200);
    } catch (err) {
      saveStatus.textContent = `save failed: ${err.message}`;
    } finally {
      autoSaveInFlight = false;
    }
  }

  function scheduleAutoSave() {
    if (!resume) return;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null;
      if (autoSaveInFlight) { scheduleAutoSave(); return; }
      saveResume();
    }, 700);
  }

  editor.addEventListener('input', scheduleAutoSave);

  $('btn-tailor-save').addEventListener('click', saveResume);

  // ----- helpers -----

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function textInput(value, placeholder, extraClass, onInput) {
    const input = el('input', `text-sm bg-ink-50/20 border border-ink-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ink-300 ${extraClass || ''}`);
    input.type = 'text';
    input.value = value ?? '';
    input.placeholder = placeholder;
    if (onInput) input.addEventListener('input', () => onInput(input.value));
    return input;
  }

  function labeled(labelText, control) {
    const wrap = el('label', 'block');
    const lbl = el('div', 'text-[11px] text-ink-400 mb-1');
    lbl.textContent = labelText;
    wrap.appendChild(lbl);
    wrap.appendChild(control);
    return wrap;
  }

  function bulletEditor(bullets, title) {
    const wrap = el('div', '');
    const lbl = el('div', 'text-[11px] text-ink-400 mb-1');
    lbl.textContent = title;
    wrap.appendChild(lbl);
    const list = el('div', 'space-y-1.5');
    bullets.forEach((text, i) => list.appendChild(bulletRow(bullets, i)));
    wrap.appendChild(list);
    const add = el('button', 'text-[11px] font-medium text-ink-500 hover:text-ink-800 mt-2');
    add.textContent = '+ add bullet';
    add.addEventListener('click', () => {
      bullets.push('');
      list.appendChild(bulletRow(bullets, bullets.length - 1));
      scheduleAutoSave();
    });
    wrap.appendChild(add);
    return wrap;
  }

  function bulletRow(bullets, idx) {
    const row = el('div', 'flex items-start gap-2');
    const ta = el('textarea', 'flex-1 text-sm bg-ink-50/20 border border-ink-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ink-300');
    ta.rows = 2;
    ta.value = bullets[idx] ?? '';
    ta.addEventListener('input', () => { bullets[idx] = ta.value; });
    row.appendChild(ta);
    row.appendChild(removeButton(() => { bullets.splice(idx, 1); row.remove(); scheduleAutoSave(); }));
    return row;
  }

  function removeButton(onClick) {
    const btn = el('button', 'text-ink-400 hover:text-ink-900 text-sm px-2');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Remove');
    btn.title = 'Remove';
    btn.textContent = '×';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function removeRow(label, onClick) {
    const row = el('div', 'flex justify-end');
    const btn = el('button', 'text-[11px] text-ink-400 hover:text-ink-800');
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    row.appendChild(btn);
    return row;
  }

  // ----- tailor: paste JD, render PDF -----

  runButton.addEventListener('click', () => runTailor());

  async function runTailor() {
    const jd = jdInput.value.trim();
    if (!jd) { runStatus.textContent = 'paste a job description first'; return; }
    setTailorBusy(true);
    try {
      const res = await fetch('/api/tailor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jd }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body.error || `tailor failed (${res.status})`;
        runStatus.textContent = msg;
        previewStatus.textContent = msg;
        return;
      }
      tailored = body.tailored;
      runStatus.textContent = '';
      paintTailored(body);
      schedulePreview();
    } catch (err) {
      const msg = `tailor failed: ${err.message}`;
      runStatus.textContent = msg;
      previewStatus.textContent = msg;
    } finally {
      setTailorBusy(false);
    }
  }

  function setTailorBusy(isBusy) {
    runButton.disabled = isBusy;
    runButton.setAttribute('aria-busy', String(isBusy));
    runButton.textContent = isBusy ? 'Tailoring...' : 'Tailor';
    if (isBusy) {
      runStatus.textContent = 'tailoring resume against the job description...';
      previewStatus.textContent = 'tailoring...';
    }
  }

  $('btn-tailor-discard').addEventListener('click', () => {
    tailored = null;
    resultPanel.classList.add('hidden');
    if (lastPdfUrl) { URL.revokeObjectURL(lastPdfUrl); lastPdfUrl = null; }
    previewFrame.src = 'about:blank';
  });

  $('btn-tailor-download').addEventListener('click', async () => {
    if (!lastPdfUrl) return;
    const a = document.createElement('a');
    a.href = lastPdfUrl;
    a.download = downloadFilename();
    a.click();
  });

  function downloadFilename() {
    const name = (tailored?.contact?.name || 'resume').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    return `${name}_tailored.pdf`;
  }

  function paintTailored(result) {
    resultPanel.classList.remove('hidden');
    tailorCostLabel.textContent = `${result.tokens} tokens · $${(result.cost_usd || 0).toFixed(4)}`;
    truncationWarning.classList.toggle('hidden', !result.truncation_warning);
    paintDropped(result.dropped_bullets || []);
    paintAts(result.ats, result.ats_base);
    paintDiff(result.base, result.tailored);
  }

  function paintAts(ats, atsBase) {
    if (!ats) { atsBox.classList.add('hidden'); return; }
    atsBox.classList.remove('hidden');
    const pct = Math.round((ats.score || 0) * 100);
    const pctBase = Math.round(((atsBase?.score) || 0) * 100);
    const totalKw = (ats.matched?.length || 0) + (ats.missing?.length || 0);

    atsPct.textContent = `${pct}%`;
    atsPct.className = `text-3xl font-semibold tabular ${atsToneClass(pct)}`;
    atsFraction.textContent = totalKw === 0 ? 'no required keywords' : `${ats.matched.length}/${totalKw}`;

    atsPctBase.textContent = `${pctBase}%`;
    const totalKwBase = (atsBase?.matched?.length || 0) + (atsBase?.missing?.length || 0);
    atsFractionBase.textContent = totalKwBase === 0 ? '—' : `${atsBase.matched.length}/${totalKwBase}`;

    const delta = pct - pctBase;
    const sign = delta > 0 ? '+' : '';
    atsDelta.textContent = `${sign}${delta}%`;
    atsDelta.className = `text-2xl font-semibold tabular ${delta === 0 ? 'text-ink-500' : 'text-ink-800'}`;

    paintKeywordChips(atsMissingWrap, atsMissing, ats.missing || [], 'border-ink-900 text-ink-800 bg-ink-50');
    paintKeywordChips(atsMatchedWrap, atsMatched, ats.matched || [], 'border-ink-900 text-ink-800 bg-ink-50');
  }

  function atsToneClass(pct) {
    if (pct >= 90) return 'text-ink-900';
    if (pct >= 70) return 'text-ink-800';
    return 'text-ink-700';
  }

  function paintKeywordChips(wrap, list, items, chipClasses) {
    if (items.length === 0) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    list.innerHTML = '';
    for (const item of items) {
      const chip = el('span', `inline-flex items-center px-2.5 py-1 rounded-md border text-[11px] font-medium ${chipClasses}`);
      chip.textContent = item;
      list.appendChild(chip);
    }
  }

  function paintDropped(dropped) {
    if (dropped.length === 0) { droppedBox.classList.add('hidden'); return; }
    droppedBox.classList.remove('hidden');
    droppedList.innerHTML = '';
    for (const d of dropped) {
      const li = el('li', '');
      li.textContent = `${d.section}[${d.section_index}]: ${d.bullet_text}`;
      droppedList.appendChild(li);
    }
  }

  // ----- diff view: base vs tailored -----

  function paintDiff(base, tailored) {
    diffPanel.innerHTML = '';
    if (!base || !tailored) return;

    diffPanel.appendChild(diffSummary(base.summary, tailored.summary));

    const baseExpByCo = mapByCompany(base.experience);
    diffPanel.appendChild(diffSection('Experience', tailored.experience.map((j) => ({
      heading: `${j.title} · ${j.company}`,
      meta: j.dates,
      baseBullets: (baseExpByCo.get(j.company.toLowerCase()) || []).map((b) => normalizeBullet(b)),
      tailoredBullets: j.bullets.map((b) => normalizeBullet(b.text)),
    }))));

    const baseProjByName = mapByName(base.projects);
    diffPanel.appendChild(diffSection('Projects', tailored.projects.map((p) => ({
      heading: p.name,
      meta: null,
      baseBullets: (baseProjByName.get(p.name.toLowerCase()) || []).map((b) => normalizeBullet(b)),
      tailoredBullets: p.bullets.map((b) => normalizeBullet(b.text)),
    }))));

    diffPanel.appendChild(diffSkills(base.skills || [], tailored.skills || []));
  }

  function mapByCompany(experience) {
    const m = new Map();
    for (const j of experience || []) m.set(j.company.toLowerCase(), j.bullets || []);
    return m;
  }

  function mapByName(projects) {
    const m = new Map();
    for (const p of projects || []) m.set(p.name.toLowerCase(), p.bullets || []);
    return m;
  }

  function normalizeBullet(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function diffSummary(baseText, tailoredText) {
    const card = el('div', 'surface rounded-xl px-6 py-5 space-y-4');
    card.appendChild(diffHeader('Summary', baseText === tailoredText ? 'unchanged' : 'rewritten'));
    const grid = el('div', 'grid grid-cols-1 md:grid-cols-2 gap-3');
    grid.appendChild(diffColumn('Base', baseText || '—', 'text-ink-500'));
    grid.appendChild(diffColumn('Tailored', tailoredText || '—', 'text-ink-900'));
    card.appendChild(grid);
    return card;
  }

  function diffSection(title, items) {
    const card = el('div', 'surface rounded-xl px-6 py-5 space-y-5');
    card.appendChild(diffHeader(title, null));
    if (items.length === 0) {
      const empty = el('div', 'text-[11px] text-ink-400');
      empty.textContent = '(no entries)';
      card.appendChild(empty);
      return card;
    }
    for (const item of items) {
      card.appendChild(diffEntry(item));
    }
    return card;
  }

  function diffEntry(item) {
    const wrap = el('div', 'rounded-lg border border-ink-200/60 bg-ink-200/15 px-4 py-3 space-y-2');
    const head = el('div', 'flex items-center justify-between gap-2');
    const heading = el('div', 'text-sm font-semibold text-ink-800 truncate');
    heading.textContent = item.heading;
    head.appendChild(heading);
    if (item.meta) {
      const meta = el('div', 'text-[11px] text-ink-400 tabular');
      meta.textContent = item.meta;
      head.appendChild(meta);
    }
    wrap.appendChild(head);

    const grid = el('div', 'grid grid-cols-1 md:grid-cols-2 gap-3');
    grid.appendChild(bulletList('Base', item.baseBullets, 'text-ink-500'));
    grid.appendChild(bulletList('Tailored', item.tailoredBullets, 'text-ink-800'));
    wrap.appendChild(grid);
    return wrap;
  }

  function bulletList(label, bullets, toneClass) {
    const col = el('div', 'space-y-1.5');
    const lbl = el('div', 'text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold');
    lbl.textContent = label;
    col.appendChild(lbl);
    if (bullets.length === 0) {
      const empty = el('div', 'text-[11px] text-ink-400');
      empty.textContent = '(none)';
      col.appendChild(empty);
      return col;
    }
    for (const b of bullets) {
      const row = el('div', `text-[12.5px] leading-snug ${toneClass}`);
      row.textContent = `• ${b}`;
      col.appendChild(row);
    }
    return col;
  }

  function diffSkills(baseSkills, tailoredSkills) {
    const card = el('div', 'surface rounded-xl px-6 py-5 space-y-4');
    const tailoredSet = new Set((tailoredSkills || []).map((s) => s.toLowerCase()));
    const dropped = (baseSkills || []).filter((s) => !tailoredSet.has(s.toLowerCase()));
    card.appendChild(diffHeader('Skills', `${tailoredSkills.length} kept · ${dropped.length} dropped`));

    const keptWrap = el('div', '');
    const keptLbl = el('div', 'text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold mb-1.5');
    keptLbl.textContent = 'Kept (reordered for JD)';
    keptWrap.appendChild(keptLbl);
    const keptChips = el('div', 'flex flex-wrap gap-1.5');
    for (const s of tailoredSkills) {
      const chip = el('span', 'inline-flex items-center px-2.5 py-1 rounded-md bg-ink-200/60 text-xs text-ink-800');
      chip.textContent = s;
      keptChips.appendChild(chip);
    }
    keptWrap.appendChild(keptChips);
    card.appendChild(keptWrap);

    if (dropped.length > 0) {
      const dropWrap = el('div', '');
      const dropLbl = el('div', 'text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold mb-1.5');
      dropLbl.textContent = 'Dropped';
      dropWrap.appendChild(dropLbl);
      const dropChips = el('div', 'flex flex-wrap gap-1.5');
      for (const s of dropped) {
        const chip = el('span', 'inline-flex items-center px-2.5 py-1 rounded-md bg-ink-100/40 text-xs text-ink-500 line-through');
        chip.textContent = s;
        dropChips.appendChild(chip);
      }
      dropWrap.appendChild(dropChips);
      card.appendChild(dropWrap);
    }
    return card;
  }

  function diffHeader(title, badgeText) {
    const head = el('div', 'flex items-center justify-between gap-2');
    const lbl = el('div', 'text-[11px] uppercase tracking-[0.18em] text-ink-400 font-semibold');
    lbl.textContent = title;
    head.appendChild(lbl);
    if (badgeText) {
      const badge = el('span', 'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-0.5 rounded-md bg-ink-200 text-ink-500');
      badge.textContent = badgeText;
      head.appendChild(badge);
    }
    return head;
  }

  function diffColumn(label, text, toneClass) {
    const col = el('div', 'space-y-1.5');
    const lbl = el('div', 'text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold');
    lbl.textContent = label;
    col.appendChild(lbl);
    const body = el('div', `text-[12.5px] leading-snug whitespace-pre-wrap ${toneClass}`);
    body.textContent = text;
    col.appendChild(body);
    return col;
  }

  function schedulePreview() {
    previewStatus.textContent = 'rendering…';
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(renderPreview, 350);
  }

  async function renderPreview() {
    if (!tailored) return;
    try {
      const res = await fetch('/api/resume/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(tailored),
      });
      if (!res.ok) { previewStatus.textContent = `render failed (${res.status})`; return; }
      const blob = await res.blob();
      if (lastPdfUrl) URL.revokeObjectURL(lastPdfUrl);
      lastPdfUrl = URL.createObjectURL(blob);
      previewFrame.src = lastPdfUrl;
      previewStatus.textContent = '';
    } catch (err) {
      previewStatus.textContent = `render failed: ${err.message}`;
    }
  }
})();
