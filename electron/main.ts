import { app, BrowserWindow, shell, utilityProcess } from "electron";
import type { UtilityProcess } from "electron";
import * as path from "path";
import * as http from "http";
import * as fs from "fs";

let mainWindow: BrowserWindow | null = null;
let serverProcess: UtilityProcess | null = null;

// Prevent multiple instances of the app
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

app.on("second-instance", () => {
    // If a second instance tries to start, focus the existing window
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

const SERVER_PORT = 3001;
const DEV_CLIENT_URL = "http://localhost:5173";
const isDev = !app.isPackaged;

// Root of the project (works both in dev and packaged with electron-packager)
function projectRoot(): string {
    return isDev
        ? path.join(__dirname, "..")
        : app.getAppPath();
}

// ── Start the Express backend ────────────────────────────────────────────────
function startBackend(): void {
    if (isDev) {
        // In dev mode (electron:dev), the backend is already started by concurrently
        return;
    }

    const root = projectRoot();
    // Run the pre-compiled JavaScript server (no tsx needed at runtime)
    const serverEntry = path.join(root, "dist-server", "server-http.js");

    // Ensure logs directory exists and open log stream
    const logsDir = path.join(root, "logs");
    fs.mkdirSync(logsDir, { recursive: true });
    const logPath = path.join(logsDir, "server-electron.log");
    const logStream = fs.createWriteStream(logPath, { flags: "a" });
    const logLine = (msg: string) => logStream.write(`[${new Date().toISOString()}] ${msg}\n`);

    logLine(`Starting backend: ${serverEntry}`);
    console.log("[Electron] Starting backend:", serverEntry);

    serverProcess = utilityProcess.fork(serverEntry, [], {
        cwd: root,
        env: { ...process.env, PORT: String(SERVER_PORT) },
        stdio: "pipe",
    });

    serverProcess.stdout?.on("data", (data: Buffer) => logStream.write(data));
    serverProcess.stderr?.on("data", (data: Buffer) => logStream.write(data));

    serverProcess.on("exit", (code) => {
        logLine(`Backend exited with code: ${code}`);
        logStream.end();
        console.log("[Electron] Backend exited with code:", code);
        if (code !== 0 && mainWindow) {
            mainWindow.webContents.executeJavaScript(
                `document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:#c00">' +
                '<h2>Erreur : le serveur backend n\\'a pas pu démarrer (code ' + ${JSON.stringify(String("" + code))} + ')</h2>' +
                '<p>Consultez le fichier de log pour le détail :</p>' +
                '<pre style="background:#fdd;padding:10px;font-size:12px">${logPath.replace(/\\/g, "\\\\")}</pre>' +
                '</div>'`,
            ).catch(() => {});
        }
    });
}

// ── Wait until the backend is ready ─────────────────────────────────────────
function waitForBackend(retries = 60, delay = 1000): Promise<void> {
    return new Promise((resolve, reject) => {
        function check(n: number) {
            http.get(`http://localhost:${SERVER_PORT}/health`, (res) => {
                if (res.statusCode === 200) resolve();
                else if (n > 0) setTimeout(() => check(n - 1), delay);
                else reject(new Error("Backend did not start in time"));
            }).on("error", () => {
                if (n > 0) setTimeout(() => check(n - 1), delay);
                else reject(new Error("Backend did not start in time"));
            });
        }
        check(retries);
    });
}

// ── Create the main window ───────────────────────────────────────────────────
async function createWindow(): Promise<void> {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 600,
        title: "Assistant PMP",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // Open external links in the OS browser, not in Electron
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });

    if (isDev) {
        // In dev mode, the Vite dev server must already be running
        await mainWindow.loadURL(DEV_CLIENT_URL);
        mainWindow.webContents.openDevTools();
    } else {
        const indexPath = path.join(app.getAppPath(), "client", "dist", "index.html");
        console.log("[Electron] Loading UI from:", indexPath);
        await mainWindow.loadFile(indexPath);
        // Uncomment next line to debug a blank window:
        // mainWindow.webContents.openDevTools();
    }

    mainWindow.on("closed", () => { mainWindow = null; });
}

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    startBackend();

    try {
        await waitForBackend();
    } catch (e) {
        console.warn("[Electron] Backend not reachable, opening window anyway:", e);
    }

    await createWindow();

    app.on("activate", async () => {
        if (BrowserWindow.getAllWindows().length === 0) await createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
});
