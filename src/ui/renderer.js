console.log("Kelvor renderer loaded.");

const navButtons = document.querySelectorAll(".nav-button");
const views = document.querySelectorAll(".view");

console.log("Navigation buttons found:", navButtons.length);
console.log("Views found:", views.length);

function showView(viewName) {
  navButtons.forEach((button) => {
    button.classList.remove("active");

    if (button.dataset.view === viewName) {
      button.classList.add("active");
    }
  });

  views.forEach((view) => {
    view.classList.remove("active");

    if (view.id === `${viewName}-view`) {
      view.classList.add("active");
    }
  });
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const viewName = button.dataset.view;

    console.log("Opening view:", viewName);
    showView(viewName);
  });
});
const talkButton = document.getElementById("talk-button");
const voiceOrb = document.getElementById("voice-orb");
const voiceStatus = document.getElementById("voice-status");
const voiceLevel = document.getElementById("voice-level");

let microphoneStream = null;
let audioContext = null;
let analyser = null;
let animationFrame = null;
let isListening = false;

async function startListening() {
  if (isListening || !talkButton) return;

  try {
    isListening = true;

    microphoneStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

    audioContext = new AudioContext();

    const source =
      audioContext.createMediaStreamSource(
        microphoneStream
      );

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    source.connect(analyser);

    const audioData = new Uint8Array(
      analyser.frequencyBinCount
    );

    voiceOrb?.classList.add("listening");
    talkButton.classList.add("active");
    talkButton.textContent = "Listening…";

    if (voiceStatus) {
      voiceStatus.textContent =
        "Kelvor is listening";
    }

    function updateVoiceMeter() {
      if (!analyser || !isListening) return;

      analyser.getByteFrequencyData(audioData);

      const average =
        audioData.reduce(
          (total, value) => total + value,
          0
        ) / audioData.length;

      const percentage =
        Math.min(average * 2.5, 100);

      if (voiceLevel) {
        voiceLevel.style.width =
          `${percentage}%`;
      }

      animationFrame =
        requestAnimationFrame(
          updateVoiceMeter
        );
    }

    updateVoiceMeter();
  } catch (error) {
    console.error(
      "Microphone error:",
      error
    );

    isListening = false;

    if (voiceStatus) {
      voiceStatus.textContent =
        "Microphone unavailable";
    }

    if (talkButton) {
      talkButton.textContent =
        "Hold to Talk";
      talkButton.classList.remove("active");
    }

    voiceOrb?.classList.remove("listening");
  }
}

function stopListening() {
  if (!isListening) return;

  isListening = false;

  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  if (microphoneStream) {
    microphoneStream
      .getTracks()
      .forEach((track) => track.stop());

    microphoneStream = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  analyser = null;

  if (voiceLevel) {
    voiceLevel.style.width = "0%";
  }

  voiceOrb?.classList.remove("listening");

  if (talkButton) {
    talkButton.classList.remove("active");
    talkButton.textContent = "Hold to Talk";
  }

  if (voiceStatus) {
    voiceStatus.textContent =
      "Microphone standby";
  }
}

if (talkButton) {
  talkButton.addEventListener(
    "mousedown",
    startListening
  );

  talkButton.addEventListener(
    "mouseup",
    stopListening
  );

  talkButton.addEventListener(
    "mouseleave",
    stopListening
  );
}