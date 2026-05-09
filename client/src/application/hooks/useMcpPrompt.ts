import { useState, useCallback } from "react";
import { getMcpClient, resetClient } from "../../infrastructure/mcp/McpClientAdapter";

export type PromptMessage = { role: string; content: string };

export function useMcpPrompt() {
    const [loading, setLoading] = useState(false);

    const getPrompt = useCallback(async (
        name: string,
        args: Record<string, string>,
    ): Promise<PromptMessage[]> => {
        setLoading(true);
        try {
            const client = await getMcpClient();
            const result = await client.getPrompt({ name, arguments: args });
            return (result.messages as Array<{ role: string; content: { type: string; text: string } }>).map((m) => ({
                role: m.role,
                content: m.content.text ?? "",
            }));
        } catch (err) {
            resetClient();
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    return { getPrompt, loading };
}
