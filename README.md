# KelvorOS v0.51 Beta — Project Aegis

## Phase 3: Ignition

Project Aegis adds stream protection and smart monitoring to KelvorOS.

## Requirements
- OBS Studio open
- OBS WebSocket enabled
- Node.js installed

## Run
```bash
npm install
npm start
```

## OBS Settings
Use:
- Host: 127.0.0.1
- Port: 4455
- Password: your OBS WebSocket password

## New in v0.51
- Aegis protection dashboard
- Smart warning system
- OBS FPS monitoring
- OBS CPU monitoring
- Dropped frame alerts
- Render skipped frame alerts
- Mission checklist
- Stream timeline
- Aegis status states: Standby, Protected, Warning, Critical

## Test Notes
Start with OBS open but not live. Connect Kelvor, switch scenes, start/stop recording, then review the timeline and warnings.
