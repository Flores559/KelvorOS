const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kelvor", {
  version: "2.9",
  platform: process.platform,

  launchApp: (appName) => ipcRenderer.invoke("launch-app", appName),
});