# Name.am NOC Dashboard 0.4.1 - Phase 4.1 Release Notes

Phase 4.1-ը ավելացնում է real interactive SSH PTY terminal՝ xterm.js UI-ով։

## Նորը

- Server Details -> Terminal
- Interactive Terminal mode
- WebSocket SSH PTY bridge
- xterm.js terminal
- top/htop/nano/tail -f/mysql/less/vim support
- Terminal resize and idle timeout
- Terminal session metadata logs
- Command Runner page
- Saved commands/snippets
- Command history
- Audit Logs
- Dangerous command confirmation
- Blocked command protection
- Local Codex API architecture preparation
- Codex Context copy helper

## Սահմանափակումներ

Չկա autonomous AI assistant, SSH management module, service control panel, Telegram alerts կամ public API exposure։ Codex-ը Phase 4.1-ում unrestricted PTY access չունի։

## Ստուգված

- Backend compile
- Backend import
- SQLite schema verification
- Terminal/saved/audit/codex API smoke checks
- WebSocket route presence check
- Frontend TypeScript/Vite build
- Translation key parity

Backend restart անհրաժեշտ է Phase 4-ից հետո։
# Phase 5 Release

Phase 5 prepares the app for normal Windows desktop usage.

- Windows installer build is available as `Name.am-NOC-Dashboard-Setup.exe`.
- Electron starts the bundled FastAPI backend automatically.
- No manual PowerShell backend/frontend start is required in production.
- SQLite production data is stored in AppData and should survive app updates.
- Dashboard account count now shows `total / suspended`.
- Last Checked and other user-facing timestamps are shown in the local computer timezone.
- SSH/WHM/private key secrets remain masked and are not returned by API responses.
