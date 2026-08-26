# Name.am NOC Dashboard

Name.am NOC Dashboard-ը Windows desktop հավելված է hosting/NOC օպերացիոն աշխատանքի համար։

Հավելվածը միավորում է.

- FastAPI backend
- SQLite database
- React/Vite frontend
- Electron desktop shell
- SSH metrics և terminal workflows
- WHM/cPanel account management

## Production Օգտագործում

Վերջնական օգտվողը PowerShell չի բացում։ Հավելվածը տեղադրվում է installer-ով.

```text
Name.am-NOC-Dashboard-Setup.exe
```

Install-ից հետո app-ը բացվում է Desktop shortcut-ից կամ Start Menu-ից։ Electron-ը background-ում start է անում bundled `backend.exe`-ը, backend-ը bind է լինում միայն `127.0.0.1:8765`, հետո frontend-ը բացվում է Electron window-ում։

## Local Auth Token

App-ը օգտագործում է per-install local auth token։

- Token-ը ստեղծվում կամ կարդացվում է Electron startup-ի ժամանակ։
- Token-ը պահվում է user AppData-ում։
- Electron-ը token-ը փոխանցում է backend-ին environment variable-ով։
- Frontend-ը token-ը ստանում է Electron preload IPC-ով։
- Բոլոր HTTP request-երը ուղարկվում են `x-nameam-noc-token` header-ով։
- Interactive terminal WebSocket-ը token-ը ուղարկում է query string-ով։
- Backend-ը մերժում է `/api/*` request-երը և WebSocket session-ները, եթե token-ը բացակայում է կամ սխալ է։

Այս պաշտպանությունը local-only է։ Backend-ը չի կարելի bind անել public IP-ի վրա։

## Secret Encryption

SSH password-ները, SSH private key-երը, SSH key passphrase-ները և WHM API token-ները չեն վերադարձվում API response-ներով։

Windows-ում secrets-ը պահվում են DPAPI encryption-ով `dpapi:` prefix-ով։

Startup migration-ը ստուգում է հին plaintext secrets-ը։ Եթե գտնում է, նախ ստեղծում է SQLite backup նույն AppData ֆոլդերում, հետո encrypt է անում արժեքները։

## Data Path

Production database-ը installation directory-ում չի պահվում։ Այն պահվում է user AppData-ում.

```text
%APPDATA%\Name.am NOC Dashboard\database.db
```

Local auth token-ը պահվում է նույն AppData root-ում.

```text
%APPDATA%\Name.am NOC Dashboard\auth-token
```

Backend log-ը պահվում է.

```text
%APPDATA%\Name.am NOC Dashboard\logs\backend.log
```

SQLite-ի համար միացված են.

- foreign keys
- WAL mode
- busy timeout
- operational indexes accounts/audit/command/metrics tables-ի համար

## Terminal Cleanup

Interactive terminal-ը բացում է SSH PTY session միայն authenticated WebSocket-ի միջոցով։

- WebSocket disconnect-ի դեպքում SSH channel-ը փակվում է։
- Electron app exit-ի դեպքում renderer window-ը փակվում է, WebSocket-ը փակվում է, backend process-ը terminate է լինում։
- Backend-ը ունի idle timeout terminal session-ների համար։
- Non-interactive command executor-ը ունի command timeout և output size limit։
- Մեծ stdout/stderr output-ը truncate է արվում, որպեսզի app-ը չդանդաղի։

## Development Run

Electron dev mode.

```powershell
cd "C:\Users\hogab\OneDrive\Документы\Server Monitoring app"
npm run dev
```

Եթե backend-ը առանձին եք start անում, պետք է նույն auth token-ը փոխանցել backend-ին և frontend-ին։

```powershell
$env:NAMEAM_NOC_AUTH_TOKEN="your-local-dev-token"
cd "C:\Users\hogab\OneDrive\Документы\Server Monitoring app\backend"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

Frontend dev-ի համար.

```powershell
$env:VITE_NAMEAM_NOC_AUTH_TOKEN="your-local-dev-token"
cd "C:\Users\hogab\OneDrive\Документы\Server Monitoring app"
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173
```

## Build Installer

```powershell
cd "C:\Users\hogab\OneDrive\Документы\Server Monitoring app"
npm --prefix frontend install
npm --prefix electron install
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
npm run build
npm --prefix electron run dist
```

Output.

```text
%LOCALAPPDATA%\NameAM-NOC-Dashboard-Release\Name.am-NOC-Dashboard-Setup.exe
```

## Անվտանգության Նշում

Այս app-ը նախատեսված է trusted local sysadmin workstation-ի համար։ Այն չպետք է բացվի public network-ի վրա և չպետք է օգտագործվի shared Windows account-ով, որտեղ այլ օգտվողներ ունեն նույն AppData-ին հասանելիություն։

Մանրամասները՝ [SECURITY.md](SECURITY.md)։
