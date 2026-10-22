// The mini IDE's build system: a thin wrapper around arduino-cli with its own
// config and data folders so it never touches a separate Arduino IDE install.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const tools = require('./tools');
const { run } = require('./proc');

const BOARD_URLS = [
  'https://espressif.github.io/arduino-esp32/package_esp32_index.json',
];

const BOARDS = [
  { id: 'esp32', fqbn: 'esp32:esp32:esp32', name: 'ESP32 Dev Module', group: 'ESP32' },
  { id: 'esp32s3', fqbn: 'esp32:esp32:esp32s3', name: 'ESP32-S3 Dev Module', group: 'ESP32-S3' },
  { id: 'esp32s3cdc', fqbn: 'esp32:esp32:esp32s3:CDCOnBoot=cdc', name: 'ESP32-S3 (USB CDC on boot)', group: 'ESP32-S3' },
  { id: 'esp32c3', fqbn: 'esp32:esp32:esp32c3', name: 'ESP32-C3 Dev Module', group: 'ESP32' },
  { id: 'cyd', fqbn: 'esp32:esp32:esp32', name: 'CYD (ESP32-2432S028R)', group: 'CYD' },
  { id: 'cyd2usb', fqbn: 'esp32:esp32:esp32', name: 'CYD 2-USB variant', group: 'CYD' },
  { id: 'm5core', fqbn: 'esp32:esp32:m5stack_core', name: 'M5Stack Core (Basic / Gray)', group: 'M5Stack' },
  { id: 'm5core2', fqbn: 'esp32:esp32:m5stack_core2', name: 'M5Stack Core2', group: 'M5Stack' },
  { id: 'm5cores3', fqbn: 'esp32:esp32:m5stack_cores3', name: 'M5Stack CoreS3', group: 'M5Stack' },
  { id: 'm5stickcplus', fqbn: 'esp32:esp32:m5stack_stickc_plus', name: 'M5StickC Plus', group: 'M5Stack' },
  { id: 'm5stickcplus2', fqbn: 'esp32:esp32:m5stack_stickc_plus2', name: 'M5StickC Plus2', group: 'M5Stack' },
  { id: 'm5cardputer', fqbn: 'esp32:esp32:m5stack_cardputer', name: 'M5Stack Cardputer', group: 'M5Stack' },
  { id: 'uno', fqbn: 'arduino:avr:uno', name: 'Arduino Uno', group: 'Arduino' },
  { id: 'nano', fqbn: 'arduino:avr:nano', name: 'Arduino Nano', group: 'Arduino' },
  { id: 'nanoold', fqbn: 'arduino:avr:nano:cpu=atmega328old', name: 'Arduino Nano (old bootloader / clones)', group: 'Arduino' },
  { id: 'mega', fqbn: 'arduino:avr:mega', name: 'Arduino Mega 2560', group: 'Arduino' },
  { id: 'leonardo', fqbn: 'arduino:avr:leonardo', name: 'Arduino Leonardo', group: 'Arduino' },
];

const CORES = [
  { id: 'esp32:esp32', name: 'ESP32 (Espressif)', note: 'ESP32, S3, C3, CYD and M5Stack boards. Large download (about 1 GB).' },
  { id: 'arduino:avr', name: 'Arduino AVR', note: 'Uno, Nano, Mega, Leonardo. Small download.' },
];

let current = null;

function configFile() {
  const root = store.paths.arduino;
  const file = path.join(root, 'arduino-cli.yaml');
  const fwd = (p) => p.replace(/\\/g, '/');
  const yaml = [
    'board_manager:',
    '  additional_urls:',
    ...BOARD_URLS.map((u) => `    - ${u}`),
    'directories:',
    `  data: "${fwd(path.join(root, 'data'))}"`,
    `  downloads: "${fwd(path.join(root, 'staging'))}"`,
    `  user: "${fwd(path.join(root, 'user'))}"`,
    'network:',
    '  connection_timeout: 120s',
    'updater:',
    '  enable_notification: false',
    '',
  ].join('\n');
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== yaml) {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(file, yaml);
  }
  return file;
}

async function cli(args, onLog, { json = false } = {}) {
  if (current) throw new Error('arduino-cli is busy with another task.');
  const exe = await tools.ensure('arduino-cli', (p) => onLog && onLog({ type: 'tool', text: `${p.tool}: ${p.stage}`, pct: p.pct }));
  const full = ['--config-file', configFile(), ...args];
  if (json) full.push('--format', 'json');
  if (onLog && !json) onLog({ type: 'cmd', text: `> arduino-cli ${args.join(' ')}` });
  const job = run(exe, full, {
    onLine: onLog && !json ? (line, isErr) => {
      const pct = line.match(/(\d{1,3}(?:\.\d+)?)\s?%/);
      onLog({ type: isErr ? 'err' : 'line', text: line, pct: pct ? parseFloat(pct[1]) : undefined });
    } : null,
  });
  current = job.child;
  try {
    const r = await job.promise;
    if (r.signal || r.code === null) throw new Error('Cancelled');
    if (r.code !== 0) {
      const tail = (r.err || r.out).trim().split(/\r?\n/).filter(Boolean).slice(-4).join('\n');
      throw new Error(tail || `arduino-cli failed (code ${r.code})`);
    }
    if (json) {
      try {
        return JSON.parse(r.out);
      } catch {
        return null;
      }
    }
    return r;
  } finally {
    current = null;
  }
}

function coreOf(fqbn) {
  return fqbn.split(':').slice(0, 2).join(':');
}

async function listCores() {
  let installed = [];
  try {
    const r = await cli(['core', 'list'], null, { json: true });
    const rows = Array.isArray(r) ? r : (r && r.platforms) || [];
    installed = rows.map((p) => ({ id: p.id, version: p.installed_version || p.installed || (p.installed_release && p.installed_release.version) }));
  } catch {
    // arduino-cli not installed yet; report nothing installed
  }
  return CORES.map((c) => {
    const hit = installed.find((i) => i.id === c.id);
    return { ...c, installed: !!hit, version: hit ? hit.version : null };
  });
}

async function installCore(id, onLog) {
  onLog({ type: 'info', text: `Installing board package ${id}. This can take a while the first time.` });
  await cli(['core', 'update-index'], onLog);
  await cli(['core', 'install', id], onLog);
  onLog({ type: 'done', text: `${id} installed.` });
  return listCores();
}

async function ensureCore(fqbn, onLog) {
  const id = coreOf(fqbn);
  const cores = await listCores();
  const hit = cores.find((c) => c.id === id);
  if (hit && hit.installed) return;
  await installCore(id, onLog);
}

function buildDir(sketchDir, fqbn) {
  return path.join(store.paths.arduino, 'build', path.basename(sketchDir), fqbn.replace(/[^a-z0-9]+/gi, '_'));
}

async function compile({ sketchDir, fqbn }, onLog) {
  await ensureCore(fqbn, onLog);
  const out = buildDir(sketchDir, fqbn);
  fs.mkdirSync(out, { recursive: true });
  const r = await cli(['compile', '--fqbn', fqbn, '--output-dir', out, '--warnings', 'default', sketchDir], onLog);
  const text = r.out + '\n' + r.err;
  const flashUse = (text.match(/Sketch uses (\d+) bytes \((\d+)%\)/) || []).slice(1);
  const ramUse = (text.match(/Global variables use (\d+) bytes \((\d+)%\)/) || []).slice(1);
  const binaries = fs.readdirSync(out)
    .filter((f) => /\.(bin|hex)$/i.test(f) && !/bootloader|partitions|with_bootloader/i.test(f))
    .map((f) => path.join(out, f));
  const merged = binaries.find((f) => /\.merged\.bin$/i.test(f));
  onLog({ type: 'done', text: 'Compiled successfully.' });
  return {
    buildDir: out,
    binaries,
    best: merged || binaries.find((f) => /\.hex$/i.test(f)) || binaries[0] || null,
    flash: flashUse.length ? { bytes: +flashUse[0], pct: +flashUse[1] } : null,
    ram: ramUse.length ? { bytes: +ramUse[0], pct: +ramUse[1] } : null,
  };
}

async function upload({ sketchDir, fqbn, port }, onLog) {
  if (!port) throw new Error('Pick a COM port first.');
  const result = await compile({ sketchDir, fqbn }, onLog);
  onLog({ type: 'info', text: `Uploading to ${port}...` });
  await cli(['upload', '-p', port, '--fqbn', fqbn, '--input-dir', result.buildDir, sketchDir], onLog);
  onLog({ type: 'done', text: 'Upload complete.' });
  return result;
}

async function uploadHex({ port, fqbn, file }, onLog) {
  await ensureCore(fqbn, onLog);
  await cli(['upload', '-p', port, '--fqbn', fqbn, '--input-file', file], onLog);
  onLog({ type: 'done', text: 'Upload complete.', pct: 100, stage: 'Done' });
  return true;
}

async function libSearch(q) {
  const r = await cli(['lib', 'search', '--omit-releases-details', q], null, { json: true });
  const libs = (r && r.libraries) || [];
  return libs.slice(0, 40).map((l) => {
    const latest = l.latest || {};
    return {
      name: l.name,
      version: latest.version,
      author: latest.author,
      sentence: latest.sentence,
      website: latest.website,
    };
  });
}

async function libInstall(name, onLog) {
  await cli(['lib', 'install', name], onLog);
  onLog({ type: 'done', text: `Library "${name}" installed.` });
  return libList();
}

async function libList() {
  try {
    const r = await cli(['lib', 'list'], null, { json: true });
    const rows = Array.isArray(r) ? r : (r && r.installed_libraries) || [];
    return rows.map((x) => ({ name: x.library.name, version: x.library.version }));
  } catch {
    return [];
  }
}

function cancel() {
  if (current) {
    try {
      current.kill();
    } catch {}
  }
}

module.exports = { BOARDS, CORES, listCores, installCore, compile, upload, uploadHex, libSearch, libInstall, libList, cancel };
