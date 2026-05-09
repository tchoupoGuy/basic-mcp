import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

const LOGS_DIR = path.resolve(process.cwd(), "logs");

function resolveSafePath(filePath: string): string {
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

export function registerReadLogFileTool(server: McpServer) {
    server.registerTool(
        "read-log-file",
        {
            description: "Read the contents of a log file from the server's logs directory. Optionally return only the last N lines.",
            inputSchema: z.object({
                filename: z.string().describe("Name of the log file (e.g. 'app.log'). Must be a .log file inside the logs/ directory."),
                lastLines: z.number().int().positive().optional().describe("If specified, return only the last N lines of the file."),
            }),
        },
        async ({ filename, lastLines }) => {
            let safePath: string;
            try {
                safePath = resolveSafePath(filename);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
            }

            if (!fs.existsSync(safePath)) {
                return { content: [{ type: "text" as const, text: `Error: File not found: ${filename}` }], isError: true };
            }

            const raw = fs.readFileSync(safePath, "utf-8");

            if (lastLines !== undefined) {
                const lines = raw.split("\n");
                const tail = lines.slice(-lastLines).join("\n");
                return { content: [{ type: "text" as const, text: tail }] };
            }

            return { content: [{ type: "text" as const, text: raw }] };
        },
    );
}
