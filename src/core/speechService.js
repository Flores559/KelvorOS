const { spawn } = require("child_process");

let activeSpeechProcess = null;

/**
 * Stops Kelvor if it is currently speaking.
 */
function stopSpeaking() {
  if (!activeSpeechProcess) {
    return;
  }

  try {
    activeSpeechProcess.kill();
  } catch (error) {
    console.warn(
      "Could not stop Kelvor speech:",
      error.message
    );
  }

  activeSpeechProcess = null;
}

/**
 * Makes Kelvor speak a message.
 *
 * macOS uses the built-in "say" command.
 * Windows uses PowerShell speech synthesis.
 *
 * @param {string} message
 * @returns {Promise<void>}
 */
function speak(message) {
  return new Promise((resolve, reject) => {
    const text = String(message || "").trim();

    if (!text) {
      resolve();
      return;
    }

    stopSpeaking();

    let executable;
    let args;

    if (process.platform === "darwin") {
      executable = "say";

      args = [
        "-v",
        "Daniel",
        "-r",
        "180",
        text,
      ];
    } else if (process.platform === "win32") {
      executable = "powershell.exe";

      const escapedText = text.replace(
        /'/g,
        "''"
      );

      args = [
        "-NoProfile",
        "-Command",
        [
          "Add-Type -AssemblyName System.Speech;",
          "$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer;",
          "$voice.Rate = 0;",
          `$voice.Speak('${escapedText}');`,
        ].join(" "),
      ];
    } else {
      reject(
        new Error(
          `Speech is not configured for platform: ${process.platform}`
        )
      );

      return;
    }

    console.log("Kelvor speaking:", text);

    activeSpeechProcess = spawn(
      executable,
      args,
      {
        shell: false,
        windowsHide: true,
      }
    );

    activeSpeechProcess.on(
      "error",
      (error) => {
        activeSpeechProcess = null;

        reject(
          new Error(
            `Kelvor could not speak: ${error.message}`
          )
        );
      }
    );

    activeSpeechProcess.on(
      "close",
      (exitCode) => {
        activeSpeechProcess = null;

        if (exitCode !== 0) {
          reject(
            new Error(
              `Kelvor speech exited with code ${exitCode}`
            )
          );

          return;
        }

        resolve();
      }
    );
  });
}

module.exports = {
  speak,
  stopSpeaking,
};