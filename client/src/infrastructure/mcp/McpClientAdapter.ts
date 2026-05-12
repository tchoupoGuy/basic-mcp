import { Client } from "@modelcontextprotocol/sdk/client/index";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";

const MCP_SERVER_URL = `${import.meta.env.VITE_API_URL ?? "http://localhost:3001"}/mcp`;

let client: Client | null = null;

export async function getMcpClient(): Promise<Client> {
    if (client) return client;

    const newClient = new Client({ name: "mcp-ui-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
    try {
        await newClient.connect(transport);
    } catch (e) {
        client = null;
        throw e;
    }
    client = newClient;
    return client;
}

export function resetClient() {
    client = null;
}
