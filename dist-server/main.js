"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const stdio_1 = require("@modelcontextprotocol/sdk/server/stdio");
const compositionRoot_1 = require("./src/compositionRoot");
async function main() {
    const server = (0, compositionRoot_1.buildServer)();
    const transport = new stdio_1.StdioServerTransport();
    await server.connect(transport);
}
main().catch(console.error);
