const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dns = require('dns').promises;
const OBSWebSocket = require('obs-websocket-js').default;
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

let mainWindow;
let obs = null;
let obsConnected = false;
let discordClient = null;
let discordReady = false;
let discordInfo = { connected:false, botName:'Unavailable', botId:'Unavailable', guilds:[] };
let timeline = [];
let session = { active:false, startedAt:null, endedAt:null, durationSeconds:0 };
let lastCpu = process.cpuUsage();
let lastCpuTime = Date.now();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1640,
    height: 1040,
    minWidth: 1280,
    minHeight: 820,
    backgroundColor: '#030303',
    title: 'KelvorOS v0.92 Alpha - Overwatch Live Integration',
    webPreferences: {
      preload: __dirname + '/src/core/preload.js',
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.loadFile('src/ui/index.html');
}

function logEvent(event, detail = '') {
  const entry = { time: new Date().toISOString(), event, detail };
  timeline.unshift(entry);
  timeline = timeline.slice(0, 300);
  mainWindow?.webContents.send('overwatch-event', { type:'TIMELINE', payload:entry });
  return entry;
}

function defaultSettings() {
  return {
    profileName:'Jose',
    brandName:'The JD Lounge',
    obsHost:'127.0.0.1',
    obsPort:'4455',
    obsPassword:'',
    discordToken:'',
    discordChannelId:'',
    startingScene:'Starting Soon',
    gameplayScene:'Gameplay',
    endingScene:'Stream Ending',
    autoRecord:true,
    autoConnectOBS:false,
    autoConnectDiscord:false,
    liveMessage:'Kelvor has activated the stream. Come hang out with The JD Lounge!'
  };
}

function settingsPath() { return path.join(app.getPath('userData'), 'kelvor-profile.json'); }

function loadSettings() {
  try {
    const file = settingsPath();
    if (!fs.existsSync(file)) return defaultSettings();
    return { ...defaultSettings(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (_) { return defaultSettings(); }
}

function saveSettings(settings) {
  const merged = { ...defaultSettings(), ...settings };
  fs.mkdirSync(app.getPath('userData'), { recursive:true });
  fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), 'utf8');
  logEvent('Atlas Profile Saved', 'Local settings updated.');
  return merged;
}

function ensureVault() {
  const vault = path.join(__dirname, 'vault');
  const folders = ['Overlays','Alerts','Logos','Transitions','Tournament','Social','Wallpapers','Favorites'];
  if (!fs.existsSync(vault)) fs.mkdirSync(vault);
  folders.forEach(folder => {
    const folderPath = path.join(vault, folder);
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);
  });
  return vault;
}

function scanVault() {
  const vault = ensureVault();
  const categories = fs.readdirSync(vault, { withFileTypes:true }).filter(e => e.isDirectory()).map(e => e.name);
  let assetCount = 0;
  categories.forEach(category => {
    assetCount += fs.readdirSync(path.join(vault, category), { withFileTypes:true }).filter(e => e.isFile()).length;
  });
  return { vaultPath:vault, categories, assetCount };
}

async function getInternet() {
  const start = Date.now();
  try {
    await dns.lookup('discord.com');
    return { online:true, pingMs:Date.now() - start, status:'Stable' };
  } catch (_) {
    return { online:false, pingMs:null, status:'Offline' };
  }
}

function getSystemStats() {
  const total = os.totalmem();
  const free = os.freemem();
  const ramPercent = Math.round(((total - free) / total) * 100);
  const current = process.cpuUsage();
  const now = Date.now();
  const cpuPercent = Math.min(100, Math.round(((current.user - lastCpu.user + current.system - lastCpu.system) / Math.max((now - lastCpuTime) * 1000, 1)) * 100));
  lastCpu = current;
  lastCpuTime = now;
  return {
    cpuPercent,
    ramPercent,
    ramUsedGb:Number(((total-free)/1024/1024/1024).toFixed(1)),
    ramTotalGb:Number((total/1024/1024/1024).toFixed(1)),
    platform:os.platform(),
    cpuCores:os.cpus()?.length || 0
  };
}

async function obsStatus() {
  if (!obsConnected || !obs) {
    return { connected:false, currentScene:'Unavailable', streaming:false, recording:false, scenes:[], fps:'Unavailable', cpuUsage:'Unavailable', outputSkippedFrames:0, renderSkippedFrames:0, streamTimecode:'00:00:00', recordTimecode:'00:00:00', bitrate:'Unavailable' };
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
    currentScene:scene.currentProgramSceneName,
    streaming:stream.outputActive,
    recording:record.outputActive,
    scenes:(sceneList.scenes || []).map(s => s.sceneName).reverse(),
    fps:stats.activeFps ? Number(stats.activeFps).toFixed(1) : 'Unavailable',
    cpuUsage:stats.cpuUsage ? Number(stats.cpuUsage).toFixed(1) + '%' : 'Unavailable',
    outputSkippedFrames:stream.outputSkippedFrames || 0,
    renderSkippedFrames:stats.renderSkippedFrames || 0,
    streamTimecode:stream.outputTimecode || '00:00:00',
    recordTimecode:record.outputTimecode || '00:00:00',
    bitrate:stream.outputBytes ? `${Math.round((stream.outputBytes / 1024 / 1024) * 10) / 10} MB sent` : 'Unavailable'
  };
}

function updateSession(obs) {
  if (obs.streaming && !session.active) {
    session.active = true;
    session.startedAt = new Date().toISOString();
    session.endedAt = null;
    logEvent('Stream Session Started', 'OBS streaming detected.');
  }
  if (!obs.streaming && session.active) {
    session.active = false;
    session.endedAt = new Date().toISOString();
    logEvent('Stream Session Ended', 'OBS streaming stopped.');
  }
  if (session.startedAt && !session.endedAt) {
    session.durationSeconds = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
  }
}

function buildAlerts({ obs, discord, internet, system }) {
  const alerts = [];
  const add = (level,title,detail,recommendation='') => alerts.push({ level,title,detail,recommendation,time:new Date().toISOString() });
  if (!obs.connected) add('critical','OBS Offline','OBS WebSocket is disconnected.','Open OBS and connect from Systems.');
  if (obs.connected && Number(obs.fps) < 50) add('warning','Low OBS FPS',`OBS FPS is ${obs.fps}.`,'Close heavy apps or lower game settings.');
  if (obs.outputSkippedFrames > 0) add('warning','Dropped Frames',`${obs.outputSkippedFrames} skipped output frames.`,'Check internet and bitrate.');
  if (obs.renderSkippedFrames > 0) add('warning','Render Lag',`${obs.renderSkippedFrames} skipped render frames.`,'Reduce game or OBS load.');
  if (!discord.connected) add('warning','Discord Offline','Bot is not connected.','Connect Discord before announcements.');
  if (!internet.online) add('critical','Internet Offline','DNS check failed.','Check your internet.');
  if (internet.online && internet.pingMs > 250) add('warning','High Latency',`Ping is ${internet.pingMs} ms.`,'Wait for network to stabilize.');
  if (system.cpuPercent >= 85) add('warning','High CPU',`CPU is ${system.cpuPercent}%.`,'Close unused apps.');
  if (system.ramPercent >= 88) add('warning','High RAM',`RAM is ${system.ramPercent}%.`,'Close unused apps.');
  if (!alerts.length) add('info','Live Integration Stable','No active issues detected.','Keep monitoring.');
  return alerts;
}

function healthFor({ obs, discord, internet, system }) {
  let score = 100;
  if (!obs.connected) score -= 30;
  if (obs.connected && Number(obs.fps) < 50) score -= 12;
  if (obs.outputSkippedFrames > 0) score -= 12;
  if (obs.renderSkippedFrames > 0) score -= 8;
  if (!discord.connected) score -= 8;
  if (!internet.online) score -= 30;
  if (internet.online && internet.pingMs > 250) score -= 10;
  if (system.cpuPercent >= 85) score -= 10;
  if (system.ramPercent >= 88) score -= 8;
  score = Math.max(0, Math.min(100, score));
  return { score, label: score >= 90 ? 'Excellent' : score >= 75 ? 'Stable' : score >= 55 ? 'Attention' : 'Critical' };
}

async function payload() {
  const obs = await obsStatus();
  updateSession(obs);
  const internet = await getInternet();
  const system = getSystemStats();
  const forge = scanVault();
  const settings = loadSettings();
  const discord = discordInfo;
  const health = healthFor({ obs, discord, internet, system });
  const alerts = buildAlerts({ obs, discord, internet, system });
  return { obs, discord, internet, system, forge, settings, health, alerts, timeline, session };
}

async function safeOBS(type, data={}) {
  if (!obsConnected || !obs) throw new Error('OBS is not connected.');
  return await obs.call(type, data);
}

ipcMain.handle('overwatch-status', async () => payload());
ipcMain.handle('atlas-load-settings', async () => loadSettings());
ipcMain.handle('atlas-save-settings', async (_e, settings) => saveSettings(settings));
ipcMain.handle('atlas-reset-settings', async () => {
  const file = settingsPath();
  if (fs.existsSync(file)) fs.unlinkSync(file);
  logEvent('Atlas Profile Reset','Profile reset.');
  return defaultSettings();
});

ipcMain.handle('obs-connect', async (_e, config) => {
  try {
    obs = new OBSWebSocket();
    const address = `ws://${config.host || '127.0.0.1'}:${config.port || '4455'}`;
    await obs.connect(address, config.password || '');
    obsConnected = true;
    logEvent('OBS Connected', address);
    obs.on('ConnectionClosed', () => { obsConnected = false; logEvent('OBS Disconnected','Connection closed.'); mainWindow?.webContents.send('overwatch-event',{type:'OBS_DISCONNECTED'}); });
    obs.on('CurrentProgramSceneChanged', d => { logEvent('Scene Changed', d.sceneName); mainWindow?.webContents.send('overwatch-event',{type:'OBS_SCENE_CHANGED',sceneName:d.sceneName}); });
    obs.on('StreamStateChanged', d => { logEvent('Stream State', d.outputState || 'Updated'); mainWindow?.webContents.send('overwatch-event',{type:'OBS_STATUS_UPDATED'}); });
    obs.on('RecordStateChanged', d => { logEvent('Recording State', d.outputState || 'Updated'); mainWindow?.webContents.send('overwatch-event',{type:'OBS_STATUS_UPDATED'}); });
    return await obsStatus();
  } catch (err) {
    obsConnected = false;
    logEvent('OBS Connection Failed', err.message || String(err));
    return { connected:false, error:err.message || String(err), scenes:[] };
  }
});

ipcMain.handle('obs-set-scene', async (_e, sceneName) => {
  try { await safeOBS('SetCurrentProgramScene', { sceneName }); logEvent('Scene Switch', sceneName); return await obsStatus(); }
  catch (err) { logEvent('Scene Switch Failed', err.message || String(err)); return { connected:obsConnected, error:err.message || String(err) }; }
});
ipcMain.handle('obs-start-record', async () => {
  try { await safeOBS('StartRecord'); logEvent('Recording Started','Manual command.'); return await obsStatus(); }
  catch (err) { logEvent('Recording Failed', err.message || String(err)); return { connected:obsConnected, error:err.message || String(err) }; }
});
ipcMain.handle('obs-stop-record', async () => {
  try { await safeOBS('StopRecord'); logEvent('Recording Stopped','Manual command.'); return await obsStatus(); }
  catch (err) { logEvent('Stop Recording Failed', err.message || String(err)); return { connected:obsConnected, error:err.message || String(err) }; }
});
ipcMain.handle('obs-start-stream', async () => {
  try { await safeOBS('StartStream'); logEvent('Stream Started','Manual command.'); return await obsStatus(); }
  catch (err) { logEvent('Stream Start Failed', err.message || String(err)); return { connected:obsConnected, error:err.message || String(err) }; }
});
ipcMain.handle('obs-stop-stream', async () => {
  try { await safeOBS('StopStream'); logEvent('Stream Stopped','Manual command.'); return await obsStatus(); }
  catch (err) { logEvent('Stream Stop Failed', err.message || String(err)); return { connected:obsConnected, error:err.message || String(err) }; }
});

ipcMain.handle('discord-connect', async (_e, config) => {
  try {
    if (discordClient) { try { discordClient.destroy(); } catch (_) {} }
    discordReady = false;
    discordInfo = { connected:false, botName:'Unavailable', botId:'Unavailable', guilds:[] };
    discordClient = new Client({ intents:[GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
    discordClient.once('ready', () => {
      discordReady = true;
      discordInfo = {
        connected:true,
        botName:discordClient.user.tag,
        botId:discordClient.user.id,
        guilds:discordClient.guilds.cache.map(g => ({ id:g.id, name:g.name, memberCount:g.memberCount || 'Unavailable' }))
      };
      logEvent('Discord Connected', discordInfo.botName);
      mainWindow?.webContents.send('overwatch-event',{type:'DISCORD_CONNECTED',payload:discordInfo});
    });
    await discordClient.login(config.token);
    await new Promise((resolve,reject) => {
      const start=Date.now();
      const timer=setInterval(()=> {
        if (discordReady) { clearInterval(timer); resolve(); }
        if (Date.now()-start > 12000) { clearInterval(timer); reject(new Error('Discord connection timed out.')); }
      },250);
    });
    return discordInfo;
  } catch (err) {
    discordReady = false;
    discordInfo = { connected:false, botName:'Unavailable', botId:'Unavailable', guilds:[], error:err.message || String(err) };
    logEvent('Discord Connection Failed', err.message || String(err));
    return discordInfo;
  }
});

ipcMain.handle('discord-send-live', async (_e, config) => {
  try {
    if (!discordReady || !discordClient) throw new Error('Discord is not connected.');
    if (!config.channelId) throw new Error('Channel ID is required.');
    const channel = await discordClient.channels.fetch(config.channelId);
    if (!channel || !channel.isTextBased()) throw new Error('Channel not found or is not text-based.');
    const embed = new EmbedBuilder()
      .setColor(0xff1d1d)
      .setTitle('🔴 THE JD LOUNGE IS LIVE!')
      .setDescription(config.message || 'Kelvor has activated the stream. Come hang out with The JD Lounge!')
      .addFields({ name:'Powered By', value:'KelvorOS', inline:true }, { name:'Module', value:'Overwatch Live Integration', inline:true })
      .setFooter({ text:'The JD Lounge Command Center' })
      .setTimestamp();
    const sent = await channel.send({ embeds:[embed] });
    logEvent('Discord Announcement Sent', channel.id);
    return { ok:true, messageId:sent.id, channelId:channel.id };
  } catch (err) {
    logEvent('Discord Announcement Failed', err.message || String(err));
    return { ok:false, error:err.message || String(err) };
  }
});

ipcMain.handle('forge-open-vault', async () => {
  const vault = ensureVault();
  await shell.openPath(vault);
  logEvent('Forge Vault Opened', vault);
  return { ok:true, vaultPath:vault };
});

app.whenReady().then(() => {
  ensureVault();
  saveSettings(loadSettings());
  logEvent('KelvorOS Started','Operation Overwatch v0.92 online.');
  createWindow();
});

app.on('window-all-closed', () => {
  try { if (discordClient) discordClient.destroy(); } catch (_) {}
  if (process.platform !== 'darwin') app.quit();
});
