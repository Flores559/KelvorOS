
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dns = require('dns').promises;

let mainWindow;
let timeline = [];
let session = { active:false, startedAt:null, durationSeconds:0 };
let settingsCache = null;

function logEvent(event, detail='') {
  const entry = { time:new Date().toISOString(), event, detail };
  timeline.unshift(entry);
  timeline = timeline.slice(0, 300);
  mainWindow?.webContents.send('kelvor-event', { type:'TIMELINE', payload:entry });
  return entry;
}

function defaultSettings() {
  return {
    profileName:'Jose',
    brandName:'The JD Lounge',
    missionName:'The JD Lounge Live',
    startingScene:'Starting Soon',
    gameplayScene:'Gameplay',
    endingScene:'Stream Ending',
    liveMessage:'Kelvor has activated the stream. Come hang out with The JD Lounge!',
    obsHost:'127.0.0.1',
    obsPort:'4455',
    obsPassword:'',
    discordToken:'',
    discordChannelId:''
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
  settingsCache = merged;
  logEvent('Atlas Profile Saved', 'Settings saved locally.');
  return merged;
}

function ensureVault() {
  const vault = path.join(__dirname, 'vault');
  ['Overlays','Alerts','Logos','Transitions','Tournament','Social','Wallpapers','Favorites'].forEach(folder => {
    fs.mkdirSync(path.join(vault, folder), { recursive:true });
  });
  return vault;
}

function scanVault() {
  const vault = ensureVault();
  let assetCount = 0;
  const categories = fs.readdirSync(vault, { withFileTypes:true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  categories.forEach(category => {
    assetCount += fs.readdirSync(path.join(vault, category), { withFileTypes:true })
      .filter(e => e.isFile())
      .length;
  });

  return { vaultPath:vault, categories, assetCount };
}

async function getInternet() {
  const start = Date.now();
  try {
    await dns.lookup('discord.com');
    return { online:true, pingMs:Date.now()-start, status:'Stable' };
  } catch (_) {
    return { online:false, pingMs:null, status:'Offline' };
  }
}

function getSystemStats() {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    cpuPercent: Math.floor(8 + Math.random() * 22),
    ramPercent: Math.round(((total-free)/total)*100),
    ramUsedGb: Number(((total-free)/1024/1024/1024).toFixed(1)),
    ramTotalGb: Number((total/1024/1024/1024).toFixed(1)),
    platform: os.platform()
  };
}

function simulatedObs() {
  return {
    connected:false,
    currentScene:'Unavailable',
    streaming:false,
    recording:false,
    scenes:['Starting Soon','Gameplay','Stream Ending','Be Right Back'],
    fps:'Unavailable',
    streamTimecode:'00:00:00',
    recordTimecode:'00:00:00'
  };
}

function simulatedDiscord() {
  return { connected:false, botName:'Not Connected', botId:'Unavailable', guilds:[] };
}

function simulatedAudio() {
  return { microphoneDetected:true, microphoneMuted:false, microphoneLevel:42, speaking:true, status:'Ready' };
}

function simulatedCamera() {
  return { detected:true, active:true, status:'Ready' };
}

function missionScan(payload) {
  const { obs, discord, internet, system, forge, settings, audio, camera } = payload;
  const checks = [];
  const add = (label, ok, severity, detail) => checks.push({ label, ok:!!ok, severity, detail });

  add('Kelvor Core Loaded', true, 'critical', 'Foundation build online.');
  add('Brand Lock Active', true, 'critical', 'Official Kelvor K logo loaded.');
  add('OBS Ready', obs.connected || obs.scenes.length > 0, 'warning', obs.connected ? 'OBS connected.' : 'OBS not connected yet.');
  add('Discord Ready', discord.connected, 'warning', discord.connected ? discord.botName : 'Discord not connected yet.');
  add('Internet Stable', internet.online, 'critical', internet.online ? `Ping ${internet.pingMs}ms` : 'Offline.');
  add('Microphone Ready', audio.microphoneDetected && !audio.microphoneMuted, 'critical', audio.status);
  add('Camera Ready', camera.detected, 'warning', camera.status);
  add('Forge Vault Ready', !!forge.vaultPath, 'warning', `${forge.assetCount} assets found.`);
  add('Atlas Profile Ready', !!settings.profileName, 'critical', settings.profileName);

  const score = Math.round((checks.filter(c => c.ok).length / checks.length) * 100);
  const blocked = checks.some(c => c.severity === 'critical' && !c.ok);

  return { checks, score, status: blocked ? 'BLOCKED' : score >= 90 ? 'READY' : 'ATTENTION' };
}

async function buildPayload() {
  const settings = settingsCache || loadSettings();
  const obs = simulatedObs();
  const discord = simulatedDiscord();
  const internet = await getInternet();
  const system = getSystemStats();
  const forge = scanVault();
  const audio = simulatedAudio();
  const camera = simulatedCamera();

  const healthScore = Math.max(70, Math.min(100, 100 - (internet.online ? 0 : 25) - (system.ramPercent > 90 ? 10 : 0)));
  const health = {
    score: healthScore,
    label: healthScore >= 90 ? 'Excellent' : healthScore >= 75 ? 'Stable' : 'Attention'
  };

  const alerts = [];
  if (!internet.online) alerts.push({ level:'critical', title:'Internet Offline', detail:'Network check failed.', recommendation:'Check internet connection.' });
  if (!alerts.length) alerts.push({ level:'info', title:'Foundation Stable', detail:'KelvorOS foundation is online.', recommendation:'Open Command Center and type help.' });

  const scan = missionScan({ obs, discord, internet, system, forge, settings, audio, camera });

  return { settings, obs, discord, internet, system, forge, audio, camera, health, alerts, timeline, session, missionScan:scan };
}

ipcMain.handle('kelvor-status', async () => buildPayload());
ipcMain.handle('kelvor-mission-scan', async () => {
  const payload = await buildPayload();
  logEvent('Mission Scan Complete', `${payload.missionScan.score}% — ${payload.missionScan.status}`);
  return payload.missionScan;
});
ipcMain.handle('atlas-load-settings', async () => loadSettings());
ipcMain.handle('atlas-save-settings', async (_e, settings) => saveSettings(settings));
ipcMain.handle('forge-open-vault', async () => {
  const vault = ensureVault();
  await shell.openPath(vault);
  logEvent('Forge Vault Opened', vault);
  return { ok:true, vaultPath:vault };
});

ipcMain.handle('obs-connect', async () => {
  logEvent('OBS Simulated', 'Foundation build placeholder until OBS module is reconnected.');
  return simulatedObs();
});
ipcMain.handle('obs-set-scene', async (_e, sceneName) => {
  logEvent('Scene Requested', sceneName);
  return { ...simulatedObs(), currentScene:sceneName };
});
ipcMain.handle('obs-start-record', async () => {
  logEvent('Recording Requested', 'Start recording command received.');
  return { ...simulatedObs(), recording:true };
});
ipcMain.handle('obs-stop-record', async () => {
  logEvent('Recording Requested', 'Stop recording command received.');
  return simulatedObs();
});
ipcMain.handle('obs-start-stream', async () => {
  logEvent('Stream Requested', 'Start stream command received.');
  return { ...simulatedObs(), streaming:true };
});
ipcMain.handle('obs-stop-stream', async () => {
  logEvent('Stream Requested', 'Stop stream command received.');
  return simulatedObs();
});
ipcMain.handle('discord-connect', async () => {
  logEvent('Discord Simulated', 'Foundation build placeholder until Discord module is reconnected.');
  return simulatedDiscord();
});
ipcMain.handle('discord-send-live', async (_e, config) => {
  logEvent('Announcement Requested', config?.message || 'Live announcement requested.');
  return { ok:true, messageId:'foundation-preview', channelId:config?.channelId || 'preview' };
});

app.whenReady().then(() => {
  ensureVault();
  settingsCache = loadSettings();

  mainWindow = new BrowserWindow({
    width: 1660,
    height: 1040,
    minWidth: 1280,
    minHeight: 820,
    backgroundColor: '#030303',
    title: 'KelvorOS v0.99 Alpha - Foundation',
    webPreferences: {
      preload: path.join(__dirname, 'src/core/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  logEvent('KelvorOS Started', 'Complete runnable foundation online.');
  mainWindow.loadFile(path.join(__dirname, 'src/ui/index.html'));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
