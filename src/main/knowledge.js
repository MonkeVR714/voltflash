// The ESP32 / Arduino knowledge pack: markdown notes in /knowledge, split into
// sections and searched with BM25 so the assistant can quote real pinouts and
// fixes instead of guessing. Also feeds the Pinouts page.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'knowledge');
const STOP = new Set('the a an and or of to in on for is it be with as at by this that are from if not can use your you how what do does my i me'.split(' '));

let chunks = null;
let df = null;
let avgLen = 0;

function tokens(text) {
  return text.toLowerCase().replace(/gpio\s?(\d+)/g, 'gpio$1 $1').split(/[^a-z0-9_.+-]+/)
    .map((t) => t.replace(/^[.+-]+|[.+-]+$/g, ''))
    .filter((t) => t.length > 1 || /\d/.test(t))
    .filter((t) => !STOP.has(t));
}

function load() {
  if (chunks) return chunks;
  chunks = [];
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).sort()) {
    const lines = fs.readFileSync(path.join(DIR, file), 'utf8').split(/\r?\n/);
    let boards = [];
    let doc = file.replace(/\.md$/, '');
    let current = null;
    const flush = () => {
      if (current && current.lines.join('').trim()) {
        const text = current.lines.join('\n').trim();
        chunks.push({ id: `${file}#${chunks.length}`, file, doc: current.doc, title: current.title, boards: current.boards, text, terms: tokens(`${current.doc} ${current.title} ${text}`) });
      }
      current = null;
    };
    for (const line of lines) {
      const b = line.match(/^<!--\s*boards:\s*([^>]*?)\s*-->/);
      if (b) { flush(); boards = b[1].split(',').map((s) => s.trim()).filter(Boolean); continue; }
      const h1 = line.match(/^#\s+(.*)/);
      if (h1) { flush(); doc = h1[1].trim(); continue; }
      const h2 = line.match(/^##\s+(.*)/);
      if (h2) { flush(); current = { doc, title: h2[1].trim(), boards, lines: [] }; continue; }
      if (current) current.lines.push(line);
    }
    flush();
  }
  df = new Map();
  let total = 0;
  for (const c of chunks) {
    total += c.terms.length;
    c.tf = new Map();
    for (const t of c.terms) c.tf.set(t, (c.tf.get(t) || 0) + 1);
    for (const t of c.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  }
  avgLen = total / Math.max(1, chunks.length);
  return chunks;
}

// BM25 ranking, with a boost for sections about the selected board.
function search(query, { board, limit = 5 } = {}) {
  load();
  const q = Array.from(new Set(tokens(query)));
  const N = chunks.length;
  const k1 = 1.4;
  const b = 0.75;
  const scored = chunks.map((c) => {
    let s = 0;
    for (const t of q) {
      const f = c.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * c.terms.length) / avgLen)));
    }
    if (board && c.boards.includes(board)) s *= 1.6;
    else if (board && c.boards.length && !c.boards.includes(board)) s *= 0.5;
    if (board && SECTION[board] && c.title.includes(SECTION[board])) s *= 2;
    return { c, s };
  }).filter((x) => x.s > 0).sort((a, b2) => b2.s - a.s);

  const out = scored.slice(0, limit).map((x) => x.c);
  // always include the selected board's pinout so pin answers are grounded
  const pin = board && pinoutFor(board);
  if (pin && !out.includes(pin)) out.unshift(pin);
  return out.slice(0, limit + 1);
}

// Boards that share a notes file, and the section title that is theirs.
const SECTION = {
  m5core: 'Core (Basic',
  m5core2: 'Core2',
  m5cores3: 'CoreS3',
  m5stickcplus: 'StickC Plus',
  m5stickcplus2: 'StickC Plus',
  m5cardputer: 'Cardputer',
  uno: 'Uno',
  nano: 'Nano',
  nanoold: 'Nano',
  mega: 'Mega',
  leonardo: 'Leonardo',
};

function pinoutFor(board) {
  load();
  const own = chunks.filter((c) => c.boards.includes(board) && c.boards.length <= 7 && /pinout/i.test(c.title));
  return (SECTION[board] && own.find((c) => c.title.includes(SECTION[board]))) || own[0] || null;
}

// Sections that describe one board (for the Pinouts page).
function forBoard(board) {
  load();
  return chunks.filter((c) => c.boards.includes(board) && c.boards.length <= 7)
    .map(({ doc, title, text }) => ({ doc, title, text }));
}

function byFile(file) {
  load();
  return chunks.filter((c) => c.file === file).map(({ doc, title, text }) => ({ doc, title, text }));
}

module.exports = { search, forBoard, byFile, load };
