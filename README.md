# KelvorOS v0.90 Alpha — Operation Sentinel

Operation Sentinel adds the first true protection layer to KelvorOS.

## New in v0.90
- Pre-flight diagnostics
- Mission readiness score
- Alert Center
- Mission Timeline
- System cards
- Internet availability check
- Starting scene validation
- Gameplay scene validation
- Discord channel validation
- Forge vault validation
- Safer Sentinel Go Live sequence
- Mission Abort button

## Important
The Sentinel Go Live button runs diagnostics first. If critical checks fail, the mission is blocked.

This version starts recording and posts Discord announcements, but the full autonomous Start Stream flow should still be tested carefully.

## Run
```bash
npm install
npm start
```

## Suggested Git Commit
```bash
git add .
git commit -m "feat: Operation Sentinel v0.90 pre-flight diagnostics"
git push
```
