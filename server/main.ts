import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { buildServer } from "./src/compositionRoot";

async function main() {
    const server = buildServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(console.error);
