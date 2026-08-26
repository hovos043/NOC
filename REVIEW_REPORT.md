# Production Readiness Review Report

Date: 2026-06-16  
Scope: FastAPI backend, SQLAlchemy/SQLite storage, SSH/terminal/command execution, WHM API integration, React UI, Electron shell, packaging, Windows installer, AppData storage, translations, logging and performance.  
Mode: Audit only. No source code changes were made.

## Executive Summary

The app is usable for a trusted local operator, but it is not production-ready for a security-sensitive desktop NOC tool yet. The largest risks are:

- No application-level authentication on the local FastAPI API or terminal WebSocket.
- Remote command execution and WHM account actions are reachable through unauthenticated localhost endpoints.
- SSH passwords, private keys, key passphrases and WHM API tokens are stored in SQLite without actually applying DPAPI encryption on save.
- WHM API calls disable TLS certificate verification.
- SSH host keys are accepted automatically.
- Terminal and command execution lack strong output limits, session limits, and robust dangerous-command controls.

Translation key parity was checked: `en.json`, `hy.json`, and `ru.json` are valid JSON and have matching keys.

## Critical Issues

### 1. Local API Has No Authentication

Affected files:

- `backend/app/main.py`
- `backend/app/routers/servers.py`
- `backend/app/routers/accounts.py`
- `backend/app/routers/terminal.py`
- `backend/app/routers/terminal_ws.py`
- `backend/app/routers/codex.py`
- `frontend/src/api/client.ts`
- `frontend/src/components/InteractiveTerminal.tsx`

All backend endpoints are unauthenticated. Binding to `127.0.0.1` reduces network exposure, but it does not protect against local malware, another local user process, or a malicious browser page that can reach localhost.

Impact:

- Any local process can add/edit/delete servers.
- Any local process can run SSH commands through the command executor.
- Any local process can open an interactive terminal WebSocket.
- Any local process can suspend/unsuspend WHM/cPanel accounts.
- The Codex helper endpoint can execute commands by server display name or hostname.

Recommendation:

- Generate a per-install random API token on first startup.
- Store it in AppData with restricted ACLs or Windows Credential Manager.
- Require `Authorization: Bearer <token>` or `X-NameAM-NOC-Token` on every HTTP endpoint and WebSocket connection.
- Electron should inject the token from the main process, not hardcode it in frontend source.
- Reject all requests without the token.

### 2. WebSocket Interactive Terminal Is Unauthenticated

Affected files:

- `backend/app/routers/terminal_ws.py`
- `backend/app/services/pty_terminal_service.py`
- `frontend/src/components/InteractiveTerminal.tsx`

The terminal WebSocket only checks that the client host is loopback. It does not validate `Origin`, does not require a token, and does not bind the session to an authorized Electron window.

Impact:

- A malicious local page or process can open `ws://127.0.0.1:8765/ws/servers/{id}/terminal`.
- It can get a live SSH PTY as the configured SSH user.

Recommendation:

- Require the same per-install API token for WebSocket connections.
- Validate `Origin` and allow only the packaged Electron origin or dev origin.
- Add per-server and global terminal session limits.
- Add max PTY dimensions.
- Add server-side session kill support.

### 3. Command Execution Endpoint Is Too Exposed

Affected files:

- `backend/app/routers/terminal.py`
- `backend/app/routers/codex.py`
- `backend/app/services/terminal_service.py`
- `backend/app/services/ssh_service.py`

The app exposes remote command execution through unauthenticated localhost endpoints. The dangerous-command detection is regex-based and can be bypassed with common shell variants.

Examples of weak coverage:

- `rm -fr /`
- `rm -rf -- /`
- `find / -delete`
- `bash -c '...'`
- `curl ... | sh`
- recursive `chmod`/`chown`
- destructive SQL commands
- package removals
- firewall policy changes

Impact:

- Local attacker can run arbitrary commands on production servers.
- The fixed confirmation text `I understand` can be automated.

Recommendation:

- Treat command execution as privileged admin action behind local API auth.
- Replace fixed confirmation with per-command nonce confirmation.
- Use an allowlist for predefined safe commands when possible.
- For arbitrary commands, require explicit UI session authorization and audit log entry.
- Add server-side deny rules for shell wrappers, pipes to shells, recursive permission changes, package removals, firewall resets, database destructive commands, and service disabling.

### 4. Secrets Are Not Encrypted on Save

Affected files:

- `backend/app/models/server.py`
- `backend/app/routers/servers.py`
- `backend/app/services/secret_service.py`
- `backend/app/services/ssh_service.py`
- `backend/app/services/whm_service.py`

`secret_service.py` implements DPAPI helpers, but `protect_secret()` is not used anywhere in the backend save/update flow. New values are stored directly in `servers.ssh_password`, `servers.ssh_private_key`, `servers.ssh_key_passphrase`, and `servers.whm_api_token`.

Impact:

- Anyone with access to the SQLite DB can read SSH passwords, private keys, key passphrases, and WHM API tokens.
- AppData backups or support bundles may leak production credentials.

Recommendation:

- Apply `protect_secret()` before storing all secret fields.
- Add a migration that detects plaintext legacy values and converts them to `dpapi:` values.
- Add a one-time verification tool that confirms no plaintext secrets remain.
- Restrict AppData directory ACLs to the current Windows user.
- Never clone secrets into duplicated server records.

### 5. WHM API TLS Verification Is Disabled

Affected file:

- `backend/app/services/whm_service.py`

WHM requests use:

```python
httpx.Client(timeout=20.0, verify=False, follow_redirects=False)
```

Impact:

- WHM API tokens can be exposed to man-in-the-middle attacks.
- The app cannot verify it is talking to the real WHM server.

Recommendation:

- Use `verify=True`.
- Support custom CA bundle only if explicitly configured.
- Surface certificate errors clearly in UI.
- Do not add an insecure bypass unless it is hidden behind a high-risk admin setting.

## High Priority Issues

### 1. SSH Host Keys Are Auto-Trusted

Affected file:

- `backend/app/services/ssh_service.py`

`paramiko.AutoAddPolicy()` accepts unknown host keys automatically.

Impact:

- SSH MITM is possible.
- A changed host key is not treated as suspicious.

Recommendation:

- Store and pin host key fingerprints per server.
- Show first-seen fingerprint during test connection.
- Fail on host key mismatch until the operator confirms rotation.

### 2. Server Clone Copies Secrets

Affected file:

- `backend/app/routers/servers.py`

`clone_server()` copies SSH password, SSH private key, key passphrase, WHM token, and notes.

Impact:

- Secrets spread to extra records unintentionally.
- A disabled clone still contains production credentials.

Recommendation:

- Clone only non-secret profile fields.
- Reset all secret fields, connection statuses, and notes unless explicitly requested.

### 3. SQLite Foreign Keys Are Not Enforced

Affected files:

- `backend/app/database.py`
- `backend/app/models/*.py`

Models declare foreign keys with cascades, but SQLite requires `PRAGMA foreign_keys=ON` per connection. The engine does not enable it.

Impact:

- Cascading deletes may not work reliably at DB level.
- Orphan records are possible.
- Account-note cleanup depends on ORM behavior, not DB integrity.

Recommendation:

- Add SQLAlchemy connect event to set `PRAGMA foreign_keys=ON`.
- Add integrity checks for existing orphan rows.

### 4. WHM Sync Can Delete Local Accounts and Notes After Bad Remote Response

Affected file:

- `backend/app/services/whm_service.py`

`sync_accounts_for_server()` deletes every local account missing from the latest WHM `listaccts` response.

Impact:

- A partial WHM response, API bug, permission issue, or transient failure could delete local account rows and associated notes.

Recommendation:

- Use soft-delete or `missing_from_whm` status first.
- Require two consecutive syncs before deleting local records.
- Keep notes for a retention window before purge.
- Log sync diff counts before applying deletion.

### 5. SSH Command Execution Can Hang or Consume Excess Memory

Affected files:

- `backend/app/services/ssh_service.py`
- `backend/app/services/terminal_service.py`

`_run()` calls `recv_exit_status()` before reading stdout/stderr. Paramiko can deadlock if remote output fills buffers. There is no maximum stdout/stderr size.

Impact:

- A command with large output can hang backend worker logic.
- Large command output can increase memory use and freeze UI.

Recommendation:

- Read stdout/stderr incrementally.
- Enforce max output bytes per command.
- Enforce wall-clock timeout.
- Kill channel on timeout.

### 6. Terminal Session Resource Limits Are Missing

Affected file:

- `backend/app/services/pty_terminal_service.py`

There is no global or per-server limit for concurrent PTY sessions.

Impact:

- Multiple WebSockets can open many SSH sessions.
- Backend and remote servers can be overloaded.

Recommendation:

- Add per-server and global session caps.
- Add admin-visible active session list.
- Add server-side forced disconnect endpoint.

### 7. Disconnect Endpoint Does Not Disconnect Real Sessions

Affected file:

- `backend/app/routers/terminal.py`

The HTTP disconnect endpoint returns success but does not close an interactive WebSocket/PTY session.

Impact:

- UI may show disconnected while a real session remains active until WebSocket close or timeout.

Recommendation:

- Track active PTY sessions in a session manager.
- Implement real disconnect by session ID and server ID.

### 8. Electron Backend Port Reuse Detection Can Attach to Wrong Service

Affected file:

- `electron/main.cjs`

Electron treats any service on `127.0.0.1:8765` returning a compatible `/api/health` payload as the backend. There is no per-install token or process identity check.

Impact:

- A malicious or stale local service can impersonate the backend.

Recommendation:

- Require signed/random startup token handshake.
- Pass token through environment to backend and Electron only.

### 9. Electron Can Kill Unrelated Processes Named `backend*`

Affected file:

- `electron/main.cjs`

`stopStaleBackendOnPort()` kills any listening process on port 8765 whose process name matches `backend*`.

Impact:

- Could terminate an unrelated local process.

Recommendation:

- Only kill backend processes launched by this app or matching exact executable path.
- Prefer a lock file with PID and executable path validation.

### 10. Audit Logs Are Incomplete

Affected files:

- `backend/app/routers/servers.py`
- `backend/app/routers/accounts.py`
- `backend/app/routers/settings.py`
- `backend/app/services/terminal_service.py`

Command execution is audited, but server edits/deletes, secret changes, enable/disable, WHM test/sync, suspend/unsuspend, notes clear, and settings changes are not consistently audited.

Impact:

- No reliable operator trail for sensitive changes.

Recommendation:

- Audit all mutating actions.
- Include action type, target server/account, timestamp, result, and sanitized details.
- Never log raw secrets.

## Medium Priority Issues

### 1. Manual SQLite Migration System Is Fragile

Affected files:

- `backend/app/services/migrations.py`
- `backend/app/database.py`

Migrations are hand-written `ALTER TABLE` statements plus `create_all()`. There is no transactional migration history table, rollback plan, checksum, or repeatable migration framework.

Recommendation:

- Move to Alembic or a small explicit migration table.
- Run migrations before app router startup.
- Add startup schema verification with actionable error messages.

### 2. SQLite Settings Need Production PRAGMAs

Affected file:

- `backend/app/database.py`

The SQLite engine does not configure WAL, busy timeout, synchronous mode, or foreign keys.

Recommendation:

- Enable `PRAGMA journal_mode=WAL`.
- Enable `PRAGMA busy_timeout`.
- Enable `PRAGMA foreign_keys=ON`.
- Consider `synchronous=NORMAL` for desktop app performance.

### 3. Monitoring Scheduler Can Duplicate Work

Affected file:

- `backend/app/services/monitoring_scheduler.py`

The scheduler starts on every backend startup. If multiple backend instances survive due port/process issues, duplicate monitoring jobs can run.

Recommendation:

- Use a single-instance lock.
- Record scheduler owner PID.
- Skip scheduler when backend is not the active Electron-owned process.

### 4. No Retention Policy for Growing Tables

Affected models:

- `monitoring_snapshots`
- `connection_history`
- `command_history`
- `audit_logs`
- `terminal_sessions`

These tables can grow indefinitely.

Recommendation:

- Add retention settings.
- Keep audit logs longer than command output previews.
- Add periodic cleanup with export option.

### 5. `snapshot_to_read()` Can Fail on Corrupt Disk JSON

Affected file:

- `backend/app/routers/servers.py`

`json.loads(snapshot.raw_disk_json)` is not guarded.

Recommendation:

- Catch JSON decode errors.
- Return empty disk list and log corruption.

### 6. Account and Server Queries Have Avoidable N+1/Repeated Counts

Affected files:

- `backend/app/routers/servers.py`
- `backend/app/routers/accounts.py`

`list_servers()` performs two account count queries per server. `list_accounts()` recomputes summaries and options on every request.

Recommendation:

- Use grouped count queries.
- Cache or precompute dashboard counts for large installations.

### 7. Search Performance Will Degrade at Larger Scale

Affected file:

- `backend/app/routers/accounts.py`

Search uses broad `%term%` matching across multiple fields.

Recommendation:

- Add SQLite FTS5 for domain/username/owner/package search.
- Keep normal indexes for exact username/IP lookups.

### 8. Command Output Masking Is Too Narrow

Affected file:

- `backend/app/services/terminal_service.py`

Secret masking only catches simple `password=value` style patterns.

Recommendation:

- Expand masking for Authorization headers, WHM tokens, private key blocks, cPanel tokens, DSNs, `.env`-style lines, and common API key formats.
- Apply masking before UI return where practical.

### 9. Electron App Has No Content Security Policy

Affected files:

- `electron/main.cjs`
- `frontend/index.html`

Electron uses good defaults (`contextIsolation`, `nodeIntegration: false`, `sandbox: true`), but the renderer has no explicit CSP.

Recommendation:

- Add CSP for packaged frontend.
- Restrict `connect-src` to `http://127.0.0.1:8765` and `ws://127.0.0.1:8765`.
- Avoid unsafe inline scripts.

### 10. Installer Is Not Code-Signed

Affected file:

- `electron/package.json`

`signAndEditExecutable` is false and no signing configuration is present.

Impact:

- Windows SmartScreen warnings.
- Harder to trust installer integrity.

Recommendation:

- Add code signing for production release.
- Keep hashes for installer artifacts.

### 11. Logs Have No Rotation or Structured Format

Affected files:

- `backend/desktop_backend.py`
- `electron/main.cjs`

Backend crash log is written to a single file. Electron logs backend stderr with minimal filtering.

Recommendation:

- Add rotating logs.
- Use structured log records.
- Sanitize secrets before writing logs.
- Keep separate backend/electron logs.

### 12. Documentation Encoding Is Broken

Affected file:

- `README.md`

Armenian text appears as mojibake.

Recommendation:

- Re-save docs as UTF-8.
- Add editorconfig or tooling to preserve UTF-8.

## Low Priority Issues

### 1. Repo Contains Build/Release Artifacts

Observed folders:

- `release`
- `release-build`
- `release-installer`
- `backend/build`
- `backend/dist`
- `frontend/dist`

Recommendation:

- Keep build artifacts out of source control.
- Add missing `.gitignore` entries.
- Generate release artifacts in a clean output directory.

### 2. No Automated Tests Found

No backend/frontend/electron test folders were found in the checked paths.

Recommendation:

- Add backend unit tests for SSH parsing, WHM sync, secret encryption, migrations, and command safety.
- Add frontend tests for dashboard/account filtering and terminal state.
- Add Electron smoke test for startup/backend handshake.

### 3. `preload.cjs` Exposes Stale Phase Metadata

Affected file:

- `electron/preload.cjs`

The preload exposes `phase: "1"`, which appears stale.

Recommendation:

- Remove it if unused or replace with real app version/build metadata.

### 4. Some UI Confirmations Use Native `window.confirm`

Affected files:

- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/pages/ServersPage.tsx`
- `frontend/src/pages/AccountsPage.tsx`
- `frontend/src/components/TerminalPanel.tsx`

Native confirmations are functional but inconsistent with the app design and not easily auditable.

Recommendation:

- Use a shared confirmation modal with clear risk text and action-specific confirmation.

### 5. Frontend Bundle Size Warning Risk

The app includes terminal libraries and a broad admin UI. Bundle size can grow quickly.

Recommendation:

- Lazy-load terminal/account/detail pages.
- Split xterm into a separate route chunk.

## Recommended Improvements

### Security Hardening Roadmap

1. Add per-install API authentication for HTTP and WebSocket.
2. Encrypt all secrets on save with DPAPI and migrate plaintext secrets.
3. Enable WHM TLS verification.
4. Add SSH host key pinning.
5. Add session limits and real disconnect for terminal sessions.
6. Replace weak command safety rules with a stricter policy engine.
7. Audit all mutating actions.
8. Add output limits and timeouts for every SSH command.
9. Add AppData ACL verification on startup.
10. Add code signing for installer.

### Database Roadmap

1. Enable SQLite foreign keys and WAL.
2. Add migration history table or Alembic.
3. Add retention policies.
4. Add FTS search for accounts.
5. Add indexes for common audit/history filters.
6. Add DB backup/export workflow.

### Electron/Packaging Roadmap

1. Add backend token handshake.
2. Validate backend executable path before killing stale processes.
3. Add CSP.
4. Code-sign installer.
5. Keep release artifacts outside repo.
6. Fix README/documentation encoding.

### Operational Readiness Roadmap

1. Add health checks for DB, scheduler, backend, and active terminal sessions.
2. Add safe diagnostics export with secrets redacted.
3. Add structured rotating logs.
4. Add a migration/backup prompt before schema changes.
5. Add basic CI: TypeScript build, backend import check, translation parity, and packaging smoke test.

## Audit Checks Completed

- Reviewed backend FastAPI routing and CORS.
- Reviewed SQLAlchemy models and SQLite migration flow.
- Reviewed SSH handling and metrics collection.
- Reviewed command executor and safety checks.
- Reviewed interactive PTY WebSocket flow.
- Reviewed WHM API client and account sync behavior.
- Reviewed Electron main/preload and packaging config.
- Reviewed frontend API client and terminal/account confirmation flows.
- Verified `en.json`, `hy.json`, and `ru.json` are valid JSON.
- Verified translation key parity: `hy` missing `0`, extra `0`; `ru` missing `0`, extra `0`.

## Checks Not Executed

The audit intentionally avoided build/test commands that generate or rewrite artifacts because the request was audit-only. No dependency vulnerability scan was run because it may require network access.

