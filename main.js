const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

const imageExt = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const videoExt = ['.mp4', '.webm', '.mov'];
const audioExt = ['.mp3', '.wav', '.ogg'];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1580,
    height: 980,
    minWidth: 1280,
    minHeight: 820,
    backgroundColor: '#030303',
    title: 'KelvorOS v0.60 Alpha - Project Forge',
    webPreferences: {
      preload: __dirname + '/src/core/preload.js',
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('src/ui/index.html');
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

function fileType(ext) {
  if (imageExt.includes(ext)) return 'image';
  if (videoExt.includes(ext)) return 'video';
  if (audioExt.includes(ext)) return 'audio';
  return 'file';
}

function scanFolder(folderPath, category) {
  if (!fs.existsSync(folderPath)) return [];
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  return entries
    .filter(e => e.isFile())
    .map(e => {
      const full = path.join(folderPath, e.name);
      const stat = fs.statSync(full);
      const ext = path.extname(e.name).toLowerCase();
      return {
        id: Buffer.from(full).toString('base64'),
        name: e.name,
        category,
        path: full,
        type: fileType(ext),
        ext,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        previewUrl: `file://${full.replace(/\\/g, '/')}`
      };
    });
}

function scanVault() {
  const vault = ensureVault();
  const categories = fs.readdirSync(vault, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  let assets = [];
  categories.forEach(category => {
    assets = assets.concat(scanFolder(path.join(vault, category), category));
  });

  return {
    vaultPath: vault,
    categories,
    assets
  };
}

ipcMain.handle('forge-scan', async () => scanVault());

ipcMain.handle('forge-open-vault', async () => {
  const vault = ensureVault();
  await shell.openPath(vault);
  return { ok: true, vaultPath: vault };
});

ipcMain.handle('forge-open-file-location', async (_event, filePath) => {
  shell.showItemInFolder(filePath);
  return { ok: true };
});

ipcMain.handle('forge-import-files', async (_event, category) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Assets into Kelvor Forge',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media Assets', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled) return { canceled: true };

  const vault = ensureVault();
  const target = path.join(vault, category || 'Overlays');
  if (!fs.existsSync(target)) fs.mkdirSync(target);

  const imported = [];
  for (const file of result.filePaths) {
    const dest = path.join(target, path.basename(file));
    fs.copyFileSync(file, dest);
    imported.push(dest);
  }

  return { canceled: false, imported, scan: scanVault() };
});

app.whenReady().then(() => {
  ensureVault();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
