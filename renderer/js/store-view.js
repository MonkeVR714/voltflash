/* Firmware store: category pages with cards, plus the "add your own project" dialog. */
(function () {
  const { h, icon, clear, call, toast, errorToast, modal, confirmBox, state, CATS, catById, bus } = VF;

  const el = h('section.view#view-store');
  let currentCat = 'all';

  function allEntries() {
    const builtIn = (state.catalog.firmware || []).map((f) => ({ ...f, builtIn: true }));
    const mine = state.projects.map((p) => ({ ...p, categories: Array.from(new Set(['mine', ...(p.categories || [])])) }));
    return [...mine, ...builtIn];
  }

  function entriesFor(cat) {
    return allEntries().filter((e) => cat === 'all' || (e.categories || []).includes(cat));
  }

  function counts() {
    const c = {};
    for (const cat of CATS) c[cat.id] = entriesFor(cat.id).length;
    return c;
  }

  function matchesSearch(e, q) {
    if (!q) return true;
    const hay = [e.name, e.author, e.description, e.repo, ...(e.tags || [])].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  }

  function coverUrl(e) {
    return /^https?:/i.test(e.image) ? e.image : 'file:///' + e.image.replace(/\\/g, '/');
  }

  function card(e) {
    // only a cover the user picked themselves; no generated art
    const cover = e.image
      ? h('div.card-cover', { onclick: () => VF.openFlash({ entry: e, category: currentCat }) }, h('img', { src: coverUrl(e), alt: '', draggable: false }))
      : null;
    const tags = h('div.card-tags', (e.categories || []).filter((c) => c !== 'all').map((c) => {
      const cat = catById(c);
      return h('span.badge', { style: { '--badge-color': cat.color } }, cat.id === 'mine' ? 'Mine' : cat.name);
    }));

    const foot = h('div.card-foot',
      h('button.btn.btn-accent', { onclick: () => VF.openFlash({ entry: e, category: currentCat }) }, icon('bolt'), 'Flash'));
    if (e.repo) foot.appendChild(h('button.btn.btn-icon', { title: 'Open on GitHub (built-in browser)', onclick: () => VF.openInBrowser(`https://github.com/${e.repo}`) }, icon('globe')));
    if (!e.builtIn) {
      foot.appendChild(h('button.btn.btn-icon', { title: 'Edit', onclick: () => openAddProject(e) }, icon('pencil')));
      foot.appendChild(h('button.btn.btn-icon.btn-danger', { title: 'Remove from My Projects', onclick: () => removeProject(e) }, icon('trash')));
    }

    return h('article.card',
      cover,
      h('div.card-body',
        tags,
        h('div.card-title', { title: e.description || '' }, e.name),
        h('div.card-author', e.author || e.repo || (e.source === 'file' ? 'file' : ''))),
      foot);
  }

  async function removeProject(e) {
    const ok = await confirmBox('Remove?', e.name, { okLabel: 'Remove', danger: true });
    if (!ok) return;
    await call(window.vf.projects.remove(e.id));
    await reloadProjects();
  }

  async function reloadProjects() {
    state.projects = await call(window.vf.projects.list());
    bus.emit('catalog');
  }

  function render() {
    const cat = catById(currentCat);
    const q = state.search || '';
    const list = entriesFor(currentCat).filter((e) => matchesSearch(e, q));
    const shown = list;

    clear(el);
    el.style.setProperty('--hero-color', cat.color);
    const scroll = h('div.scroll',
      h('div.hero',
        h('div',
          h('h1', cat.name),
          h('p', q ? `${shown.length} result${shown.length === 1 ? '' : 's'} for "${q}"` : cat.desc)),
        h('div.hero-actions',
          h('button.btn', { onclick: () => openAddProject() }, icon('plus'), 'Add'),
          h('button.btn.btn-icon', { title: 'Refresh catalog', onclick: () => VF.loadCatalog(true) }, icon('refresh')))),
      state.catalog.warning ? h('div.notice', icon('alert'), state.catalog.warning) : null,
      shown.length || currentCat === 'mine'
        ? h('div.grid',
          shown.map(card),
          currentCat === 'mine' || currentCat === 'all' && !q ? h('div.card.add', { onclick: () => openAddProject() },
            h('div.plus', '+'), h('span', 'Add')) : null)
        : h('div.empty', 'Empty'));
    el.appendChild(scroll);
  }

  // ---------- add / edit project ----------
  // existing = a saved project to edit; prefill = fields for a new one (e.g. a repo from the browser)
  function openAddProject(existing, prefill) {
    const p = existing
      ? { ...existing, categories: (existing.categories || []).filter((c) => c !== 'mine') }
      : { source: 'github', categories: [], ...(prefill || {}) };
    let info = null;
    let analysis = null;
    const m = modal({ title: existing ? 'Edit' : 'Add project' });

    const nameInput = h('input.input', { value: p.name || '', placeholder: 'Name' });
    const descInput = h('textarea.textarea', { rows: 2, placeholder: '' }, p.description || '');
    const repoInput = h('input.input.grow', { value: p.repo || '', placeholder: 'owner/repo', spellcheck: false });
    const filterInput = h('input.input', { value: p.assetFilter || '', placeholder: 'optional', spellcheck: false });
    const preview = h('div');

    function tabs() {
      return h('div.tabs',
        h('div.tab' + (p.source === 'github' ? '.active' : ''), { onclick: () => { p.source = 'github'; draw(); } }, icon('github'), ' GitHub'),
        h('div.tab' + (p.source === 'file' ? '.active' : ''), { onclick: () => { p.source = 'file'; draw(); } }, icon('file'), ' File'));
    }

    function catPicks() {
      return h('div.cat-picks', CATS.filter((c) => c.id !== 'all' && c.id !== 'mine').map((c) =>
        h('div.cat-pick' + (p.categories.includes(c.id) ? '.on' : ''), {
          style: { '--nav-color': c.color },
          onclick: () => {
            p.categories = p.categories.includes(c.id) ? p.categories.filter((x) => x !== c.id) : [...p.categories, c.id];
            draw();
          },
        }, h('span.nav-swatch', { style: { '--nav-color': c.color } }), c.name)));
    }

    async function checkRepo() {
      clear(preview).appendChild(h('div.row.muted', '...'));
      try {
        info = await call(window.vf.github.repoInfo(repoInput.value));
        const rels = await call(window.vf.github.releases(info.repo));
        repoInput.value = info.repo;
        if (!nameInput.value) nameInput.value = info.name.replace(/[-_]/g, ' ');
        if (!descInput.value) descInput.value = info.description;
        const files = rels.reduce((n, r) => n + r.assets.length, 0);
        clear(preview).appendChild(h('div.preview-card',
          h('div.grow',
            h('b', info.repo), h('div.dim', `★ ${info.stars} · ${info.license || 'no license listed'}`),
            h('div', { style: { color: rels.length ? 'var(--green)' : 'var(--orange)', marginTop: '4px' } },
              rels.length ? `${files} files` : 'No release files'))));
      } catch (err) {
        info = null;
        clear(preview).appendChild(h('div.notice.err', { style: { margin: 0 } }, icon('alert'), err.message));
      }
    }

    async function pickFile() {
      const file = await call(window.vf.app.pickFirmware());
      if (!file) return;
      p.path = file;
      analysis = await call(window.vf.flash.analyze(file));
      if (!nameInput.value) nameInput.value = analysis.name.replace(/\.(bin|hex)$/i, '');
      if (analysis.chip && !p.categories.length) {
        if (analysis.chip === 'ESP32-S3') p.categories = ['esp32s3'];
        else if (analysis.chip === 'ESP32') p.categories = ['esp32'];
      }
      if (analysis.target === 'avr' && !p.categories.length) p.categories = ['arduino'];
      draw();
    }

    function draw() {
      const source = p.source === 'github'
        ? h('div.field', h('span', 'Repo'),
          h('div.row', repoInput, h('button.btn', { onclick: checkRepo }, icon('search'), 'Check')),
          preview,
          h('label.field', { style: { marginTop: '6px' } }, h('span', 'Filter'), filterInput,
            h('small', 'Handy when a release has files for many boards.')))
        : h('div.field', h('span', 'File'),
          p.path
            ? h('div.asset.selected', h('span.radio'), h('span.name', p.path), h('button.btn.btn-sm', { onclick: pickFile }, 'Change'))
            : h('button.btn.btn-lg.btn-block', { onclick: pickFile }, icon('folder'), 'Choose file'),
          analysis ? h('small', `${analysis.summary}${analysis.chip ? ' Built for ' + analysis.chip + '.' : ''}`) : null);

      m.setBody(
        existing ? null : tabs(),
        source,
        h('div.two', h('label.field', h('span', 'Name'), nameInput),
          h('div.field', h('span', 'Image'), h('div.row',
            h('button.btn.grow', { onclick: async () => { const img = await call(window.vf.app.pickImage()); if (img) { p.image = img; draw(); } } }, icon('image'), p.image ? 'Change' : 'Choose'),
            p.image ? h('button.btn.btn-icon', { title: 'Remove image', onclick: () => { p.image = null; draw(); } }, icon('x')) : null))),
        h('label.field', h('span', 'Notes'), descInput),
        h('div.field', h('span', 'Categories'), catPicks()));
      m.setFoot(h('div.spacer'), h('button.btn', { onclick: () => m.close() }, 'Cancel'),
        h('button.btn.btn-accent', { onclick: save }, icon('check'), existing ? 'Save' : 'Add'));
    }

    async function save() {
      try {
        const name = nameInput.value.trim();
        if (!name) throw new Error('Give the project a name.');
        const out = {
          id: p.id,
          name,
          description: descInput.value.trim(),
          categories: p.categories,
          source: p.source,
          image: p.image || null,
          fqbn: p.fqbn,
          offset: p.offset,
        };
        if (p.source === 'github') {
          const repo = repoInput.value.trim();
          if (!repo) throw new Error('Enter a GitHub repo.');
          out.repo = info ? info.repo : repo.replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '');
          out.author = info ? info.owner : out.repo.split('/')[0];
          const f = filterInput.value.trim();
          out.assetFilter = f;
          out.assetPattern = f ? f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
        } else {
          if (!p.path) throw new Error('Choose a firmware file.');
          out.path = p.path;
          if (analysis && analysis.offset !== null && analysis.offset !== undefined) out.offset = analysis.offset;
        }
        await call(window.vf.projects.save(out));
        m.close();
        await reloadProjects();
        toast(existing ? 'Saved' : 'Added', null, { type: 'ok' });
      } catch (err) {
        errorToast(err, 'Could not save');
      }
    }

    draw();
    if (p.source === 'github' && p.repo) checkRepo();
    if (p.source === 'file' && p.path) {
      call(window.vf.flash.analyze(p.path)).then((a) => { analysis = a; draw(); }).catch(() => {});
    }
  }

  VF.views.store = {
    el,
    show(cat) {
      currentCat = cat || 'all';
      render();
    },
    render,
    counts,
  };
  VF.openAddProject = openAddProject;
  VF.reloadProjects = reloadProjects;
  bus.on('catalog', () => render());
  bus.on('search', () => { if (VF.state.view.startsWith('store')) render(); });
})();
