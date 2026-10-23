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

  el.append(
    h('div.serial-bar',
      connectBtn,
      h('div.row', statusDot, portLabel),
      h('div.spacer'),
      baudSelect,
      endingSelect,
      h('label.check', h('input', { type: 'checkbox', onchange: (e) => { opts.timestamps = e.target.checked; } }), 'Time'),
      h('label.check', h('input', { type: 'checkbox', checked: true, onchange: (e) => { opts.autoscroll = e.target.checked; } }), 'Scroll'),
      h('button.btn.btn-icon', { title: 'Reset the board (toggles EN via RTS)', onclick: () => resetBoard() }, icon('reset')),
      h('button.btn.btn-icon', { title: 'Copy output', onclick: () => navigator.clipboard.writeText(out.innerText).then(() => toast('Copied', null, { type: 'ok' })) }, icon('file')),
      h('button.btn.btn-icon', { title: 'Clear', onclick: () => { clear(out); partial = null; } }, icon('trash'))),
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
      if (i < parts.length - 1) partial = null;
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

  VF.views.serial = {
    el,
    show() { renderControls(); if (!port) input.blur(); },
  };
})();
