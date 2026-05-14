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
exports.saveHistory = saveHistory;
exports.listHistory = listHistory;
exports.getHistory = getHistory;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// __dirname is natively available in CJS (both tsx and compiled output)
const HISTORY_DIR = path.resolve(__dirname, "../../../../logs/history");
function ensureDir() {
    if (!fs.existsSync(HISTORY_DIR))
        fs.mkdirSync(HISTORY_DIR, { recursive: true });
}
function saveHistory(entry) {
    try {
        ensureDir();
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `${entry.type}-${ts}.json`;
        fs.writeFileSync(path.join(HISTORY_DIR, filename), JSON.stringify(entry, null, 2), "utf-8");
    }
    catch (err) {
        console.warn("[History] Failed to save:", err instanceof Error ? err.message : err);
    }
}
function listHistory() {
    try {
        ensureDir();
        const files = fs.readdirSync(HISTORY_DIR)
            .filter(f => f.endsWith(".json"))
            .sort()
            .reverse();
        return files.flatMap(filename => {
            try {
                const entry = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, filename), "utf-8"));
                let label = "";
                if (entry.type === "chat") {
                    const first = entry.messages.find(m => m.role === "user");
                    label = first ? first.content.slice(0, 70) : "Chat";
                }
                else {
                    label = `Quiz Ch.${entry.chapter}${entry.document ? ` (${entry.document})` : ""} — ${entry.count} q.`;
                }
                return [{ id: filename.replace(".json", ""), type: entry.type, timestamp: entry.timestamp, label }];
            }
            catch {
                return [];
            }
        });
    }
    catch {
        return [];
    }
}
function getHistory(id) {
    try {
        // Prevent path traversal
        const safe = path.basename(id);
        const filepath = path.join(HISTORY_DIR, `${safe}.json`);
        if (!fs.existsSync(filepath))
            return null;
        return JSON.parse(fs.readFileSync(filepath, "utf-8"));
    }
    catch {
        return null;
    }
}
