const { app, BrowserWindow, ipcMain, session, shell, systemPreferences } = require("electron");
const path = require("path");
const fs = require("fs");
const { registerVoiceIPC } = require("./src/ipc/voiceIPC");

let mainWindow;
let timeline = [];
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); return dir; }
function dataDir() { return ensureDir(path.join(app.getPath("userData"), "creator-dashboard")); }
function vaultPath() { const v = path.join(__dirname, "vault"); ["Dashboard", "Clips", "Posts", "Ideas", "Tasks", "Logos"].forEach((f) => ensureDir(path.join(v, f))); return v; }
function filePath(name) { return path.join(dataDir(), name); }
function readJson(name, fallback) { try { const p = filePath(name); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback; } catch (_) { return fallback; } }
function writeJson(name, data) { fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf8"); return data; }
function logEvent(event, detail = "") { const entry = { time: new Date().toISOString(), event, detail }; timeline.unshift(entry); timeline = timeline.slice(0, 500); mainWindow?.webContents.send("kelvor-event", entry); return entry; }
function tasks() { return readJson("tasks.json", []); }
function ideas() { return readJson("ideas.json", []); }
function posts() { return readJson("posts.json", []); }
function payload() { return { health: { score: 100, label: "Audio Engine Ready" }, dashboard: { tasks: tasks(), ideas: ideas(), posts: posts() }, timeline }; }

ipcMain.handle("kelvor-status", async () => payload());
ipcMain.handle("kelvor-command", async (_event, command = "") => ({ response: command ? `Kelvor heard: ${command}` : "No command received.", action: "generic" }));
ipcMain.handle("forge-open-vault", async () => { const v = vaultPath(); await shell.openPath(v); return { ok: true, vaultPath: v }; });
registerVoiceIPC({ logEvent });

async function configureMicrophoneAccess() {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === "media" || permission === "microphone"));
  if (process.platform === "darwin") {
    try { await systemPreferences.askForMediaAccess("microphone"); } catch (error) { console.error("Microphone permission error:", error); }
  }
}

function createWindow() {
  vaultPath();
  mainWindow = new BrowserWindow({
    width: 1600, height: 1000, minWidth: 1200, minHeight: 760,
    backgroundColor: "#030303", title: "KelvorOS v3.1 Audio Engine",
    webPreferences: { preload: path.join(__dirname, "src/core/preload.js"), nodeIntegration: false, contextIsolation: true },
  });
  mainWindow.loadFile(path.join(__dirname, "src/ui/index.html"));
  logEvent("KelvorOS Started", "v3.1 Audio Engine online.");
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(async () => { await configureMicrophoneAccess(); createWindow(); app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
