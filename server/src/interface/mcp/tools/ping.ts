import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";

export function registerPingTool(server: McpServer) {
    server.registerTool(
        "ping-server",
        {
            description: "A simple tool that echoes back the input",
            inputSchema: z.object({ message: z.string() }),
        },
        async ({ message }) => ({
            content: [{ type: "text" as const, text: `Here is your message: ${message}` }],
        }),
    );
}
