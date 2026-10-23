/* Backups: full flash images read off boards before flashing, grouped per board, with restore. */
(function () {
  const { h, icon, clear, call, toast, errorToast, modal, confirmBox, promptBox, state, fmtBytes, timeAgo } = VF;

  const el = h('section.view#view-backups');
  const body = h('div');
  el.appendChild(h('div.scroll', body));
  let backups = [];

  function familyColor(family) {
    if (/S3/i.test(family)) return 'var(--cat-esp32s3)';
    if (/ESP32$/i.test(family)) return 'var(--cat-esp32)';
    return 'var(--cyan)';
  }

  function row(b) {
    return h('div.backup-row',
      h('div.backup-icon', { style: { '--badge-color': familyColor(b.family) } }, icon('save')),
      h('div.grow',
        h('div.backup-title', b.label || b.name),
        h('div.dim', { style: { fontSize: '12.5px' } },
          [new Date(b.created).toLocaleString(), timeAgo(b.created), fmtBytes(b.size), b.flashSize && `${b.flashSize} flash`].filter(Boolean).join('  ·  ')),
        b.label ? h('div.dim.mono', { style: { fontSize: '11.5px' } }, b.name) : null),
      h('button.btn.btn-accent', { title: 'Write this backup back onto a board', onclick: () => restore(b) }, icon('reset'), 'Restore'),
      h('button.btn.btn-icon', { title: 'Rename', onclick: () => rename(b) }, icon('pencil')),
      h('button.btn.btn-icon', { title: 'Show in folder', onclick: () => window.vf.app.showItem(b.file) }, icon('folder')),
      h('button.btn.btn-icon.btn-danger', { title: 'Move to Recycle Bin', onclick: () => remove(b) }, icon('trash')));
  }

  function render() {
    const groups = new Map();
    for (const b of backups) {
      const key = b.mac || 'unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(b);
    }
    const det = state.detected[state.port];

    clear(body).append(
      h('div.hero', { style: { '--hero-color': 'var(--cyan)' } },
        h('div',
          h('h1', 'Backups'),
          h('p', 'Every time you flash, VoltFlash first saves the firmware that was on the board. Restore it here any time to get the original back.')),
        h('div.hero-actions',
          h('button.btn', { onclick: async () => window.vf.app.openPath(await call(window.vf.backups.folder())) }, icon('folder'), 'Folder'),
          h('button.btn.btn-accent', { onclick: backupNow }, icon('download'), 'Back up now'))));

    if (!backups.length) {
      body.appendChild(h('div.empty', 'No backups'));
      return;
    }

    const list = h('div.backup-groups');
    for (const [mac, items] of groups) {
      const first = items[0];
      const isThisBoard = det && det.mac && det.mac === mac;
      list.appendChild(h('div.backup-group',
        h('div.backup-group-head',
          h('span.badge', { style: { '--badge-color': familyColor(first.family) } }, first.family || 'ESP'),
          h('b', first.chip || 'Unknown chip'),
          h('span.dim.mono', mac === 'unknown' ? '' : mac),
          isThisBoard ? h('span.pill.ok', state.port) : null,
          h('span.spacer'),
          h('span.dim', String(items.length))),
        items.map(row)));
    }
    body.appendChild(list);
  }

  async function refresh() {
    try {
      backups = await call(window.vf.backups.list());
    } catch (e) {
      errorToast(e, 'Could not list backups');
    }
    if (state.view === 'backups') render();
  }

  function restore(b) {
    const det = state.detected[state.port];
    if (det && det.mac && b.mac && det.mac !== b.mac) {
      toast('Different board', null, { type: 'info' });
    }
    VF.openFlash({
      entry: { name: `Restore: ${b.label || b.name}`, source: 'file', path: b.file, offset: 0 },
    });
  }

  async function rename(b) {
    const label = await promptBox('Rename', 'Name', { value: b.label || '', okLabel: 'Save' });
    if (label === null) return;
    backups = await call(window.vf.backups.update(b.file, { label }));
    render();
  }

  async function remove(b) {
    const ok = await confirmBox('Delete?', b.label || b.name, { okLabel: 'Delete', danger: true });
    if (!ok) return;
    backups = await call(window.vf.backups.trash(b.file));
    render();
  }

  async function backupNow() {
    if (!state.port) return toast('No port', null, { type: 'err' });
    await VF.releasePort();
    const stageEl = h('div.stage', 'Connecting');
    const pctEl = h('div.pct', '');
    const bar = h('div');
    const prog = h('div.progress.indeterminate', bar);
    const log = h('div.log', { style: { height: '200px' } });
    const m = modal({ title: 'Backup', lock: true });
    m.setBody(h('div', h('div.flash-status', stageEl, pctEl), prog), log);
    m.setFoot(h('div.spacer'),
      h('button.btn.btn-danger', { onclick: () => window.vf.flash.cancel() }, icon('stop'), 'Cancel'));
    const off = window.vf.flash.onLog((p) => {
      if (p.stage) stageEl.textContent = p.stage;
      if (p.pct !== undefined && p.stage === 'Backing up') {
        prog.classList.remove('indeterminate');
        bar.style.width = p.pct + '%';
        pctEl.textContent = Math.round(p.pct) + '%';
      }
      log.appendChild(h('span' + (p.type === 'cmd' ? '.cmd' : p.type === 'done' ? '.ok' : ''), p.text + '\n'));
      log.scrollTop = log.scrollHeight;
    });
    try {
      const meta = await call(window.vf.backups.create({ port: state.port, baud: state.settings.baud || 921600, label: 'Manual backup' }));
      toast('Saved', null, { type: 'ok' });
      m.close();
    } catch (e) {
      prog.classList.remove('indeterminate');
      prog.classList.add('fail');
      stageEl.textContent = 'Backup failed';
      log.appendChild(h('span.err', e.message + '\n'));
      m.lock(false);
      m.setFoot(h('div.spacer'), h('button.btn', { onclick: () => m.close() }, 'Close'));
    } finally {
      off();
      refresh();
    }
  }

  VF.views.backups = {
    el,
    show() { render(); refresh(); },
  };
  VF.refreshBackups = refresh;
})();
