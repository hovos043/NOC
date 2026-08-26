# Security

Այս փաստաթուղթը նկարագրում է Name.am NOC Dashboard-ի production hardening կարգավորումները։

## Local Backend

Backend-ը պետք է bind լինի միայն localhost-ի վրա.

```text
127.0.0.1:8765
```

Չի թույլատրվում backend-ը բացել public IP-ի, LAN IP-ի կամ reverse proxy-ի հետևում առանց առանձին authentication layer-ի։

## Local Auth Token

App-ը օգտագործում է random per-install local auth token։

- Electron-ը token-ը ստեղծում կամ կարդում է startup-ի ժամանակ։
- Token-ը պահվում է AppData-ում։
- Backend-ը token-ը ստանում է `NAMEAM_NOC_AUTH_TOKEN` environment variable-ով։
- Frontend-ը token-ը ստանում է Electron preload IPC-ով։
- HTTP request-երը պետք է ունենան `x-nameam-noc-token` header։
- WebSocket terminal session-ը պետք է ունենա token query parameter։

Backend-ը մերժում է սխալ կամ բացակայող token-ով request-երը։

## Secret Storage

Հետևյալ արժեքները secret են.

- SSH password
- SSH private key
- SSH key passphrase
- WHM API token

Այս արժեքները երբեք չպետք է երևան.

- API response-ում
- frontend state-ում որպես բաց տեքստ
- audit log-ում
- backend/electron log-ում

Windows-ում secret-ները պահվում են DPAPI encryption-ով։ Stored արժեքները պետք է սկսվեն `dpapi:` prefix-ով։

Startup migration-ը encrypt է անում հին plaintext արժեքները։ Migration-ից առաջ ստեղծվում է SQLite backup նույն AppData ֆոլդերում։

## SQLite Storage

Production database path.

```text
%APPDATA%\Name.am NOC Dashboard\database.db
```

SQLite-ի համար միացված են.

- `PRAGMA foreign_keys=ON`
- `PRAGMA journal_mode=WAL`
- `PRAGMA busy_timeout=5000`

Ավելացված են indexes accounts search/filter-ի, audit logs-ի, command history-ի և monitoring snapshots-ի համար։

## Terminal Sessions

Interactive terminal-ը full shell access է տալիս ընտրված server-ին, դրա համար այն պաշտպանված է local auth token-ով։

Session cleanup կանոններ.

- WebSocket disconnect-ը փակում է SSH channel-ը։
- Idle timeout-ը փակում է անգործ session-ը։
- Electron app exit-ի ժամանակ renderer-ը փակվում է, WebSocket-ը փակվում է, backend process-ը terminate է լինում։
- Backend-ը finally block-ում փակում է SSH channel-ը և SSH client-ը։

## Command Executor

Non-interactive SSH command executor-ը ունի.

- command timeout
- stdout/stderr output size limit
- truncated output flag frontend-ի համար
- dangerous command confirmation
- audit/command history preview masking

Սա չի դարձնում arbitrary command execution-ը լիովին անվտանգ։ Այն նախատեսված է միայն trusted sysadmin-ի կողմից local desktop app-ի ներսում օգտագործվելու համար։

## WHM API Token

WHM API token-ը չի վերադարձվում API response-ով և պետք է պահվի encrypted վիճակում։

Token-ը պետք է ունենա միայն անհրաժեշտ WHM permissions-ը։ Root-level full access token օգտագործել միայն եթե այլ տարբերակ չկա։

## Operational Rules

- Մի օգտագործեք shared Windows account այս app-ի համար։
- Մի ուղարկեք AppData database-ը support-ին առանց secrets cleanup-ի։
- Մի բացեք backend port-ը firewall-ում։
- Production server-ների վրա destructive command մի գործարկեք առանց rollback plan-ի։
- SSH key authentication-ը նախընտրելի է password authentication-ից։
