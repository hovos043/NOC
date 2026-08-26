# Windows տեղադրման ուղեցույց

## Development mode

Development-ի համար պետք են Python 3.12+, Node.js և npm։

```powershell
cd "C:\Users\hogab\OneDrive\Документы\Server Monitoring app"
npm --prefix frontend install
npm --prefix electron install
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
npm run dev
```

`npm run dev`-ը բացում է Electron պատուհանը և development backend/frontend flow-ը։

## Production build

Installer սարքելու համար՝

```powershell
cd "C:\Users\hogab\OneDrive\Документы\Server Monitoring app"
npm run build
npm --prefix electron run dist
```

Վերջնական installer-ը ստեղծվում է այստեղ՝

```text
%LOCALAPPDATA%\NameAM-NOC-Dashboard-Release\Name.am-NOC-Dashboard-Setup.exe
```

Project path-ում Cyrillic/Unicode տառեր լինելու պատճառով NSIS installer output-ը դրված է ASCII-only `%LOCALAPPDATA%` path-ում։ Սա շրջանցում է NSIS-ի path encoding խնդիրը։

## Install on another Windows computer

Այլ Windows համակարգչում պետք է միայն installer-ը.

```text
Name.am-NOC-Dashboard-Setup.exe
```

Target համակարգչում պետք չէ ձեռքով տեղադրել Python, Node.js, npm կամ բացել PowerShell։ Installer-ից հետո app-ը բացվում է Desktop shortcut-ից կամ Start Menu-ից։

## Startup flow

Production-ում.

1. Electron-ը բացվում է։
2. Electron-ը background-ում գործարկում է bundled `backend.exe`։
3. Backend-ը bind է լինում միայն `127.0.0.1:8765`։
4. React frontend-ը բացվում է Electron window-ի մեջ։
5. App-ը փակելուց Electron-ը կանգնեցնում է backend process-ը։

## Data path

Production SQLite database-ը installation folder-ում չի պահվում։

Պահվում է Windows user data folder-ում.

```text
C:\Users\<User>\AppData\Roaming\Name.am NOC Dashboard\
```

Պահվող ֆայլեր.

```text
database.db
logs\backend.log
settings.json
```

Update-ի ժամանակ installation folder-ը կարող է փոխվել, բայց AppData-ի database-ը պետք է մնա նույն user-ի մոտ։

## Troubleshooting

Եթե app-ը բացվում է, բայց backend-ը չի start լինում, ստուգեք port-ը.

```powershell
Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue
```

Եթե port-ը զբաղված է հին process-ով, փակեք միայն այդ process-ը.

```powershell
$listeners=Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
foreach ($l in $listeners) { Stop-Process -Id $l.OwningProcess -Force }
```

Backend startup սխալների log-ը.

```text
%APPDATA%\Name.am NOC Dashboard\logs\backend.log
```

Եթե installer build-ը NSIS path error է տալիս, օգտագործեք `npm --prefix electron run dist`, որը output-ը դնում է `%LOCALAPPDATA%\NameAM-NOC-Dashboard-Release` path-ում։
