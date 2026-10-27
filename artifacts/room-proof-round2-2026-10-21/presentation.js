(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  // Below this stage width a 1440px desktop frame is unreadable, so frames marked data-narrow
  // re-render the mockup at phone width instead of shrinking it further.
  const NARROW = 720;
  const PHONE = { w: 390, h: 844 };

  /* Scaled, lazily loaded frames */
  const visible = new WeakSet();
  const load = frame => {
    if (!visible.has(frame) || !frame.dataset.src) return;
    if (frame.getAttribute('src') !== frame.dataset.src) frame.setAttribute('src', frame.dataset.src);
  };
  const setSource = (frame, url) => { frame.dataset.src = url; load(frame); };

  function fit(stage) {
    const frame = $('iframe', stage);
    const available = stage.clientWidth;
    if (!frame || !available) return;
    const narrow = stage.hasAttribute('data-narrow') && window.innerWidth < NARROW;
    const w = narrow ? PHONE.w : Number(stage.dataset.w);
    const h = narrow ? PHONE.h : Number(stage.dataset.h);
    const scale = Math.min(1, available / w);
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    frame.style.transform = `scale(${scale})`;
    frame.style.left = `${Math.max(0, (available - w * scale) / 2)}px`;
    stage.style.height = `${Math.round(h * scale)}px`;
    if (stage.classList.contains('is-narrow') !== narrow) {
      stage.classList.toggle('is-narrow', narrow);
      stage.dispatchEvent(new CustomEvent('stagemode', { bubbles: true }));
    }
  }

  const stages = $$('.stage');
  if ('ResizeObserver' in window) {
    const resize = new ResizeObserver(entries => entries.forEach(entry => fit(entry.target)));
    stages.forEach(stage => resize.observe(stage));
  } else {
    window.addEventListener('resize', () => stages.forEach(fit));
  }
  stages.forEach(fit);

  if ('IntersectionObserver' in window) {
    const watch = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const frame = $('iframe', entry.target);
      visible.add(frame);
      load(frame);
      watch.unobserve(entry.target);
    }), { rootMargin: '900px 0px' });
    stages.forEach(stage => watch.observe(stage));
  } else {
    stages.forEach(stage => { const frame = $('iframe', stage); visible.add(frame); load(frame); });
  }

  const press = (buttons, active) => buttons.forEach(button => button.setAttribute('aria-pressed', String(button === active)));

  /* Previous and proposed */
  const PREVIOUS = '../room-proof-workflows-2026-10-21/mockup.html';
  const compareLook = {
    project: 'Look for a simpler masthead and project row, and how soon the room and its margin arrive.',
    accounts: 'Look for the six readings taken in together, a compact title, and the next action beside the fact it resolves.',
    desk: 'Look for six rooms on one contact sheet, and a work list where every act names its project, person and date.'
  };
  const compare = $('#compare-panels');
  const compareState = { scene: 'project', mode: 'proposed' };
  function renderCompare() {
    const { scene, mode } = compareState;
    compare.dataset.mode = mode;
    $$('.frame', compare).forEach(figure => {
      const version = figure.dataset.version;
      figure.hidden = mode !== 'both' && mode !== version;
      const url = `${version === 'previous' ? PREVIOUS : 'mockup.html'}?view=${scene}`;
      $('a[data-open]', figure).href = url;
      setSource($('iframe', figure), url);
    });
    $('#compare-look').textContent = compareLook[scene];
  }
  const compareScenes = $$('[data-compare-scene]');
  const compareModes = $$('[data-compare-mode]');
  compareScenes.forEach(button => button.addEventListener('click', () => {
    compareState.scene = button.dataset.compareScene;
    press(compareScenes, button);
    renderCompare();
  }));
  compareModes.forEach(button => button.addEventListener('click', () => {
    compareState.mode = button.dataset.compareMode;
    press(compareModes, button);
    renderCompare();
  }));
  renderCompare();

  /* Six desktop scenes */
  const scenes = [
    ['desk', 'The studio desk', 'Find the most urgent act across six projects, then open a different room.'],
    ['project', 'The room', 'Say what changed, who acts next, and which record that act applies to.'],
    ['approvals', 'The approval', 'Name the issued revision, and say what approving it does not authorize.'],
    ['accounts', 'Accounts', 'Explain why an approved design with a received deposit still has a held order.'],
    ['orders', 'Orders', 'Decide whether the Northline order can be released, and say what is missing.'],
    ['hours', 'Time', 'Record an entry, then find which time is priced, reserved in a draft or invoiced.']
  ];
  const sceneList = $('#scene-list');
  sceneList.innerHTML = scenes.map(([id, name], index) =>
    `<li><button type="button" data-scene="${id}" aria-pressed="${index === 0}"><span class="scene-num">${index + 1}</span><span class="scene-name">${name}</span></button></li>`
  ).join('');
  const sceneButtons = $$('[data-scene]', sceneList);
  const densityButtons = $$('[data-density]');
  const sceneFrame = $('#scene-frame');
  const explore = { index: 0, density: 'compact' };
  function renderScene() {
    const [id, name, task] = scenes[explore.index];
    const url = `mockup.html?view=${id}${explore.density === 'full' ? '&explanations=full' : ''}`;
    press(sceneButtons, sceneButtons[explore.index]);
    $('#scene-label').textContent = `${name}${explore.density === 'full' ? ', full explanations' : ''}`;
    $('#scene-task').textContent = `Try this: ${task}`;
    $('#scene-open').href = url;
    sceneFrame.title = `Room Proof mockup: ${name.toLowerCase()}`;
    setSource(sceneFrame, url);
  }
  sceneButtons.forEach((button, index) => button.addEventListener('click', () => { explore.index = index; renderScene(); }));
  densityButtons.forEach(button => button.addEventListener('click', () => {
    explore.density = button.dataset.density;
    press(densityButtons, button);
    renderScene();
  }));
  $('#scene-prev').addEventListener('click', () => { explore.index = (explore.index + scenes.length - 1) % scenes.length; renderScene(); });
  $('#scene-next').addEventListener('click', () => { explore.index = (explore.index + 1) % scenes.length; renderScene(); });
  const sceneStage = sceneFrame.closest('.stage');
  const syncNarrowNote = () => { $('#scene-narrow-note').hidden = !sceneStage.classList.contains('is-narrow'); };
  sceneStage.addEventListener('stagemode', syncNarrowNote);
  syncNarrowNote();
  renderScene();

  /* Repeated-explanation comparison */
  const densityScenes = $$('[data-density-scene]');
  densityScenes.forEach(button => button.addEventListener('click', () => {
    press(densityScenes, button);
    $$('#density-compare .frame').forEach(figure => {
      const frame = $('iframe', figure);
      const url = `${frame.dataset.base}${button.dataset.densityScene}${frame.dataset.suffix || ''}`;
      $('a[data-open]', figure).href = url;
      setSource(frame, url);
    });
  }));

  /* Founder notes: this browser only */
  const form = $('#review-form');
  const status = $('#notes-status');
  const key = 'patina-room-proof-round2-review-notes-v1';
  const fields = $$('textarea', form);
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    fields.forEach(field => { if (typeof saved[field.name] === 'string') field.value = saved[field.name]; });
  } catch { /* unreadable storage: start empty */ }
  const collect = () => Object.fromEntries(fields.map(field => [field.name, field.value]));
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      localStorage.setItem(key, JSON.stringify(collect()));
      status.textContent = 'Notes saved in this browser. Nothing was sent.';
    } catch {
      status.textContent = 'This browser can’t save notes. Download them to keep a copy.';
    }
  });
  $('#download-notes').addEventListener('click', () => {
    const sections = $$('fieldset', form).map((fieldset, index) => {
      const title = $('legend', fieldset).textContent.replace(/^\d+/, '').trim();
      const question = $('label', fieldset).textContent.trim();
      const answer = $('textarea', fieldset).value.trim() || '(No note)';
      return `## ${index + 1}. ${title}\n\n_${question}_\n\n${answer}\n`;
    });
    const text = `# Room Proof, round two: founder notes\n\nWritten ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}. Fictional concept mockup; no user testing.\n\n${sections.join('\n')}`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'room-proof-round2-notes.md' });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Notes downloaded. Nothing was sent.';
  });
})();
