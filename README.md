# KelvorOS v2.1 — StreamLink Phase

This builds on the permanent v2.0 Foundation and adds the first real stream-control phase.

## Included
- Electron app
- OBS WebSocket connection
- OBS status panel
- Scene switching commands
- Recording controls
- Stream controls
- Prepare Stream workflow
- Forge Vault
- Atlas profile
- Timeline logging

## Run
```bash
npm install
npm start
```

## OBS Setup
In OBS:
1. Tools
2. WebSocket Server Settings
3. Enable WebSocket server
4. Port: 4455
5. Add password only if you want one
6. Save the same settings inside KelvorOS StreamLink

## GitHub Commit
```bash
git add .
git commit -m "feat: KelvorOS v2.1 StreamLink Phase"
git push
```
