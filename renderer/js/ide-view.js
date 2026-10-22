/* Mini Arduino IDE: sketches, a Monaco editor, compile/upload through arduino-cli, libraries. */
(function () {
  const { h, icon, clear, call, toast, errorToast, modal, confirmBox, promptBox, state, fmtBytes } = VF;

  const GROUP_TO_CAT = { ESP32: 'esp32', 'ESP32-S3': 'esp32s3', CYD: 'cyd', M5Stack: 'm5stack', Arduino: 'arduino' };
  const ARDUINO_WORDS = [
    'pinMode', 'digitalWrite', 'digitalRead', 'analogRead', 'analogWrite', 'analogReadResolution', 'delay', 'delayMicroseconds',
    'millis', 'micros', 'tone', 'noTone', 'pulseIn', 'shiftOut', 'shiftIn', 'attachInterrupt', 'detachInterrupt', 'map',
    'constrain', 'random', 'randomSeed', 'Serial.begin', 'Serial.print', 'Serial.println', 'Serial.printf', 'Serial.available',
    'Serial.read', 'Serial.readStringUntil', 'Serial.write', 'WiFi.begin', 'WiFi.status', 'WiFi.localIP', 'WiFi.mode',
    'WiFi.scanNetworks', 'WiFi.softAP', 'Wire.begin', 'Wire.beginTransmission', 'Wire.endTransmission', 'Wire.requestFrom',
    'SPI.begin', 'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN', 'WL_CONNECTED', 'String', 'byte', 'boolean',
    'setup', 'loop', 'ledcAttach', 'ledcWrite', 'touchRead', 'esp_deep_sleep_start', 'ESP.restart', 'Preferences',
  ];

  const el = h('section.view#view-ide');
  const s = {
    boards: [],
    sketches: [],
    sketch: null,
    files: [],
    models: {},
    active: null,
    boardId: 'esp32',
    busy: false,
    lastBuild: null,
    monacoReady: null,
  };
  let editor = null;

  // ---------- layout ----------
  const sketchList = h('div.ide-list');
  const fileList = h('div.ide-files');
  const boardSelect = h('select.select', { title: 'Board', onchange: () => setBoard(boardSelect.value) });
  const verifyBtn = h('button.btn.btn-verify', { title: 'Compile (Ctrl+R)', onclick: () => verify() }, icon('check'), 'Verify');
  const uploadBtn = h('button.btn.btn-upload', { title: 'Compile and upload (Ctrl+U)', onclick: () => upload() }, icon('arrow'), 'Upload');
  const saveBtn = h('button.btn.btn-icon', { title: 'Save (Ctrl+S)', onclick: () => saveAll() }, icon('save'));
  const libBtn = h('button.btn', { onclick: () => openLibraries() }, icon('book'), 'Libraries');
  const addToStoreBtn = h('button.btn', { title: 'Add the last build to My Projects', onclick: () => addBuildToStore(), disabled: true }, icon('package'), 'Add to Store');
  const usage = h('div.usage');
  const tabs = h('div.editor-tabs');
  const host = h('div.editor-host');
  const outLog = h('div.log');
  const outBar = h('div');
  const outProg = h('div.progress', { style: { display: 'none' } }, outBar);
  const outStatus = h('span.dim');
  const cancelBtn = h('button.btn.btn-sm.btn-danger', { style: { display: 'none' }, onclick: () => window.vf.arduino.cancel() }, icon('stop'), 'Stop');
  const emptyState = h('div.empty', { style: { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', background: '#1e1e1e' } },
    h('div', icon('code'), h('h3', 'No sketch open'), h('p', 'Create a new sketch from a template to get started.'),
      h('button.btn.btn-accent', { onclick: () => newSketch() }, icon('plus'), 'New sketch')));

  el.appendChild(h('div.ide',
    h('aside.ide-side',
      h('div.ide-side-head', h('h3', 'Sketches'), h('button.btn.btn-sm.btn-accent', { onclick: () => newSketch() }, icon('plus'), 'New')),
      sketchList,
      fileList),
    h('div.ide-main',
      h('div.ide-toolbar', verifyBtn, uploadBtn, h('div.sep'), boardSelect, saveBtn, libBtn, addToStoreBtn, h('div.spacer'), usage),
      h('div.editor-area', { style: { position: 'relative' } }, tabs, host, emptyState),
      h('div.ide-out',
        h('div.ide-out-head', h('b', 'Output'), outStatus, h('div.spacer'), outProg, cancelBtn,
          h('button.btn.btn-sm.btn-ghost', { onclick: () => clear(outLog) }, 'Clear')),
        outLog))));

  // ---------- monaco ----------
  function loadMonaco() {
    if (s.monacoReady) return s.monacoReady;
    s.monacoReady = new Promise((resolve, reject) => {
      const base = new URL('../node_modules/monaco-editor/min/', location.href).href;
      const script = document.createElement('script');
      script.src = base + 'vs/loader.js';
      script.onerror = () => reject(new Error('Could not load the code editor'));
      script.onload = () => {
        window.require.config({ paths: { vs: base + 'vs' } });
        window.MonacoEnvironment = {
          getWorkerUrl: () => 'data:text/javascript;charset=utf-8,' + encodeURIComponent(
            `self.MonacoEnvironment={baseUrl:'${base}'};importScripts('${base}vs/base/worker/workerMain.js');`),
        };
        window.require(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
      };
      document.head.appendChild(script);
    }).then((monaco) => {
      monaco.editor.defineTheme('voltflash', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'keyword', foreground: 'ffc83d' },
          { token: 'string', foreground: '7ee787' },
          { token: 'number', foreground: '79c0ff' },
          { token: 'comment', foreground: '6f7a92', fontStyle: 'italic' },
        ],
        colors: { 'editor.background': '#1e1e1e', 'editorCursor.foreground': '#ffc83d', 'editor.lineHighlightBackground': '#262b36' },
      });
      monaco.languages.registerCompletionItemProvider('cpp', {
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
          return {
            suggestions: ARDUINO_WORDS.map((w) => ({
              label: w,
              kind: /^[A-Z_]+$/.test(w) ? monaco.languages.CompletionItemKind.Constant : monaco.languages.CompletionItemKind.Function,
              insertText: w,
              range,
            })),
          };
        },
      });
      editor = monaco.editor.create(host, {
        theme: 'voltflash',
        automaticLayout: true,
        fontFamily: 'Cascadia Code, Consolas, monospace',
        fontSize: 14,
        fontLigatures: true,
        minimap: { enabled: true, scale: 1 },
        smoothScrolling: true,
        cursorSmoothCaretAnimation: 'on',
        renderWhitespace: 'selection',
        tabSize: 2,
        scrollBeyondLastLine: false,
        padding: { top: 10 },
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveAll());
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR, () => verify());
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU, () => upload());
      return monaco;
    });
    return s.monacoReady;
  }

  // ---------- rendering ----------
  function renderBoards() {
    clear(boardSelect);
    const groups = {};
    for (const b of s.boards) (groups[b.group] = groups[b.group] || []).push(b);
    for (const [g, list] of Object.entries(groups)) {
      boardSelect.appendChild(h('optgroup', { label: g }, list.map((b) => h('option', { value: b.id, selected: b.id === s.boardId }, b.name))));
    }
  }

  function renderSketches() {
    clear(sketchList);
    if (!s.sketches.length) sketchList.appendChild(h('div.dim', { style: { padding: '10px', fontSize: '12.5px' } }, 'No sketches yet.'));
    for (const sk of s.sketches) {
      const board = s.boards.find((b) => b.id === sk.board);
      sketchList.appendChild(h('div.ide-item' + (s.sketch === sk.name ? '.active' : ''), { onclick: () => openSketch(sk.name), title: sk.name },
        icon('folder'), h('span.grow', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, sk.name),
        board ? h('span.sub', board.group) : null));
    }
  }

  function renderFiles() {
    clear(fileList);
    if (!s.sketch) return;
    fileList.appendChild(h('div.row', { style: { padding: '4px 6px 6px' } },
      h('b.dim.grow', { style: { fontSize: '11px', letterSpacing: '.6px', textTransform: 'uppercase' } }, 'Files'),
      h('button.btn.btn-sm.btn-ghost.btn-icon', { title: 'New file', onclick: addFile }, icon('plus')),
      h('button.btn.btn-sm.btn-ghost.btn-icon', { title: 'Open sketch folder', onclick: async () => window.vf.app.openPath(await call(window.vf.sketch.dir(s.sketch))) }, icon('folder')),
      h('button.btn.btn-sm.btn-ghost.btn-icon.btn-danger', { title: 'Move sketch to Recycle Bin', onclick: trashSketch }, icon('trash'))));
    for (const f of s.files) {
      fileList.appendChild(h('div.ide-item' + (s.active === f ? '.active' : ''), { onclick: () => activate(f) }, icon('file'), f));
    }
  }

  function renderTabs() {
    clear(tabs);
    for (const f of s.files) {
      const m = s.models[f];
      if (!m) continue;
      tabs.appendChild(h('div.editor-tab' + (s.active === f ? '.active' : ''), { onclick: () => activate(f) }, f, m.dirty ? h('span.dirty') : null));
    }
  }

  function setBusy(busy, label) {
    s.busy = busy;
    verifyBtn.disabled = busy || !s.sketch;
    uploadBtn.disabled = busy || !s.sketch;
    cancelBtn.style.display = busy ? '' : 'none';
    outProg.style.display = busy ? '' : 'none';
    outProg.classList.toggle('indeterminate', busy);
    outStatus.textContent = label || '';
  }

  function log(text, cls) {
    outLog.appendChild(h('span' + (cls ? '.' + cls : ''), text + '\n'));
    while (outLog.childNodes.length > 3000) outLog.removeChild(outLog.firstChild);
    outLog.scrollTop = outLog.scrollHeight;
  }

  window.vf.arduino.onLog((p) => {
    const cls = p.type === 'cmd' ? 'cmd' : p.type === 'done' ? 'ok' : p.type === 'info' || p.type === 'tool' ? 'info'
      : /error|fatal/i.test(p.text) ? 'err' : /warning/i.test(p.text) ? 'info' : '';
    log(p.text, cls);
    if (p.pct !== undefined) {
      outProg.classList.remove('indeterminate');
      outBar.style.width = p.pct + '%';
    }
  });

  // ---------- sketches ----------
  async function refreshSketches() {
    s.sketches = await call(window.vf.sketch.list());
    renderSketches();
  }

  async function openSketch(name) {
    if (s.sketch && Object.values(s.models).some((m) => m.dirty)) await saveAll();
    const monaco = await loadMonaco();
    for (const m of Object.values(s.models)) m.model.dispose();
    s.models = {};
    s.sketch = name;
    s.lastBuild = null;
    addToStoreBtn.disabled = true;
    clear(usage);
    s.files = await call(window.vf.sketch.files(name));
    for (const f of s.files) {
      const text = await call(window.vf.sketch.read(name, f));
      const model = monaco.editor.createModel(text, /\.(md|txt)$/.test(f) ? 'plaintext' : /\.json$/.test(f) ? 'json' : 'cpp');
      const entry = { model, dirty: false };
      model.onDidChangeContent(() => { if (!entry.dirty) { entry.dirty = true; renderTabs(); } });
      s.models[f] = entry;
    }
    const meta = s.sketches.find((x) => x.name === name);
    if (meta && meta.board && s.boards.some((b) => b.id === meta.board)) {
      s.boardId = meta.board;
      boardSelect.value = s.boardId;
    }
    emptyState.style.display = 'none';
    setBusy(false);
    activate(s.files[0]);
    renderSketches();
  }

  function activate(file) {
    if (!s.models[file]) return;
    s.active = file;
    editor.setModel(s.models[file].model);
    editor.focus();
    renderTabs();
    renderFiles();
  }

  async function saveAll() {
    if (!s.sketch) return;
    for (const [f, m] of Object.entries(s.models)) {
      if (!m.dirty) continue;
      await call(window.vf.sketch.write(s.sketch, f, m.model.getValue()));
      m.dirty = false;
    }
    renderTabs();
  }

  async function setBoard(id) {
    s.boardId = id;
    await VF.saveSettings({ ideBoard: id });
    if (s.sketch) {
      await call(window.vf.sketch.setBoard(s.sketch, id));
      const sk = s.sketches.find((x) => x.name === s.sketch);
      if (sk) sk.board = id;
      renderSketches();
    }
  }

  function newSketch() {
    call(window.vf.sketch.templates()).then((templates) => {
      let chosen = templates[1] ? templates[1].id : templates[0].id;
      const nameInput = h('input.input', { value: 'my_sketch_' + (s.sketches.length + 1), spellcheck: false });
      const err = h('small', { style: { color: 'var(--red)' } });
      const list = h('div.asset-list', { style: { maxHeight: '300px' } });
      const drawList = () => {
        clear(list);
        for (const t of templates) {
          const board = s.boards.find((b) => b.id === t.board);
          list.appendChild(h('div.asset' + (chosen === t.id ? '.selected' : ''), { onclick: () => { chosen = t.id; drawList(); } },
            h('span.radio'), h('span.grow', t.name), h('span.meta', board ? board.group : ''), t.libs.length ? h('span.meta', 'needs ' + t.libs.join(', ')) : null));
        }
      };
      drawList();
      const m = modal({
        title: 'New sketch',
        body: [h('label.field', h('span', 'Name'), nameInput, err), h('div.field', h('span', 'Start from'), list)],
      });
      const create = async () => {
        try {
          const name = nameInput.value.trim();
          const res = await call(window.vf.sketch.create(name, chosen));
          m.close();
          await refreshSketches();
          await openSketch(name);
          if (res.board) { s.boardId = res.board; boardSelect.value = res.board; }
          if (res.libs && res.libs.length) {
            toast('This template uses libraries', res.libs.join(', '), {
              timeout: 15000,
              actions: [{ label: 'Install them', primary: true, onClick: () => installLibs(res.libs) }],
            });
          }
        } catch (e) {
          err.textContent = e.message;
        }
      };
      nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
      m.setFoot(h('div.spacer'), h('button.btn', { onclick: () => m.close() }, 'Cancel'), h('button.btn.btn-accent', { onclick: create }, icon('plus'), 'Create'));
      setTimeout(() => nameInput.select(), 30);
    }).catch(errorToast);
  }

  async function addFile() {
    const name = await promptBox('New file', 'File name', { placeholder: 'config.h', okLabel: 'Create' });
    if (!name) return;
    try {
      await call(window.vf.sketch.addFile(s.sketch, name));
      await openSketch(s.sketch);
      activate(name);
    } catch (e) {
      errorToast(e);
    }
  }

  async function trashSketch() {
    const ok = await confirmBox('Delete sketch?', `"${s.sketch}" will be moved to the Recycle Bin. You can restore it from there.`, { okLabel: 'Move to Recycle Bin', danger: true });
    if (!ok) return;
    await call(window.vf.sketch.trash(s.sketch));
    for (const m of Object.values(s.models)) m.model.dispose();
    s.models = {};
    s.sketch = null;
    s.files = [];
    emptyState.style.display = 'grid';
    renderTabs();
    renderFiles();
    await refreshSketches();
  }

  // ---------- build ----------
  function board() {
    return s.boards.find((b) => b.id === s.boardId) || s.boards[0];
  }

  // The ESP32 package is ~1 GB, so ask before arduino-cli pulls it in.
  async function coreReady(fqbn) {
    const coreId = fqbn.split(':').slice(0, 2).join(':');
    const cores = await call(window.vf.arduino.cores());
    const core = cores.find((c) => c.id === coreId);
    if (!core || core.installed) return true;
    return confirmBox(`Install ${core.name} board package?`,
      `The first build for this board needs the ${core.name} package. ${core.note} It downloads once and is reused after that.`,
      { okLabel: 'Download and build' });
  }

  async function verify() {
    if (!s.sketch || s.busy) return;
    await saveAll();
    const b = board();
    if (!(await coreReady(b.fqbn))) return;
    setBusy(true, `Compiling for ${b.name}...`);
    clear(usage);
    try {
      const sketchDir = await call(window.vf.sketch.dir(s.sketch));
      const r = await call(window.vf.arduino.compile({ sketchDir, fqbn: b.fqbn }));
      buildDone(r);
      setBusy(false, 'Compiled');
      return r;
    } catch (e) {
      setBusy(false, 'Build failed');
      log(e.message, 'err');
      toast('Build failed', 'See the output panel for the error.', { type: 'err' });
    }
  }

  async function upload() {
    if (!s.sketch || s.busy) return;
    if (!state.port) return toast('No port selected', 'Plug in your board and pick its COM port at the top.', { type: 'err' });
    await saveAll();
    const b = board();
    if (!(await coreReady(b.fqbn))) return;
    await VF.releasePort();
    setBusy(true, `Uploading to ${state.port}...`);
    clear(usage);
    try {
      const sketchDir = await call(window.vf.sketch.dir(s.sketch));
      const r = await call(window.vf.arduino.upload({ sketchDir, fqbn: b.fqbn, port: state.port }));
      buildDone(r);
      setBusy(false, 'Uploaded');
      toast('Upload complete', `${s.sketch} is running on ${state.port}.`, {
        type: 'ok', actions: [{ label: 'Serial Monitor', onClick: () => VF.go('serial') }],
      });
    } catch (e) {
      setBusy(false, 'Upload failed');
      log(e.message, 'err');
      toast('Upload failed', /No serial data|Failed to connect/i.test(e.message)
        ? 'Hold BOOT, tap RESET, release BOOT and try again.' : 'See the output panel for details.', { type: 'err' });
    }
  }

  function buildDone(r) {
    s.lastBuild = r;
    addToStoreBtn.disabled = !r.best;
    clear(usage);
    if (r.flash) usage.appendChild(h('span', 'Flash ', h('b', `${r.flash.pct}%`), ` (${fmtBytes(r.flash.bytes)})`));
    if (r.ram) usage.appendChild(h('span', 'RAM ', h('b', `${r.ram.pct}%`), ` (${fmtBytes(r.ram.bytes)})`));
  }

  function addBuildToStore() {
    if (!s.lastBuild || !s.lastBuild.best) return;
    const b = board();
    VF.openAddProject(null, {
      source: 'file',
      path: s.lastBuild.best,
      name: s.sketch,
      categories: GROUP_TO_CAT[b.group] ? [GROUP_TO_CAT[b.group]] : [],
      fqbn: b.group === 'Arduino' ? b.fqbn : undefined,
    });
  }

  // ---------- libraries ----------
  async function installLibs(names) {
    for (const n of names) {
      try {
        log(`Installing library ${n}...`, 'info');
        await call(window.vf.arduino.libInstall(n));
      } catch (e) {
        log(e.message, 'err');
      }
    }
  }

  function openLibraries() {
    const m = modal({ title: 'Libraries', sub: 'Search the Arduino Library Manager and install with one click.', size: 'wide' });
    const q = h('input.input.grow', { placeholder: 'Search libraries (TFT_eSPI, FastLED, ArduinoJson...)', spellcheck: false });
    const results = h('div', { style: { display: 'grid', gap: '8px' } });
    let installed = [];
    const search = async () => {
      const term = q.value.trim();
      if (!term) return;
      clear(results).appendChild(h('div.row.muted', icon('spinner', 'spin'), 'Searching...'));
      try {
        const libs = await call(window.vf.arduino.libSearch(term));
        clear(results);
        if (!libs.length) results.appendChild(h('div.dim', 'No libraries found.'));
        for (const lib of libs) {
          const have = installed.find((i) => i.name === lib.name);
          const btn = h('button.btn.btn-sm' + (have ? '' : '.btn-accent'), { disabled: !!have }, have ? `Installed ${have.version}` : 'Install');
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Installing...';
            try {
              installed = await call(window.vf.arduino.libInstall(lib.name));
              btn.textContent = 'Installed';
              toast('Library installed', lib.name, { type: 'ok' });
            } catch (e) {
              btn.disabled = false;
              btn.textContent = 'Install';
              errorToast(e, 'Install failed');
            }
          });
          results.appendChild(h('div.lib-row',
            h('div.grow', h('h4', lib.name, h('span.dim', { style: { fontWeight: 400, fontSize: '12px' } }, `  ${lib.version || ''}${lib.author ? ' · ' + lib.author : ''}`)), h('p', lib.sentence || '')),
            btn));
        }
      } catch (e) {
        clear(results).appendChild(h('div.notice.err', { style: { margin: 0 } }, icon('alert'), e.message));
      }
    };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
    m.setBody(h('div.row', q, h('button.btn.btn-accent', { onclick: search }, icon('search'), 'Search')), results);
    call(window.vf.arduino.libList()).then((list) => {
      installed = list;
      if (!q.value && list.length) {
        results.appendChild(h('div.section-title', 'Installed'));
        for (const l of list) results.appendChild(h('div.lib-row', h('div.grow', h('h4', l.name), h('p', l.version))));
      }
    }).catch(() => {});
    setTimeout(() => q.focus(), 30);
  }

  document.addEventListener('keydown', (e) => {
    if (state.view !== 'ide' || !e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); saveAll(); }
    if (k === 'r') { e.preventDefault(); verify(); }
    if (k === 'u') { e.preventDefault(); upload(); }
  });

  let initialised = false;
  VF.views.ide = {
    el,
    async show() {
      if (initialised) { if (editor) editor.layout(); return; }
      initialised = true;
      try {
        s.boards = await call(window.vf.arduino.boards());
        s.boardId = state.settings.ideBoard && s.boards.some((b) => b.id === state.settings.ideBoard) ? state.settings.ideBoard : 'esp32';
        renderBoards();
        setBusy(false);
        await refreshSketches();
        await loadMonaco();
        if (s.sketches.length) await openSketch(s.sketches[0].name);
      } catch (e) {
        errorToast(e, 'IDE failed to start');
      }
    },
  };
})();
