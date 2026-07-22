const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  setup: {
    check: () => ipcRenderer.invoke('setup:check'),
    installSkills: () => ipcRenderer.invoke('setup:installSkills'),
    installCodex: () => ipcRenderer.invoke('setup:installCodex'),
    codexLogin: () => ipcRenderer.invoke('setup:codexLogin'),
    registerMcp: () => ipcRenderer.invoke('setup:registerMcp'),
    registerQrMcp: () => ipcRenderer.invoke('setup:registerQrMcp'),
    installIma2: () => ipcRenderer.invoke('setup:installIma2'),
    installVideoSkills: () => ipcRenderer.invoke('setup:installVideoSkills'),
    videoSkillsStatus: () => ipcRenderer.invoke('setup:videoSkillsStatus'),
    installImagePromptKit: () => ipcRenderer.invoke('setup:installImagePromptKit'),
    imagePromptKitStatus: () => ipcRenderer.invoke('setup:imagePromptKitStatus'),
    ima2Setup: () => ipcRenderer.invoke('setup:ima2Setup'),
  },
  ws: {
    list: () => ipcRenderer.invoke('ws:list'),
    create: (name) => ipcRenderer.invoke('ws:create', name),
    pickFolder: () => ipcRenderer.invoke('ws:pickFolder'),
    status: (dir) => ipcRenderer.invoke('ws:status', dir),
    outputs: (dir) => ipcRenderer.invoke('ws:outputs', dir),
    readFile: (dir, rel) => ipcRenderer.invoke('ws:readFile', dir, rel),
    readImage: (dir, rel, maxEdge) => ipcRenderer.invoke('ws:readImage', dir, rel, maxEdge),
    openFolder: (dir) => ipcRenderer.invoke('ws:openFolder', dir),
    board: (dir) => ipcRenderer.invoke('ws:board', dir),
    watch: (dir) => ipcRenderer.invoke('ws:watch', dir),
  },
  gates: {
    get: (dir) => ipcRenderer.invoke('gates:get', dir),
    approve: (dir, entry) => ipcRenderer.invoke('gates:approve', dir, entry),
  },
  channels: {
    check: () => ipcRenderer.invoke('channels:check'),
  },
  pub: {
    mark: (dir, uid, on) => ipcRenderer.invoke('pub:mark', dir, uid, on),
    copy: (dir, rel, topic) => ipcRenderer.invoke('pub:copy', dir, rel, topic),
  },
  app: {
    log: (source, line) => ipcRenderer.invoke('app:log', source, line),
    openLogs: () => ipcRenderer.invoke('app:openLogs'),
    copyLogs: () => ipcRenderer.invoke('app:copyLogs'),
  },
  pipe: {
    runStage: (dir, stage, opts) => ipcRenderer.invoke('pipe:runStage', dir, stage, opts),
    stop: (dir) => ipcRenderer.invoke('pipe:stop', dir),
    openTerminal: (dir) => ipcRenderer.invoke('pipe:openTerminal', dir),
  },
  slidevideo: {
    render: (dir, manifestRel) => ipcRenderer.invoke('slidevideo:render', dir, manifestRel),
    list: (dir) => ipcRenderer.invoke('slidevideo:list', dir),
  },
  engine: {
    get: () => ipcRenderer.invoke('cfg:getEngine'),
    set: (engine) => ipcRenderer.invoke('cfg:setEngine', engine),
    getStageEngines: () => ipcRenderer.invoke('cfg:getStageEngines'),
    setStageEngine: (stage, engine) => ipcRenderer.invoke('cfg:setStageEngine', stage, engine),
    getModels: () => ipcRenderer.invoke('cfg:getModels'),
    setModel: (engine, model) => ipcRenderer.invoke('cfg:setModel', engine, model),
    getBudget: () => ipcRenderer.invoke('cfg:getBudget'),
    setBudget: (usd) => ipcRenderer.invoke('cfg:setBudget', usd),
    getImageStyle: () => ipcRenderer.invoke('cfg:getImageStyle'),
    setImageStyle: (key) => ipcRenderer.invoke('cfg:setImageStyle', key),
  },
  chat: {
    send: (dir, msg) => ipcRenderer.invoke('chat:send', dir, msg),
    stop: () => ipcRenderer.invoke('chat:stop'),
    history: (dir) => ipcRenderer.invoke('chat:history', dir),
    reset: (dir) => ipcRenderer.invoke('chat:reset', dir),
  },
  auto: {
    run: (dir) => ipcRenderer.invoke('auto:run', dir),
    stop: (dir) => ipcRenderer.invoke('auto:stop', dir),
    status: (dir) => ipcRenderer.invoke('auto:status', dir),
    runningDirs: () => ipcRenderer.invoke('auto:runningDirs'),
    getAutoApprove: () => ipcRenderer.invoke('cfg:getAutoApprove'),
    setAutoApprove: (on) => ipcRenderer.invoke('cfg:setAutoApprove', on),
  },
  hist: {
    list: (dir) => ipcRenderer.invoke('hist:list', dir),
  },
  backup: {
    create: (dir) => ipcRenderer.invoke('bk:create', dir),
    list: () => ipcRenderer.invoke('bk:list'),
    restore: (name, dir) => ipcRenderer.invoke('bk:restore', name, dir),
    remove: (name) => ipcRenderer.invoke('bk:delete', name),
    open: () => ipcRenderer.invoke('bk:open'),
  },
  render: {
    providers: (envHint) => ipcRenderer.invoke('render:providers', envHint),
    generate: (dir, job) => ipcRenderer.invoke('render:generate', dir, job),
    batch: (dir, opts) => ipcRenderer.invoke('render:batch', dir, opts),
    variants: (dir, job) => ipcRenderer.invoke('render:variants', dir, job),
    listVariants: (dir, uid) => ipcRenderer.invoke('render:listVariants', dir, uid),
    pickVariant: (dir, uid, name, slot) => ipcRenderer.invoke('render:pickVariant', dir, uid, name, slot),
    styles: () => ipcRenderer.invoke('render:styles'),
  },
  post: {
    deleteAssets: (dir, uid, opts) => ipcRenderer.invoke('post:deleteAssets', dir, uid, opts),
  },
  sheet: {
    list: (dir) => ipcRenderer.invoke('sheet:list', dir),
    get: (dir, channel) => ipcRenderer.invoke('sheet:get', dir, channel),
    save: (dir, channel, data) => ipcRenderer.invoke('sheet:save', dir, channel, data),
    lock: (dir, channel, locked) => ipcRenderer.invoke('sheet:lock', dir, channel, locked),
    generate: (dir, channel) => ipcRenderer.invoke('sheet:generate', dir, channel),
    genRef: (dir, channel, which, index) => ipcRenderer.invoke('sheet:genRef', dir, channel, which, index),
    setLogo: (dir, channel) => ipcRenderer.invoke('sheet:setLogo', dir, channel),
    clearLogo: (dir, channel) => ipcRenderer.invoke('sheet:clearLogo', dir, channel),
  },
  prompt: {
    compile: (dir, job) => ipcRenderer.invoke('prompt:compile', dir, job),
  },
  ref: {
    analyze: (dir, urls) => ipcRenderer.invoke('ref:analyze', dir, urls),
  },
  ob: {
    questions: () => ipcRenderer.invoke('ob:questions'),
    followups: (dir, answers) => ipcRenderer.invoke('ob:followups', dir, answers),
    finalize: (dir, answers, followupAnswers) => ipcRenderer.invoke('ob:finalize', dir, answers, followupAnswers),
  },
  packs: {
    list: () => ipcRenderer.invoke('packs:list'),
    delete: (file) => ipcRenderer.invoke('packs:delete', file),
    ocSearch: (query) => ipcRenderer.invoke('oc:search', query),
    ocLoad: (pack) => ipcRenderer.invoke('oc:load', pack),
    ocConstants: () => ipcRenderer.invoke('oc:constants'),
    ocProjects: () => ipcRenderer.invoke('oc:projects'),
    ocRunWorkflow: (key, args) => ipcRenderer.invoke('oc:runWorkflow', key, args),
    ocRoute: (channel) => ipcRenderer.invoke('oc:route', channel),
  },
  vassets: {
    list: (dir) => ipcRenderer.invoke('vassets:list', dir),
    ensure: (dir) => ipcRenderer.invoke('vassets:ensure', dir),
    ingest: (dir, projectName) => ipcRenderer.invoke('vassets:ingest', dir, projectName),
  },
  orch: {
    tasks: () => ipcRenderer.invoke('orch:tasks'),
    run: (dir, taskName, extra) => ipcRenderer.invoke('orch:run', dir, taskName, extra),
  },
  strat: {
    extract: (dir) => ipcRenderer.invoke('strat:extract', dir),
    list: (dir) => ipcRenderer.invoke('strat:list', dir),
    ingest: (dir, projectName) => ipcRenderer.invoke('strat:ingest', dir, projectName),
  },
  sec: {
    get: (ns) => ipcRenderer.invoke('sec:get', ns),
    set: (ns, values) => ipcRenderer.invoke('sec:set', ns, values),
    invalidateChannels: () => ipcRenderer.invoke('sec:invalidateChannels'),
  },
  cmt: {
    list: (dir, uid) => ipcRenderer.invoke('cmt:list', dir, uid),
    draft: (dir, payload) => ipcRenderer.invoke('cmt:draft', dir, payload),
    reply: (dir, payload) => ipcRenderer.invoke('cmt:reply', dir, payload),
  },
  pub2: {
    draft: (dir, lane, topic) => ipcRenderer.invoke('pub2:draft', dir, lane, topic),
    status: () => ipcRenderer.invoke('pub2:status'),
    publishNow: (dir, payload) => ipcRenderer.invoke('pub2:publishNow', dir, payload),
    schedule: (dir, payload) => ipcRenderer.invoke('pub2:schedule', dir, payload),
    queue: (dir) => ipcRenderer.invoke('pub2:queue', dir),
    cancel: (dir, qid) => ipcRenderer.invoke('pub2:cancel', dir, qid),
    test: (channel) => ipcRenderer.invoke('pub2:test', channel),
  },
  update: {
    version: () => ipcRenderer.invoke('update:version'),
    check: () => ipcRenderer.invoke('update:check'),
    status: () => ipcRenderer.invoke('update:status'),
    install: () => ipcRenderer.invoke('update:install'),
    openReleases: () => ipcRenderer.invoke('update:openReleases'),
  },
  onLog: (cb) => subscribe('log', cb),
  onUpdate: (cb) => subscribe('update', cb),
  onBoard: (cb) => subscribe('board:update', cb),
  onStage: (cb) => subscribe('stage', cb),
  onStageResult: (cb) => subscribe('stage:result', cb),
  onChatStream: (cb) => subscribe('chat:stream', cb),
  onAuto: (cb) => subscribe('auto', cb),
});

// 구독 해제자를 반환 — 재구독 패턴에서 리스너가 누적되지 않게
function subscribe(channel, cb) {
  const h = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
}
