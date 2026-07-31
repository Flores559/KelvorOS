console.log("Kelvor v3.2 renderer loaded.");

// ============================================================
// ELEMENTS
// ============================================================

const navButtons = document.querySelectorAll(".nav-button");
const views = document.querySelectorAll(".view");

const commandForm = document.getElementById("command-form");
const commandInput = document.getElementById("command-input");
const commandStatus = document.getElementById("command-status");
const commandCount = document.getElementById("command-count");

const activityLog = document.getElementById("activity-log");
const clearLogButton = document.getElementById("clear-log");

const talkButton = document.getElementById("talk-button");
const voiceStatus = document.getElementById("voice-status");
const voiceOrb = document.getElementById("voice-orb");
const voiceLevel = document.getElementById("voice-level");

const sidebarTestVoiceButton = document.getElementById("testVoiceBtn");
const voicePageTestButton = document.getElementById("test-voice-button");

let executedCommandCount = 0;
let isRecording = false;

let audioContext = null;
let microphoneStream = null;
let microphoneSource = null;
let audioProcessor = null;
let recordedAudioChunks = [];

// ============================================================
// NAVIGATION
// ============================================================

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetView = button.dataset.view;

    navButtons.forEach((navButton) => {
      navButton.classList.remove("active");
    });

    views.forEach((view) => {
      view.classList.remove("active");
    });

    button.classList.add("active");

    const selectedView = document.getElementById(`${targetView}-view`);

    if (selectedView) {
      selectedView.classList.add("active");
    }
  });
});

// ============================================================
// ACTIVITY LOG
// ============================================================

function getCurrentTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function addLogEntry(message, type = "system") {
  if (!activityLog) {
    return;
  }

  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = getCurrentTime();

  const text = document.createElement("p");
  text.textContent = message;

  entry.appendChild(time);
  entry.appendChild(text);

  activityLog.prepend(entry);
}

if (clearLogButton) {
  clearLogButton.addEventListener("click", () => {
    activityLog.innerHTML = "";

    addLogEntry("Activity log cleared.");
  });
}

// ============================================================
// COMMAND PROCESSING
// ============================================================

function updateCommandCount() {
  if (commandCount) {
    commandCount.textContent = String(executedCommandCount);
  }
}

function getResultMessage(result, fallbackMessage) {
  if (typeof result === "string") {
    return result;
  }

  if (result?.message) {
    return result.message;
  }

  if (result?.response) {
    return result.response;
  }

  if (result?.error) {
    return result.error;
  }

  return fallbackMessage;
}

async function executeCommand(commandText, source = "typed") {
  const command = commandText.trim();

  if (!command) {
    return;
  }

  if (!window.kelvor?.command) {
    const message = "Kelvor command bridge is unavailable.";

    console.error(message);

    if (commandStatus) {
      commandStatus.textContent = "Command unavailable";
    }

    addLogEntry(message, "error");
    return;
  }

  try {
    if (commandStatus) {
      commandStatus.textContent = "Processing...";
    }

    addLogEntry(
      `${source === "voice" ? "Voice" : "Command"}: ${command}`,
      "command"
    );

    const result = await window.kelvor.command(command);

    executedCommandCount += 1;
    updateCommandCount();

    const resultMessage = getResultMessage(
      result,
      `Command completed: ${command}`
    );

    if (commandStatus) {
      commandStatus.textContent = resultMessage;
    }

    addLogEntry(resultMessage, "success");

    speak(`Command completed.`);
  } catch (error) {
    console.error("Kelvor command error:", error);

    const errorMessage =
      error?.message || "Kelvor could not complete the command.";

    if (commandStatus) {
      commandStatus.textContent = "Command failed";
    }

    addLogEntry(errorMessage, "error");

    speak("I could not complete that command.");
  }
}

if (commandForm) {
  commandForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const command = commandInput?.value || "";

    if (!command.trim()) {
      if (commandStatus) {
        commandStatus.textContent = "Enter a command";
      }

      return;
    }

    if (commandInput) {
      commandInput.value = "";
    }

    await executeCommand(command, "typed");
  });
}

// ============================================================
// KELVOR VOICE
// ============================================================

function speak(message) {
  if (!("speechSynthesis" in window)) {
    console.warn("Speech synthesis is unavailable.");
    return;
  }

  window.speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(message);

  speech.rate = 0.95;
  speech.pitch = 0.85;
  speech.volume = 1;

  const availableVoices = window.speechSynthesis.getVoices();

  const preferredVoice =
    availableVoices.find((voice) =>
      voice.name.toLowerCase().includes("daniel")
    ) ||
    availableVoices.find((voice) =>
      voice.name.toLowerCase().includes("alex")
    ) ||
    availableVoices.find((voice) =>
      voice.lang.toLowerCase().startsWith("en")
    );

  if (preferredVoice) {
    speech.voice = preferredVoice;
  }

  window.speechSynthesis.speak(speech);
}

function testKelvorVoice() {
  speak("Voice systems online. Welcome back, JD.");

  addLogEntry("Kelvor voice test completed.", "success");
}

if (sidebarTestVoiceButton) {
  sidebarTestVoiceButton.addEventListener("click", testKelvorVoice);
}

if (voicePageTestButton) {
  voicePageTestButton.addEventListener("click", testKelvorVoice);
}

// ============================================================
// AUDIO RECORDING
// ============================================================

function setVoiceState(state, message) {
  if (voiceStatus) {
    voiceStatus.textContent = message;
  }

  if (voiceOrb) {
    voiceOrb.classList.remove(
      "listening",
      "processing",
      "success",
      "error"
    );

    if (state) {
      voiceOrb.classList.add(state);
    }
  }

  if (talkButton) {
    talkButton.classList.toggle("recording", state === "listening");
  }
}

function mergeAudioChunks(chunks) {
  const totalLength = chunks.reduce(
    (length, chunk) => length + chunk.length,
    0
  );

  const mergedAudio = new Float32Array(totalLength);

  let offset = 0;

  chunks.forEach((chunk) => {
    mergedAudio.set(chunk, offset);
    offset += chunk.length;
  });

  return mergedAudio;
}

function resampleAudio(audioData, originalSampleRate, targetSampleRate) {
  if (originalSampleRate === targetSampleRate) {
    return audioData;
  }

  const sampleRateRatio = originalSampleRate / targetSampleRate;
  const newLength = Math.round(audioData.length / sampleRateRatio);

  const resampledAudio = new Float32Array(newLength);

  let originalOffset = 0;

  for (let index = 0; index < newLength; index += 1) {
    const nextOriginalOffset = Math.round(
      (index + 1) * sampleRateRatio
    );

    let total = 0;
    let count = 0;

    for (
      let sampleIndex = originalOffset;
      sampleIndex < nextOriginalOffset &&
      sampleIndex < audioData.length;
      sampleIndex += 1
    ) {
      total += audioData[sampleIndex];
      count += 1;
    }

    resampledAudio[index] = count > 0 ? total / count : 0;
    originalOffset = nextOriginalOffset;
  }

  return resampledAudio;
}

function writeText(dataView, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    dataView.setUint8(offset + index, text.charCodeAt(index));
  }
}

function encodeWav(audioData, sampleRate = 16000) {
  const bytesPerSample = 2;
  const wavHeaderSize = 44;

  const buffer = new ArrayBuffer(
    wavHeaderSize + audioData.length * bytesPerSample
  );

  const view = new DataView(buffer);

  writeText(view, 0, "RIFF");
  view.setUint32(4, 36 + audioData.length * bytesPerSample, true);

  writeText(view, 8, "WAVE");
  writeText(view, 12, "fmt ");

  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);

  writeText(view, 36, "data");
  view.setUint32(40, audioData.length * bytesPerSample, true);

  let offset = wavHeaderSize;

  for (let index = 0; index < audioData.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, audioData[index]));

    const integerSample =
      sample < 0
        ? sample * 0x8000
        : sample * 0x7fff;

    view.setInt16(offset, integerSample, true);

    offset += bytesPerSample;
  }

  return new Uint8Array(buffer);
}

function updateVoiceMeter(audioData) {
  if (!voiceLevel || audioData.length === 0) {
    return;
  }

  let total = 0;

  for (let index = 0; index < audioData.length; index += 1) {
    total += audioData[index] * audioData[index];
  }

  const rms = Math.sqrt(total / audioData.length);
  const levelPercentage = Math.min(100, Math.round(rms * 350));

  voiceLevel.style.width = `${levelPercentage}%`;
}

async function startRecording() {
  if (isRecording) {
    return;
  }

  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    audioContext = new AudioContext();

    microphoneSource =
      audioContext.createMediaStreamSource(microphoneStream);

    audioProcessor = audioContext.createScriptProcessor(
      4096,
      1,
      1
    );

    recordedAudioChunks = [];

    audioProcessor.onaudioprocess = (event) => {
      const audioData = event.inputBuffer.getChannelData(0);

      recordedAudioChunks.push(new Float32Array(audioData));

      updateVoiceMeter(audioData);
    };

    microphoneSource.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);

    isRecording = true;

    setVoiceState("listening", "Listening...");

    addLogEntry("Microphone recording started.", "voice");
  } catch (error) {
    console.error("Microphone error:", error);

    setVoiceState("error", "Microphone permission denied");

    addLogEntry(
      "Kelvor could not access the microphone.",
      "error"
    );
  }
}

async function stopRecording() {
  if (!isRecording) {
    return;
  }

  isRecording = false;

  setVoiceState("processing", "Processing speech...");

  if (audioProcessor) {
    audioProcessor.disconnect();
    audioProcessor.onaudioprocess = null;
  }

  if (microphoneSource) {
    microphoneSource.disconnect();
  }

  if (microphoneStream) {
    microphoneStream.getTracks().forEach((track) => {
      track.stop();
    });
  }

  const originalSampleRate = audioContext?.sampleRate || 48000;

  if (audioContext) {
    await audioContext.close();
  }

  if (voiceLevel) {
    voiceLevel.style.width = "0%";
  }

  const mergedAudio = mergeAudioChunks(recordedAudioChunks);

  if (mergedAudio.length === 0) {
    setVoiceState("error", "No audio recorded");
    return;
  }

  const resampledAudio = resampleAudio(
    mergedAudio,
    originalSampleRate,
    16000
  );

  const wavBytes = encodeWav(resampledAudio, 16000);

  console.log("Kelvor WAV generated:", {
    bytes: wavBytes.length,
    sampleRate: 16000
  });

  await transcribeRecording(wavBytes);
}

async function transcribeRecording(wavBytes) {
  if (!window.kelvor?.transcribeAudio) {
    setVoiceState(
      "error",
      "Voice transcription bridge unavailable"
    );

    addLogEntry(
      "Kelvor transcription bridge is unavailable.",
      "error"
    );

    return;
  }

  try {
    const transcriptionResult =
      await window.kelvor.transcribeAudio(wavBytes);

    const transcription =
      typeof transcriptionResult === "string"
        ? transcriptionResult
        : transcriptionResult?.text ||
          transcriptionResult?.transcription ||
          "";

    const cleanedText = transcription.trim();

    console.log("Kelvor transcription:", cleanedText);

    if (!cleanedText) {
      setVoiceState("error", "Kelvor did not detect speech");

      addLogEntry(
        "No speech was detected. Please try again.",
        "error"
      );

      return;
    }

    setVoiceState("success", `Heard: ${cleanedText}`);

    addLogEntry(`Heard: ${cleanedText}`, "voice");

    await processRecognizedVoice(cleanedText);
  } catch (error) {
    console.error("Transcription error:", error);

    setVoiceState("error", "Speech processing failed");

    addLogEntry(
      error?.message || "Kelvor could not process the recording.",
      "error"
    );
  }
}

async function processRecognizedVoice(text) {
  try {
    if (window.kelvor?.processVoiceCommand) {
      const result =
        await window.kelvor.processVoiceCommand(text);

      const resultMessage = getResultMessage(
        result,
        `Voice command completed: ${text}`
      );

      executedCommandCount += 1;
      updateCommandCount();

      setVoiceState("success", resultMessage);

      addLogEntry(resultMessage, "success");

      speak("Command completed.");
      return;
    }

    await executeCommand(text, "voice");
  } catch (error) {
    console.error("Voice command error:", error);

    setVoiceState("error", "Voice command failed");

    addLogEntry(
      error?.message || "Kelvor could not execute the voice command.",
      "error"
    );

    speak("I could not complete that command.");
  }
}

// ============================================================
// PUSH-TO-TALK CONTROLS
// ============================================================

if (talkButton) {
  talkButton.addEventListener("pointerdown", async (event) => {
    event.preventDefault();

    talkButton.setPointerCapture?.(event.pointerId);

    await startRecording();
  });

  talkButton.addEventListener("pointerup", async (event) => {
    event.preventDefault();

    await stopRecording();
  });

  talkButton.addEventListener("pointercancel", async () => {
    await stopRecording();
  });

  talkButton.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
}

// ============================================================
// LIVE SYSTEM INFORMATION
// ============================================================

function formatPlatform(platform) {
  const platformNames = {
    darwin: "macOS",
    win32: "Windows",
    linux: "Linux"
  };

  return platformNames[platform] || platform;
}

function formatUptime(minutes) {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${remainingMinutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }

  return `${remainingMinutes}m`;
}

function loadSystemInformation() {
  if (!window.kelvor?.getSystemInfo) {
    console.warn("Kelvor system information bridge is unavailable.");
    return;
  }

  try {
    const systemInfo = window.kelvor.getSystemInfo();

    const platformName =
      document.getElementById("platform-name");

    const computerName =
      document.getElementById("computer-name");

    const memoryTotal =
      document.getElementById("memory-total");

    const cpuName =
      document.getElementById("cpu-name");

    const systemUptime =
      document.getElementById("system-uptime");

    const runtimeVersion =
      document.getElementById("runtime-version");

    if (platformName) {
      platformName.textContent =
        formatPlatform(systemInfo.platform);
    }

    if (computerName) {
      computerName.textContent = systemInfo.hostname;
    }

    if (memoryTotal) {
      memoryTotal.textContent = `${systemInfo.memory} GB`;
    }

    if (cpuName) {
      cpuName.textContent = systemInfo.cpu;
    }

    if (systemUptime) {
      systemUptime.textContent =
        formatUptime(systemInfo.uptime);
    }

    if (runtimeVersion) {
      runtimeVersion.textContent =
        `Node ${systemInfo.node} • Electron ${systemInfo.electron}`;
    }

    console.log(
      "Kelvor system information loaded:",
      systemInfo
    );

    addLogEntry(
      `System detected: ${formatPlatform(systemInfo.platform)} • ${systemInfo.memory} GB RAM`,
      "system"
    );
  } catch (error) {
    console.error(
      "Unable to load system information:",
      error
    );

    addLogEntry(
      "Unable to retrieve live system information.",
      "error"
    );
  }
}

// ============================================================
// INITIALIZATION
// ============================================================

window.addEventListener("DOMContentLoaded", () => {
  updateCommandCount();
  loadSystemInformation();

  console.log("KelvorOS dashboard initialized.");
});
const quickActionButtons = document.querySelectorAll(
  ".quick-action-button"
);

const quickActionStatus = document.getElementById(
  "quick-action-status"
);

quickActionButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const actionName = button.dataset.action;
    const originalText = quickActionStatus.textContent;

    button.disabled = true;

    quickActionStatus.classList.remove("success", "error");
    quickActionStatus.textContent =
      `Kelvor is launching ${actionName}...`;

    try {
      if (!window.kelvor?.quickAction) {
        throw new Error("Quick Actions bridge is unavailable.");
      }

      const result = await window.kelvor.quickAction(actionName);

      if (!result?.ok) {
        throw new Error(
          result?.message || "The application could not be launched."
        );
      }

      quickActionStatus.classList.add("success");
      quickActionStatus.textContent =
        result.message || `${actionName} launched successfully.`;

      
    } catch (error) {
      console.error("Quick Action error:", error);

      quickActionStatus.classList.add("error");
      quickActionStatus.textContent =
        error.message || "Quick Action failed.";
    } finally {
      window.setTimeout(() => {
        button.disabled = false;

        if (
          quickActionStatus.textContent.includes("successfully") ||
          quickActionStatus.classList.contains("error")
        ) {
          window.setTimeout(() => {
            quickActionStatus.classList.remove("success", "error");
            quickActionStatus.textContent = originalText;
          }, 2500);
        }
      }, 500);
    }
  });
});