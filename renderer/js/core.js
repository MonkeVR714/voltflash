/* Shared helpers: icons, element builder, IPC unwrapping, state, modals, toasts. */
(function () {
  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    upload: '<path d="M12 15V3m0 0-4 4m4-4 4 4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    download: '<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    code: '<path d="m8 6-6 6 6 6M16 6l6 6-6 6"/>',
    terminal: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m6 9 4 3-4 3M12 15h6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    reset: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    github: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M18 10.5c0 4-6 3-11 5.5"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    usb: '<path d="M12 2v14"/><circle cx="12" cy="19" r="2.5"/><path d="M12 12 7 9V6M12 10l5-3V5"/><rect x="5.5" y="3.5" width="3" height="3"/><circle cx="17" cy="4" r="1.5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
    save: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5"/>',
    package: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
    eraser: '<path d="m7 21-4-4 11-11 7 7-8 8z"/><path d="M7 21h14"/>',
    plug: '<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 9v5M12 17.5v.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    spinner: '<path d="M21 12a9 9 0 1 1-6.2-8.6"/>',
  };

  function icon(name, cls = '') {
    const span = document.createElement('span');
    span.className = 'icon ' + cls;
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
    return span;
  }

  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      el.replaceWith(icon(el.dataset.icon, el.className));
    });
  }

  // h('div.card', {onclick}, child, 'text', [children])
  function h(sel, attrs, ...children) {
    if (attrs instanceof Node || typeof attrs === 'string' || Array.isArray(attrs)) {
      children.unshift(attrs);
      attrs = null;
    }
    const tag = (sel.match(/^[a-z][a-z0-9-]*/i) || ['div'])[0];
    const id = (sel.match(/#([\w-]+)/) || [])[1];
    const classes = Array.from(sel.matchAll(/\.([\w-]+)/g), (m) => m[1]);
    const el = document.createElement(tag);
    if (id) el.id = id;
    if (classes.length) el.className = classes.join(' ');
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'style' && typeof v === 'object') {
          for (const [prop, val] of Object.entries(v)) {
            if (prop.startsWith('--')) el.style.setProperty(prop, val);
            else el.style[prop] = val;
          }
        }
        else if (k === 'class') el.className += ' ' + v;
        else if (k === 'html') el.innerHTML = v;
        else if (k in el && typeof v !== 'string') el[k] = v;
        else if (k === 'value') el.value = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, children);
    return el;
  }

  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  // IPC handlers return {ok,data}|{ok:false,error}; turn that into data or a throw.
  async function call(promise) {
    const r = await promise;
    if (!r || !r.ok) throw new Error((r && r.error) || 'Unknown error');
    return r.data;
  }

  const listeners = {};
  const bus = {
    on(ev, fn) {
      (listeners[ev] = listeners[ev] || []).push(fn);
      return () => (listeners[ev] = listeners[ev].filter((f) => f !== fn));
    },
    emit(ev, payload) {
      (listeners[ev] || []).forEach((fn) => {
        try { fn(payload); } catch (e) { console.error(e); }
      });
    },
  };

  const CATS = [
    { id: 'all', name: 'All Firmware', color: 'var(--accent)', desc: 'Everything in the store, from every category.' },
    { id: 'esp32', name: 'ESP32', color: 'var(--cat-esp32)', desc: 'Classic ESP32 dev kits and boards (ESP32-WROOM, WROVER, D1 Mini 32...).' },
    { id: 'esp32s3', name: 'ESP32-S3', color: 'var(--cat-esp32s3)', desc: 'ESP32-S3 boards with native USB, more RAM and AI acceleration.' },
    { id: 'cyd', name: 'CYD', color: 'var(--cat-cyd)', desc: 'Cheap Yellow Display: ESP32-2432S028 and friends with a built-in touch screen.' },
    { id: 'm5stack', name: 'M5Stack', color: 'var(--cat-m5stack)', desc: 'M5Stack Core, Core2, CoreS3, StickC, Cardputer and Atom devices.' },
    { id: 'arduino', name: 'Arduino', color: 'var(--cat-arduino)', desc: 'AVR boards like the Uno, Nano and Mega. Flashes .hex files.' },
    { id: 'mine', name: 'My Projects', color: 'var(--cat-mine)', desc: 'Firmware you added yourself, from GitHub repos, local files or your own sketches.' },
  ];
  const catById = (id) => CATS.find((c) => c.id === id) || CATS[0];

  function fmtBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(n > 100 * 1024 * 1024 ? 0 : 1) + ' MB';
  }

  function timeAgo(date) {
    if (!date) return 'latest';
    const s = (Date.now() - new Date(date).getTime()) / 1000;
    if (!isFinite(s)) return '';
    const units = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
    for (const [sec, name] of units) {
      const v = Math.floor(s / sec);
      if (v >= 1) return `${v} ${name}${v > 1 ? 's' : ''} ago`;
    }
    return 'just now';
  }

  const hex = (n) => '0x' + Number(n || 0).toString(16).toUpperCase();

  // ---------- toasts ----------
  function toast(title, msg, opts = {}) {
    const root = document.getElementById('toasts');
    const el = h('div.toast.' + (opts.type || 'info'),
      h('div.t-body',
        h('div.t-title', title),
        msg ? h('div.t-msg', msg) : null,
        opts.actions ? h('div.t-actions', opts.actions.map((a) =>
          h('button.btn.btn-sm' + (a.primary ? '.btn-accent' : ''), { onclick: () => { a.onClick(); dismiss(); } }, a.label))) : null),
      h('button.btn.btn-ghost.btn-sm.btn-icon', { onclick: () => dismiss(), title: 'Dismiss' }, icon('x')));
    root.appendChild(el);
    const dismiss = () => el.remove();
    const timeout = opts.timeout === undefined ? (opts.type === 'err' ? 9000 : 5000) : opts.timeout;
    if (timeout) setTimeout(dismiss, timeout);
    return dismiss;
  }

  function errorToast(err, title = 'Something went wrong') {
    console.error(err);
    toast(title, err && err.message ? err.message : String(err), { type: 'err' });
  }

  // ---------- modals ----------
  function modal({ title, sub, body, foot, size = '', lock = false, onClose } = {}) {
    const root = document.getElementById('modalRoot');
    const bodyEl = h('div.modal-body');
    const footEl = h('div.modal-foot');
    const subEl = h('div.sub', sub || '');
    const titleEl = h('h2', title || '');
    let locked = lock;
    const closeBtn = h('button.btn.btn-ghost.btn-icon', { title: 'Close', onclick: () => api.close() }, icon('x'));
    const box = h('div.modal' + (size ? '.' + size : ''),
      h('div.modal-head', h('div.grow', titleEl, subEl), closeBtn), bodyEl, footEl);
    const backdrop = h('div.modal-backdrop', { onmousedown: (e) => { if (e.target === backdrop && !locked) api.close(); } }, box);
    const onKey = (e) => { if (e.key === 'Escape' && !locked) api.close(); };
    document.addEventListener('keydown', onKey);

    const api = {
      el: box,
      body: bodyEl,
      setTitle(t, s) { titleEl.textContent = t; if (s !== undefined) subEl.textContent = s; },
      setBody(...nodes) { append(clear(bodyEl), nodes); },
      setFoot(...nodes) { append(clear(footEl), nodes); footEl.style.display = nodes.flat().filter(Boolean).length ? '' : 'none'; },
      lock(v) { locked = v; closeBtn.disabled = v; },
      close() {
        if (!backdrop.isConnected) return;
        document.removeEventListener('keydown', onKey);
        backdrop.remove();
        if (onClose) onClose();
      },
    };
    if (body) api.setBody(body);
    api.setFoot(foot || []);
    root.appendChild(backdrop);
    return api;
  }

  function confirmBox(title, message, { okLabel = 'OK', danger = false } = {}) {
    return new Promise((resolve) => {
      let answered = false;
      const m = modal({
        title, size: 'narrow',
        body: h('p.muted', { style: { margin: 0 } }, message),
        onClose: () => { if (!answered) resolve(false); },
      });
      m.setFoot(
        h('div.spacer'),
        h('button.btn', { onclick: () => m.close() }, 'Cancel'),
        h('button.btn' + (danger ? '.btn-danger' : '.btn-accent'), { onclick: () => { answered = true; resolve(true); m.close(); } }, okLabel));
    });
  }

  function promptBox(title, label, { value = '', placeholder = '', okLabel = 'OK', validate } = {}) {
    return new Promise((resolve) => {
      let answered = false;
      const input = h('input.input', { value, placeholder, spellcheck: false });
      const err = h('small', { style: { color: 'var(--red)' } });
      const submit = () => {
        const v = input.value.trim();
        const problem = validate && validate(v);
        if (problem) { err.textContent = problem; return; }
        answered = true; resolve(v); m.close();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      const m = modal({
        title, size: 'narrow',
        body: h('label.field', h('span', label), input, err),
        onClose: () => { if (!answered) resolve(null); },
      });
      m.setFoot(h('div.spacer'), h('button.btn', { onclick: () => m.close() }, 'Cancel'), h('button.btn.btn-accent', { onclick: submit }, okLabel));
      setTimeout(() => input.focus(), 30);
    });
  }

  // ---------- app state ----------
  const state = {
    port: '',
    ports: [],
    settings: {},
    catalog: { firmware: [] },
    projects: [],
    detected: {},
    view: 'store:all',
    serialConnected: false,
  };

  async function saveSettings(patch) {
    state.settings = await call(window.vf.settings.set(patch));
    bus.emit('settings', state.settings);
  }

  // Anything that opens the COM port (flashing, uploading) calls this first so
  // the serial monitor lets go of it.
  async function releasePort() {
    if (state.serialConnected) {
      bus.emit('serial:release');
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  const BAUDS = [115200, 230400, 460800, 921600, 1500000, 2000000];

  window.VF = {
    h, icon, hydrateIcons, clear, append, call, bus, CATS, catById, fmtBytes, timeAgo, hex,
    toast, errorToast, modal, confirmBox, promptBox, state, saveSettings, releasePort, BAUDS,
    views: {},
  };
})();
