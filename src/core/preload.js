const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kelvor", {
  version: "3.1.0",
  platform: process.platform,
  launchApp: (appName) => ipcRenderer.invoke("launch-app", appName),
  processVoiceCommand: (text) => ipcRenderer.invoke("process-voice-command", text),
  transcribeAudio: (wavBytes) => ipcRenderer.invoke("transcribe-audio", wavBytes),
  status: () => ipcRenderer.invoke("kelvor-status"),
  command: (text) => ipcRenderer.invoke("kelvor-command", text),
});
