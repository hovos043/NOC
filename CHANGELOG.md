# Changelog

## 0.4.1 - Phase 4.1

### Ավելացված

- Real interactive PTY terminal Paramiko `invoke_shell(term="xterm")`-ով։
- WebSocket SSH bridge՝ `/ws/servers/{id}/terminal`։
- xterm.js frontend terminal։
- Terminal resize / fit support։
- Copy selected / paste / clear controls։
- Admin warning modal before first interactive connect։
- Idle timeout՝ 30 րոպե inactivity-ից հետո։
- `terminal_sessions` table՝ session start/end metadata logging-ի համար։
- Terminal modes՝ Interactive Terminal և Command Executor։
- Server Details-ում Codex Context panel և copy button։

### Անվտանգություն

- WebSocket terminal endpoint-ը local-only guard ունի։
- Interactive terminal output-ը DB-ում չի պահվում։
- SSH password/WHM token/private key content չի ուղարկվում frontend։
- Codex endpoints-ը շարունակում են օգտագործել safe command executor-ը, ոչ թե unrestricted PTY։

## 0.4.0 - Phase 4

### Ավելացված

- Per-server Terminal panel Server Details-ում։
- Command Runner էջ՝ մեկ ընտրված server-ի համար։
- Manual Connect / Disconnect flow։
- Command execution over SSH password auth։
- stdout/stderr/exit code/duration output։
- Command history per server։
- Saved commands CRUD և default snippets։
- Audit Logs էջ։
- Dangerous command double confirmation։
- Blocked command protection։
- Local Codex API preparation endpoints։
- Safe server context endpoint առանց secrets-ի։

### Անվտանգություն

- Disabled server-ների վրա command չի գործարկվում։
- Missing SSH credentials-ը վերադարձնում է Not Configured։
- Blocked command-ները չեն գնում SSH։
- Dangerous command-ները պահանջում են `I understand` confirmation։
- SSH password/WHM token չեն վերադարձվում API response-ով։
- Audit/output previews-ը size-limited և masked է։

## 0.3.1 - Phase 3.1

- Accounts toolbar filters։
- Summary cards։
- Server overview panel։
- Dashboard account count navigation։
- Pagination 25/50/100/250։

## 0.3.0 - Phase 3

- WHM API integration։
- cPanel accounts sync/list/search/details։
- Suspend/Unsuspend account։
- Global search։

## 0.2.0 - Phase 2

- SSH connectivity։
- Read-only metrics։
- Dashboard metrics formatting։

## 0.1.0 - Phase 1

- Desktop skeleton։
- Server CRUD։
- Dashboard։
- Settings։
# Phase 5

- Added Electron production packaging with `electron-builder`.
- Added PyInstaller backend executable build (`backend.exe`).
- Added Windows NSIS installer output: `Name.am-NOC-Dashboard-Setup.exe`.
- Added app icons in `electron/assets/icon.png` and `electron/assets/icon.ico`.
- Electron production startup now launches the bundled backend silently on `127.0.0.1`.
- Production SQLite data is stored in the Windows user AppData directory instead of the install folder.
- Dashboard account count now displays `total / suspended`.
- Frontend timestamp formatting now treats backend timestamps as UTC and displays local computer time.
- Added Windows install/build documentation.
