$ErrorActionPreference = "Stop"

$BackendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $Python)) {
    Write-Error "Virtualenv Python not found: $Python"
}

Set-Location $BackendDir

& $Python -c "import paramiko" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing missing backend dependencies..."
    & $Python -m pip install -r requirements.txt
}

& $Python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
