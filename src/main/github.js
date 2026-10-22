// GitHub access: the firmware catalog, release listings and asset downloads.
const fs = require('fs');
const path = require('path');
const store = require('./store');

const API = 'https://api.github.com';
const RELEASE_TTL = 10 * 60 * 1000;
const memo = new Map();

function headers(extra = {}) {
  const h = { 'User-Agent': 'VoltFlash', Accept: 'application/vnd.github+json', ...extra };
  const token = store.getSettings().githubToken;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function api(route) {
  const res = await fetch(API + route, { headers: headers() });
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
    const mins = reset ? Math.max(1, Math.round((reset - Date.now()) / 60000)) : null;
    throw new Error(`GitHub rate limit reached${mins ? `, try again in ~${mins} min` : ''}. Add a GitHub token in Settings to raise the limit.`);
  }
  if (res.status === 404) throw new Error('Not found on GitHub: ' + route.replace('/repos/', ''));
  if (!res.ok) throw new Error(`GitHub error ${res.status}`);
  return res.json();
}

// Cache API answers on disk too so the store still works offline.
async function cachedApi(key, route, force) {
  const hit = memo.get(key);
  if (!force && hit && Date.now() - hit.at < RELEASE_TTL) return hit.data;
  const file = path.join(store.paths.cache, key.replace(/[^a-z0-9_.-]/gi, '_') + '.json');
  try {
    const data = await api(route);
    memo.set(key, { at: Date.now(), data });
    store.writeJson(file, data);
    return data;
  } catch (err) {
    const disk = store.readJson(file, null);
    if (disk) return disk;
    throw err;
  }
}

function normalizeRepo(input) {
  const m = String(input).trim().match(/(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/i);
  if (!m) throw new Error('That does not look like a GitHub repo. Use owner/name or a github.com link.');
  return `${m[1]}/${m[2]}`;
}

const FIRMWARE_EXT = /\.(bin|hex)$/i;

// When the API is unavailable (usually the 60/hour limit), read the latest
// release from github.com pages instead, which are not rate limited.
async function latestReleaseFromWeb(repo) {
  const res = await fetch(`https://github.com/${repo}/releases/latest`, { headers: { 'User-Agent': 'VoltFlash' }, redirect: 'manual' });
  const loc = res.headers.get('location') || '';
  const tag = decodeURIComponent((loc.match(/\/releases\/tag\/([^/?#]+)/) || [])[1] || '');
  if (!tag) throw new Error('No releases found');
  const page = await fetch(`https://github.com/${repo}/releases/expanded_assets/${encodeURIComponent(tag)}`, { headers: { 'User-Agent': 'VoltFlash' } });
  if (!page.ok) throw new Error(`GitHub page error ${page.status}`);
  const html = await page.text();
  const seen = new Set();
  const assets = [];
  const re = /href="(\/[^"]+\/releases\/download\/[^"]+\/([^"/]+))"/g;
  let m;
  while ((m = re.exec(html))) {
    const name = decodeURIComponent(m[2]);
    if (seen.has(name)) continue;
    seen.add(name);
    assets.push({ name, size: 0, browser_download_url: 'https://github.com' + m[1], download_count: 0 });
  }
  return [{ tag_name: tag, name: tag, prerelease: false, draft: false, published_at: null, body: '', html_url: `https://github.com/${repo}/releases/tag/${tag}`, assets }];
}

async function getReleases(repoInput, force) {
  const repo = normalizeRepo(repoInput);
  let list;
  try {
    list = await cachedApi(`releases_${repo}`, `/repos/${repo}/releases?per_page=15`, force);
  } catch (err) {
    try {
      list = await latestReleaseFromWeb(repo);
    } catch {
      throw err;
    }
  }
  return list
    .filter((r) => !r.draft)
    .map((r) => ({
      tag: r.tag_name,
      name: r.name || r.tag_name,
      prerelease: r.prerelease,
      published: r.published_at,
      notes: (r.body || '').slice(0, 4000),
      url: r.html_url,
      assets: r.assets
        .filter((a) => FIRMWARE_EXT.test(a.name))
        .map((a) => ({ name: a.name, size: a.size, url: a.browser_download_url, downloads: a.download_count, repo, tag: r.tag_name })),
    }))
    .filter((r) => r.assets.length);
}

async function getRepoInfo(repoInput) {
  const repo = normalizeRepo(repoInput);
  const r = await cachedApi(`repo_${repo}`, `/repos/${repo}`);
  return {
    repo,
    name: r.name,
    owner: r.owner && r.owner.login,
    description: r.description || '',
    stars: r.stargazers_count,
    license: r.license && r.license.spdx_id,
    url: r.html_url,
    topics: r.topics || [],
    updated: r.pushed_at,
  };
}

async function downloadFile(url, dest, onProgress = () => {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'VoltFlash' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  const out = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  let received = 0;
  let lastTick = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
      if (Date.now() - lastTick > 100) {
        lastTick = Date.now();
        onProgress(received, total);
      }
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  } catch (err) {
    out.destroy();
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  onProgress(received, total);
  fs.renameSync(tmp, dest);
  return dest;
}

// Downloads a release asset into downloads/<owner>_<repo>/<tag>/ and reuses
// an earlier download when the size matches.
async function downloadAsset(asset, onProgress) {
  const safe = (s) => String(s).replace(/[^a-z0-9_.-]/gi, '_');
  const dest = path.join(store.paths.downloads, safe(asset.repo), safe(asset.tag), asset.name);
  if (fs.existsSync(dest) && (!asset.size || fs.statSync(dest).size === asset.size)) {
    onProgress({ name: asset.name, pct: 100, cached: true });
    return dest;
  }
  await downloadFile(asset.url, dest, (received, total) => {
    onProgress({ name: asset.name, received, total, pct: total ? Math.round((received / total) * 100) : 0 });
  });
  return dest;
}

// The catalog is the bundled catalog.json, optionally replaced by a remote one
// (Settings > Catalog URL). The last good remote copy is cached for offline use.
async function getCatalog(force) {
  const bundled = store.readJson(path.join(__dirname, '..', '..', 'catalog.json'), { firmware: [] });
  const url = store.getSettings().catalogUrl;
  if (!url) return { source: 'built-in', ...bundled };
  const cacheFile = path.join(store.paths.cache, 'remote-catalog.json');
  try {
    const key = 'catalog';
    const hit = memo.get(key);
    if (!force && hit && Date.now() - hit.at < RELEASE_TTL) return hit.data;
    const res = await fetch(url, { headers: { 'User-Agent': 'VoltFlash' } });
    if (!res.ok) throw new Error(`Catalog download failed (${res.status})`);
    const remote = await res.json();
    if (!Array.isArray(remote.firmware)) throw new Error('Catalog has no "firmware" list');
    const data = { source: url, ...remote };
    memo.set(key, { at: Date.now(), data });
    store.writeJson(cacheFile, data);
    return data;
  } catch (err) {
    const cached = store.readJson(cacheFile, null);
    if (cached) return { ...cached, warning: `Using cached catalog: ${err.message}` };
    return { source: 'built-in', ...bundled, warning: `Remote catalog unavailable: ${err.message}` };
  }
}

module.exports = { api, getReleases, getRepoInfo, downloadFile, downloadAsset, getCatalog, normalizeRepo };
