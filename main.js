const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const dns = require('dns').promises;
const OBSWebSocket = require('obs-websocket-js').default;
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

let mainWindow;
let obs = null;
let obsConnected = false;
let discordClient = null;
let discordReady = false;

let discordInfo = { connected:false, botName:'Unavailable', botId:'Unavailable', guilds:[] };
let missionTimeline = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1620,
    height: 1020,
    minWidth: 1280,
    minHeight: 820,
    backgroundColor: '#030303',
    title: 'KelvorOS v0.90 Alpha - Operation Sentinel',
    webPreferences: {
      preload: __dirname + '/src/core/preload.js',
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.loadFile('src/ui/index.html');
}

function logMission(event, detail = '') {
  const entry = {
    time: new Date().toISOString(),
    event,
    detail
  };
  missionTimeline.unshift(entry);
  missionTimeline = missionTimeline.slice(0, 200);
  mainWindow?.webContents.send('mission-event', { type:'TIMELINE_UPDATED', payload:entry });
  return entry;
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'kelvor-profile.json');
}

function defaultSettings() {
  return {
    profileName: 'Jose',
    brandName: 'The JD Lounge',
    obsHost: '127.0.0.1',
    obsPort: '4455',
    obsPassword: '',
    discordToken: '',
    discordChannelId: '',
    startingScene: 'Starting Soon',
    gameplayScene: 'Gameplay',
    endingScene: 'Stream Ending',
    autoRecord: true,
    liveMessage: 'Kelvor has activated the stream. Come hang out with The JD Lounge!'
  };
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
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), 'utf8');
  logMission('Atlas Profile Saved', 'Local command profile updated.');
  return merged;
}

function getVaultPath() {
  return path.join(__dirname, 'vault');
}

function ensureVault() {
  const vault = getVaultPath();
  const folders = ['Overlays', 'Alerts', 'Logos', 'Transitions', 'Tournament', 'Social', 'Wallpapers', 'Favorites'];
  if (!fs.existsSync(vault)) fs.mkdirSync(vault);
  folders.forEach(folder => {
    const folderPath = path.join(vault, folder);
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);
  });
  return vault;
}

function scanVault() {
  const vault = ensureVault();
  const categories = fs.readdirSync(vault, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  let assetCount = 0;
  let folderStatus = {};
  categories.forEach(category => {
    const folder = path.join(vault, category);
    const count = fs.readdirSync(folder, { withFileTypes: true }).filter(e => e.isFile()).length;
    folderStatus[category] = count;
    assetCount += count;
  });
  return { vaultPath: vault, categories, assetCount, folderStatus };
}

async function obsStatus() {
  if (!obsConnected || !obs) {
    return {
      connected:false,
      currentScene:'Unavailable',
      streaming:false,
      recording:false,
      scenes:[],
      fps:'Unavailable',
      cpuUsage:'Unavailable',
      outputSkippedFrames:0,
      streamTimecode:'00:00:00',
      recordTimecode:'00:00:00'
    };
  }

  const [scene, stream, record, sceneList, stats] = await Promise.all([
    obs.call('GetCurrentProgramScene'),
    obs.call('GetStreamStatus'),
    obs.call('GetRecordStatus'),
    obs.call('GetSceneList'),
    obs.call('GetStats')
  ]);

  return {
    connected:true,
    currentScene: scene.currentProgramSceneName,
    streaming: stream.outputActive,
    recording: record.outputActive,
    scenes: (sceneList.scenes || []).map(s => s.sceneName).reverse(),
    fps: stats.activeFps ? Number(stats.activeFps).toFixed(1) : 'Unavailable',
    cpuUsage: stats.cpuUsage ? Number(stats.cpuUsage).toFixed(1) + '%' : 'Unavailable',
    outputSkippedFrames: stream.outputSkippedFrames || 0,
    streamTimecode: stream.outputTimecode || '00:00:00',
    recordTimecode: record.outputTimecode || '00:00:00'
  };
}

async function safeOBS(requestType, requestData = {}) {
  if (!obsConnected || !obs) throw new Error('OBS is not connected.');
  return await obs.call(requestType, requestData);
}

async function internetStatus() {
  try {
    await dns.lookup('discord.com');
    return { connected:true, target:'discord.com' };
  } catch (_) {
    return { connected:false, target:'discord.com' };
  }
}

function computeDiagnostics({ settings, obs, discord, forge, internet }) {
  const checks = [];

  function add(id, label, ok, severity, detail) {
    checks.push({ id, label, ok: !!ok, severity, detail });
  }

  add('atlas-profile', 'Atlas Profile Loaded', !!settings.profileName, 'critical', settings.profileName ? `Operator: ${settings.profileName}` : 'Profile name missing.');
  add('obs-connected', 'OBS Connected', obs.connected, 'critical', obs.connected ? 'OBS WebSocket connected.' : 'OBS is offline.');
  add('discord-connected', 'Discord Connected', discord.connected, 'warning', discord.connected ? `Connected as ${discord.botName}.` : 'Discord bot is offline.');
  add('internet', 'Internet Available', internet.connected, 'critical', internet.connected ? 'Internet check passed.' : 'Could not reach Discord DNS.');
  add('starting-scene', 'Starting Scene Exists', obs.connected && obs.scenes.includes(settings.startingScene), 'critical', `Expected: ${settings.startingScene}`);
  add('gameplay-scene', 'Gameplay Scene Exists', obs.connected && obs.scenes.includes(settings.gameplayScene), 'warning', `Expected: ${settings.gameplayScene}`);
  add('discord-channel', 'Announcement Channel Set', !!settings.discordChannelId, 'warning', settings.discordChannelId ? 'Channel ID saved.' : 'Discord Channel ID missing.');
  add('live-message', 'Live Message Ready', !!settings.liveMessage, 'warning', settings.liveMessage ? 'Live announcement message is configured.' : 'Live message missing.');
  add('forge-vault', 'Forge Vault Ready', !!forge.vaultPath, 'critical', forge.vaultPath || 'Vault missing.');
  add('logos-folder', 'Logo Assets Folder Ready', forge.categories.includes('Logos'), 'warning', 'Logo folder should exist.');
  add('overlays-folder', 'Overlay Folder Ready', forge.categories.includes('Overlays'), 'warning', 'Overlay folder should exist.');
  add('recording-off', 'Not Already Recording', !obs.recording, 'info', obs.recording ? 'Recording already active.' : 'Recording is currently off.');
  add('streaming-off', 'Not Already Live', !obs.streaming, 'critical', obs.streaming ? 'Stream already live.' : 'Stream is currently offline.');

  let score = 0;
  let total = 0;

  checks.forEach(check => {
    const weight = check.severity === 'critical' ? 20 : check.severity === 'warning' ? 10 : 5;
    total += weight;
    if (check.ok) score += weight;
  });

  const readiness = Math.round((score / Math.max(total, 1)) * 100);
  const criticalFailures = checks.filter(c => c.severity === 'critical' && !c.ok);
  const warningFailures = checks.filter(c => c.severity === 'warning' && !c.ok);

  let status = 'READY';
  if (criticalFailures.length > 0) status = 'BLOCKED';
  else if (warningFailures.length > 0) status = 'ATTENTION';

  return { checks, readiness, status, criticalFailures, warningFailures };
}

ipcMain.handle('sentinel-run-diagnostics', async () => {
  const settings = loadSettings();
  const obs = await obsStatus();
  const discord = discordInfo;
  const forge = scanVault();
  const internet = await internetStatus();
  const diagnostics = computeDiagnostics({ settings, obs, discord, forge, internet });
  logMission('Pre-Flight Diagnostics', `Readiness ${diagnostics.readiness}% — ${diagnostics.status}`);
  return { settings, obs, discord, forge, internet, diagnostics, timeline:missionTimeline };
});

ipcMain.handle('sentinel-mission-status', async () => {
  const settings = loadSettings();
  const obs = await obsStatus();
  const forge = scanVault();
  return {
    obs,
    discord: discordInfo,
    forge,
    settings,
    mission: { phase:'Operation Sentinel', version:'v0.90 Alpha', progress:90 },
    timeline: missionTimeline
  };
});

ipcMain.handle('atlas-load-settings', async () => loadSettings());
ipcMain.handle('atlas-save-settings', async (_event, settings) => saveSettings(settings));
ipcMain.handle('atlas-reset-settings', async () => {
  const file = settingsPath();
  if (fs.existsSync(file)) fs.unlinkSync(file);
  logMission('Atlas Profile Reset', 'Local profile reset to defaults.');
  return defaultSettings();
});

ipcMain.handle('obs-connect', async (_event, config) => {
  try {
    obs = new OBSWebSocket();
    const address = `ws://${config.host || '127.0.0.1'}:${config.port || '4455'}`;
    await obs.connect(address, config.password || '');
    obsConnected = true;
    logMission('OBS Connected', address);

    obs.on('ConnectionClosed', () => {
      obsConnected = false;
      logMission('OBS Disconnected', 'OBS connection closed.');
      mainWindow?.webContents.send('mission-event', { type:'OBS_DISCONNECTED' });
    });
    obs.on('CurrentProgramSceneChanged', data => {
      logMission('Scene Changed', data.sceneName);
      mainWindow?.webContents.send('mission-event', { type:'OBS_SCENE_CHANGED', sceneName:data.sceneName });
    });
    obs.on('StreamStateChanged', data => {
      logMission('Stream State Changed', data.outputState || 'Updated');
      mainWindow?.webContents.send('mission-event', { type:'OBS_STATUS_UPDATED' });
    });
    obs.on('RecordStateChanged', data => {
      logMission('Record State Changed', data.outputState || 'Updated');
      mainWindow?.webContents.send('mission-event', { type:'OBS_STATUS_UPDATED' });
    });

    return await obsStatus();
  } catch (error) {
    obsConnected = false;
    logMission('OBS Connection Failed', error.message || String(error));
    return { connected:false, error:error.message || String(error), scenes:[] };
  }
});

ipcMain.handle('obs-set-scene', async (_event, sceneName) => {
  try {
    await safeOBS('SetCurrentProgramScene', { sceneName });
    logMission('Scene Switch Requested', sceneName);
    return await obsStatus();
  } catch (error) {
    logMission('Scene Switch Failed', error.message || String(error));
    return { connected:obsConnected, error:error.message || String(error) };
  }
});

ipcMain.handle('obs-start-record', async () => {
  try {
    await safeOBS('StartRecord');
    logMission('Recording Started', 'OBS recording started.');
    return await obsStatus();
  } catch (error) {
    logMission('Recording Failed', error.message || String(error));
    return { connected:obsConnected, error:error.message || String(error) };
  }
});

ipcMain.handle('obs-stop-record', async () => {
  try {
    await safeOBS('StopRecord');
    logMission('Recording Stopped', 'OBS recording stopped.');
    return await obsStatus();
  } catch (error) {
    logMission('Stop Recording Failed', error.message || String(error));
    return { connected:obsConnected, error:error.message || String(error) };
  }
});

ipcMain.handle('obs-start-stream', async () => {
  try {
    await safeOBS('StartStream');
    logMission('Stream Started', 'OBS stream started.');
    return await obsStatus();
  } catch (error) {
    logMission('Stream Start Failed', error.message || String(error));
    return { connected:obsConnected, error:error.message || String(error) };
  }
});

ipcMain.handle('obs-stop-stream', async () => {
  try {
    await safeOBS('StopStream');
    logMission('Stream Stopped', 'OBS stream stopped.');
    return await obsStatus();
  } catch (error) {
    logMission('Stream Stop Failed', error.message || String(error));
    return { connected:obsConnected, error:error.message || String(error) };
  }
});

ipcMain.handle('discord-connect', async (_event, config) => {
  try {
    if (discordClient) {
      try { discordClient.destroy(); } catch (_) {}
    }
    discordReady = false;
    discordInfo = { connected:false, botName:'Unavailable', botId:'Unavailable', guilds:[] };

    discordClient = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
    });

    discordClient.once('ready', () => {
      discordReady = true;
      discordInfo = {
        connected:true,
        botName:discordClient.user.tag,
        botId:discordClient.user.id,
        guilds:discordClient.guilds.cache.map(g => ({ id:g.id, name:g.name, memberCount:g.memberCount || 'Unavailable' }))
      };
      logMission('Discord Connected', discordInfo.botName);
      mainWindow?.webContents.send('mission-event', { type:'DISCORD_CONNECTED', payload:discordInfo });
    });

    await discordClient.login(config.token);

    await new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (discordReady) { clearInterval(timer); resolve(); }
        if (Date.now() - start > 12000) { clearInterval(timer); reject(new Error('Discord connection timed out.')); }
      }, 250);
    });

    return discordInfo;
  } catch (error) {
    discordReady = false;
    discordInfo = { connected:false, botName:'Unavailable', botId:'Unavailable', guilds:[], error:error.message || String(error) };
    logMission('Discord Connection Failed', error.message || String(error));
    return discordInfo;
  }
});

ipcMain.handle('discord-send-live', async (_event, config) => {
  try {
    if (!discordReady || !discordClient) throw new Error('Discord is not connected.');
    if (!config.channelId) throw new Error('Channel ID is required.');
    const channel = await discordClient.channels.fetch(config.channelId);
    if (!channel || !channel.isTextBased()) throw new Error('Channel not found or is not text-based.');

    const embed = new EmbedBuilder()
      .setColor(0xff1d1d)
      .setTitle('🔴 THE JD LOUNGE IS LIVE!')
      .setDescription(config.message || 'Kelvor has activated the stream. Come hang out with The JD Lounge!')
      .addFields({ name:'Powered By', value:'KelvorOS', inline:true }, { name:'Module', value:'Operation Sentinel', inline:true })
      .setFooter({ text:'The JD Lounge Command Center' })
      .setTimestamp();

    const sent = await channel.send({ embeds:[embed] });
    logMission('Discord Announcement Sent', channel.id);
    return { ok:true, messageId:sent.id, channelId:channel.id };
  } catch (error) {
    logMission('Discord Announcement Failed', error.message || String(error));
    return { ok:false, error:error.message || String(error) };
  }
});

ipcMain.handle('sentinel-go-live', async (_event, config) => {
  try {
    const diagnosticPayload = {
      settings: loadSettings(),
      obs: await obsStatus(),
      discord: discordInfo,
      forge: scanVault(),
      internet: await internetStatus()
    };
    const diagnostics = computeDiagnostics(diagnosticPayload);

    if (diagnostics.status === 'BLOCKED') {
      logMission('Go Live Blocked', `Critical issues: ${diagnostics.criticalFailures.length}`);
      return { ok:false, blocked:true, diagnostics };
    }

    logMission('Sentinel Go Live', 'Sequence started.');

    if (config.startingScene) {
      await safeOBS('SetCurrentProgramScene', { sceneName: config.startingScene });
      logMission('Starting Scene Loaded', config.startingScene);
    }

    if (config.autoRecord) {
      const record = await safeOBS('GetRecordStatus');
      if (!record.outputActive) {
        await safeOBS('StartRecord');
        logMission('Recording Started', 'Auto record enabled.');
      }
    }

    return { ok:true, diagnostics, obs: await obsStatus(), timeline:missionTimeline };
  } catch (error) {
    logMission('Sentinel Go Live Failed', error.message || String(error));
    return { ok:false, error:error.message || String(error) };
  }
});

ipcMain.handle('sentinel-abort', async (_event, config) => {
  try {
    logMission('Mission Abort Requested', 'Emergency stop started.');
    if (obsConnected && obs) {
      const status = await obsStatus();
      if (status.streaming) await safeOBS('StopStream');
      if (status.recording) await safeOBS('StopRecord');
      if (config.endingScene) {
        try { await safeOBS('SetCurrentProgramScene', { sceneName: config.endingScene }); } catch (_) {}
      }
    }
    logMission('Mission Abort Complete', 'Emergency stop finished.');
    return { ok:true, obs: await obsStatus(), timeline:missionTimeline };
  } catch (error) {
    logMission('Mission Abort Failed', error.message || String(error));
    return { ok:false, error:error.message || String(error) };
  }
});

ipcMain.handle('forge-open-vault', async () => {
  const vault = ensureVault();
  await shell.openPath(vault);
  logMission('Forge Vault Opened', vault);
  return { ok:true, vaultPath:vault };
});

app.whenReady().then(() => {
  ensureVault();
  saveSettings(loadSettings());
  logMission('KelvorOS Started', 'Operation Sentinel online.');
  createWindow();
});

app.on('window-all-closed', () => {
  try { if (discordClient) discordClient.destroy(); } catch (_) {}
  if (process.platform !== 'darwin') app.quit();
});
