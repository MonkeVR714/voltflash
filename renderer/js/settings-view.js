/* Settings: flashing defaults, GitHub, catalog source, tools and board packages. */
(function () {
  const { h, icon, clear, call, toast, errorToast, state, BAUDS, bus } = VF;

  const el = h('section.view#view-settings');
  const body = h('div.settings');
  el.appendChild(h('div.scroll', body));

  let tools = null;
  let cores = null;
  let info = null;
  const installing = {};

  function panel(iconName, title, desc, ...children) {
    return h('div.panel', h('h2', icon(iconName), title), desc ? h('p.desc', desc) : null, ...children);
  }

  function toolRow(name, label, what) {
    const t = tools && tools[name];
    const busy = installing[name];
    return h('div.tool-row',
      icon('package'),
      h('div.grow', h('div.name', label, ' ', t ? h('span.pill.' + (t.installed ? 'ok' : 'no'), t.installed ? `v${t.version}` : 'not installed') : null),
        h('div.dim', { style: { fontSize: '12.5px' } }, busy ? busy : what)),
      h('button.btn.btn-sm', {
        disabled: !!busy,
        onclick: async () => {
          installing[name] = 'Starting...';
          render();
          try {
            await call(window.vf.tools.install(name));
            toast(`${label} ready`, null, { type: 'ok' });
          } catch (e) {
            errorToast(e, `${label} install failed`);
          }
          delete installing[name];
          await refresh();
        },
      }, icon('download'), t && t.installed ? 'Update' : 'Install'));
  }

  function coreRow(c) {
    const busy = installing[c.id];
    return h('div.tool-row',
      icon('chip'),
      h('div.grow', h('div.name', c.name, ' ', h('span.pill.' + (c.installed ? 'ok' : 'no'), c.installed ? `v${c.version}` : 'not installed')),
        h('div.dim', { style: { fontSize: '12.5px' } }, busy || c.note)),
      h('button.btn.btn-sm', {
        disabled: !!busy,
        onclick: async () => {
          installing[c.id] = 'Installing...';
          render();
          try {
            cores = await call(window.vf.arduino.installCore(c.id));
            toast('Board package installed', c.name, { type: 'ok' });
          } catch (e) {
            errorToast(e, 'Install failed');
          }
          delete installing[c.id];
          render();
        },
      }, icon('download'), c.installed ? 'Update' : 'Install'));
  }

  const MODE_TEXT = {
    installer: 'Installed with the setup program. Updates download in the background and install when you restart.',
    folder: 'Installed with the one-line installer. Updates replace the app files only, so Windows Smart App Control keeps trusting it.',
    portable: 'Portable copy: VoltFlash tells you when a new version is out, but you download it yourself.',
    dev: 'Running from source code: updates are off.',
  };

  function updatesPanel(st) {
    const u = state.update || { status: 'idle', mode: 'dev' };
    const statusText = {
      idle: '',
      checking: 'Checking...',
      none: 'Up to date',
      available: `${u.version} available`,
      downloading: `${u.pct || 0}%`,
      ready: `${u.version} ready`,
      error: u.error,
    }[u.status] || '';
    return panel('refresh', 'Updates', MODE_TEXT[u.mode],
      h('div.tool-row',
        icon(u.status === 'ready' ? 'check' : 'info'),
        h('div.grow', h('div.name', `Version ${u.current || ''}`), h('div.dim', { style: { fontSize: '12.5px' } }, u.note || statusText)),
        u.status === 'ready'
          ? h('button.btn.btn-sm.btn-accent', { onclick: () => VF.installUpdate() }, icon('reset'), 'Restart')
          : u.status === 'available'
            ? h('button.btn.btn-sm.btn-accent', { onclick: () => window.vf.app.openExternal(u.url) }, icon('download'), 'Download')
            : h('button.btn.btn-sm', {
              disabled: u.status === 'checking' || u.status === 'downloading',
              onclick: () => call(window.vf.update.check()).catch((e) => errorToast(e, 'Update check failed')),
            }, icon('refresh'), 'Check')),
      h('label.check', h('input', { type: 'checkbox', checked: st.autoUpdate !== false, onchange: (e) => VF.saveSettings({ autoUpdate: e.target.checked }) }),
        'Auto check'));
  }

  function render() {
    const st = state.settings;
    const tokenInput = h('input.input.mono', { type: 'password', value: st.githubToken || '', placeholder: 'optional', spellcheck: false });
    const catalogInput = h('input.input.mono', { value: st.catalogUrl || '', placeholder: 'https://raw.githubusercontent.com/you/catalog/main/catalog.json', spellcheck: false });
    const homeInput = h('input.input.mono', { value: st.browserHome || '', spellcheck: false });

    clear(body).append(
      h('div', h('h1', { style: { margin: 0 } }, 'Settings')),

      panel('bolt', 'Flashing', 'Defaults for the flash dialog.',
        h('div.two',
          h('label.field', h('span', 'Baud'),
            h('select.select', { onchange: (e) => VF.saveSettings({ baud: Number(e.target.value) }) },
              BAUDS.map((b) => h('option', { value: b, selected: b === st.baud }, `${b.toLocaleString()} baud`))),
            h('small', 'Use 115200 or 460800 if flashing fails with long or cheap cables.')),
          h('div.field', h('span', 'Before flash'),
            h('label.check', h('input', { type: 'checkbox', checked: st.backupBeforeFlash !== false, onchange: (e) => VF.saveSettings({ backupBeforeFlash: e.target.checked }) }),
              'Back up first'),
            h('label.check', h('input', { type: 'checkbox', checked: !!st.eraseBeforeFlash, onchange: (e) => VF.saveSettings({ eraseBeforeFlash: e.target.checked }) }),
              'Erase first')))),

      panel('github', 'GitHub', 'Without a token GitHub allows 60 requests an hour. A token with no scopes raises that to 5,000.',
        h('label.field', h('span', 'Token'),
          h('div.row', tokenInput, h('button.btn', { onclick: async () => { await VF.saveSettings({ githubToken: tokenInput.value.trim() }); toast('Saved', null, { type: 'ok' }); } }, 'Save')),
          h('small', 'Create one at github.com/settings/tokens (no permissions needed). Stored in plain text in your VoltFlash settings file.'))),

      panel('grid', 'Catalog', 'Leave empty to use the built-in catalog. Point it at your own catalog.json to share a store with friends.',
        h('label.field', h('span', 'URL'),
          h('div.row', catalogInput,
            h('button.btn', { onclick: async () => { await VF.saveSettings({ catalogUrl: catalogInput.value.trim() }); await VF.loadCatalog(true); toast('Catalog updated', state.catalog.warning || `Loaded ${state.catalog.firmware.length} firmware entries.`, { type: state.catalog.warning ? 'err' : 'ok' }); } }, 'Save')))),

      panel('globe', 'Browser', null,
        h('label.field', h('span', 'Home'),
          h('div.row', homeInput, h('button.btn', { onclick: async () => { await VF.saveSettings({ browserHome: homeInput.value.trim() }); toast('Saved', null, { type: 'ok' }); } }, 'Save')))),

      panel('package', 'Tools', 'VoltFlash downloads these official tools from GitHub when they are first needed.',
        toolRow('esptool', 'esptool', ''),
        toolRow('arduino-cli', 'arduino-cli', '')),

      panel('chip', 'Boards', 'Needed by the Arduino IDE to build for each family of boards.',
        cores ? cores.map(coreRow) : h('div.dim', '-')),

      panel('folder', 'Storage', null,
        h('div.row.wrap',
          h('button.btn', { onclick: () => info && window.vf.app.openPath(info.downloads) }, icon('download'), 'Downloads'),
          h('button.btn', { onclick: () => info && window.vf.app.openPath(info.userData) }, icon('folder'), 'Data')),
        info ? h('small.dim.mono', info.userData) : null),

      updatesPanel(st),

      panel('info', 'About', null,
        h('div', `VoltFlash ${info ? info.version : ''}`),
        null));
  }

  async function refresh() {
    try {
      [tools, info] = await Promise.all([call(window.vf.tools.status()), call(window.vf.app.info())]);
      cores = tools['arduino-cli'].installed ? await call(window.vf.arduino.cores()) : null;
    } catch (e) {
      errorToast(e);
    }
    if (state.view === 'settings') render();
  }

  window.vf.tools.onProgress((p) => {
    if (installing[p.tool] !== undefined) {
      installing[p.tool] = `${p.stage}${p.pct ? ` · ${p.pct}%` : ''}`;
      if (state.view === 'settings') render();
    }
  });
  bus.on('update', () => { if (state.view === 'settings' && !document.activeElement.matches('input')) render(); });
  bus.on('settings', () => { if (state.view === 'settings' && !document.activeElement.matches('input')) render(); });

  VF.views.settings = {
    el,
    show() { render(); refresh(); },
  };
})();
