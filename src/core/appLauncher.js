const { execFile, spawn } = require("child_process");

const MAC_APPS = { github: "GitHub Desktop", vscode: "Visual Studio Code", discord: "Discord", obs: "OBS", plex: "Plex" };
const WINDOWS_COMMANDS = {
  github: ["cmd", ["/c", "start", "", "%LocalAppData%\\GitHubDesktop\\GitHubDesktop.exe"]],
  vscode: ["cmd", ["/c", "start", "", "%LocalAppData%\\Programs\\Microsoft VS Code\\Code.exe"]],
  discord: ["cmd", ["/c", "start", "", "%LocalAppData%\\Discord\\Update.exe", "--processStart", "Discord.exe"]],
  obs: ["cmd", ["/c", "start", "", "obs64.exe"]],
  plex: ["cmd", ["/c", "start", "", "Plex.exe"]],
};

function launchApp(appName) {
  return new Promise((resolve, reject) => {
    if (process.platform === "darwin") {
      const app = MAC_APPS[appName];
      if (!app) return reject(new Error(`Unknown app: ${appName}`));
      execFile("open", ["-a", app], (error) => error ? reject(error) : resolve());
      return;
    }
    if (process.platform === "win32") {
      const command = WINDOWS_COMMANDS[appName];
      if (!command) return reject(new Error(`Unknown app: ${appName}`));
      const child = spawn(command[0], command[1], { detached: true, windowsHide: true, shell: false });
      child.on("error", reject);
      child.unref();
      resolve();
      return;
    }
    reject(new Error("Unsupported operating system."));
  });
}

module.exports = { launchApp };
