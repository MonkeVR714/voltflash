// Firmware analysis and flashing. ESP chips go through esptool, AVR .hex
// files go through arduino-cli (which drives avrdude).
const fs = require('fs');
const path = require('path');
const tools = require('./tools');
const { run } = require('./proc');

const CHIP_IDS = {
  0: 'ESP32',
  2: 'ESP32-S2',
  5: 'ESP32-C3',
  9: 'ESP32-S3',
  12: 'ESP32-C2',
  13: 'ESP32-C6',
  16: 'ESP32-H2',
  18: 'ESP32-P4',
  20: 'ESP32-C61',
  23: 'ESP32-C5',
};
const FLASH_SIZES = ['1MB', '2MB', '4MB', '8MB', '16MB', '32MB', '64MB', '128MB'];
const APP_DESC_MAGIC = 0xabcd5432;

let current = null;

function cstr(buf, start, len) {
  if (buf.length < start + len) return '';
  const s = buf.subarray(start, start + len);
  const end = s.indexOf(0);
  return s.subarray(0, end < 0 ? len : end).toString('utf8').replace(/[^\x20-\x7e]/g, '').trim();
}

function imageHeader(buf, at) {
  if (buf.length < at + 24 || buf[at] !== 0xe9) return null;
  const chipId = buf.readUInt16LE(at + 12);
  return {
    chip: CHIP_IDS[chipId] || null,
    flashSize: FLASH_SIZES[buf[at + 3] >> 4] || null,
  };
}

function appDescription(buf, at) {
  const d = at + 0x20;
  if (buf.length < d + 144 || buf.readUInt32LE(d) !== APP_DESC_MAGIC) return null;
  return {
    version: cstr(buf, d + 16, 32),
    project: cstr(buf, d + 48, 32),
    built: `${cstr(buf, d + 96, 16)} ${cstr(buf, d + 80, 16)}`.trim(),
    idf: cstr(buf, d + 112, 32),
  };
}

// Works out what kind of image a file is and where it belongs in flash.
// Reads only the first 1 MB, which covers bootloader, partitions and app header.
function analyze(file) {
  const stat = fs.statSync(file);
  const ext = path.extname(file).toLowerCase();
  const base = { file, name: path.basename(file), size: stat.size };

  if (ext === '.hex') {
    return { ...base, kind: 'avr-hex', target: 'avr', offset: null, summary: 'Intel HEX for AVR boards (Arduino Uno, Nano, Mega)' };
  }

  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(Math.min(stat.size, 1024 * 1024));
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);

  const hasPartitions = buf.length > 0x8001 && buf[0x8000] === 0xaa && buf[0x8001] === 0x50;
  if (hasPartitions) {
    const bootAt = buf[0] === 0xe9 ? 0 : buf.length > 0x1000 && buf[0x1000] === 0xe9 ? 0x1000 : null;
    const hdr = bootAt !== null ? imageHeader(buf, bootAt) : null;
    const app = buf.length > 0x10000 ? appDescription(buf, 0x10000) : null;
    return {
      ...base,
      kind: 'merged',
      target: 'esp',
      offset: 0,
      chip: hdr && hdr.chip,
      flashSize: hdr && hdr.flashSize,
      app,
      summary: 'Full image (bootloader + partitions + app). Flashes at 0x0.',
    };
  }

  const hdr = imageHeader(buf, 0);
  if (hdr) {
    const app = appDescription(buf, 0);
    if (app) {
      return {
        ...base,
        kind: 'app',
        target: 'esp',
        offset: 0x10000,
        chip: hdr.chip,
        flashSize: hdr.flashSize,
        app,
        summary: 'App-only image. Flashes at 0x10000 and needs a matching bootloader already on the board.',
        warning: 'App-only images will not boot on a blank or differently partitioned board. Pick a "merged" or "factory" file when the release has one.',
      };
    }
    return {
      ...base,
      kind: 'esp-image',
      target: 'esp',
      offset: 0,
      chip: hdr.chip,
      flashSize: hdr.flashSize,
      summary: 'ESP image without an app header (probably a bootloader or merged image). Check the offset.',
    };
  }

  return {
    ...base,
    kind: 'raw',
    target: 'esp',
    offset: 0,
    summary: 'Unrecognised binary (filesystem image or another chip). Set the offset the project documents.',
    warning: 'VoltFlash could not identify this file. Make sure the offset matches the project instructions.',
  };
}

// esptool 5 renamed commands and options from snake_case to kebab-case.
async function esptool(onProgress) {
  const exe = await tools.ensure('esptool', onProgress);
  const v = (await tools.version('esptool')) || '5.0.0';
  const major = parseInt(v, 10) || 5;
  const c = (s) => (major >= 5 ? s.replace(/_/g, '-') : s);
  return { exe, c };
}

const HINTS = [
  [/No serial data received|Failed to connect|Wrong boot mode/i, 'The board did not enter download mode. Hold the BOOT button, tap RESET (or replug USB), release BOOT, then try again.'],
  [/could not open port|PermissionError|Access is denied|port is busy/i, 'The COM port is in use. Close the Serial Monitor, Arduino IDE or any other app using it.'],
  [/does not exist|FileNotFoundError.*COM|The system cannot find the file specified/i, 'That COM port disappeared. Check the USB cable (some are charge-only) and refresh the port list.'],
  [/This chip is (ESP[\w-]+), not (ESP[\w-]+)/i, 'This firmware is built for a different chip than the board you connected.'],
  [/exceeds|too big|beyond the end of flash/i, 'The image is larger than the flash on this board.'],
];

function hintFor(text) {
  for (const [re, hint] of HINTS) if (re.test(text)) return hint;
  return null;
}

function stageFor(line) {
  if (/Connecting/i.test(line)) return 'Connecting';
  if (/Chip (is|type)/i.test(line)) return 'Connected';
  if (/Erasing|erase/i.test(line)) return 'Erasing';
  if (/Writing at|Wrote/i.test(line)) return 'Writing';
  if (/Hash of data verified|Verifying/i.test(line)) return 'Verifying';
  if (/Hard resetting|Leaving|Resetting/i.test(line)) return 'Resetting';
  if (/avrdude|Uploading/i.test(line)) return 'Writing';
  return null;
}

function busy() {
  if (current) throw new Error('Another flash job is running.');
}

async function runJob(exe, args, onLog) {
  busy();
  onLog({ type: 'cmd', text: `> ${path.basename(exe)} ${args.join(' ')}` });
  const job = run(exe, args, {
    onLine: (line) => {
      const pct = line.match(/(\d{1,3}(?:\.\d+)?)\s?%/);
      const stage = stageFor(line);
      onLog({ type: 'line', text: line, pct: pct ? Math.min(100, parseFloat(pct[1])) : undefined, stage });
    },
  });
  current = job.child;
  try {
    const r = await job.promise;
    if (r.signal || r.code === null) throw new Error('Cancelled');
    if (r.code !== 0) {
      const all = r.out + '\n' + r.err;
      const err = new Error(hintFor(all) || 'Flashing failed. See the log for details.');
      throw err;
    }
    return r;
  } finally {
    current = null;
  }
}

function toolProgress(onLog) {
  return (p) => onLog({ type: 'tool', text: `${p.tool}: ${p.stage}`, pct: p.pct, stage: 'Preparing tools' });
}

async function flash(opts, onLog) {
  const { port, baud = 921600, files = [], erase = false, fqbn } = opts;
  if (!port) throw new Error('Pick a COM port first.');
  if (!files.length) throw new Error('No firmware selected.');

  if (files[0].path.toLowerCase().endsWith('.hex')) {
    const arduino = require('./arduino');
    return arduino.uploadHex({ port, fqbn: fqbn || 'arduino:avr:uno', file: files[0].path }, onLog);
  }

  const { exe, c } = await esptool(toolProgress(onLog));
  const args = ['--chip', 'auto', '--port', port, '--baud', String(baud), '--before', c('default_reset'), '--after', c('hard_reset'), c('write_flash')];
  if (erase) args.push('--erase-all');
  args.push('-z');
  for (const f of files) args.push('0x' + Number(f.offset).toString(16), f.path);
  await runJob(exe, args, onLog);
  onLog({ type: 'done', text: 'Flash complete. The board has been reset.', pct: 100, stage: 'Done' });
  return true;
}

async function detect(port, onLog) {
  if (!port) throw new Error('Pick a COM port first.');
  const { exe, c } = await esptool(toolProgress(onLog));
  const r = await runJob(exe, ['--port', port, '--after', c('hard_reset'), c('flash_id')], onLog);
  const text = r.out + '\n' + r.err;
  const grab = (re) => ((text.match(re) || [])[1] || '').trim();
  return {
    chip: grab(/Chip (?:is|type:)\s*([^\r\n]+)/i),
    features: grab(/Features:\s*([^\r\n]+)/i),
    crystal: grab(/Crystal (?:is|frequency:)\s*([^\r\n]+)/i),
    mac: grab(/MAC:\s*([0-9a-f:]{17})/i),
    flashSize: grab(/Detected flash size:\s*([^\r\n]+)/i),
  };
}

async function erase(port, onLog) {
  if (!port) throw new Error('Pick a COM port first.');
  const { exe, c } = await esptool(toolProgress(onLog));
  await runJob(exe, ['--chip', 'auto', '--port', port, c('erase_flash')], onLog);
  onLog({ type: 'done', text: 'Flash erased.', pct: 100, stage: 'Done' });
  return true;
}

function cancel() {
  if (current) {
    try {
      current.kill();
    } catch {}
  }
}

module.exports = { analyze, flash, detect, erase, cancel, CHIP_IDS };
