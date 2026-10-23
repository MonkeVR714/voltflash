const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

function on(channel) {
  return (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('vf', {
  settings: { get: invoke('settings:get'), set: invoke('settings:set') },
  app: {
    info: invoke('app:info'),
    openPath: invoke('app:openPath'),
    openExternal: invoke('app:openExternal'),
    showItem: invoke('app:showItem'),
    pickFirmware: invoke('dialog:openFirmware'),
    pickImage: invoke('dialog:openImage'),
    pathForFile: (file) => webUtils.getPathForFile(file),
  },
  tools: { status: invoke('tools:status'), install: invoke('tools:install'), onProgress: on('tools:progress') },
  ports: { list: invoke('ports:list'), want: (p) => ipcRenderer.send('serial:want', p) },
  catalog: { get: invoke('catalog:get') },
  github: {
    releases: invoke('github:releases'),
    repoInfo: invoke('github:repoInfo'),
    download: invoke('github:download'),
    onProgress: on('download:progress'),
  },
  flash: {
    analyze: invoke('flash:analyze'),
    start: invoke('flash:start'),
    cancel: invoke('flash:cancel'),
    detect: invoke('flash:detect'),
    erase: invoke('flash:erase'),
    onLog: on('flash:log'),
  },
  backups: {
    create: invoke('backups:create'),
    list: invoke('backups:list'),
    update: invoke('backups:update'),
    trash: invoke('backups:trash'),
    folder: invoke('backups:folder'),
  },
  projects: { list: invoke('projects:list'), save: invoke('projects:save'), remove: invoke('projects:remove') },
  arduino: {
    boards: invoke('arduino:boards'),
    cores: invoke('arduino:cores'),
    installCore: invoke('arduino:installCore'),
    compile: invoke('arduino:compile'),
    upload: invoke('arduino:upload'),
    cancel: invoke('arduino:cancel'),
    libSearch: invoke('arduino:libSearch'),
    libInstall: invoke('arduino:libInstall'),
    libList: invoke('arduino:libList'),
    onLog: on('ide:log'),
  },
  sketch: {
    templates: invoke('sketch:templates'),
    list: invoke('sketch:list'),
    create: invoke('sketch:create'),
    files: invoke('sketch:files'),
    read: invoke('sketch:read'),
    write: invoke('sketch:write'),
    setBoard: invoke('sketch:setBoard'),
    addFile: invoke('sketch:addFile'),
    trash: invoke('sketch:trash'),
    dir: invoke('sketch:dir'),
  },
  browser: { onDownload: on('browser:download') },
  update: {
    state: invoke('update:state'),
    check: invoke('update:check'),
    install: invoke('update:install'),
    onState: on('update:state'),
  },
});
