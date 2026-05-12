import { useState, useCallback } from "react";
import { getMcpClient, resetClient } from "../../infrastructure/mcp/McpClientAdapter";

export function useMcpResource() {
    const [loading, setLoading] = useState(false);

    const readResource = useCallback(async (uri: string): Promise<string> => {
        setLoading(true);
        try {
            const client = await getMcpClient();
            // Timeout étendu à 10 min pour les ressources nécessitant de l'OCR
            const result = await client.readResource({ uri }, { timeout: 600_000 });
            const text = (result.contents as Array<{ mimeType?: string; text?: string; uri: string }>)
                .map((c) => c.text ?? "")
                .join("\n");
            return text;
        } catch (err) {
            resetClient();
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    return { readResource, loading };
}
