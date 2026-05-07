import { useState, useCallback } from "react";
import { getMcpClient, resetClient } from "../../infrastructure/mcp/McpClientAdapter";

export function useMcpTool() {
    const [loading, setLoading] = useState(false);

    const callTool = useCallback(async (toolName: string, args: Record<string, unknown>): Promise<string> => {
        setLoading(true);
        try {
            const client = await getMcpClient();
            const result = await client.callTool({ name: toolName, arguments: args });
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
