import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp";
import * as fs from "fs";
import * as path from "path";

const LOGS_DIR = path.resolve(process.cwd(), "logs");

export function registerLogFileResource(server: McpServer) {
    const template = new ResourceTemplate("logs://{filename}", { list: undefined });

    server.registerResource(
        "log-file",
        template,
        {
            description: "Contents of a log file from the server's logs/ directory. Use the URI pattern logs://{filename} (e.g. logs://app.log).",
            mimeType: "text/plain",
        },
        async (uri: URL, variables: Record<string, string | string[]>) => {
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
        },
    );
}
