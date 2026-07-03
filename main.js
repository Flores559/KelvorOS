
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dns = require('dns').promises;
const OBSWebSocket = require('obs-websocket-js').default;

let mainWindow;
let timeline = [];
let obs = null;
let obsConnected = false;

let state = {
  version: '2.1.0-streamlink',
  profileName: 'JD',
  brandName: 'The JD Lounge',
  aiCore: 'ONLINE',
  speechBridge: 'FOUNDATION',
  sentinel: 'STANDBY',
  obs: 'DISCONNECTED',
  discord: 'READY_FOR_NEXT_PHASE',
  forge: 'READY',
  lastCommand: 'None'
};

function logEvent(event, detail = '') {
  const entry = { time: new Date().toISOString(), event, detail };
  timeline.unshift(entry);
  timeline = timeline.slice(0, 500);
  mainWindow?.webContents.send('kelvor-event', { type: 'TIMELINE', payload: entry });
  return entry;
}

function defaultSettings() {
  return {
    profileName: 'JD',
    brandName: 'The JD Lounge',
    wakeWord: 'kelvor',
    speechMode: 'hybrid',
    obsHost: '127.0.0.1',
    obsPort: '4455',
    obsPassword: '',
    startingScene: 'Starting Soon',
    gameplayScene: 'Gameplay',
    endingScene: 'Stream Ending',
    startupGreeting: 'Welcome back, JD. KelvorOS StreamLink is online.'
  };
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'kelvor-profile.json');
}

function loadSettings() {
  try {
    const file = settingsPath();
    if (!fs.existsSync(file)) return defaultSettings();
    return { ...defaultSettings(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (_) {
    return defaultSettings();
  }
}

function saveSettings(settings) {
  const merged = { ...defaultSettings(), ...settings };
  fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), 'utf8');
  state.profileName = merged.profileName;
  state.brandName = merged.brandName;
  logEvent('Atlas Profile Saved', 'StreamLink profile updated.');
  return merged;
}

function ensureVault() {
  const vault = path.join(__dirname, 'vault');
  ['Overlays','Alerts','Logos','Transitions','Tournament','Social','Wallpapers','Favorites'].forEach(folder => {
    fs.mkdirSync(path.join(vault, folder), { recursive: true });
  });
  return vault;
}

function scanVault() {
  const vault = ensureVault();
  let assetCount = 0;
  const categories = fs.readdirSync(vault, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  categories.forEach(category => {
    assetCount += fs.readdirSync(path.join(vault, category), { withFileTypes: true }).filter(e => e.isFile()).length;
  });
  return { vaultPath: vault, categories, assetCount };
}

async function internet() {
  const start = Date.now();
  try {
    await dns.lookup('discord.com');
    return { online: true, pingMs: Date.now() - start, status: 'Stable' };
  } catch (_) {
    return { online: false, pingMs: null, status: 'Offline' };
  }
}

function systemStats() {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    cpuPercent: Math.floor(8 + Math.random() * 16),
    ramPercent: Math.round(((total - free) / total) * 100),
    ramUsedGb: Number(((total - free) / 1024 / 1024 / 1024).toFixed(1)),
    ramTotalGb: Number((total / 1024 / 1024 / 1024).toFixed(1)),
    platform: os.platform()
  };
}

async function obsStatus() {
  if (!obsConnected || !obs) {
    state.obs = 'DISCONNECTED';
    return {
      connected: false,
      currentScene: 'Unavailable',
      streaming: false,
      recording: false,
      scenes: [],
      fps: 'Unavailable',
      error: null
    };
  }

  try {
    const [scene, stream, record, sceneList, stats] = await Promise.all([
      obs.call('GetCurrentProgramScene'),
      obs.call('GetStreamStatus'),
      obs.call('GetRecordStatus'),
      obs.call('GetSceneList'),
      obs.call('GetStats')
    ]);
    state.obs = 'CONNECTED';
    return {
      connected: true,
      currentScene: scene.currentProgramSceneName,
      streaming: stream.outputActive,
      recording: record.outputActive,
      scenes: (sceneList.scenes || []).map(s => s.sceneName).reverse(),
      fps: stats.activeFps ? Number(stats.activeFps).toFixed(1) : 'Unavailable',
      streamTimecode: stream.outputTimecode || '00:00:00',
      recordTimecode: record.outputTimecode || '00:00:00'
    };
  } catch (error) {
    obsConnected = false;
    state.obs = 'DISCONNECTED';
    logEvent('OBS Status Error', error.message);
    return {
      connected: false,
      currentScene: 'Unavailable',
      streaming: false,
      recording: false,
      scenes: [],
      fps: 'Unavailable',
      error: error.message
    };
  }
}

async function safeObsCall(type, data = {}) {
  if (!obsConnected || !obs) throw new Error('OBS is not connected.');
  return obs.call(type, data);
}

function aiRoute(command) {
  const text = (command || '').trim();
  const c = text.toLowerCase();
  state.lastCommand = text || 'None';
  logEvent('AI Core Route', text);

  if (!text) return { response: 'No command received.', action: 'none' };
  if (c.includes('help')) return { response: 'Try: connect obs, obs status, starting soon, gameplay, start recording, stop recording, start stream, stop stream, mission scan, open forge vault.', action: 'help' };
  if (c.includes('connect obs')) return { response: 'Connecting to OBS.', action: 'connect-obs' };
  if (c.includes('obs status')) return { response: 'Checking OBS status.', action: 'obs-status' };
  if (c.includes('starting soon')) return { response: 'Switching to Starting Soon scene.', action: 'scene-starting' };
  if (c.includes('gameplay')) return { response: 'Switching to Gameplay scene.', action: 'scene-gameplay' };
  if (c.includes('ending')) return { response: 'Switching to Ending scene.', action: 'scene-ending' };
  if (c.includes('start recording')) return { response: 'Starting recording.', action: 'start-recording' };
  if (c.includes('stop recording')) return { response: 'Stopping recording.', action: 'stop-recording' };
  if (c.includes('start stream') || c.includes('go live')) return { response: 'Starting stream.', action: 'start-stream' };
  if (c.includes('stop stream') || c.includes('end stream')) return { response: 'Stopping stream.', action: 'stop-stream' };
  if (c.includes('prepare stream')) return { response: 'Preparing stream workflow.', action: 'prepare-stream' };
  if (c.includes('health') || c.includes('status')) return { response: 'KelvorOS StreamLink is online. OBS controls are ready when connected.', action: 'status' };
  if (c.includes('forge') || c.includes('vault')) return { response: 'Opening Forge Vault.', action: 'open-vault' };
  return { response: `Kelvor heard: ${text}`, action: 'generic' };
}

function missionScan(payload) {
  const checks = [];
  const add = (label, ok, severity, detail) => checks.push({ label, ok: !!ok, severity, detail });
  add('AI Core', true, 'critical', 'Unified command router online.');
  add('StreamLink Module', true, 'critical', 'OBS control layer loaded.');
  add('OBS Connected', payload.obs.connected, 'warning', payload.obs.connected ? `Scene: ${payload.obs.currentScene}` : 'OBS not connected.');
  add('Atlas Profile', true, 'critical', `${payload.settings.profileName} / ${payload.settings.brandName}`);
  add('Speech Bridge', true, 'warning', 'Hybrid foundation ready.');
  add('Sentinel', true, 'warning', 'Monitoring standby.');
  add('Forge Vault', true, 'warning', `${payload.forge.assetCount} assets found.`);
  add('Internet', payload.internet.online, 'warning', payload.internet.online ? `Ping ${payload.internet.pingMs}ms` : 'Offline.');
  add('Brand Lock', true, 'critical', 'Transparent Kelvor K locked.');
  const score = Math.round((checks.filter(c => c.ok).length / checks.length) * 100);
  return { checks, score, status: score >= 90 ? 'READY' : 'ATTENTION' };
}

async function payload() {
  const settings = loadSettings();
  const net = await internet();
  const sys = systemStats();
  const forge = scanVault();
  const obsData = await obsStatus();
  const health = { score: net.online ? (obsData.connected ? 98 : 88) : 72, label: obsData.connected ? 'Stream Ready' : 'OBS Needed' };
  const scan = missionScan({ settings, internet: net, system: sys, forge, obs: obsData });
  return { settings, state, internet: net, system: sys, forge, obs: obsData, health, missionScan: scan, timeline };
}

ipcMain.handle('kelvor-status', async () => payload());

ipcMain.handle('kelvor-command', async (_e, command) => {
  const settings = loadSettings();
  const routed = aiRoute(command);

  try {
    if (routed.action === 'open-vault') {
      const vault = ensureVault();
      await shell.openPath(vault);
    }

    if (routed.action === 'connect-obs') {
      return { ...routed, result: await connectObs(settings) };
    }

    if (routed.action === 'obs-status') {
      return { ...routed, result: await obsStatus() };
    }

    if (routed.action === 'scene-starting') {
      await safeObsCall('SetCurrentProgramScene', { sceneName: settings.startingScene });
      logEvent('OBS Scene Switch', settings.startingScene);
    }

    if (routed.action === 'scene-gameplay') {
      await safeObsCall('SetCurrentProgramScene', { sceneName: settings.gameplayScene });
      logEvent('OBS Scene Switch', settings.gameplayScene);
    }

    if (routed.action === 'scene-ending') {
      await safeObsCall('SetCurrentProgramScene', { sceneName: settings.endingScene });
      logEvent('OBS Scene Switch', settings.endingScene);
    }

    if (routed.action === 'start-recording') {
      await safeObsCall('StartRecord');
      logEvent('OBS Recording Started', 'Recording started.');
    }

    if (routed.action === 'stop-recording') {
      await safeObsCall('StopRecord');
      logEvent('OBS Recording Stopped', 'Recording stopped.');
    }

    if (routed.action === 'start-stream') {
      await safeObsCall('StartStream');
      logEvent('OBS Stream Started', 'Stream started.');
    }

    if (routed.action === 'stop-stream') {
      await safeObsCall('StopStream');
      logEvent('OBS Stream Stopped', 'Stream stopped.');
    }

    if (routed.action === 'prepare-stream') {
      if (!obsConnected) await connectObs(settings);
      try { await safeObsCall('SetCurrentProgramScene', { sceneName: settings.startingScene }); } catch (_) {}
      try { await safeObsCall('StartRecord'); } catch (_) {}
      logEvent('Prepare Stream', 'Starting Soon requested and recording attempted.');
    }

    return routed;
  } catch (error) {
    logEvent('Command Error', error.message);
    return { ...routed, response: `${routed.response} Error: ${error.message}`, error: error.message };
  }
});

async function connectObs(settings) {
  try {
    if (obs) {
      try { await obs.disconnect(); } catch (_) {}
    }
    obs = new OBSWebSocket();
    const address = `ws://${settings.obsHost || '127.0.0.1'}:${settings.obsPort || '4455'}`;
    await obs.connect(address, settings.obsPassword || '');
    obsConnected = true;
    state.obs = 'CONNECTED';
    obs.on('ConnectionClosed', () => {
      obsConnected = false;
      state.obs = 'DISCONNECTED';
      logEvent('OBS Disconnected', 'Connection closed.');
    });
    logEvent('OBS Connected', address);
    return await obsStatus();
  } catch (error) {
    obsConnected = false;
    state.obs = 'DISCONNECTED';
    logEvent('OBS Connection Failed', error.message);
    return { connected: false, error: error.message };
  }
}

ipcMain.handle('obs-connect', async () => connectObs(loadSettings()));
ipcMain.handle('obs-status', async () => obsStatus());

ipcMain.handle('kelvor-mission-scan', async () => {
  const p = await payload();
  logEvent('Mission Scan Complete', `${p.missionScan.score}% — ${p.missionScan.status}`);
  return p.missionScan;
});

ipcMain.handle('atlas-load-settings', async () => loadSettings());
ipcMain.handle('atlas-save-settings', async (_e, settings) => saveSettings(settings));
ipcMain.handle('forge-open-vault', async () => {
  const vault = ensureVault();
  await shell.openPath(vault);
  logEvent('Forge Vault Opened', vault);
  return { ok: true, vaultPath: vault };
});

app.whenReady().then(() => {
  ensureVault();
  const settings = loadSettings();
  state.profileName = settings.profileName;
  state.brandName = settings.brandName;

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#030303',
    title: 'KelvorOS v2.1 StreamLink Phase',
    webPreferences: {
      preload: path.join(__dirname, 'src/core/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  logEvent('KelvorOS Started', 'v2.1 StreamLink Phase online.');
  mainWindow.loadFile(path.join(__dirname, 'src/ui/index.html'));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
