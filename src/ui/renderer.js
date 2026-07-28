console.log("Kelvor v3.1 renderer loaded.");
const navButtons = document.querySelectorAll(".nav-button");
const views = document.querySelectorAll(".view");
const talkButton = document.getElementById("talk-button");
const voiceOrb = document.getElementById("voice-orb");
const voiceStatus = document.getElementById("voice-status");
const voiceLevel = document.getElementById("voice-level");
const testVoiceButton = document.getElementById("test-voice-button");
let isListening = false;

navButtons.forEach((button) => button.addEventListener("click", () => {
  navButtons.forEach((item) => item.classList.toggle("active", item === button));
  views.forEach((view) => view.classList.toggle("active", view.id === `${button.dataset.view}-view`));
}));

function speakKelvor(message) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const speech = new SpeechSynthesisUtterance(message);
  speech.rate = 0.95; speech.pitch = 0.85; speech.volume = 1;
  const voice = window.speechSynthesis.getVoices().find((item) => item.lang.startsWith("en"));
  if (voice) speech.voice = voice;
  window.speechSynthesis.speak(speech);
}

const recorder = new window.AudioRecorder({ onLevel: (level) => { if (voiceLevel) voiceLevel.style.width = `${level}%`; } });

async function startListening() {
  if (isListening) return;
  try {
    isListening = true;
    await recorder.start();
    voiceOrb?.classList.add("listening");
    talkButton?.classList.add("active");
    if (talkButton) talkButton.textContent = "Listening…";
    if (voiceStatus) voiceStatus.textContent = "Kelvor is listening";
  } catch (error) {
    isListening = false;
    if (voiceStatus) voiceStatus.textContent = `Microphone error: ${error.message}`;
  }
}

async function stopListening() {
  if (!isListening) return;
  isListening = false;
  voiceOrb?.classList.remove("listening");
  talkButton?.classList.remove("active");
  if (talkButton) { talkButton.textContent = "Processing…"; talkButton.disabled = true; }
  if (voiceStatus) voiceStatus.textContent = "Whisper is transcribing…";
  try {
    const wavBytes = await recorder.stop();
    if (!wavBytes || wavBytes.length < 1000) throw new Error("Recording was too short");
    const result = await window.kelvor.transcribeAudio(wavBytes);
    if (!result.success) throw new Error(result.error || "Transcription failed");
    const transcript = result.transcript;
    if (result.commandResult?.success) {
      voiceStatus.textContent = `Heard: “${transcript}” — Opening ${result.commandResult.app}`;
      speakKelvor(`Opening ${result.commandResult.app}`);
    } else {
      voiceStatus.textContent = `Heard: “${transcript}” — Command not recognized`;
      speakKelvor("I heard you, but I did not recognize that command.");
    }
  } catch (error) {
    console.error(error);
    if (voiceStatus) voiceStatus.textContent = `Voice error: ${error.message}`;
    speakKelvor("The voice command could not be completed.");
  } finally {
    if (talkButton) { talkButton.textContent = "Hold to Talk"; talkButton.disabled = false; }
  }
}

if (talkButton) {
  talkButton.addEventListener("mousedown", startListening);
  talkButton.addEventListener("mouseup", stopListening);
  talkButton.addEventListener("mouseleave", stopListening);
  talkButton.addEventListener("touchstart", (event) => { event.preventDefault(); startListening(); }, { passive: false });
  talkButton.addEventListener("touchend", (event) => { event.preventDefault(); stopListening(); }, { passive: false });
}
if (testVoiceButton) testVoiceButton.addEventListener("click", () => speakKelvor("Welcome back, JD. Kelvor Voice Core is online."));
