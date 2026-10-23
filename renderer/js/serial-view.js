/* Serial monitor built on Web Serial (Electron picks the port the user chose up top). */
(function () {
  const { h, icon, clear, toast, errorToast, state, bus } = VF;

  const SERIAL_BAUDS = [9600, 19200, 38400, 57600, 74880, 115200, 230400, 460800, 921600];
  const MAX_LINES = 5000;

  const el = h('section.view#view-serial');
  let port = null;
  let reader = null;
  let keepReading = false;
  let partial = null;
  let opts = { timestamps: false, autoscroll: true, ending: '\n' };
  const history = [];
  let histIdx = -1;

  const connectBtn = h('button.btn.btn-accent', { onclick: () => (port ? disconnect() : connect()) }, icon('plug'), 'Connect');
  const baudSelect = h('select.select', { onchange: () => { VF.saveSettings({ serialBaud: Number(baudSelect.value) }); if (port) reconnect(); } });
  const endingSelect = h('select.select', { title: 'Line ending added when sending', onchange: () => { opts.ending = endingSelect.value; } },
    h('option', { value: '' }, 'None'), h('option', { value: '\n', selected: true }, 'LF'),
    h('option', { value: '\r\n' }, 'CRLF'), h('option', { value: '\r' }, 'CR'));
  const portLabel = h('span.muted');
  const statusDot = h('span.port-dot');
  const out = h('div.log.serial-out');
  const input = h('input.input', { placeholder: 'Send', disabled: true, spellcheck: false });
  const sendBtn = h('button.btn', { disabled: true, onclick: () => send() }, icon('send'), 'Send');

  // ---------- plotter: graphs numbers from each line ("12 34" or "temp:21.5,hum:40") ----------
  const COLORS = ['#e0b030', '#6fb3d2', '#6cbf6c', '#d9534f', '#a98bd0', '#d98c3f'];
  const MAX_POINTS = 400;
  const plotCanvas = h('canvas.plot-canvas');
  const plotLegend = h('div.plot-legend');
  const plotBox = h('div.plot-box', { style: { display: 'none' } }, plotLegend, plotCanvas);
  let plotOn = false;
  let series = new Map();
  let lineBuf = '';
  let plotQueued = false;

  function plotLine(line) {
    let pairs = [...line.matchAll(/([A-Za-z_][\w ]{0,20}?)\s*[:=]\s*(-?\d+(?:\.\d+)?)/g)].map((m) => [m[1].trim(), parseFloat(m[2])]);
    if (!pairs.length) {
      const nums = line.match(/-?\d+(?:\.\d+)?/g);
      if (!nums || nums.length > 6 || /[A-Za-z]{4,}/.test(line)) return;
      pairs = nums.map((n, i) => [`v${i + 1}`, parseFloat(n)]);
    }
    for (const [name, v] of pairs.slice(0, 6)) {
      if (!series.has(name)) {
        if (series.size >= 6) continue;
        series.set(name, []);
      }
      const arr = series.get(name);
      arr.push(v);
      if (arr.length > MAX_POINTS) arr.shift();
    }
    if (!plotQueued) { plotQueued = true; requestAnimationFrame(drawPlot); }
  }

  function drawPlot() {
    plotQueued = false;
    if (!plotOn) return;
    const w = plotCanvas.clientWidth;
    const hgt = plotCanvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (plotCanvas.width !== w * dpr || plotCanvas.height !== hgt * dpr) { plotCanvas.width = w * dpr; plotCanvas.height = hgt * dpr; }
    const g = plotCanvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);
    let min = Infinity;
    let max = -Infinity;
    for (const arr of series.values()) for (const v of arr) { if (v < min) min = v; if (v > max) max = v; }
    if (!isFinite(min)) return;
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.08;
    min -= pad; max += pad;
    const y = (v) => hgt - ((v - min) / (max - min)) * hgt;
    g.strokeStyle = '#3a3a3a';
    g.fillStyle = '#7c7c7c';
    g.font = '11px Consolas, monospace';
    g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = min + ((max - min) * i) / 4;
      const yy = Math.round(y(v)) + 0.5;
      g.beginPath(); g.moveTo(0, yy); g.lineTo(w, yy); g.stroke();
      g.fillText(+v.toFixed(2), 4, Math.min(hgt - 2, Math.max(10, yy - 2)));
    }
    clear(plotLegend);
    let i = 0;
    for (const [name, arr] of series) {
      const color = COLORS[i++ % COLORS.length];
      g.strokeStyle = color;
      g.lineWidth = 1.5;
      g.beginPath();
      arr.forEach((v, k) => {
        const xx = w - (arr.length - 1 - k) * (w / (MAX_POINTS - 1));
        if (k === 0) g.moveTo(xx, y(v)); else g.lineTo(xx, y(v));
      });
      g.stroke();
      plotLegend.appendChild(h('span', { style: { color } }, `${name} ${arr.length ? +arr[arr.length - 1].toFixed(3) : ''}`));
    }
  }

  function togglePlot(on) {
    plotOn = on;
    plotBox.style.display = on ? '' : 'none';
    if (on) drawPlot();
  }

  el.append(
    h('div.serial-bar',
      connectBtn,
      h('div.row', statusDot, portLabel),
      h('div.spacer'),
      baudSelect,
      endingSelect,
      h('label.check', h('input', { type: 'checkbox', onchange: (e) => togglePlot(e.target.checked) }), 'Plot'),
      h('label.check', h('input', { type: 'checkbox', onchange: (e) => { opts.timestamps = e.target.checked; } }), 'Time'),
      h('label.check', h('input', { type: 'checkbox', checked: true, onchange: (e) => { opts.autoscroll = e.target.checked; } }), 'Scroll'),
      h('button.btn.btn-icon', { title: 'Reset the board (toggles EN via RTS)', onclick: () => resetBoard() }, icon('reset')),
      h('button.btn.btn-icon', { title: 'Ask AI about this output', onclick: () => VF.askAI && VF.askAI({ log: out.innerText.split('\n').slice(-80).join('\n'), prompt: 'What does this serial output mean? Anything wrong?' }) }, icon('chat')),
      h('button.btn.btn-icon', { title: 'Copy output', onclick: () => navigator.clipboard.writeText(out.innerText).then(() => toast('Copied', null, { type: 'ok' })) }, icon('file')),
      h('button.btn.btn-icon', { title: 'Clear', onclick: () => { clear(out); partial = null; series = new Map(); drawPlot(); } }, icon('trash'))),
    plotBox,
    out,
    h('div.serial-send', input, sendBtn));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
    if (e.key === 'ArrowUp' && history.length) { histIdx = Math.min(history.length - 1, histIdx + 1); input.value = history[history.length - 1 - histIdx]; e.preventDefault(); }
    if (e.key === 'ArrowDown') { histIdx = Math.max(-1, histIdx - 1); input.value = histIdx < 0 ? '' : history[history.length - 1 - histIdx]; e.preventDefault(); }
  });

  function renderControls() {
    clear(baudSelect);
    const cur = state.settings.serialBaud || 115200;
    for (const b of SERIAL_BAUDS) baudSelect.appendChild(h('option', { value: b, selected: b === cur }, b.toLocaleString()));
    portLabel.textContent = port ? state.serialPort : state.port || '-';
    statusDot.classList.toggle('on', !!port);
    VF.clear(connectBtn).append(icon(port ? 'x' : 'plug'), port ? 'Disconnect' : 'Connect');
    connectBtn.className = 'btn ' + (port ? 'btn-danger' : 'btn-accent');
    input.disabled = !port;
    sendBtn.disabled = !port;
    bus.emit('serial:state', !!port);
  }

  function stamp() {
    const d = new Date();
    return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0') + '  ';
  }

  function systemLine(text, cls = 'info') {
    partial = null;
    out.appendChild(h('div.' + cls, text));
    trim();
  }

  function trim() {
    while (out.childNodes.length > MAX_LINES) out.removeChild(out.firstChild);
    if (opts.autoscroll) out.scrollTop = out.scrollHeight;
  }

  function write(text) {
    const parts = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    parts.forEach((piece, i) => {
      if (!partial) {
        partial = h('div');
        if (opts.timestamps) partial.appendChild(h('span.ts', stamp()));
        out.appendChild(partial);
      }
      if (piece) partial.appendChild(document.createTextNode(piece));
      lineBuf += piece;
      if (i < parts.length - 1) {
        partial = null;
        if (plotOn && lineBuf) plotLine(lineBuf);
        lineBuf = '';
      }
    });
    trim();
  }

  async function connect() {
    if (!state.port) return toast('No port', null, { type: 'err' });
    if (!navigator.serial) return toast('Serial not available', 'Web Serial is not supported in this build.', { type: 'err' });
    try {
      window.vf.ports.want(state.port);
      const p = await navigator.serial.requestPort();
      const baudRate = Number(baudSelect.value) || 115200;
      await p.open({ baudRate, bufferSize: 65536 });
      // Release DTR/RTS so ESP32 auto-reset circuits leave the chip running.
      try { await p.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch {}
      port = p;
      state.serialPort = state.port;
      state.serialConnected = true;
      systemLine(`— connected to ${state.port} at ${baudRate.toLocaleString()} baud —`);
      renderControls();
      readLoop();
      input.focus();
    } catch (err) {
      if (/No port selected/i.test(err.message)) {
        errorToast(new Error(`${state.port} could not be opened. Is it still plugged in?`), 'Could not connect');
      } else {
        errorToast(err, 'Could not connect');
      }
    }
  }

  async function readLoop() {
    keepReading = true;
    const decoder = new TextDecoder();
    while (port && port.readable && keepReading) {
      reader = port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) write(decoder.decode(value, { stream: true }));
        }
      } catch (err) {
        if (keepReading) systemLine(`— connection lost: ${err.message} —`, 'err');
        break;
      } finally {
        try { reader.releaseLock(); } catch {}
        reader = null;
      }
    }
    if (keepReading) await disconnect(true);
  }

  async function disconnect(silent) {
    keepReading = false;
    const p = port;
    port = null;
    state.serialConnected = false;
    try { if (reader) await reader.cancel(); } catch {}
    try { if (p) await p.close(); } catch {}
    if (!silent) systemLine('— disconnected —', 'dim');
    renderControls();
  }

  async function reconnect() {
    await disconnect(true);
    await connect();
  }

  async function send() {
    if (!port || !port.writable) return;
    const text = input.value;
    if (text) { history.push(text); histIdx = -1; }
    const writer = port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(text + opts.ending));
      systemLine('> ' + text, 'cmd');
      input.value = '';
    } catch (e) {
      errorToast(e, 'Send failed');
    } finally {
      writer.releaseLock();
    }
  }

  async function resetBoard() {
    if (!port) return toast('Not connected', null, { type: 'err' });
    try {
      await port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise((r) => setTimeout(r, 120));
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      systemLine('— reset —', 'dim');
    } catch (e) {
      errorToast(e, 'Reset failed');
    }
  }

  bus.on('serial:release', () => {
    if (port) {
      disconnect(true);
      systemLine('— disconnected so the port can be used for flashing —', 'dim');
    }
  });
  bus.on('port', () => { if (!port) renderControls(); });
  bus.on('settings', () => { if (!port) renderControls(); });

  VF.serialWrite = write; // used by the dev smoke test to feed sample data
  VF.views.serial = {
    el,
    show() { renderControls(); if (!port) input.blur(); },
  };
})();
