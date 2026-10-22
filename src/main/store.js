// Settings and user-added projects, kept as JSON files in the userData folder.
const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  baud: 921600,
  lastPort: '',
  githubToken: '',
  catalogUrl: '',
  eraseBeforeFlash: false,
  ideBoard: 'esp32:esp32:esp32',
  serialBaud: 115200,
  browserHome: 'https://github.com/topics/esp32',
};

const paths = {};
let settings = null;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function init(root) {
  paths.root = root;
  paths.tools = path.join(root, 'tools');
  paths.downloads = path.join(root, 'downloads');
  // not "cache": Windows paths are case-insensitive and Chromium owns userData/Cache
  paths.cache = path.join(root, 'vf-cache');
  paths.arduino = path.join(root, 'arduino');
  paths.sketches = path.join(root, 'sketches');
  paths.settings = path.join(root, 'settings.json');
  paths.projects = path.join(root, 'projects.json');
  for (const key of ['tools', 'downloads', 'cache', 'arduino', 'sketches']) {
    fs.mkdirSync(paths[key], { recursive: true });
  }
  settings = { ...DEFAULT_SETTINGS, ...readJson(paths.settings, {}) };
}

function getSettings() {
  return { ...settings };
}

function setSettings(patch) {
  settings = { ...settings, ...patch };
  writeJson(paths.settings, settings);
  return getSettings();
}

function getProjects() {
  return readJson(paths.projects, []);
}

function saveProject(project) {
  const list = getProjects();
  if (!project.id) project.id = 'p_' + Date.now().toString(36);
  project.updatedAt = Date.now();
  const i = list.findIndex((p) => p.id === project.id);
  if (i >= 0) list[i] = { ...list[i], ...project };
  else list.unshift(project);
  writeJson(paths.projects, list);
  return project;
}

function removeProject(id) {
  writeJson(paths.projects, getProjects().filter((p) => p.id !== id));
  return true;
}

module.exports = { init, paths, getSettings, setSettings, getProjects, saveProject, removeProject, readJson, writeJson };
