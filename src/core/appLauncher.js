const { exec } = require("child_process");

const APPS = {
  github: {
    darwin: "GitHub Desktop",
    win32: "%LocalAppData%\\GitHubDesktop\\GitHubDesktop.exe",
  },

  vscode: {
    darwin: "Visual Studio Code",
    win32: "%LocalAppData%\\Programs\\Microsoft VS Code\\Code.exe",
  },

  discord: {
    darwin: "Discord",
    win32: "%LocalAppData%\\Discord\\Update.exe --processStart Discord.exe",
  },

  obs: {
    darwin: "OBS",
    win32: "obs64.exe",
  },

  plex: {
    darwin: "Plex",
    win32: "Plex.exe",
  },
};

function launchApp(appName) {
  const app = APPS[appName];

  if (!app) {
    throw new Error(`Unknown app: ${appName}`);
  }

  if (process.platform === "darwin") {
    exec(`open -a "${app.darwin}"`);
    return;
  }

  if (process.platform === "win32") {
    exec(`start "" "${app.win32}"`, {
      shell: true,
    });
    return;
  }

  throw new Error("Unsupported operating system.");
}

module.exports = {
  launchApp,
};