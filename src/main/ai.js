// Local AI assistant: talks to Ollama (http://127.0.0.1:11434) and grounds
// answers in the knowledge pack, the selected board and attached files.
const store = require('./store');
const knowledge = require('./knowledge');

const DEFAULT_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'qwen2.5-coder:3b';
const MODELS = [
  { name: 'qwen2.5-coder:3b', size: '1.9 GB', note: 'fast, good at code' },
  { name: 'qwen2.5-coder:7b', size: '4.7 GB', note: 'better answers, needs 8 GB+ RAM' },
  { name: 'llama3.2:3b', size: '2.0 GB', note: 'general chat' },
];

let chatAbort = null;
let pullAbort = null;

const url = () => (store.getSettings().ollamaUrl || DEFAULT_URL).replace(/\/+$/, '');
const model = () => store.getSettings().aiModel || DEFAULT_MODEL;

async function status() {
  const base = url();
  try {
    const v = await (await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(2500) })).json();
    const tags = await (await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) })).json();
    const models = (tags.models || []).map((m) => m.name);
    const want = model();
    const hasModel = models.some((m) => m === want || m === `${want}:latest`);
    return { running: true, version: v.version, models, model: want, hasModel, url: base, choices: MODELS };
  } catch {
    return { running: false, models: [], model: model(), hasModel: false, url: base, choices: MODELS };
  }
}

// Reads Ollama's newline-delimited JSON stream.
async function* ndjson(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) yield JSON.parse(line);
    }
  }
  if (buf.trim()) yield JSON.parse(buf);
}

async function pull(name, onProgress) {
  pullAbort = new AbortController();
  const res = await fetch(`${url()}/api/pull`, {
    method: 'POST',
    body: JSON.stringify({ model: name || model(), stream: true }),
    signal: pullAbort.signal,
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  for await (const msg of ndjson(res)) {
    if (msg.error) throw new Error(msg.error);
    onProgress({ status: msg.status, pct: msg.total ? Math.round((msg.completed / msg.total) * 100) : null });
  }
  pullAbort = null;
  return status();
}

const SYSTEM = `You are the VoltFlash Assistant, an expert on ESP32 (classic, S3, C3), the Cheap Yellow Display (CYD), M5Stack devices and Arduino boards, running inside the VoltFlash firmware flasher.

Rules:
- Use the REFERENCE NOTES below as your source of truth for pin numbers, wiring and fixes. If the notes don't cover something, say you're not sure instead of guessing. Never invent pin numbers.
- When the user has a board selected, answer for that board and its pins.
- Keep answers short and practical: steps, a pin table, or code. No filler.
- Code: Arduino C++ for the Arduino-ESP32 core 3.x (use ledcAttach/ledcWrite, not ledcSetup). Put code in \`\`\`cpp blocks. Complete sketches when asked for code.
- Wiring: list each connection as "module pin -> board pin". Mention 3.3 V vs 5 V and shared GND when it matters.
- Firmware files: explain what the firmware does from the report (libraries, text, partitions), what hardware it expects, and how to flash it (offset). Say clearly when something is a guess.
- In VoltFlash: flash from the Store or "Open file", build code in the Arduino IDE page, watch output in Serial Monitor, restore old firmware in Backups.`;

function trim(text, max) {
  return text.length > max ? text.slice(0, max) + '\n...(trimmed)' : text;
}

async function chat({ messages, board, boardName, attachments = [] }, onEvent) {
  if (chatAbort) chatAbort.abort();
  chatAbort = new AbortController();
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  // the question decides most notes; attachments add a couple of their own
  const refs = knowledge.search(lastUser ? lastUser.content : '', { board, limit: 4 });
  const extra = attachments.map((a) => a.keywords || '').join(' ').trim();
  if (extra) for (const r of knowledge.search(extra, { board, limit: 2 })) if (!refs.includes(r)) refs.push(r);

  let context = SYSTEM;
  context += `\n\nSELECTED BOARD: ${boardName || 'none (ask which board if it matters)'}`;
  let budget = 7000;
  context += '\n\nREFERENCE NOTES:';
  for (const r of refs) {
    const block = `\n\n### ${r.doc} - ${r.title}\n${r.text}`;
    if (block.length > budget) break;
    budget -= block.length;
    context += block;
  }
  for (const a of attachments) {
    context += `\n\nATTACHED ${a.kind.toUpperCase()} "${a.name}":\n${trim(a.text || '', 5000)}`;
  }

  const body = {
    model: model(),
    stream: true,
    options: { temperature: 0.3, num_ctx: 8192 },
    messages: [{ role: 'system', content: context }, ...messages.slice(-10)],
  };
  let res;
  try {
    res = await fetch(`${url()}/api/chat`, { method: 'POST', body: JSON.stringify(body), signal: chatAbort.signal });
  } catch (err) {
    if (err.name === 'AbortError') return { stopped: true };
    throw new Error('Ollama is not running. Start it, or install it from ollama.com.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 404) throw new Error(`Model "${model()}" is not downloaded yet.`);
    throw new Error(`Ollama error ${res.status} ${text.slice(0, 200)}`);
  }
  let full = '';
  try {
    for await (const msg of ndjson(res)) {
      if (msg.error) throw new Error(msg.error);
      const t = msg.message && msg.message.content;
      if (t) {
        full += t;
        onEvent({ type: 'token', text: t });
      }
      if (msg.done) break;
    }
  } catch (err) {
    if (err.name === 'AbortError') return { stopped: true, text: full };
    throw err;
  } finally {
    chatAbort = null;
  }
  return { text: full, refs: refs.map((r) => `${r.doc} > ${r.title}`) };
}

function cancel() {
  if (chatAbort) chatAbort.abort();
  if (pullAbort) pullAbort.abort();
}

// README of a GitHub project, cleaned up for the model.
async function readme(repo) {
  for (const name of ['README.md', 'readme.md', 'README.MD']) {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${repo}/HEAD/${name}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const text = (await res.text())
        .replace(/<[^>]+>/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\n{3,}/g, '\n\n');
      return trim(text, 6000);
    } catch {}
  }
  return '';
}

module.exports = { status, pull, chat, cancel, readme, MODELS, DEFAULT_MODEL };
