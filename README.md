# KelvorOS v0.91 Alpha — Operation Overwatch: Project Aegis

Operation Overwatch adds Kelvor’s first live telemetry dashboard.

## New in v0.91
- Project Aegis live monitoring engine
- Live Mission Health Score
- OBS telemetry cards
- Network DNS/ping check
- CPU/RAM monitoring
- Discord status monitoring
- Alert Center 2.0
- Mission Timeline updates
- 1-second telemetry refresh loop
- Enhanced official Kelvor core animation
- Cleaner module structure scaffold

## Notes
- Microphone monitoring is scaffolded and will become real in a later Overwatch sprint.
- CPU percentage currently tracks Kelvor process usage, with RAM using system memory.
- OBS stream start/stop is available but should be tested carefully.

## Run
```bash
npm install
npm start
```

## GitHub Commit
```bash
git add .
git commit -m "feat: Operation Overwatch v0.91 - Project Aegis monitoring engine"
git push
```
