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
exports.registerLogFileResource = registerLogFileResource;
const mcp_1 = require("@modelcontextprotocol/sdk/server/mcp");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const LOGS_DIR = path.resolve(process.cwd(), "logs");
function registerLogFileResource(server) {
    const template = new mcp_1.ResourceTemplate("logs://{filename}", { list: undefined });
    server.registerResource("log-file", template, {
        description: "Contents of a log file from the server's logs/ directory. Use the URI pattern logs://{filename} (e.g. logs://app.log).",
        mimeType: "text/plain",
    }, async (uri, variables) => {
        const filename = Array.isArray(variables.filename) ? variables.filename[0] : variables.filename;
        const resolved = path.resolve(LOGS_DIR, filename);
        if (!resolved.startsWith(LOGS_DIR + path.sep) && resolved !== LOGS_DIR) {
            throw new Error("Access denied: path is outside the logs directory");
        }
        if (!resolved.endsWith(".log")) {
            throw new Error("Only .log files are allowed");
        }
        if (!fs.existsSync(resolved)) {
            throw new Error(`File not found: ${filename}`);
        }
        const text = fs.readFileSync(resolved, "utf-8");
        return {
            contents: [{
                    uri: uri.href,
                    mimeType: "text/plain",
                    text,
                }],
        };
    });
}
