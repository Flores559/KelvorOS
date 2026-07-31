const { contextBridge, ipcRenderer } = require("electron");
const { getSystemInfo } = require("./systemInfo");

contextBridge.exposeInMainWorld("kelvor", {
  version: "3.2.0",
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

  getSystemInfo: () =>
    getSystemInfo(),
});