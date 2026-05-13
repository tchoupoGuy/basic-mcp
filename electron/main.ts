import { app, BrowserWindow, shell } from "electron";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as http from "http";

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

const SERVER_PORT = 3001;
const DEV_CLIENT_URL = "http://localhost:5173";
const isDev = !app.isPackaged;

// ── Start the Express backend ────────────────────────────────────────────────
function startBackend(): void {
    const serverEntry = isDev
        ? path.join(__dirname, "..", "server", "server-http.ts")
        : path.join(process.resourcesPath, "server", "server-http.js");

    const cmd = isDev ? "npx" : "node";
    const args = isDev ? ["tsx", serverEntry] : [serverEntry];

    serverProcess = spawn(cmd, args, {
        cwd: isDev ? path.join(__dirname, "..") : process.resourcesPath,
        env: { ...process.env, PORT: String(SERVER_PORT) },
        stdio: "inherit",
        shell: true,
    });

    serverProcess.on("error", (err) => console.error("[Electron] Backend error:", err));
    serverProcess.on("exit", (code) => console.log("[Electron] Backend exited with code:", code));
}

// ── Wait until the backend is ready ─────────────────────────────────────────
function waitForBackend(retries = 30, delay = 500): Promise<void> {
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
        // In production, load the built Vite output
        await mainWindow.loadFile(
            path.join(process.resourcesPath, "client", "dist", "index.html")
        );
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
