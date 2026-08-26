# Roadmap

## Phase 1

- Windows desktop app skeleton
- FastAPI backend `127.0.0.1`
- SQLite database
- Server CRUD
- Dashboard
- Settings
- i18next translations

## Phase 2

- SSH metrics collection
- Clean uptime/load/cpu formatting
- Monitoring scheduler
- Dashboard table polish

## Phase 3

- WHM API token support
- WHM connection test
- Accounts sync/list/search/details
- Suspend/Unsuspend account
- Global account search

## Phase 3.1

- Accounts filters
- Summary cards
- Server overview panel
- Dashboard account count navigation

## Phase 4

- Per-server terminal page
- Command Runner
- Saved commands
- Command history
- Audit logs
- Dangerous command confirmation
- Local Codex API architecture preparation

## Phase 4.1

- Real interactive PTY terminal
- xterm.js frontend
- WebSocket SSH bridge
- Terminal resize support
- Idle timeout
- Terminal session metadata logging
- SSH key authentication support in server edit form

## Phase 5

- Electron production packaging
- Bundled FastAPI backend via PyInstaller
- Windows NSIS installer
- Desktop/Start Menu shortcut support
- App icon
- Backend auto-start/stop from Electron
- SQLite data path moved to user AppData in production
- Dashboard account count format: total / suspended
- Local computer timezone formatting for user-facing timestamps

## Later

- SSH Management Module
- SSH enable/disable controls
- SSH port/root-login/password-auth policy management
- Service management buttons
- Alerts / Telegram
- Autonomous Codex assistant
