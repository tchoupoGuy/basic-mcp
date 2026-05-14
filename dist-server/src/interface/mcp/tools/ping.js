"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPingTool = registerPingTool;
const zod_1 = require("zod");
function registerPingTool(server) {
    server.registerTool("ping-server", {
        description: "A simple tool that echoes back the input",
        inputSchema: zod_1.z.object({ message: zod_1.z.string() }),
    }, async ({ message }) => ({
        content: [{ type: "text", text: `Here is your message: ${message}` }],
    }));
}
