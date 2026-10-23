// Auto-updates from GitHub Releases. How depends on how VoltFlash was installed:
//  - installer: electron-updater downloads the new Setup and installs it on restart
//  - folder:    the Smart App Control friendly build (unmodified, trusted
//               Electron exe + plain resources/app folder). Only resources/app is
//               replaced, so Windows keeps trusting the exe.
//  - portable:  can't update itself; tells the user a new version exists
//  - dev:       running from source, updates are off
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const store = require('./store');
const github = require('./github');
const { powershell, runOk } = require('./proc');

const REPO = 'MonkeVR714/voltflash';
const CHECK_EVERY = 6 * 60 * 60 * 1000;

let send = () => {};
let autoUpdater = null;
let state = null;

function getState() {
  if (!state) state = { mode: detectMode(), current: app.getVersion(), status: 'idle' };
  return state;
}

function setState(patch) {
  state = { ...getState(), ...patch };
  send(state);
}

function detectMode() {
  if (!app.isPackaged) return 'dev';
  if (process.env.PORTABLE_EXECUTABLE_DIR) return 'portable';
  const res = process.resourcesPath;
  // the folder build is the only one without app.asar
  if (fs.existsSync(path.join(res, 'app', 'package.json'))) return 'folder';
  if (fs.existsSync(path.join(res, 'app-update.yml'))) return 'installer';
  return 'portable';
}

function newer(a, b) {
  const pa = a.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

// Latest release tag via the github.com redirect (not the rate-limited API).
async function latestVersion() {
  const res = await fetch(`https://github.com/${REPO}/releases/latest`, { headers: { 'User-Agent': 'VoltFlash' }, redirect: 'manual' });
  const loc = res.headers.get('location') || '';
  const tag = decodeURIComponent((loc.match(/\/releases\/tag\/([^/?#]+)/) || [])[1] || '');
  if (!tag) throw new Error('Could not find the latest release on GitHub');
  return { tag, version: tag.replace(/^v/i, ''), url: `https://github.com/${REPO}/releases/tag/${tag}` };
}

// ---------- installer mode (electron-updater) ----------
function setupInstaller() {
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => setState({ status: 'checking', error: null }));
  autoUpdater.on('update-not-available', () => setState({ status: 'none', checkedAt: Date.now() }));
  autoUpdater.on('update-available', (info) => setState({ status: 'downloading', version: info.version, pct: 0, url: `https://github.com/${REPO}/releases/tag/v${info.version}` }));
  autoUpdater.on('download-progress', (p) => setState({ status: 'downloading', pct: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => setState({ status: 'ready', version: info.version, pct: 100 }));
  autoUpdater.on('error', (err) => setState({ status: 'error', error: friendly(err) }));
}

function friendly(err) {
  const msg = (err && err.message) || String(err);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(msg)) return 'No internet connection.';
  return msg.split('\n')[0].slice(0, 200);
}

// ---------- folder mode (swap resources/app) ----------
const appDir = () => path.join(process.resourcesPath, 'app');
const nextDir = () => path.join(process.resourcesPath, 'app-next');
const oldDir = () => path.join(process.resourcesPath, 'app-old');

async function downloadFolderUpdate(latest) {
  const name = `VoltFlash-app-${latest.version}.zip`;
  const zip = path.join(store.paths.cache, name);
  setState({ status: 'downloading', version: latest.version, pct: 0, url: latest.url });
  await github.downloadFile(`https://github.com/${REPO}/releases/download/${latest.tag}/${name}`, zip, (received, total) => {
    if (total) setState({ pct: Math.round((received / total) * 95) });
  });
  fs.rmSync(nextDir(), { recursive: true, force: true });
  fs.mkdirSync(nextDir(), { recursive: true });
  try {
    await runOk(path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', nextDir()]);
  } catch {
    const q = (s) => `'${s.replace(/'/g, "''")}'`;
    await powershell(`Expand-Archive -LiteralPath ${q(zip)} -DestinationPath ${q(nextDir())} -Force`);
  }
  fs.rmSync(zip, { force: true });
  const pkg = store.readJson(path.join(nextDir(), 'package.json'), {});
  if (pkg.version !== latest.version) {
    fs.rmSync(nextDir(), { recursive: true, force: true });
    throw new Error('The downloaded update looks broken, it will be retried later.');
  }
  setState({ status: 'ready', pct: 100 });
}

// The running app can't replace its own folder, so a hidden PowerShell waits
// for VoltFlash to exit, swaps app-next in (keeping app-old to roll back) and
// starts it again.
let swapStarted = false;

// Starts a command through WMI so Windows owns the process, not VoltFlash.
// Anything VoltFlash spawns itself (even "detached") lives in its job object
// and is killed the moment VoltFlash exits.
async function startOutsideApp(commandLine) {
  const q = (s) => `'${s.replace(/'/g, "''")}'`;
  const r = await powershell([
    '$si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }',
    `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = ${q(commandLine)}; ProcessStartupInformation = $si }`,
    'if ($r.ReturnValue -ne 0) { throw "Win32_Process.Create failed with code $($r.ReturnValue)" }',
    '$r.ProcessId',
  ].join('; '));
  return r.out.trim();
}

async function installFolderUpdate(relaunch = true) {
  if (swapStarted) return;
  swapStarted = true;
  const q = (s) => `'${s.replace(/'/g, "''")}'`;
  const log = path.join(store.paths.cache, 'update.log');
  const script = [
    `Start-Transcript -LiteralPath ${q(log)} -Force | Out-Null`,
    `Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue`,
    'Start-Sleep -Milliseconds 500',
    `Remove-Item -LiteralPath ${q(oldDir())} -Recurse -Force -ErrorAction SilentlyContinue`,
    // files can stay locked for a moment while Electron's helper processes exit
    '$ok = $false',
    `for ($i = 0; $i -lt 20 -and -not $ok; $i++) { try { Move-Item -LiteralPath ${q(appDir())} -Destination ${q(oldDir())} -ErrorAction Stop; $ok = $true } catch { Start-Sleep -Milliseconds 500 } }`,
    `if ($ok) { try { Move-Item -LiteralPath ${q(nextDir())} -Destination ${q(appDir())} -ErrorAction Stop } catch { Move-Item -LiteralPath ${q(oldDir())} -Destination ${q(appDir())} } }`,
    'Write-Output "swap ok=$ok"',
    relaunch ? `Start-Process -FilePath ${q(process.execPath)} -WindowStyle Normal` : '',
    'Stop-Transcript | Out-Null',
  ].filter(Boolean).join('\n');
  // -EncodedCommand (UTF-16LE base64) avoids any command-line quoting problems
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const cmd = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ${encoded}`;
  try {
    const pid = await startOutsideApp(cmd);
    console.log(`[updater] swap helper started (pid ${pid}), log: ${log}`);
  } catch (err) {
    // fall back to a plain detached child; works when VoltFlash isn't inside a kill-on-close job
    console.log(`[updater] WMI start failed (${err.message}), using spawn`);
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
  }
  if (relaunch) app.quit();
}

// ---------- public ----------
async function check(manual = false) {
  if (state.status === 'downloading' || state.status === 'ready') return state;
  if (state.mode === 'dev') {
    setState({ status: 'none', note: 'Updates are off when running from source.' });
    return state;
  }
  if (state.mode === 'installer') {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      setState({ status: 'error', error: friendly(err) });
    }
    return state;
  }
  setState({ status: 'checking', error: null });
  try {
    const latest = await latestVersion();
    if (!newer(latest.version, state.current)) {
      setState({ status: 'none', checkedAt: Date.now() });
    } else if (state.mode === 'folder') {
      await downloadFolderUpdate(latest);
    } else {
      setState({ status: 'available', version: latest.version, url: latest.url });
    }
  } catch (err) {
    setState({ status: 'error', error: friendly(err) });
    if (manual) throw err;
  }
  return state;
}

async function install() {
  if (state.status !== 'ready') throw new Error('No update is ready yet.');
  if (state.mode === 'installer') autoUpdater.quitAndInstall(true, true);
  else if (state.mode === 'folder') await installFolderUpdate();
}

function init(sendFn) {
  send = sendFn;
  getState();
  if (state.mode === 'installer') setupInstaller();
  if (state.mode === 'folder') {
    // a downloaded update also goes in when the user just closes VoltFlash
    app.on('will-quit', (e) => {
      if (state.status !== 'ready' || swapStarted) return;
      // hold the quit until the helper is running
      e.preventDefault();
      installFolderUpdate(false).catch(() => {}).finally(() => app.exit(0));
    });
    // leftovers from the previous update
    fs.rm(oldDir(), { recursive: true, force: true }, () => {});
    if (fs.existsSync(nextDir())) fs.rm(nextDir(), { recursive: true, force: true }, () => {});
  }
  const auto = () => store.getSettings().autoUpdate !== false && check(false).catch(() => {});
  setTimeout(auto, 8000);
  setInterval(auto, CHECK_EVERY);
}

module.exports = { init, check, install, getState };
