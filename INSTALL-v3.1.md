# KelvorOS v3.1 Audio Engine

## Install
1. Keep a backup of your existing KelvorOS folder.
2. Copy all files from this pack into your KelvorOS project and replace matching files.
3. Open Terminal in the project folder.
4. Run `npm install`.
5. Run `npm start`.

## Whisper requirements
Kelvor expects these macOS paths by default:
- `~/Desktop/whisper.cpp/build/bin/whisper-cli`
- `~/Desktop/whisper.cpp/models/ggml-base.en.bin`

You can override them with `KELVOR_WHISPER_PATH` and `KELVOR_WHISPER_MODEL`.

## Test
1. Open Voice Provider.
2. Hold **Hold to Talk**.
3. Say **Open GitHub**.
4. Release the button.
5. GitHub Desktop should open and Kelvor should say **Opening GitHub**.

## Git commit
`git add . && git commit -m "feat: add Kelvor v3.1 local Whisper audio engine"`
