const COMMANDS = [
  { app: "github", phrases: ["open github", "open github desktop", "launch github"] },
  { app: "vscode", phrases: ["open vscode", "open visual studio code", "launch vscode"] },
  { app: "discord", phrases: ["open discord", "launch discord"] },
  { app: "obs", phrases: ["open obs", "open obs studio", "launch obs"] },
  { app: "plex", phrases: ["open plex", "launch plex"] },
];

function normalize(text = "") {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function findCommand(text) {
  const normalized = normalize(text);
  return COMMANDS.find(({ phrases }) => phrases.some((phrase) => normalized.includes(phrase)))?.app || null;
}

module.exports = { findCommand, normalize };
