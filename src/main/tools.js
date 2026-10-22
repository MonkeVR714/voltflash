// Finds or downloads the command line tools VoltFlash drives: esptool (ESP
// flashing) and arduino-cli (compiling, AVR uploads, libraries, cores).
const fs = require('fs');
const path = require('path');
const store = require('./store');
const { runOk, powershell } = require('./proc');

const TOOLS = {
  esptool: {
    label: 'esptool',
    repo: 'espressif/esptool',
    asset: /windows-amd64\.zip$/i,
    exe: 'esptool.exe',
    versionArgs: ['version'],
  },
  'arduino-cli': {
    label: 'arduino-cli',
    repo: 'arduino/arduino-cli',
    asset: /_Windows_64bit\.zip$/i,
    exe: 'arduino-cli.exe',
    versionArgs: ['version'],
  },
};

const versionCache = {};

function findFile(dir, name, depth = 0) {
  if (!fs.existsSync(dir) || depth > 4) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return full;
    if (entry.isDirectory()) {
      const hit = findFile(full, name, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

// Bundled copies (resources/bin) win over downloaded ones.
function locate(name) {
  const t = TOOLS[name];
  const bundledDirs = [
    process.resourcesPath && path.join(process.resourcesPath, 'bin'),
    path.join(__dirname, '..', '..', 'resources', 'bin'),
  ].filter(Boolean);
  for (const dir of bundledDirs) {
    const hit = findFile(dir, t.exe);
    if (hit) return hit;
  }
  return findFile(path.join(store.paths.tools, name), t.exe);
}

async function version(name) {
  const exe = locate(name);
  if (!exe) return null;
  if (versionCache[exe]) return versionCache[exe];
  try {
    const r = await runOk(exe, TOOLS[name].versionArgs);
    const m = (r.out + r.err).match(/v?(\d+\.\d+\.\d+)/);
    versionCache[exe] = m ? m[1] : 'unknown';
  } catch {
    versionCache[exe] = 'unknown';
  }
  return versionCache[exe];
}

async function status() {
  const result = {};
  for (const name of Object.keys(TOOLS)) {
    const exe = locate(name);
    result[name] = { installed: !!exe, path: exe, version: exe ? await version(name) : null };
  }
  return result;
}

// Concurrent installs of the same tool share one download.
const inFlight = {};

function install(name, onProgress) {
  if (!inFlight[name]) {
    inFlight[name] = doInstall(name, onProgress).finally(() => { delete inFlight[name]; });
  }
  return inFlight[name];
}

async function doInstall(name, onProgress) {
  const t = TOOLS[name];
  if (!t) throw new Error('Unknown tool ' + name);
  const github = require('./github');
  onProgress({ tool: name, stage: 'Looking up latest release', pct: 0 });
  const rel = await github.api(`/repos/${t.repo}/releases/latest`);
  const asset = rel.assets.find((a) => t.asset.test(a.name));
  if (!asset) throw new Error(`No Windows build found in ${t.repo} ${rel.tag_name}`);

  const dir = path.join(store.paths.tools, name);
  const zip = path.join(store.paths.cache, asset.name);
  await github.downloadFile(asset.browser_download_url, zip, (received, total) => {
    onProgress({ tool: name, stage: `Downloading ${asset.name}`, pct: total ? Math.round((received / total) * 90) : 0 });
  });

  onProgress({ tool: name, stage: 'Extracting', pct: 92 });
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const q = (s) => `'${s.replace(/'/g, "''")}'`;
  await powershell(`Expand-Archive -LiteralPath ${q(zip)} -DestinationPath ${q(dir)} -Force`);
  fs.rmSync(zip, { force: true });

  for (const k of Object.keys(versionCache)) delete versionCache[k];
  const exe = locate(name);
  if (!exe) throw new Error(`${t.exe} was not found after extracting`);
  onProgress({ tool: name, stage: 'Ready', pct: 100 });
  return { path: exe, version: await version(name) };
}

// Returns the tool's exe path, installing it first when missing.
async function ensure(name, onProgress = () => {}) {
  return locate(name) || (await install(name, onProgress)).path;
}

module.exports = { TOOLS, locate, version, status, install, ensure };
