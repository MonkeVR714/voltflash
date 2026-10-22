// Small helpers for running external tools and streaming their output.
const { spawn } = require('child_process');

// Runs a command, calling onLine for every line of stdout/stderr. Tools like
// esptool redraw progress with \r, so both \r and \n end a line.
function run(cmd, args, { onLine, cwd, env } = {}) {
  let child;
  const promise = new Promise((resolve, reject) => {
    child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, windowsHide: true });
    let out = '';
    let err = '';
    const split = (chunk, isErr) => {
      const text = chunk.toString();
      if (isErr) err += text;
      else out += text;
      if (!onLine) return;
      for (const line of text.split(/\r\n|\r|\n/)) {
        if (line.trim()) onLine(line, isErr);
      }
    };
    child.stdout.on('data', (c) => split(c, false));
    child.stderr.on('data', (c) => split(c, true));
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, out, err }));
  });
  return { child, promise };
}

async function runOk(cmd, args, opts) {
  const r = await run(cmd, args, opts).promise;
  if (r.code !== 0) {
    const tail = (r.err || r.out).trim().split(/\r?\n/).slice(-6).join('\n');
    throw new Error(tail || `${cmd} exited with code ${r.code}`);
  }
  return r;
}

function powershell(script) {
  return runOk('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
}

module.exports = { run, runOk, powershell };
