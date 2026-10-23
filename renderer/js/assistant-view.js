/* Assistant: local AI chat (Ollama) that knows ESP32/Arduino boards, can read .bin files and write code. */
(function () {
  const { h, icon, clear, call, toast, errorToast, state, renderMarkdown, bus } = VF;

  const el = h('section.view#view-assistant');
  const s = {
    status: null,
    boards: [],
    messages: [],
    attachments: [],
    busy: false,
    pulling: null,
  };

  const CHIP_TO_BOARD = { ESP32: 'esp32', 'ESP32-S3': 'esp32s3', 'ESP32-C3': 'esp32c3' };
  const SUGGEST = ['Which pins are safe?', 'Wire a BME280', 'Blink an LED', 'Why does it boot loop?'];

  const boardSelect = h('select.select', { title: 'Board', onchange: () => VF.saveSettings({ aiBoard: boardSelect.value }) });
  const statusEl = h('span.dim');
  const setupEl = h('div');
  const list = h('div.chat-list');
  const attachRow = h('div.chat-attach');
  const input = h('textarea.textarea.chat-input', { rows: 2, placeholder: 'Ask...', spellcheck: false });
  const sendBtn = h('button.btn.btn-accent', { onclick: () => (s.busy ? stop() : send()) }, icon('send'), 'Send');

  el.append(
    h('div.serial-bar',
      boardSelect,
      h('span.port-dot'),
      statusEl,
      h('div.spacer'),
      h('button.btn', { onclick: explainFile }, icon('file'), 'Explain .bin'),
      h('button.btn', { onclick: newChat }, icon('plus'), 'New')),
    setupEl,
    list,
    attachRow,
    h('div.serial-send', input, sendBtn));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  // ---------- board ----------
  function currentBoard() {
    if (boardSelect.value) return s.boards.find((b) => b.id === boardSelect.value) || null;
    const det = state.detected[state.port];
    const fam = det && VF.chipFamily(det.chip);
    const id = fam && CHIP_TO_BOARD[fam];
    return id ? s.boards.find((b) => b.id === id) : null;
  }

  function renderBoards() {
    clear(boardSelect).appendChild(h('option', { value: '' }, 'Board: auto'));
    const groups = {};
    for (const b of s.boards) (groups[b.group] = groups[b.group] || []).push(b);
    for (const [g, items] of Object.entries(groups)) {
      boardSelect.appendChild(h('optgroup', { label: g }, items.map((b) => h('option', { value: b.id, selected: b.id === state.settings.aiBoard }, b.name))));
    }
  }

  // ---------- ollama status / setup ----------
  async function refreshStatus() {
    try {
      s.status = await call(window.vf.ai.status());
    } catch (e) {
      s.status = { running: false };
    }
    renderStatus();
  }

  function renderStatus() {
    const st = s.status || {};
    el.querySelector('.port-dot').classList.toggle('on', !!(st.running && st.hasModel));
    statusEl.textContent = st.running ? st.model : 'Ollama off';
    clear(setupEl);
    if (!s.status) return;
    if (!st.running) {
      setupEl.appendChild(h('div.notice', icon('info'), h('div.grow', 'Needs Ollama (free, runs on your PC).'),
        h('button.btn.btn-sm.btn-accent', { onclick: () => window.vf.app.openExternal('https://ollama.com/download') }, 'Get Ollama'),
        h('button.btn.btn-sm', { onclick: refreshStatus }, 'Retry')));
    } else if (!st.hasModel) {
      const choice = (st.choices || []).find((c) => c.name === st.model);
      setupEl.appendChild(h('div.notice', icon('download'),
        h('div.grow', s.pulling ? `${s.pulling.status || 'Downloading'} ${s.pulling.pct != null ? s.pulling.pct + '%' : ''}` : `Model ${st.model}${choice ? ' (' + choice.size + ')' : ''}`),
        s.pulling ? null : h('button.btn.btn-sm.btn-accent', { onclick: pullModel }, 'Download')));
    }
  }

  async function pullModel() {
    s.pulling = { status: 'Starting', pct: null };
    renderStatus();
    const off = window.vf.ai.onPull((p) => { s.pulling = p; renderStatus(); });
    try {
      s.status = await call(window.vf.ai.pull(s.status.model));
      toast('Model ready', null, { type: 'ok' });
    } catch (e) {
      errorToast(e, 'Download failed');
    } finally {
      off();
      s.pulling = null;
      renderStatus();
    }
  }

  // ---------- messages ----------
  function renderMessages() {
    clear(list);
    if (!s.messages.length) {
      list.appendChild(h('div.chat-empty',
        h('div.chips', SUGGEST.map((q) => h('span.chip', { onclick: () => { input.value = q; send(); } }, q)))));
      return;
    }
    for (const m of s.messages) list.appendChild(messageEl(m));
    list.scrollTop = list.scrollHeight;
  }

  function messageEl(m) {
    const body = m.role === 'user' ? h('div', m.content) : renderMarkdown(m.content || (m.error ? '' : '...'));
    const node = h('div.msg.' + m.role, body,
      m.error ? h('div.notice.err', { style: { margin: '6px 0 0' } }, icon('alert'), m.error) : null,
      m.refs && m.refs.length ? h('div.msg-refs', m.refs.join(' · ')) : null);
    m.node = node;
    return node;
  }

  let raf = 0;
  function updateLast() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const m = s.messages[s.messages.length - 1];
      if (!m || !m.node) return renderMessages();
      const fresh = messageEl(m);
      list.replaceChild(fresh, list.lastChild);
      list.scrollTop = list.scrollHeight;
    });
  }

  function renderAttachments() {
    clear(attachRow);
    for (const a of s.attachments) {
      attachRow.appendChild(h('span.chip', { title: a.kind }, icon(a.kind === 'firmware' ? 'file' : a.kind === 'sketch' ? 'code' : 'list'), ' ', a.name,
        h('span', { style: { marginLeft: '6px', cursor: 'pointer' }, onclick: () => { s.attachments = s.attachments.filter((x) => x !== a); renderAttachments(); } }, '×')));
    }
  }

  function setBusy(b) {
    s.busy = b;
    clear(sendBtn).append(icon(b ? 'stop' : 'send'), b ? 'Stop' : 'Send');
    sendBtn.className = 'btn ' + (b ? 'btn-danger' : 'btn-accent');
  }

  async function send() {
    const text = input.value.trim();
    if (!text || s.busy) return;
    if (!s.status || !s.status.running) await refreshStatus();
    input.value = '';
    s.messages.push({ role: 'user', content: text });
    const reply = { role: 'assistant', content: '' };
    s.messages.push(reply);
    renderMessages();
    setBusy(true);
    const off = window.vf.ai.onEvent((ev) => {
      if (ev.type === 'token') { reply.content += ev.text; updateLast(); }
    });
    const board = currentBoard();
    try {
      const r = await call(window.vf.ai.chat({
        messages: s.messages.slice(0, -1).filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
        board: board ? board.id : null,
        boardName: board ? board.name : null,
        attachments: s.attachments.map(({ kind, name, text, keywords }) => ({ kind, name, text, keywords })),
      }));
      if (r && r.refs) reply.refs = r.refs;
      if (r && r.stopped && !reply.content) reply.content = '(stopped)';
    } catch (e) {
      reply.error = e.message;
      if (/not running|not downloaded/i.test(e.message)) refreshStatus();
    } finally {
      off();
      setBusy(false);
      updateLast();
    }
  }

  function stop() {
    window.vf.ai.cancel();
  }

  function newChat() {
    if (s.busy) stop();
    s.messages = [];
    s.attachments = [];
    renderMessages();
    renderAttachments();
  }

  async function explainFile() {
    const file = await call(window.vf.app.pickFirmware());
    if (file) await ask({ file, prompt: 'Explain this firmware: what it does, what hardware it needs, how to wire and flash it.' });
  }

  // Open the assistant with things attached, optionally sending a prompt right away.
  async function ask({ file, entry, sketch, log, prompt, autoSend = true } = {}) {
    VF.go('assistant');
    await init();
    try {
      if (file) {
        const r = await call(window.vf.flash.inspect(file));
        s.attachments.push({ kind: 'firmware', name: r.name, text: r.text, keywords: [r.chip, ...(r.libraries || [])].join(' ') });
        if (r.chip && !boardSelect.value) {
          const id = CHIP_TO_BOARD[r.chip];
          // a CYD build is a plain ESP32 build; the file name usually says CYD/2432S028
          if (id === 'esp32' && /cyd|2432s0|cheap.?yellow/i.test(r.name)) boardSelect.value = 'cyd';
          else if (id) boardSelect.value = id;
        }
      }
      if (entry && entry.repo) {
        const readme = await call(window.vf.ai.readme(entry.repo)).catch(() => '');
        if (readme) s.attachments.push({ kind: 'readme', name: entry.repo, text: readme, keywords: entry.name });
      }
      if (sketch) s.attachments.push({ kind: 'sketch', name: sketch.name, text: sketch.text, keywords: '' });
      if (log) s.attachments.push({ kind: 'log', name: 'output', text: log, keywords: 'error compile upload' });
    } catch (e) {
      errorToast(e);
    }
    renderAttachments();
    if (prompt) {
      input.value = prompt;
      if (autoSend) send();
      else input.focus();
    }
  }

  let ready = null;
  function init() {
    if (!ready) {
      ready = (async () => {
        try { s.boards = await call(window.vf.arduino.boards()); } catch {}
        renderBoards();
        renderMessages();
      })();
    }
    return ready;
  }

  VF.views.assistant = {
    el,
    show() {
      init().then(() => { refreshStatus(); input.focus(); });
    },
  };
  VF.askAI = ask;
  bus.on('port', () => { if (state.view === 'assistant') renderStatus(); });
})();
