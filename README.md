# KelvorOS v0.94 Alpha — Operation Echo+

Echo+ adds the first real local device monitoring layer through Electron/browser permissions.

## New in v0.94
- Echo+ device permission button
- Real microphone access through `navigator.mediaDevices.getUserMedia`
- Live microphone level meter
- Speaking / quiet / silent status
- Camera permission detection
- Camera label display when permission is granted
- Mission Scan now reflects real mic/camera status after device access
- Updated Echo+ device status panel

## Notes
- Desktop audio monitoring is still scaffolded.
- Mic/camera require permission inside the Electron app.
- If permission is denied, Echo+ keeps running but device checks will show as unavailable.

## Run
```bash
npm install
npm start
```

## GitHub Reminder
After replacing your project files, commit this update:

```bash
git add .
git commit -m "feat: Operation Echo+ v0.94 - Real microphone and camera monitoring foundation"
git push
```
