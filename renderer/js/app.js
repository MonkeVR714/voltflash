/* App shell: sidebar navigation, COM port picker, status bar, drag and drop, startup. */
(function () {
  const { h, icon, clear, call, toast, errorToast, state, CATS, bus } = VF;

  const sidebar = document.getElementById('sidebar');
  const content = document.getElementById('content');
  const statusbar = document.getElementById('statusbar');
  const portPicker = document.getElementById('portPicker');

  for (const v of Object.values(VF.views)) content.appendChild(v.el);

  window.addEventListener('unhandledrejection', (e) => console.error('Unhandled rejection:', e.reason && (e.reason.stack || e.reason.message || e.reason)));
  window.addEventListener('error', (e) => console.error('Uncaught error:', e.message, e.filename, e.lineno));

  // ---------- navigation ----------
  const TOOLS_NAV = [
    { id: 'browser', name: 'Browser', icon: 'globe' },
    { id: 'ide', name: 'Arduino IDE', icon: 'code' },
    { id: 'serial', name: 'Serial Monitor', icon: 'terminal' },
    { id: 'backups', name: 'Backups', icon: 'save' },
  ];

  function renderSidebar() {
    const counts = VF.views.store.counts();
    VF.append(clear(sidebar), [
      h('div.nav-title', 'Firmware Store'),
      CATS.map((c) => h('div.nav-item' + (state.view === 'store:' + c.id ? '.active' : ''), {
        style: { '--nav-color': c.color },
        onclick: () => go('store:' + c.id),
      }, c.id === 'all' ? icon('grid') : h('span.nav-swatch', { style: { '--nav-color': c.color } }), c.name, h('span.nav-count', counts[c.id]))),
      h('div.nav-title', 'Tools'),
      TOOLS_NAV.map((t) => h('div.nav-item' + (state.view === t.id ? '.active' : ''), { onclick: () => go(t.id) },
        icon(t.icon), t.name, t.id === 'serial' && state.serialConnected ? h('span.port-dot.on', { style: { marginLeft: 'auto' } }) : null)),
      h('div.sidebar-foot',
        h('div.nav-item' + (state.view === 'settings' ? '.active' : ''), { onclick: () => go('settings') }, icon('settings'), 'Settings'))]);
  }

  function go(view) {
    state.view = view;
    const [name, arg] = view.split(':');
    for (const [key, v] of Object.entries(VF.views)) v.el.classList.toggle('active', key === name);
    const v = VF.views[name];
    if (v) v.show(arg);
    document.querySelector('.search').style.visibility = name === 'store' ? 'visible' : 'hidden';
    renderSidebar();
  }
  VF.go = go;

  // ---------- ports ----------
  function portLabel(p) {
    return `${p.port}  ·  ${p.chip || p.label}`;
  }

  function fillPortSelect(sel) {
    clear(sel);
    if (!state.ports.length) sel.appendChild(h('option', { value: '' }, 'No boards found, plug one in'));
    else if (!state.port) sel.appendChild(h('option', { value: '' }, 'Choose a port...'));
    for (const p of state.ports) sel.appendChild(h('option', { value: p.port, selected: p.port === state.port }, portLabel(p)));
    sel.title = state.port ? (state.ports.find((p) => p.port === state.port) || {}).label || state.port : 'Pick the COM port of your board';
  }

  // Port selects live in the title bar and in dialogs; all stay in sync.
  VF.portSelect = ({ full } = {}) => {
    const sel = h('select.select', { 'data-port-select': '1', style: full ? { width: '100%' } : null });
    sel.addEventListener('change', () => setPort(sel.value));
    fillPortSelect(sel);
    return sel;
  };

  function setPort(port) {
    state.port = port;
    if (port) VF.saveSettings({ lastPort: port }).catch(() => {});
    document.querySelectorAll('select[data-port-select]').forEach(fillPortSelect);
    bus.emit('port', port);
    renderStatus();
  }

  let firstScan = true;
  async function scanPorts() {
    try {
      const ports = await call(window.vf.ports.list());
      const before = new Set(state.ports.map((p) => p.port));
      const added = ports.filter((p) => !before.has(p.port));
      const changed = ports.length !== state.ports.length || added.length;
      state.ports = ports;
      if (!firstScan) {
        for (const p of added) {
          toast('Board connected', `${p.port} · ${p.chip || p.label}`, {
            type: 'ok',
            actions: [
              { label: 'Use it', primary: true, onClick: () => setPort(p.port) },
              { label: 'Detect chip', onClick: () => { setPort(p.port); detectBoard(p.port); } },
            ],
          });
        }
      }
      // Pick something sensible automatically.
      if (!state.port || !ports.some((p) => p.port === state.port)) {
        const last = ports.find((p) => p.port === state.settings.lastPort);
        const pick = last || ports.find((p) => p.likelyBoard) || (ports.length === 1 ? ports[0] : null);
        const next = pick ? pick.port : '';
        if (next !== state.port) setPort(next);
      }
      if (changed || firstScan) {
        document.querySelectorAll('select[data-port-select]').forEach(fillPortSelect);
        bus.emit('port', state.port);
        renderStatus();
      }
      firstScan = false;
    } catch (e) {
      console.warn('port scan failed', e);
    }
  }

  async function detectBoard(port) {
    const dismiss = toast('Detecting board', `Talking to ${port}...`, { timeout: 0 });
    await VF.releasePort();
    try {
      const info = await call(window.vf.flash.detect(port));
      state.detected[port] = info;
      dismiss();
      toast(info.chip || 'Board detected', [info.features, info.flashSize && `${info.flashSize} flash`, info.mac && `MAC ${info.mac}`].filter(Boolean).join(' · '), { type: 'ok', timeout: 9000 });
      bus.emit('port', port);
      return info;
    } catch (e) {
      dismiss();
      errorToast(e, 'Could not detect the board');
      return null;
    }
  }
  VF.detectBoard = detectBoard;

  portPicker.append(
    h('span.port-dot'),
    VF.portSelect(),
    h('button.btn.btn-icon', { title: 'Refresh ports', onclick: () => scanPorts() }, icon('refresh')),
    h('button.btn.btn-icon', { title: 'Detect the chip on this port', onclick: () => state.port ? detectBoard(state.port) : toast('No port selected', 'Plug in a board first.', { type: 'err' }) }, icon('chip')));
  bus.on('port', () => portPicker.querySelector('.port-dot').classList.toggle('on', !!state.port));

  // ---------- status bar ----------
  let toolsStatus = null;
  let toolProgress = null;

  function renderStatus() {
    const t = toolsStatus || {};
    const item = (cls, iconName, text, title) => h('span.item' + (cls ? '.' + cls : ''), { title: title || '' }, icon(iconName), text);
    const det = state.detected[state.port];
    VF.append(clear(statusbar), [
      toolProgress
        ? h('span.item', icon('download'), `${toolProgress.tool}: ${toolProgress.stage}`, h('span.mini-progress', h('div', { style: { width: (toolProgress.pct || 0) + '%' } })))
        : item(t.esptool && t.esptool.installed ? 'ok' : 'warn', 'bolt', t.esptool && t.esptool.installed ? `esptool ${t.esptool.version}` : 'esptool: downloads on first flash'),
      item(t['arduino-cli'] && t['arduino-cli'].installed ? 'ok' : '', 'code', t['arduino-cli'] && t['arduino-cli'].installed ? `arduino-cli ${t['arduino-cli'].version}` : 'arduino-cli: downloads when you first build'),
      item(state.port ? 'ok' : '', 'usb', state.port ? `${state.port}${det && det.chip ? ' · ' + det.chip : ''}` : `${state.ports.length} port${state.ports.length === 1 ? '' : 's'}`),
      h('span.spacer'),
      updateItem(),
      h('span.item', `${(state.catalog.firmware || []).length} firmware · ${state.projects.length} of yours`),
      h('span.item', `VoltFlash ${state.update ? state.update.current : ''}`)]);
  }

  // ---------- updates ----------
  function updateItem() {
    const u = state.update;
    if (!u) return null;
    if (u.status === 'downloading') {
      return h('span.item', icon('download'), `Downloading update ${u.version || ''}`, h('span.mini-progress', h('div', { style: { width: (u.pct || 0) + '%' } })));
    }
    if (u.status === 'ready') {
      return h('button.btn.btn-sm.btn-accent', { onclick: installUpdate }, icon('reset'), `Restart to update to ${u.version}`);
    }
    if (u.status === 'available') {
      return h('button.btn.btn-sm', { onclick: () => window.vf.app.openExternal(u.url) }, icon('download'), `VoltFlash ${u.version} is out`);
    }
    return null;
  }

  async function installUpdate() {
    try {
      await VF.releasePort();
      await call(window.vf.update.install());
    } catch (e) {
      errorToast(e, 'Could not install the update');
    }
  }
  VF.installUpdate = installUpdate;

  let announced = null;
  function onUpdateState(u) {
    state.update = u;
    renderStatus();
    bus.emit('update', u);
    if (u.status === 'ready' && announced !== u.version) {
      announced = u.version;
      toast(`VoltFlash ${u.version} is ready`, 'Restart now to update, or it will be installed the next time you open VoltFlash.', {
        type: 'ok',
        timeout: 0,
        actions: [{ label: 'Restart now', primary: true, onClick: installUpdate }, { label: 'Later', onClick: () => {} }],
      });
    }
    if (u.status === 'available' && announced !== u.version) {
      announced = u.version;
      toast(`VoltFlash ${u.version} is out`, 'This portable copy can\'t update itself. Download the new version from GitHub.', {
        timeout: 0,
        actions: [{ label: 'Download', primary: true, onClick: () => window.vf.app.openExternal(u.url) }],
      });
    }
  }
  window.vf.update.onState(onUpdateState);

  window.vf.tools.onProgress((p) => {
    toolProgress = p.pct >= 100 ? null : p;
    renderStatus();
    if (p.pct >= 100) refreshTools();
  });

  async function refreshTools() {
    try {
      toolsStatus = await call(window.vf.tools.status());
    } catch {}
    renderStatus();
  }

  // ---------- search ----------
  const search = document.getElementById('search');
  search.addEventListener('input', () => {
    state.search = search.value.trim();
    if (!state.view.startsWith('store')) go('store:all');
    bus.emit('search');
  });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'f' && state.view.startsWith('store')) {
      e.preventDefault();
      search.focus();
    }
  });

  // ---------- drag & drop ----------
  const overlay = document.getElementById('dropOverlay');
  let dragDepth = 0;
  const hasFiles = (e) => Array.from(e.dataTransfer.types || []).includes('Files');
  window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; overlay.classList.add('show'); } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) overlay.classList.remove('show'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    overlay.classList.remove('show');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const p = window.vf.app.pathForFile(file);
    if (!/\.(bin|hex)$/i.test(p)) return toast('Not a firmware file', 'Drop a .bin or .hex file.', { type: 'err' });
    VF.openFlash({ file: p });
  });

  document.getElementById('flashFileBtn').addEventListener('click', () => VF.openFlash({}));

  // ---------- catalog ----------
  VF.loadCatalog = async (force) => {
    try {
      state.catalog = await call(window.vf.catalog.get(!!force));
    } catch (e) {
      errorToast(e, 'Could not load the catalog');
    }
    bus.emit('catalog');
  };
  bus.on('catalog', () => { renderSidebar(); renderStatus(); });
  bus.on('serial:state', renderSidebar);

  // ---------- startup ----------
  (async function start() {
    VF.hydrateIcons();
    try {
      state.settings = await call(window.vf.settings.get());
      state.port = state.settings.lastPort || '';
      state.projects = await call(window.vf.projects.list());
    } catch (e) {
      errorToast(e, 'Could not load settings');
    }
    try {
      state.update = await call(window.vf.update.state());
    } catch {}
    await VF.loadCatalog(false);
    go('store:all');
    await scanPorts();
    setInterval(() => { if (document.hasFocus()) scanPorts(); }, 3000);
    await refreshTools();

    // Fetch esptool in the background on first run so the first flash is instant.
    if (toolsStatus && !toolsStatus.esptool.installed) {
      call(window.vf.tools.install('esptool')).then(refreshTools).catch((e) => {
        toolProgress = null;
        renderStatus();
        console.warn('esptool background install failed', e);
      });
    }
  })();
})();
