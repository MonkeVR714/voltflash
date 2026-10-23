/* Pinouts: board pin reference, wiring for common parts, fixes and code notes from the knowledge pack. */
(function () {
  const { h, icon, clear, call, state, renderMarkdown } = VF;

  const TABS = [
    { id: 'board', name: 'Board' },
    { id: 'wiring.md', name: 'Parts' },
    { id: 'troubleshooting.md', name: 'Fixes' },
    { id: 'arduino-esp32-api.md', name: 'Code' },
    { id: 'libraries.md', name: 'Libraries' },
    { id: 'firmware-and-flashing.md', name: 'Flashing' },
  ];

  const el = h('section.view#view-pinouts');
  const boardSelect = h('select.select', { onchange: () => { VF.saveSettings({ pinoutBoard: boardSelect.value }); render(); } });
  const tabsEl = h('div.tabs');
  const body = h('div.pinout-body');
  let boards = [];
  let tab = 'board';

  el.append(
    h('div.serial-bar', boardSelect, tabsEl, h('div.spacer'),
      h('button.btn', { onclick: () => VF.askAI && VF.askAI({ prompt: `Tell me about the ${boardName()}: safe pins and what to watch out for.` }) }, icon('chat'), 'Ask AI')),
    h('div.scroll', body));

  function boardName() {
    const b = boards.find((x) => x.id === boardSelect.value);
    return b ? b.name : 'board';
  }

  function renderTabs() {
    clear(tabsEl);
    for (const t of TABS) tabsEl.appendChild(h('div.tab' + (tab === t.id ? '.active' : ''), { onclick: () => { tab = t.id; render(); } }, t.name));
  }

  async function render() {
    renderTabs();
    boardSelect.style.display = tab === 'board' ? '' : 'none';
    const sections = tab === 'board'
      ? await call(window.vf.knowledge.board(boardSelect.value))
      : await call(window.vf.knowledge.file(tab));
    clear(body);
    if (!sections.length) body.appendChild(h('div.empty', '-'));
    for (const sec of sections) {
      body.appendChild(h('div.panel.pin-sec', h('h2', sec.title), renderMarkdown(sec.text)));
    }
  }

  let ready = false;
  VF.views.pinouts = {
    el,
    async show() {
      if (!ready) {
        ready = true;
        boards = (await call(window.vf.arduino.boards())).filter((b, i, arr) => arr.findIndex((x) => x.id === b.id) === i);
        const groups = {};
        for (const b of boards) (groups[b.group] = groups[b.group] || []).push(b);
        const pick = state.settings.pinoutBoard || state.settings.ideBoard || 'esp32';
        for (const [g, items] of Object.entries(groups)) {
          boardSelect.appendChild(h('optgroup', { label: g }, items.map((b) => h('option', { value: b.id, selected: b.id === pick }, b.name))));
        }
      }
      render();
    },
  };
})();
