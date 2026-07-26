const navButtons = document.querySelectorAll(".nav-button");
const views = document.querySelectorAll(".view");

const commandForm = document.getElementById("command-form");
const commandInput = document.getElementById("command-input");
const commandCount = document.getElementById("command-count");
const commandStatus = document.getElementById("command-status");
const activityLog = document.getElementById("activity-log");
const clearLogButton = document.getElementById("clear-log");
const platformName = document.getElementById("platform-name");

let totalCommands = 0;

function showView(viewName) {
  navButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.view === viewName
    );
  });

  views.forEach((view) => {
    view.classList.toggle(
      "active",
      view.id === `${viewName}-view`
    );
  });
}

function addLogEntry(message) {
  const entry = document.createElement("div");
  entry.className = "log-entry";

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const text = document.createElement("p");
  text.textContent = message;

  entry.append(time, text);
  activityLog.prepend(entry);
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showView(button.dataset.view);
    addLogEntry(`Opened ${button.textContent.trim()} view.`);
  });
});

commandForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const command = commandInput.value.trim();

  if (!command) {
    commandStatus.textContent = "Enter a command";
    commandInput.focus();
    return;
  }

  totalCommands += 1;
  commandCount.textContent = totalCommands;
  commandStatus.textContent = "Command received";

  addLogEntry(`Command received: ${command}`);

  commandInput.value = "";
  commandInput.focus();

  window.setTimeout(() => {
    commandStatus.textContent = "Standing by";
  }, 1500);
});

clearLogButton.addEventListener("click", () => {
  activityLog.innerHTML = "";
  addLogEntry("Activity log cleared.");
});

if (window.kelvor) {
  platformName.textContent =
    window.kelvor.platform === "darwin"
      ? "macOS"
      : window.kelvor.platform;

  addLogEntry(
    `KelvorOS v${window.kelvor.version} connected successfully.`
  );
}