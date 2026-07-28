const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

function getWhisperConfig() {
  const platform = process.platform;

  if (platform === "darwin") {
    return {
      executable:
        process.env.KELVOR_WHISPER_PATH ||
        path.join(
          os.homedir(),
          "Desktop",
          "whisper.cpp",
          "build",
          "bin",
          "whisper-cli"
        ),

      model:
        process.env.KELVOR_WHISPER_MODEL ||
        path.join(
          os.homedir(),
          "Desktop",
          "whisper.cpp",
          "models",
          "ggml-base.en.bin"
        ),
    };
  }

  if (platform === "win32") {
    return {
      executable:
        process.env.KELVOR_WHISPER_PATH ||
        path.join(
          os.homedir(),
          "Desktop",
          "whisper.cpp",
          "build",
          "bin",
          "Release",
          "whisper-cli.exe"
        ),

      model:
        process.env.KELVOR_WHISPER_MODEL ||
        path.join(
          os.homedir(),
          "Desktop",
          "whisper.cpp",
          "models",
          "ggml-base.en.bin"
        ),
    };
  }

  throw new Error(
    `Whisper is not configured for platform: ${platform}`
  );
}

function verifyFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `${label} was not found at: ${filePath}`
    );
  }
}

function cleanTranscript(output) {
  if (!output) {
    return "";
  }

  return output
    .replace(
      /^\[[0-9:.]+\s*-->\s*[0-9:.]+\]\s*/gm,
      ""
    )
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTranscript(transcript) {
  const normalized = transcript
    .toLowerCase()
    .replace(/[.,!?'"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const corrections = {
    // GitHub
    "cover please open github": "open github",
    "kelvor please open github": "open github",
    "kelvor open github": "open github",
    "please open github": "open github",
    "open get hub": "open github",
    "open git hub": "open github",
    "open gethub": "open github",
    "open kit hub": "open github",
    "open good hub": "open github",
    "unrealistic": "open github",

    // Discord
    "kelvor please open discord": "open discord",
    "kelvor open discord": "open discord",
    "please open discord": "open discord",
    "open disc cord": "open discord",
    "open this cord": "open discord",
    "open dis cord": "open discord",

    // Visual Studio Code
    "kelvor please open visual studio code":
      "open visual studio code",
    "kelvor open visual studio code":
      "open visual studio code",
    "please open visual studio code":
      "open visual studio code",
    "open visual studio":
      "open visual studio code",
    "open vs code":
      "open visual studio code",
    "open visual studio cold":
      "open visual studio code",

    // Browser
    "kelvor please open browser":
      "open browser",
    "kelvor open browser":
      "open browser",
    "please open browser":
      "open browser",
    "open chrome":
      "open browser",
    "open safari":
      "open browser",

    // YouTube
    "kelvor please open youtube":
      "open youtube",
    "kelvor open youtube":
      "open youtube",
    "please open youtube":
      "open youtube",

    // Settings
    "kelvor please open settings":
      "open settings",
    "kelvor open settings":
      "open settings",
    "please open settings":
      "open settings",
  };

  return corrections[normalized] || normalized;
}

function safelyDelete(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn(
      `Could not delete temporary file ${filePath}:`,
      error.message
    );
  }
}

function transcribeAudio(audioFilePath) {
  return new Promise((resolve, reject) => {
    try {
      const { executable, model } =
        getWhisperConfig();

      verifyFile(
        executable,
        "Whisper executable"
      );

      verifyFile(
        model,
        "Whisper model"
      );

      verifyFile(
        audioFilePath,
        "Audio file"
      );

      // Save a permanent test recording
      // on the Desktop for troubleshooting.
      const debugAudioPath = path.join(
        os.homedir(),
        "Desktop",
        "kelvor-test.wav"
      );

      fs.copyFileSync(
        audioFilePath,
        debugAudioPath
      );

      console.log(
        "Saved microphone test recording:",
        debugAudioPath
      );

      const audioStats =
        fs.statSync(audioFilePath);

      console.log("Audio debug:", {
        path: audioFilePath,
        sizeBytes: audioStats.size,
        extension:
          path.extname(audioFilePath),
      });

      const outputBase = path.join(
        path.dirname(audioFilePath),
        `${path.basename(
          audioFilePath,
          path.extname(audioFilePath)
        )}-transcript`
      );

      const transcriptFile =
        `${outputBase}.txt`;

      safelyDelete(transcriptFile);

      const args = [
        "-m",
        model,

        "-f",
        audioFilePath,

        "-l",
        "en",

        "-otxt",

        "-of",
        outputBase,

        "-t",
        "4",

        "-nt",

        /*
         * CPU mode works correctly on this Mac.
         * Metal GPU mode was rejecting the audio.
         */
        "-ng",

        /*
         * Prevent short commands from being
         * classified as silence.
         */
        "-nth",
        "0.95",

        "--prompt",
        "Kelvor, please open GitHub. Open Discord. Open Visual Studio Code. Open browser. Open YouTube. Open settings.",
      ];

      console.log(
        "Starting Whisper transcription:",
        audioFilePath
      );

      const whisperProcess = spawn(
        executable,
        args,
        {
          shell: false,
        }
      );

      let stdout = "";
      let stderr = "";
      let hasFinished = false;

      whisperProcess.stdout.on(
        "data",
        (data) => {
          stdout += data.toString();
        }
      );

      whisperProcess.stderr.on(
        "data",
        (data) => {
          stderr += data.toString();
        }
      );

      whisperProcess.on(
        "error",
        (error) => {
          if (hasFinished) {
            return;
          }

          hasFinished = true;

          reject(
            new Error(
              `Whisper could not start: ${error.message}`
            )
          );
        }
      );

      whisperProcess.on(
        "close",
        (exitCode) => {
          if (hasFinished) {
            return;
          }

          hasFinished = true;

          console.log(
            "Whisper exited with code:",
            exitCode
          );

          if (exitCode !== 0) {
            console.error(
              "Whisper stderr:",
              stderr
            );

            reject(
              new Error(
                `Whisper exited with code ${exitCode}: ${stderr.trim()}`
              )
            );

            return;
          }

          let transcriptText = "";

          if (
            fs.existsSync(transcriptFile)
          ) {
            transcriptText =
              fs.readFileSync(
                transcriptFile,
                "utf8"
              );
          }

          safelyDelete(transcriptFile);

          const cleanedFileTranscript =
            cleanTranscript(
              transcriptText
            );

          const cleanedStdoutTranscript =
            cleanTranscript(stdout);

          const cleanedTranscript =
            cleanedFileTranscript ||
            cleanedStdoutTranscript;

          console.log(
            "Whisper transcript file:",
            transcriptText
          );

          console.log(
            "Whisper stdout:",
            stdout
          );

          console.log(
            "Whisper stderr:",
            stderr
          );

          if (!cleanedTranscript) {
            reject(
              new Error(
                "Whisper did not detect any speech. Hold the button and say: Kelvor, please open GitHub."
              )
            );

            return;
          }

          const normalizedTranscript =
            normalizeTranscript(
              cleanedTranscript
            );

          console.log(
            "Whisper raw transcript:",
            cleanedTranscript
          );

          console.log(
            "Whisper normalized transcript:",
            normalizedTranscript
          );

          resolve(
            normalizedTranscript
          );
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  transcribeAudio,
  getWhisperConfig,
};