import { contextBridge } from "electron";

// Expose a minimal safe API to the renderer if needed in the future.
// Currently the React app talks directly to the Express backend via fetch/SSE.
contextBridge.exposeInMainWorld("electronAPI", {
    platform: process.platform,
});
