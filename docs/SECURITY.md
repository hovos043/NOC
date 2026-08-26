# Անվտանգության նշումներ

## Local-only architecture

- Backend-ը production և development mode-երում bind է լինում միայն `127.0.0.1` հասցեով։
- Public API exposure նախատեսված չէ։
- Terminal WebSocket endpoint-ը մնում է local-only։
- Electron-ը backend-ը գործարկում է background process-ով և app փակվելիս կանգնեցնում է։

## Secrets

API response-ով չեն վերադարձվում.

- SSH password
- SSH private key
- SSH key passphrase
- WHM API token

Windows-ում secrets-ը պահվում են DPAPI encryption-ով։ UI-ում secret դաշտերը edit-ի ժամանակ mask են լինում `********` արժեքով։

## Command safety

Command Executor-ը պահպանում է dangerous/blocked command կանոնները։

Blocked օրինակներ.

- `rm -rf /`
- `rm -rf /*`
- `mkfs`
- `dd if=`
- fork bomb

Dangerous command-ները պահանջում են confirmation text՝ `I understand`։

Interactive Terminal-ը իրական PTY shell է։ Այն չի կարող ամբողջությամբ block անել shell-ի ներսում մուտքագրված destructive գործողությունները, դրա համար connect-ից առաջ ցույց է տրվում admin warning։

## Logs and audit

Audit logs-ում պահվում են command metadata և output preview-ներ, բայց secrets չեն պահվում։

Interactive terminal-ի համար չի պահվում full terminal output։ Պահվում է միայն session metadata՝ server, hostname, username, start/end, duration, disconnect reason։

Production backend startup error-ը գրվում է.

```text
%APPDATA%\Name.am NOC Dashboard\logs\backend.log
```

## Production data

SQLite database-ը installation directory-ում չէ։ Այն պահվում է user AppData path-ում, որպեսզի app update-ը չջնջի data-ն։
