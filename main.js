const { app, BrowserWindow, ipcMain } = require('electron');
const OBSWebSocket = require('obs-websocket-js').default;

let mainWindow;
let obs = null;
let obsConnected = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 990,
    minWidth: 1280,
    minHeight: 820,
    backgroundColor: '#030303',
    title: 'KelvorOS v0.51 Beta - Project Aegis',
    webPreferences: {
      preload: __dirname + '/src/core/preload.js',
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('src/ui/index.html');
}

async function safeCall(requestType, requestData = {}) {
  if (!obsConnected || !obs) throw new Error('OBS is not connected.');
  return await obs.call(requestType, requestData);
}

async function getOBSStatus() {
  if (!obsConnected || !obs) {
    return {
      connected: false,
      currentScene: 'Unavailable',
      streaming: false,
      recording: false,
      obsVersion: 'Unavailable',
      scenes: [],
      streamTimecode: '00:00:00',
      recordTimecode: '00:00:00',
      outputSkippedFrames: 0,
      outputTotalFrames: 0,
      fps: 'Unavailable',
      cpuUsage: 'Unavailable',
      memoryUsage: 'Unavailable',
      renderSkippedFrames: 0,
      renderTotalFrames: 0
    };
  }

  const [scene, stream, record, version, sceneList, stats] = await Promise.all([
    obs.call('GetCurrentProgramScene'),
    obs.call('GetStreamStatus'),
    obs.call('GetRecordStatus'),
    obs.call('GetVersion'),
    obs.call('GetSceneList'),
    obs.call('GetStats')
  ]);

  return {
    connected: true,
    currentScene: scene.currentProgramSceneName,
    streaming: stream.outputActive,
    recording: record.outputActive,
    obsVersion: version.obsVersion || 'Connected',
    scenes: (sceneList.scenes || []).map(s => s.sceneName).reverse(),
    streamTimecode: stream.outputTimecode || '00:00:00',
    recordTimecode: record.outputTimecode || '00:00:00',
    outputSkippedFrames: stream.outputSkippedFrames || 0,
    outputTotalFrames: stream.outputTotalFrames || 0,
    fps: stats.activeFps ? Number(stats.activeFps).toFixed(1) : 'Unavailable',
    cpuUsage: stats.cpuUsage ? Number(stats.cpuUsage).toFixed(1) + '%' : 'Unavailable',
    memoryUsage: stats.memoryUsage ? Number(stats.memoryUsage).toFixed(1) + ' MB' : 'Unavailable',
    renderSkippedFrames: stats.renderSkippedFrames || 0,
    renderTotalFrames: stats.renderTotalFrames || 0
  };
}

ipcMain.handle('obs-connect', async (_event, config) => {
  try {
    obs = new OBSWebSocket();
    const address = `ws://${config.host || '127.0.0.1'}:${config.port || '4455'}`;
    await obs.connect(address, config.password || '');
    obsConnected = true;

    obs.on('ConnectionClosed', () => {
      obsConnected = false;
      mainWindow?.webContents.send('obs-event', { type: 'OBS_DISCONNECTED' });
    });

    obs.on('CurrentProgramSceneChanged', (data) => {
      mainWindow?.webContents.send('obs-event', { type: 'OBS_SCENE_CHANGED', sceneName: data.sceneName });
    });

    obs.on('StreamStateChanged', () => mainWindow?.webContents.send('obs-event', { type: 'OBS_STATUS_UPDATED' }));
    obs.on('RecordStateChanged', () => mainWindow?.webContents.send('obs-event', { type: 'OBS_STATUS_UPDATED' }));
    obs.on('SceneCreated', () => mainWindow?.webContents.send('obs-event', { type: 'OBS_SCENES_UPDATED' }));
    obs.on('SceneRemoved', () => mainWindow?.webContents.send('obs-event', { type: 'OBS_SCENES_UPDATED' }));
    obs.on('SceneNameChanged', () => mainWindow?.webContents.send('obs-event', { type: 'OBS_SCENES_UPDATED' }));

    return await getOBSStatus();
  } catch (error) {
    obsConnected = false;
    return { connected: false, error: error.message || String(error), scenes: [] };
  }
});

ipcMain.handle('obs-disconnect', async () => {
  try { if (obs) await obs.disconnect(); } catch (_) {}
  obsConnected = false;
  obs = null;
  return await getOBSStatus();
});

ipcMain.handle('obs-status', async () => {
  try { return await getOBSStatus(); }
  catch (error) { return { connected: false, error: error.message || String(error), scenes: [] }; }
});

ipcMain.handle('obs-set-scene', async (_event, sceneName) => {
  try {
    await safeCall('SetCurrentProgramScene', { sceneName });
    return await getOBSStatus();
  } catch (error) {
    return { connected: obsConnected, error: error.message || String(error) };
  }
});

ipcMain.handle('obs-start-stream', async () => {
  try { await safeCall('StartStream'); return await getOBSStatus(); }
  catch (error) { return { connected: obsConnected, error: error.message || String(error) }; }
});

ipcMain.handle('obs-stop-stream', async () => {
  try { await safeCall('StopStream'); return await getOBSStatus(); }
  catch (error) { return { connected: obsConnected, error: error.message || String(error) }; }
});

ipcMain.handle('obs-start-record', async () => {
  try { await safeCall('StartRecord'); return await getOBSStatus(); }
  catch (error) { return { connected: obsConnected, error: error.message || String(error) }; }
});

ipcMain.handle('obs-stop-record', async () => {
  try { await safeCall('StopRecord'); return await getOBSStatus(); }
  catch (error) { return { connected: obsConnected, error: error.message || String(error) }; }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
