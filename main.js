const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

const store = require('./src/main/store');
const tools = require('./src/main/tools');
const ports = require('./src/main/ports');
const github = require('./src/main/github');
const flasher = require('./src/main/flasher');
const arduino = require('./src/main/arduino');
const sketches = require('./src/main/sketches');

let win = null;
let wantedSerialPort = null;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0d1017',
    title: 'VoltFlash',
    icon: path.join(__dirname, 'build', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0d1017', symbolColor: '#c9d1e3', height: 44 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: false,
      // smoke tests render offscreen so no window pops up on the desktop
      offscreen: !!process.env.VF_SMOKE,
    },
  });

  win.once('ready-to-show', () => { if (!process.env.VF_SMOKE) win.show(); });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.env.VF_SMOKE) smokeTest(win, process.env.VF_SMOKE);

  // Links that try to open a new window go to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  setupSerialPermissions(win.webContents.session);
  setupBrowserDownloads();
}

// Dev check: `VF_SMOKE=<folder> electron .` prints renderer console output,
// walks through every view, saves a screenshot of each into <folder> and quits.
function smokeTest(w, outDir) {
  w.webContents.on('console-message', (_e, level, message, line, source) => {
    console.log(`[renderer:${level}] ${message} (${path.basename(source || '')}:${line})`);
  });
  const views = (process.env.VF_SMOKE_VIEWS || 'store:all,store:cyd,browser,ide,serial,settings').split(',');
  w.webContents.once('did-finish-load', async () => {
    fs.mkdirSync(outDir, { recursive: true });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(3500);
    for (const v of views) {
      await w.webContents.executeJavaScript(`VF.go(${JSON.stringify(v)})`).catch((e) => console.log('go failed', e.message));
      await wait(v === 'browser' || v === 'ide' ? 6000 : 2500);
      const img = await w.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, v.replace(':', '-') + '.png'), img.toPNG());
      console.log('captured', v);
    }
    if (process.env.VF_SMOKE_JS) {
      const r = await w.webContents.executeJavaScript(process.env.VF_SMOKE_JS).catch((e) => 'ERR ' + e.message);
      console.log('smoke js:', typeof r === 'string' ? r : JSON.stringify(r));
      await wait(4000);
      fs.writeFileSync(path.join(outDir, 'custom.png'), (await w.webContents.capturePage()).toPNG());
    }
    app.quit();
  });
}

// Web Serial (used by the serial monitor). The renderer tells us which COM
// port it wants, then calls navigator.serial.requestPort() and we pick it.
function setupSerialPermissions(ses) {
  ses.on('select-serial-port', (event, portList, _wc, callback) => {
    event.preventDefault();
    const match = portList.find((p) => p.portName === wantedSerialPort) ||
      portList.find((p) => (p.displayName || '').includes(`(${wantedSerialPort})`));
    callback(match ? match.portId : '');
  });
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'serial' || permission === 'clipboard-sanitized-write');
  ses.setDevicePermissionHandler((details) => details.deviceType === 'serial');
}

// Downloads made inside the built-in browser land in our downloads folder and
// the renderer is told so it can offer to flash them.
function setupBrowserDownloads() {
  const ses = session.fromPartition('persist:vf-browser');
  ses.on('will-download', (_e, item) => {
    const dir = path.join(store.paths.downloads, 'browser');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, item.getFilename());
    item.setSavePath(target);
    const id = Date.now() + Math.random();
    send('browser:download', { id, state: 'started', name: item.getFilename(), total: item.getTotalBytes() });
    item.on('updated', () => {
      send('browser:download', { id, state: 'progress', name: item.getFilename(), received: item.getReceivedBytes(), total: item.getTotalBytes() });
    });
    item.once('done', (_ev, state) => {
      send('browser:download', { id, state, name: item.getFilename(), path: target });
    });
  });
}

// ---------- IPC ----------
// Every handler returns { ok, data } or { ok:false, error } so the renderer
// can show friendly errors instead of uncaught rejections.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });
}

function registerIpc() {
  const progress = (channel) => (payload) => send(channel, payload);

  // settings / app
  handle('settings:get', () => store.getSettings());
  handle('settings:set', (patch) => store.setSettings(patch));
  handle('app:info', () => ({ version: app.getVersion(), userData: store.paths.root, downloads: store.paths.downloads }));
  handle('app:openPath', (p) => shell.openPath(p));
  handle('app:openExternal', (url) => shell.openExternal(url));
  handle('app:showItem', (p) => shell.showItemInFolder(p));
  handle('dialog:openFirmware', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose firmware',
      properties: ['openFile'],
      filters: [{ name: 'Firmware', extensions: ['bin', 'hex'] }, { name: 'All files', extensions: ['*'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('dialog:openImage', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose cover image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  // tools
  handle('tools:status', () => tools.status());
  handle('tools:install', (name) => tools.install(name, progress('tools:progress')));

  // ports
  handle('ports:list', () => ports.list());
  ipcMain.on('serial:want', (_e, port) => { wantedSerialPort = port; });

  // catalog / github
  handle('catalog:get', (force) => github.getCatalog(force));
  handle('github:releases', (repo, force) => github.getReleases(repo, force));
  handle('github:repoInfo', (repo) => github.getRepoInfo(repo));
  handle('github:download', (asset) => github.downloadAsset(asset, progress('download:progress')));

  // flashing
  handle('flash:analyze', (file) => flasher.analyze(file));
  handle('flash:start', (opts) => flasher.flash(opts, progress('flash:log')));
  handle('flash:cancel', () => flasher.cancel());
  handle('flash:detect', (port) => flasher.detect(port, progress('flash:log')));
  handle('flash:erase', (port) => flasher.erase(port, progress('flash:log')));

  // backups of the firmware that was on a board before flashing
  handle('backups:create', (opts) => flasher.backup(opts, progress('flash:log')));
  handle('backups:list', () => flasher.listBackups());
  handle('backups:update', (file, patch) => flasher.updateBackup(file, patch));
  handle('backups:trash', async (file) => {
    if (path.dirname(file) !== store.paths.backups) throw new Error('Not a backup file');
    await shell.trashItem(file);
    const meta = file.replace(/\.bin$/i, '.json');
    if (fs.existsSync(meta)) await shell.trashItem(meta);
    return flasher.listBackups();
  });
  handle('backups:folder', () => store.paths.backups);

  // my projects (firmware entries the user adds)
  handle('projects:list', () => store.getProjects());
  handle('projects:save', (p) => store.saveProject(p));
  handle('projects:remove', (id) => store.removeProject(id));

  // arduino
  handle('arduino:boards', () => arduino.BOARDS);
  handle('arduino:cores', () => arduino.listCores());
  handle('arduino:installCore', (core) => arduino.installCore(core, progress('ide:log')));
  handle('arduino:compile', (opts) => arduino.compile(opts, progress('ide:log')));
  handle('arduino:upload', (opts) => arduino.upload(opts, progress('ide:log')));
  handle('arduino:cancel', () => arduino.cancel());
  handle('arduino:libSearch', (q) => arduino.libSearch(q));
  handle('arduino:libInstall', (name) => arduino.libInstall(name, progress('ide:log')));
  handle('arduino:libList', () => arduino.libList());

  // sketches
  handle('sketch:templates', () => sketches.templates());
  handle('sketch:list', () => sketches.list());
  handle('sketch:create', (name, template) => sketches.create(name, template));
  handle('sketch:files', (name) => sketches.files(name));
  handle('sketch:read', (name, file) => sketches.read(name, file));
  handle('sketch:write', (name, file, content) => sketches.write(name, file, content));
  handle('sketch:setBoard', (name, board) => sketches.setBoard(name, board));
  handle('sketch:addFile', (name, file) => sketches.addFile(name, file));
  handle('sketch:trash', (name) => sketches.trash(name));
  handle('sketch:dir', (name) => sketches.dir(name));
}

// Pages in the built-in browser that open a new tab load in place instead.
app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) contents.loadURL(url);
    return { action: 'deny' };
  });
});

app.whenReady().then(() => {
  store.init(app.getPath('userData'));
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  flasher.cancel();
  arduino.cancel();
  app.quit();
});
