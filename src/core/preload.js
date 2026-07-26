const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("kelvor", {
  version: "2.6",
  platform: process.platform,
});