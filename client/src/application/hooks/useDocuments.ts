import { useState, useEffect, useCallback } from "react";
import { getMcpClient } from "../../infrastructure/mcp/McpClientAdapter";

export interface DocumentInfo {
    name: string;
    chapters: number;
    generatedAt: string;
}

/**
 * Récupère la liste des documents indexés via l'outil MCP list-documents.
 * Recharge automatiquement après chaque indexation via `refresh()`.
 */
export function useDocuments() {
    const [documents, setDocuments] = useState<DocumentInfo[]>([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const client = await getMcpClient();
            const result = await client.callTool({ name: "list-documents", arguments: {} });
            const text = (result.content as Array<{ type: string; text: string }>)
                .filter(c => c.type === "text")
                .map(c => c.text)
                .join("\n");

            // Parser le texte retourné : "• {name}\n  Chapitres : N   |   Indexé le : YYYY-MM-DD"
            const docs: DocumentInfo[] = [];
            const lines = text.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const nameLine = lines[i].match(/^[•\-]\s+(.+)$/);
                if (!nameLine) continue;
                const name = nameLine[1].trim();
                const metaLine = lines[i + 1] ?? "";
                const chapMatch = metaLine.match(/Chapitres\s*:\s*(\d+)/);
                const dateMatch = metaLine.match(/Indexé le\s*:\s*(\S+)/);
                docs.push({
                    name,
                    chapters: chapMatch ? parseInt(chapMatch[1]) : 0,
                    generatedAt: dateMatch ? dateMatch[1] : "",
                });
                i++; // skip meta line
            }
            setDocuments(docs);
        } catch {
            // Serveur pas encore démarré ou aucun document — silencieux
            setDocuments([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    return { documents, loading, refresh: load };
}
