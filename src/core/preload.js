const { contextBridge, ipcRenderer } = require("electron");
const { getSystemInfo } = require("./systemInfo");

contextBridge.exposeInMainWorld("kelvor", {
  version: "3.4.0",
  platform: process.platform,

  launchApp: (appName) =>
    ipcRenderer.invoke("launch-app", appName),

  processVoiceCommand: (text) =>
    ipcRenderer.invoke("process-voice-command", text),

  transcribeAudio: (wavBytes) =>
    ipcRenderer.invoke("transcribe-audio", wavBytes),

  status: () =>
    ipcRenderer.invoke("kelvor-status"),

  command: (text) =>
    ipcRenderer.invoke("kelvor-command", text),

  quickAction: (actionName) =>
    ipcRenderer.invoke("kelvor-quick-action", actionName),

  getLiveSystem: () =>
    ipcRenderer.invoke("kelvor-live-system"),

  getSystemInfo: () =>
    getSystemInfo(),
});