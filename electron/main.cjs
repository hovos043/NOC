const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const crypto = require("node:crypto");

const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT = "8765";
const DEV_SERVER_URL = "http://127.0.0.1:5173";
let backendProcess = null;
let mainWindow = null;
let authToken = null;
let backendWatchdog = null;

function backendReady() {
  return new Promise((resolve) => {
    const req = http.get(
      `http://${BACKEND_HOST}:${BACKEND_PORT}/api/health`,
      { headers: { "x-nameam-noc-token": authToken || "" } },
      (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          resolve(false);
          return;
        }
        try {
          const health = JSON.parse(body);
          resolve(health.status === "ok" && health.features?.account_notes === true && health.features?.local_auth === true);
        } catch {
          resolve(false);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function loadAuthToken() {
  const tokenPath = path.join(app.getPath("userData"), "auth-token");
  try {
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
    if (fs.existsSync(tokenPath)) {
      const existing = fs.readFileSync(tokenPath, "utf8").trim();
      if (existing.length >= 32) return existing;
    }
    const generated = crypto.randomBytes(48).toString("base64url");
    fs.writeFileSync(tokenPath, `${generated}\n`, { encoding: "utf8", mode: 0o600 });
    return generated;
  } catch (error) {
    throw new Error(`Local auth token could not be prepared: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function runBackendCleanup(excludePid = null) {
  if (process.platform !== "win32") return;
  const packagedBackend = app.isPackaged ? path.join(process.resourcesPath, "backend", "backend.exe") : "";
  const escapedBackend = packagedBackend.replace(/'/g, "''");
  const exclude = Number.isInteger(excludePid) ? excludePid : 0;
  spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `
        $exclude=${exclude};
        $backendPath='${escapedBackend}';
        $listeners=Get-NetTCPConnection -LocalPort ${BACKEND_PORT} -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' };
        foreach ($l in $listeners) {
          $p=Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue;
          if ($p -and $p.Id -ne $exclude -and ($p.ProcessName -like 'backend*')) { Stop-Process -Id $p.Id -Force }
        }
        if ($backendPath) {
          Get-Process backend -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $exclude -and $_.Path -eq $backendPath } | Stop-Process -Force
        }
      `,
    ],
    { windowsHide: true },
  );
}

function startBackendWatchdog() {
  if (backendWatchdog) clearInterval(backendWatchdog);
  backendWatchdog = setInterval(async () => {
    if (!backendProcess || backendProcess.killed) return;
    if (await backendReady()) return;
    try {
      backendProcess.kill();
    } catch {
      // Process may already be gone.
    }
    backendProcess = null;
    void startBackend().catch((error) => console.error(error));
  }, 15000);
  if (backendWatchdog.unref) backendWatchdog.unref();
}

async function waitForBackend() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await backendReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Backend did not become ready");
}

async function startBackend() {
  authToken = authToken || loadAuthToken();
  if (await backendReady()) return;
  runBackendCleanup();
  if (await backendReady()) return;

  const backendDir = path.resolve(__dirname, "../backend");
  const appDataDir = app.getPath("userData");
  const env = {
    ...process.env,
    NAMEAM_NOC_BACKEND_HOST: BACKEND_HOST,
    NAMEAM_NOC_BACKEND_PORT: BACKEND_PORT,
    NAMEAM_NOC_DATA_DIR: appDataDir,
    NAMEAM_NOC_AUTH_TOKEN: authToken,
  };

  if (app.isPackaged) {
    const exePath = path.join(process.resourcesPath, "backend", "backend.exe");
    if (!fs.existsSync(exePath)) {
      throw new Error(`Bundled backend executable not found: ${exePath}`);
    }
    backendProcess = spawn(exePath, [], {
      cwd: path.dirname(exePath),
      env,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
  } else {
    const python = process.env.NAMEAM_NOC_PYTHON || "python";
    backendProcess = spawn(
      python,
      ["-m", "uvicorn", "app.main:app", "--host", BACKEND_HOST, "--port", BACKEND_PORT],
      {
        cwd: backendDir,
        env: {
          ...env,
          PYTHONPATH: backendDir,
        },
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
  }

  backendProcess.stderr.on("data", (chunk) => {
    const line = chunk.toString();
    if (!line.toLowerCase().includes("token")) {
      console.error(line);
    }
  });
  backendProcess.on("exit", () => {
    backendProcess = null;
  });
  startBackendWatchdog();
}

async function createWindow() {
  try {
    await startBackend();
    await waitForBackend();
  } catch (error) {
    await showStartupError(error);
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#0f172a",
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    return;
  }

  if (process.env.NODE_ENV === "development") {
    await mainWindow.loadURL(DEV_SERVER_URL);
    return;
  }

  const frontendIndex = app.isPackaged
    ? path.join(process.resourcesPath, "frontend", "dist", "index.html")
    : path.resolve(__dirname, "../frontend/dist/index.html");
  await mainWindow.loadFile(frontendIndex);
}

async function showStartupError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const win = new BrowserWindow({
    width: 720,
    height: 420,
    resizable: false,
    backgroundColor: "#0f172a",
    icon: path.join(__dirname, "assets", "icon.png"),
  });
  const body = encodeURIComponent(`
    <html>
      <body style="margin:0;font-family:Segoe UI,Arial;background:#0f172a;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh">
        <main style="max-width:560px;padding:32px">
          <h1 style="font-size:22px;margin:0 0 12px">Backend-ը չհաջողվեց գործարկել</h1>
          <p style="line-height:1.5;color:#cbd5e1">Name.am NOC Dashboard-ը աշխատում է միայն local backend-ով՝ 127.0.0.1:${BACKEND_PORT}։ Ստուգեք, որ port-ը ազատ է և backend.exe-ը կա installer-ի resources-ում։</p>
          <pre style="white-space:pre-wrap;background:#020617;border:1px solid #334155;border-radius:8px;padding:12px;color:#fca5a5">${message}</pre>
        </main>
      </body>
    </html>
  `);
  await win.loadURL(`data:text/html;charset=utf-8,${body}`);
  await dialog.showMessageBox(win, {
    type: "error",
    title: "Name.am NOC Dashboard",
    message: "Backend-ը չհաջողվեց գործարկել",
    detail: message,
  });
}

ipcMain.handle("nameam-noc:get-auth-token", () => authToken || "");
ipcMain.handle("nameam-noc:get-app-version", () => app.getVersion());

app.whenReady().then(() => {
  authToken = loadAuthToken();
  return createWindow();
});

app.on("window-all-closed", () => {
  if (backendWatchdog) {
    clearInterval(backendWatchdog);
    backendWatchdog = null;
  }
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (backendWatchdog) clearInterval(backendWatchdog);
  if (backendProcess) backendProcess.kill();
  runBackendCleanup();
});
