/* The flash dialog: pick a release asset (or a local file), check it, flash it. */
(function () {
  const { h, icon, clear, call, toast, errorToast, modal, state, fmtBytes, timeAgo, hex, BAUDS, bus } = VF;

  const AVR_BOARDS = [
    { fqbn: 'arduino:avr:uno', name: 'Arduino Uno' },
    { fqbn: 'arduino:avr:nano', name: 'Arduino Nano' },
    { fqbn: 'arduino:avr:nano:cpu=atmega328old', name: 'Nano (old bootloader / clones)' },
    { fqbn: 'arduino:avr:mega', name: 'Arduino Mega 2560' },
  ];

  // "ESP32-D0WD-V3 (revision v3.1)" -> "ESP32", "ESP32-S3 (QFN56)" -> "ESP32-S3"
  function chipFamily(detected) {
    if (!detected) return null;
    const m = detected.match(/ESP32-(S2|S3|C2|C3|C5|C61|C6|H2|P4)\b/i);
    if (m) return 'ESP32-' + m[1].toUpperCase();
    return /ESP32/i.test(detected) ? 'ESP32' : null;
  }

  // Higher score = better default pick for this category / board.
  function scoreAsset(asset, entry, category) {
    const n = asset.name;
    let s = 0;
    const prefer = entry.prefer || {};
    const pref = prefer[category] || prefer.default;
    if (pref && new RegExp(pref, 'i').test(n)) s += 100;
    if (/merged|factory|full|complete/i.test(n)) s += 40;
    if (/ota|update|_firmware\.bin$|littlefs|spiffs|bootloader|partition/i.test(n)) s -= 30;
    const fam = chipFamily(state.detected[state.port] && state.detected[state.port].chip);
    if (fam) {
      const tag = fam.replace('ESP32-', '').toLowerCase();
      if (fam !== 'ESP32' && new RegExp(tag, 'i').test(n)) s += 30;
      if (fam === 'ESP32' && !/s2|s3|c3|c6|h2|p4/i.test(n)) s += 10;
    }
    return s;
  }

  function open(opts = {}) {
    const entry = opts.entry || null;
    const category = opts.category || 'all';
    const isGithub = !!(entry && entry.repo && entry.source !== 'file');
    const s = {
      releases: [],
      release: null,
      asset: null,
      file: opts.file || (entry && entry.source === 'file' ? entry.path : null),
      analysis: null,
      offset: null,
      baud: state.settings.baud || 921600,
      erase: !!state.settings.eraseBeforeFlash,
      fqbn: (entry && entry.fqbn) || 'arduino:avr:uno',
      filter: '',
      busy: false,
      dlPct: null,
    };
    if (entry && entry.offset !== undefined && entry.offset !== null && entry.offset !== '') s.offset = Number(entry.offset);

    const title = entry ? entry.name : 'Flash a file';
    const sub = entry ? (entry.repo ? entry.repo : 'Local firmware') : 'Pick a .bin or .hex from your computer';
    const m = modal({ title, sub, size: 'wide', onClose: () => { cleanup(); } });
    const unsubs = [];
    const cleanup = () => unsubs.forEach((u) => u());

    unsubs.push(bus.on('port', () => { if (!s.busy) render(); }));

    // ---------- sections ----------
    function sourceSection() {
      if (isGithub) {
        if (!s.releases.length) {
          return h('div',
            h('div.section-title', icon('github'), 'Release'),
            s.loadError
              ? h('div.notice.err', icon('alert'), h('div.grow', s.loadError), h('button.btn.btn-sm', { onclick: () => loadReleases(true) }, 'Retry'))
              : h('div.row.muted', icon('spinner', 'spin'), 'Loading releases from GitHub...'));
        }
        const relSelect = h('select.select.grow', {
          onchange: (e) => { s.release = s.releases[e.target.selectedIndex]; s.asset = null; s.analysis = null; s.file = null; pickDefaultAsset(); render(); },
        }, s.releases.map((r, i) => h('option', { value: i, selected: r === s.release },
          `${r.name}${r.name !== r.tag ? ` (${r.tag})` : ''}${r.prerelease ? ' · pre-release' : ''} · ${timeAgo(r.published)}`)));

        const pattern = entry.assetPattern ? new RegExp(entry.assetPattern, 'i') : null;
        let assets = s.release.assets.filter((a) => !pattern || pattern.test(a.name));
        if (!assets.length) assets = s.release.assets;
        const best = [...assets].sort((a, b) => scoreAsset(b, entry, category) - scoreAsset(a, entry, category))[0];
        const filterInput = h('input.input', { placeholder: `Filter ${assets.length} files (e.g. CYD, S3, Core2)`, value: s.filter, spellcheck: false });
        filterInput.addEventListener('input', () => {
          s.filter = filterInput.value;
          m.body.querySelector('.asset-list').replaceWith(assetList(assets, best));
        });

        function assetList(all, bestAsset) {
          const vis = all.filter((a) => !s.filter || a.name.toLowerCase().includes(s.filter.toLowerCase()));
          return h('div.asset-list', vis.length ? vis.map((a) => h('div.asset' + (s.asset === a ? '.selected' : ''), {
            onclick: () => selectAsset(a),
          }, h('span.radio'), h('span.name', { title: a.name }, a.name),
          a === bestAsset ? h('span.star', 'SUGGESTED') : null,
          h('span.meta', fmtBytes(a.size)))) : h('div.dim', { style: { padding: '8px' } }, 'No files match that filter.'));
        }

        return h('div',
          h('div.section-title', icon('github'), 'Release'),
          h('div.row', relSelect, h('button.btn.btn-icon', { title: 'Reload releases', onclick: () => loadReleases(true) }, icon('refresh'))),
          h('div', { style: { height: '12px' } }),
          h('div.section-title', icon('file'), 'Firmware file', h('span.dim', { style: { textTransform: 'none', fontWeight: 400 } }, '· pick the one for your board')),
          assets.length > 6 ? h('div', { style: { marginBottom: '8px' } }, filterInput) : null,
          assetList(assets, best));
      }

      return h('div',
        h('div.section-title', icon('file'), 'Firmware file'),
        s.file
          ? h('div.asset.selected', h('span.radio'), h('span.name', s.file.split(/[\\/]/).pop()), h('span.meta', s.analysis ? fmtBytes(s.analysis.size) : ''),
            entry && entry.source === 'file' ? null : h('button.btn.btn-sm', { onclick: (e) => { e.stopPropagation(); pickFile(); } }, 'Change'))
          : h('button.btn.btn-lg.btn-block', { onclick: pickFile }, icon('folder'), 'Choose a .bin or .hex file'));
    }

    function analysisSection() {
      if (s.dlPct !== null) {
        return h('div',
          h('div.section-title', icon('download'), 'Downloading'),
          h('div.progress', h('div', { style: { width: s.dlPct + '%' } })),
          h('div.dim', { style: { marginTop: '6px', fontSize: '12px' } }, `${s.asset ? s.asset.name : ''} · ${s.dlPct}%`));
      }
      const a = s.analysis;
      if (!a) return null;
      const isHex = a.target === 'avr';
      const det = state.detected[state.port];
      const fam = chipFamily(det && det.chip);
      const mismatch = !isHex && a.chip && fam && a.chip !== fam;
      const kindLabel = { merged: 'Full image', app: 'App only', 'esp-image': 'ESP image', raw: 'Unknown', 'avr-hex': 'AVR HEX' }[a.kind];

      const offsetInput = h('input.input.mono', { value: hex(s.offset), style: { width: '100%' }, spellcheck: false });
      offsetInput.addEventListener('change', () => {
        const v = parseInt(offsetInput.value, 16);
        if (Number.isFinite(v) && v >= 0) s.offset = v;
        offsetInput.value = hex(s.offset);
      });

      return h('div',
        h('div.section-title', icon('chip'), 'What VoltFlash found'),
        h('div.analysis',
          h('div.stat', h('div.k', 'Type'), h('div.v', { title: a.summary }, kindLabel)),
          h('div.stat', h('div.k', 'Built for'), h('div.v' + (mismatch ? '.warn' : a.chip ? '.good' : ''), isHex ? 'AVR' : a.chip || 'Unknown')),
          isHex
            ? h('div.stat', h('div.k', 'Size'), h('div.v', fmtBytes(a.size)))
            : h('div.stat', h('div.k', 'Flash offset'), offsetInput),
          h('div.stat', h('div.k', a.app && a.app.version ? 'Version' : 'Size'), h('div.v', { title: a.app ? `${a.app.project} ${a.app.version} · IDF ${a.app.idf}` : '' }, a.app && a.app.version ? a.app.version : fmtBytes(a.size)))),
        h('div.dim', { style: { fontSize: '12.5px', marginTop: '8px' } }, a.summary),
        a.warning ? h('div.notice', { style: { margin: '10px 0 0' } }, icon('alert'), a.warning) : null,
        mismatch ? h('div.notice.err', { style: { margin: '10px 0 0' } }, icon('alert'),
          `This file is built for ${a.chip}, but the board on ${state.port} is ${fam}. It will not run. Pick another file.`) : null);
    }

    function targetSection() {
      const isHex = s.analysis ? s.analysis.target === 'avr' : (s.file || '').toLowerCase().endsWith('.hex');
      const det = state.detected[state.port];
      return h('div',
        h('div.section-title', icon('usb'), 'Your board'),
        h('div.row.wrap',
          h('label.field.grow', h('span', 'Port'), VF.portSelect({ full: true })),
          isHex
            ? h('label.field', h('span', 'Board'), h('select.select', { onchange: (e) => { s.fqbn = e.target.value; } },
              AVR_BOARDS.map((b) => h('option', { value: b.fqbn, selected: b.fqbn === s.fqbn }, b.name))))
            : h('label.field', h('span', 'Speed (baud)'), h('select.select', { onchange: (e) => { s.baud = Number(e.target.value); } },
              BAUDS.map((b) => h('option', { value: b, selected: b === s.baud }, b.toLocaleString())))),
          !isHex ? h('label.field', h('span', ' '), h('button.btn', { onclick: detectBoard, title: 'Ask the board what chip it is' }, icon('chip'), 'Detect')) : null),
        det && !isHex ? h('div.dim', { style: { fontSize: '12.5px', marginTop: '8px' } },
          `Detected: ${det.chip}${det.flashSize ? ' · ' + det.flashSize + ' flash' : ''}${det.mac ? ' · ' + det.mac : ''}`) : null,
        !isHex ? h('div', { style: { marginTop: '10px' } },
          h('label.check', h('input', { type: 'checkbox', checked: s.erase, onchange: (e) => { s.erase = e.target.checked; } }),
            'Erase the whole flash first (wipes saved settings, fixes most boot loops)')) : null);
    }

    function render() {
      if (s.busy) return;
      m.setBody(sourceSection(), analysisSection(), targetSection());
      const ready = s.analysis && state.port && s.dlPct === null;
      m.setFoot(
        isGithub && s.release ? h('button.btn.btn-ghost', { onclick: () => { m.close(); VF.openInBrowser(s.release.url); } }, icon('globe'), 'Release notes') : null,
        h('div.spacer'),
        !state.port ? h('span.dim', 'Plug in a board and pick its port') : null,
        h('button.btn', { onclick: () => m.close() }, 'Cancel'),
        h('button.btn.btn-accent.btn-lg', { disabled: !ready, onclick: startFlash }, icon('bolt'), 'Flash'));
    }

    // ---------- actions ----------
    async function loadReleases(force) {
      s.loadError = null;
      s.releases = [];
      render();
      try {
        s.releases = await call(window.vf.github.releases(entry.repo, !!force));
        if (!s.releases.length) throw new Error('This repo has no releases with .bin or .hex files.');
        s.release = s.releases.find((r) => !r.prerelease) || s.releases[0];
        pickDefaultAsset();
      } catch (err) {
        s.loadError = err.message;
      }
      render();
    }

    function pickDefaultAsset() {
      const pattern = entry.assetPattern ? new RegExp(entry.assetPattern, 'i') : null;
      let assets = s.release.assets.filter((a) => !pattern || pattern.test(a.name));
      if (!assets.length) assets = s.release.assets;
      if (assets.length === 1) selectAsset(assets[0]);
    }

    async function selectAsset(asset) {
      s.asset = asset;
      s.analysis = null;
      s.dlPct = 0;
      render();
      const off = window.vf.github.onProgress((p) => {
        if (p.name !== asset.name) return;
        s.dlPct = p.pct || 0;
        const bar = m.body.querySelector('.progress > div');
        if (bar) bar.style.width = s.dlPct + '%';
      });
      try {
        const file = await call(window.vf.github.download(asset));
        if (s.asset !== asset) return;
        s.dlPct = null;
        await analyzeFile(file);
      } catch (err) {
        s.dlPct = null;
        s.asset = null;
        errorToast(err, 'Download failed');
        render();
      } finally {
        off();
      }
    }

    async function pickFile() {
      const file = await call(window.vf.app.pickFirmware());
      if (file) await analyzeFile(file);
    }

    async function analyzeFile(file) {
      try {
        s.file = file;
        s.analysis = await call(window.vf.flash.analyze(file));
        const fixed = entry && entry.offset !== undefined && entry.offset !== null && entry.offset !== '';
        if (!fixed) s.offset = s.analysis.offset || 0;
      } catch (err) {
        errorToast(err, 'Could not read that file');
      }
      render();
    }

    async function detectBoard() {
      if (!state.port) return toast('No port selected', 'Plug in your board and pick its COM port.', { type: 'err' });
      await VF.detectBoard(state.port);
      render();
    }

    async function startFlash() {
      const isHex = s.analysis.target === 'avr';
      await VF.releasePort();
      s.busy = true;
      m.lock(true);
      const port = state.port;
      const stageEl = h('div.stage', 'Preparing');
      const pctEl = h('div.pct', '');
      const bar = h('div');
      const prog = h('div.progress.indeterminate', bar);
      const log = h('div.log', { style: { height: '260px' } });
      m.setTitle(`Flashing ${entry ? entry.name : s.analysis.name}`, `${port} · ${isHex ? 'arduino-cli' : 'esptool @ ' + s.baud.toLocaleString() + ' baud'}`);
      m.setBody(h('div', h('div.flash-status', stageEl, pctEl), prog), log);
      const cancelBtn = h('button.btn.btn-danger', { onclick: () => window.vf.flash.cancel() }, icon('stop'), 'Cancel');
      m.setFoot(h('div.dim', 'Keep the board plugged in until this finishes.'), h('div.spacer'), cancelBtn);

      let lastWasProgress = false;
      const off = window.vf.flash.onLog((p) => {
        if (p.stage) stageEl.textContent = p.stage;
        if (p.pct !== undefined && (p.stage === 'Writing' || p.type === 'tool' || p.type === 'done')) {
          prog.classList.remove('indeterminate');
          bar.style.width = p.pct + '%';
          pctEl.textContent = Math.round(p.pct) + '%';
        }
        const isProgress = p.pct !== undefined && p.type === 'line';
        const cls = p.type === 'cmd' ? 'cmd' : p.type === 'done' ? 'ok' : p.type === 'tool' ? 'info' : /error|fatal|failed/i.test(p.text) ? 'err' : '';
        if (isProgress && lastWasProgress && log.lastChild) {
          log.lastChild.textContent = p.text + '\n';
        } else {
          log.appendChild(h('span' + (cls ? '.' + cls : ''), p.text + '\n'));
        }
        lastWasProgress = isProgress;
        log.scrollTop = log.scrollHeight;
      });

      try {
        await call(window.vf.flash.start({
          port,
          baud: s.baud,
          erase: s.erase,
          fqbn: s.fqbn,
          files: [{ offset: s.offset || 0, path: s.file }],
        }));
        prog.classList.remove('indeterminate');
        prog.classList.add('ok');
        bar.style.width = '100%';
        pctEl.textContent = '100%';
        finish(true, log);
      } catch (err) {
        prog.classList.remove('indeterminate');
        prog.classList.add('fail');
        finish(false, log, err.message);
      } finally {
        off();
      }
    }

    function finish(ok, log, message) {
      s.busy = false;
      m.lock(false);
      log.style.height = '170px';
      const result = ok
        ? h('div.result', h('div.big.ok', icon('check')), h('h3', 'Flashed successfully'), h('p.muted', { style: { margin: 0 } }, `${entry ? entry.name : 'Your firmware'} is now running on ${state.port}.`))
        : h('div.result', h('div.big.fail', icon('x')), h('h3', message === 'Cancelled' ? 'Flashing cancelled' : 'Flashing failed'), h('p.muted', { style: { margin: '0 auto', maxWidth: '560px' } }, message));
      m.setBody(result, h('details', h('summary.dim', { style: { cursor: 'pointer', marginBottom: '8px' } }, 'Log'), log));
      if (!ok) m.body.querySelector('details').open = true;
      m.setFoot(
        ok ? h('button.btn', { onclick: () => { m.close(); VF.go('serial'); } }, icon('terminal'), 'Open Serial Monitor') : null,
        h('div.spacer'),
        h('button.btn', { onclick: () => { s.busy = false; m.setTitle(entry ? entry.name : 'Flash a file', sub); render(); } }, icon('reset'), ok ? 'Flash again' : 'Try again'),
        h('button.btn.btn-accent', { onclick: () => m.close() }, 'Done'));
      if (ok) toast('Flash complete', `${entry ? entry.name : 'Firmware'} flashed to ${state.port}`, { type: 'ok' });
    }

    if (isGithub) loadReleases(false);
    else if (s.file) analyzeFile(s.file);
    else render();
    return m;
  }

  VF.openFlash = open;
  VF.chipFamily = chipFamily;
})();
