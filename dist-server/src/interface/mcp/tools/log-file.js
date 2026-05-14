"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReadLogFileTool = registerReadLogFileTool;
const zod_1 = require("zod");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const LOGS_DIR = path.resolve(process.cwd(), "logs");
function resolveSafePath(filePath) {
    // Resolve the path and ensure it stays within LOGS_DIR
    const resolved = path.resolve(LOGS_DIR, filePath);
    if (!resolved.startsWith(LOGS_DIR + path.sep) && resolved !== LOGS_DIR) {
        throw new Error("Access denied: path is outside the logs directory");
    }
    if (!resolved.endsWith(".log")) {
        throw new Error("Only .log files are allowed");
    }
    return resolved;
}
function registerReadLogFileTool(server) {
    server.registerTool("read-log-file", {
        description: "Read the contents of a log file from the server's logs directory. Optionally return only the last N lines.",
        inputSchema: zod_1.z.object({
            filename: zod_1.z.string().describe("Name of the log file (e.g. 'app.log'). Must be a .log file inside the logs/ directory."),
            lastLines: zod_1.z.number().int().positive().optional().describe("If specified, return only the last N lines of the file."),
        }),
    }, async ({ filename, lastLines }) => {
        let safePath;
        try {
            safePath = resolveSafePath(filename);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
        }
        if (!fs.existsSync(safePath)) {
            return { content: [{ type: "text", text: `Error: File not found: ${filename}` }], isError: true };
        }
        const raw = fs.readFileSync(safePath, "utf-8");
        if (lastLines !== undefined) {
            const lines = raw.split("\n");
            const tail = lines.slice(-lastLines).join("\n");
            return { content: [{ type: "text", text: tail }] };
        }
        return { content: [{ type: "text", text: raw }] };
    });
}
