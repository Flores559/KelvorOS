# KelvorOS v2.2 — DiscordLink Phase

This builds on the permanent v2.x codebase and adds Discord bot connection + announcement foundation.

## Included
- Electron app
- OBS StreamLink preserved
- Discord bot connection
- Discord announcement sender
- Discord status panel
- Prepare Stream workflow attempts:
  - Connect OBS
  - Connect Discord
  - Set Starting Soon
  - Start recording
  - Send Discord announcement

## Run
```bash
npm install
npm start
```

## Discord Setup
1. Create Discord application/bot in Discord Developer Portal.
2. Copy bot token.
3. Invite bot to your server with permission to send messages.
4. Copy channel ID from Discord developer mode.
5. Paste token + channel ID into DiscordLink settings.
6. Click Connect Discord.
7. Click Send Announcement.

## GitHub Commit
```bash
git add .
git commit -m "feat: KelvorOS v2.2 DiscordLink Phase"
git push
```
