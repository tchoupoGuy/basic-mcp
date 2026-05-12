import { useState, useCallback } from "react";
import { getMcpClient, resetClient } from "../../infrastructure/mcp/McpClientAdapter";

export function useMcpTool() {
    const [loading, setLoading] = useState(false);

    const callTool = useCallback(async (toolName: string, args: Record<string, unknown>): Promise<string> => {
        setLoading(true);
        try {
            const client = await getMcpClient();
            // Timeout étendu à 30 min pour les opérations longues (indexation de gros chapitres)
            const result = await client.callTool(
                { name: toolName, arguments: args },
                undefined,
                { timeout: 1_800_000 },
            );
            const text = (result.content as Array<{ type: string; text: string }>)
                .filter((c) => c.type === "text")
                .map((c) => c.text)
                .join("\n");
            return text;
        } catch (err) {
            resetClient();
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    return { callTool, loading };
}
