const { findCommand } = require("./voiceCommands");
const { launchApp } = require("./appLauncher");

async function routeVoiceCommand(text) {
  const app = findCommand(text);
  if (!app) return { success: false, message: "Command not recognized" };
  await launchApp(app);
  return { success: true, app, message: `Opening ${app}` };
}

module.exports = { routeVoiceCommand };
