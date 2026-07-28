const fs = require("fs");
const path = require("path");
const os = require("os");
const { ipcMain } = require("electron");
const { transcribeAudio } = require("../core/whisperService");
const { routeVoiceCommand } = require("../core/commandRouter");
const { launchApp } = require("../core/appLauncher");

function registerVoiceIPC({ logEvent = () => {} } = {}) {
  ipcMain.handle("launch-app", async (_event, appName) => {
    try { await launchApp(appName); logEvent("Application Launched", appName); return { success: true, app: appName }; }
    catch (error) { return { success: false, error: error.message }; }
  });

  ipcMain.handle("process-voice-command", async (_event, text) => {
    try { const result = await routeVoiceCommand(text); logEvent("Voice Command", text); return result; }
    catch (error) { return { success: false, error: error.message }; }
  });

  ipcMain.handle("transcribe-audio", async (_event, wavBytes) => {
    const tempPath = path.join(os.tmpdir(), `kelvor-${Date.now()}.wav`);
    try {
      fs.writeFileSync(tempPath, Buffer.from(wavBytes));
      const transcript = await transcribeAudio(tempPath);
      const commandResult = await routeVoiceCommand(transcript);
      logEvent("Whisper Transcript", transcript);
      return { success: true, transcript, commandResult };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    }
  });
}

module.exports = { registerVoiceIPC };
