/* Built-in web browser. Firmware downloaded here can be flashed straight away,
   and GitHub repo pages get a bar for adding them to My Projects. */
(function () {
  const { h, icon, toast, state } = VF;

  const QUICK = [
    { label: 'ESP32 projects', url: 'https://github.com/topics/esp32' },
    { label: 'CYD projects', url: 'https://github.com/topics/cheap-yellow-display' },
    { label: 'CYD guide', url: 'https://github.com/witnessmenow/ESP32-Cheap-Yellow-Display' },
    { label: 'M5Stack docs', url: 'https://docs.m5stack.com/en/start/intro' },
    { label: 'M5Stack on GitHub', url: 'https://github.com/m5stack' },
    { label: 'Arduino libraries', url: 'https://www.arduino.cc/reference/en/libraries/' },
    { label: 'ESP32 Arduino docs', url: 'https://docs.espressif.com/projects/arduino-esp32/en/latest/' },
    { label: 'Random Nerd Tutorials', url: 'https://randomnerdtutorials.com/projects-esp32/' },
  ];

  const el = h('section.view#view-browser');
  let webview = null;
  let ready = false;

  const backBtn = h('button.btn.btn-icon', { title: 'Back', onclick: () => ready && webview.canGoBack() && webview.goBack() }, icon('back'));
  const fwdBtn = h('button.btn.btn-icon', { title: 'Forward', onclick: () => ready && webview.canGoForward() && webview.goForward() }, h('span', { style: { transform: 'scaleX(-1)', display: 'inline-flex' } }, icon('back')));
  const reloadBtn = h('button.btn.btn-icon', { title: 'Reload', onclick: () => ready && webview.reload() }, icon('refresh'));
  const homeBtn = h('button.btn.btn-icon', { title: 'Home', onclick: () => navigate(state.settings.browserHome || QUICK[0].url) }, icon('home'));
  const urlInput = h('input.input.url.mono', { spellcheck: false, placeholder: 'Search or type a web address' });
  const extBtn = h('button.btn.btn-icon', { title: 'Open in your normal browser', onclick: () => ready && window.vf.app.openExternal(webview.getURL()) }, icon('external'));
  const loading = h('div.browser-loading', h('div'));
  const repoText = h('span.grow');
  const repoBanner = h('div.repo-banner', icon('github'), repoText);
  const wrap = h('div.browser-wrap', loading);

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigate(urlInput.value);
  });
  urlInput.addEventListener('focus', () => urlInput.select());

  el.append(
    h('div.browser-bar', backBtn, fwdBtn, reloadBtn, homeBtn, urlInput, extBtn),
    h('div.quick-links', QUICK.map((q) => h('span.chip', { onclick: () => navigate(q.url) }, q.label))),
    repoBanner,
    wrap);

  function toUrl(input) {
    const v = input.trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v)) return 'https://' + v;
    return 'https://duckduckgo.com/?q=' + encodeURIComponent(v);
  }

  function ensureWebview(url) {
    if (webview) return;
    webview = document.createElement('webview');
    webview.setAttribute('partition', 'persist:vf-browser');
    webview.setAttribute('src', url);
    wrap.appendChild(webview);
    webview.addEventListener('dom-ready', () => { ready = true; updateNav(); });
    webview.addEventListener('did-start-loading', () => loading.classList.add('on'));
    webview.addEventListener('did-stop-loading', () => { loading.classList.remove('on'); updateNav(); });
    webview.addEventListener('did-navigate', updateNav);
    webview.addEventListener('did-navigate-in-page', updateNav);
  }

  function navigate(input) {
    const url = toUrl(input);
    if (!url) return;
    if (!webview) ensureWebview(url);
    else if (!ready) webview.setAttribute('src', url);
    else webview.loadURL(url).catch(() => {});
    urlInput.value = url;
  }

  const RESERVED = /^(topics|orgs|settings|marketplace|explore|features|about|pricing|login|signup|search|sponsors|notifications|new|collections|trending|apps|enterprise|customer-stories|security|readme)$/i;

  function updateNav() {
    if (!ready) return;
    const url = webview.getURL();
    if (document.activeElement !== urlInput) urlInput.value = url;
    backBtn.disabled = !webview.canGoBack();
    fwdBtn.disabled = !webview.canGoForward();

    const m = url.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/i);
    if (m && !RESERVED.test(m[1])) {
      const repo = `${m[1]}/${m[2].replace(/\.git$/, '')}`;
      const known = [...(state.catalog.firmware || []), ...state.projects].find((e) => (e.repo || '').toLowerCase() === repo.toLowerCase());
      VF.clear(repoText).append(h('b', repo), known ? h('span.dim', `  · already in ${state.projects.includes(known) ? 'My Projects' : 'the store'}`) : '');
      VF.clear(repoBanner).append(icon('github'), repoText,
        h('button.btn.btn-sm.btn-accent', { onclick: () => VF.openFlash({ entry: known || { name: m[2], repo } }) }, icon('bolt'), 'Flash from releases'),
        known ? null : h('button.btn.btn-sm', { onclick: () => VF.openAddProject(null, { repo, source: 'github' }) }, icon('plus'), 'Add to My Projects'));
      repoBanner.classList.add('show');
    } else {
      repoBanner.classList.remove('show');
    }
  }

  // Downloads from the built-in browser
  const pending = new Map();
  window.vf.browser.onDownload((d) => {
    if (d.state === 'started') {
      pending.set(d.id, toast('Downloading', d.name, { timeout: 0 }));
    } else if (d.state === 'completed' || d.state === 'cancelled' || d.state === 'interrupted') {
      const close = pending.get(d.id);
      if (close) close();
      pending.delete(d.id);
      if (d.state !== 'completed') return toast('Download stopped', d.name, { type: 'err' });
      const flashable = /\.(bin|hex)$/i.test(d.name);
      toast('Downloaded', d.name, {
        type: 'ok',
        timeout: 12000,
        actions: [
          flashable ? { label: 'Flash it', primary: true, onClick: () => VF.openFlash({ file: d.path }) } : null,
          flashable ? { label: 'Add to My Projects', onClick: () => VF.openAddProject(null, { source: 'file', path: d.path, name: d.name.replace(/\.(bin|hex)$/i, '') }) } : null,
          { label: 'Show in folder', onClick: () => window.vf.app.showItem(d.path) },
        ].filter(Boolean),
      });
    }
  });

  VF.views.browser = {
    el,
    show() {
      if (!webview) navigate(state.settings.browserHome || QUICK[0].url);
    },
  };

  VF.openInBrowser = (url) => {
    VF.go('browser');
    navigate(url);
  };
})();
