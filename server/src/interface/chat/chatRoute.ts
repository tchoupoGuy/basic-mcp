import { Router } from "express";
import { streamText, jsonSchema, tool, stepCountIs } from "ai";
import { ollama } from "ollama-ai-provider-v2";
import { Client } from "@modelcontextprotocol/sdk/client/index";
import { saveHistory } from "../../infrastructure/history/historyStore";

export function createChatRouter(mcpClient: Client): Router {
    const router = Router();

    router.post("/chat", async (req, res) => {
        const { message, history = [] } = req.body as {
            message: string;
            history?: Array<{ role: "user" | "assistant"; content: string }>;
        };

        if (!message || typeof message !== "string") {
            res.status(400).json({ error: "Field 'message' is required" });
            return;
        }

        const { tools: mcpTools } = await mcpClient.listTools();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tools: Record<string, any> = {};
        for (const mcpTool of mcpTools) {
            const toolName = mcpTool.name;
            tools[toolName] = tool({
                description: mcpTool.description ?? "",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                inputSchema: jsonSchema(mcpTool.inputSchema as any),
                execute: async (input) => {
                    const result = await mcpClient.callTool({
                        name: toolName,
                        arguments: input as Record<string, unknown>,
                    });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const content = result.content as any[];
                    if (result.isError) {
                        throw new Error(JSON.stringify(content));
                    }
                    const texts = content
                        .filter((c: { type: string }) => c.type === "text")
                        .map((c: { type: string; text: string }) => c.text);
                    return texts.join("\n") || JSON.stringify(content);
                },
            });
        }

        const messages: Array<{ role: "user" | "assistant"; content: string }> = [
            ...history,
            { role: "user", content: message },
        ];

        const result = streamText({
            model: ollama(process.env.OLLAMA_MODEL ?? "llama3.2"),
            system: "Tu es un assistant utile avec accès à des outils météo et GitHub. Réponds toujours dans la langue de l'utilisateur.",
            messages,
            tools,
            stopWhen: stepCountIs(5),
            maxRetries: 0,
        });

        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        let fullResponse = "";
        try {
            for await (const chunk of result.textStream) {
                fullResponse += chunk;
                res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const isConnRefused = msg.includes("ECONNREFUSED") || msg.includes("connect");
            fullResponse = isConnRefused
                ? `⚠️ Ollama n'est pas démarré. Lancez \`ollama serve\` puis réessayez.`
                : `⚠️ Erreur LLM : ${msg}`;
            res.write(`data: ${JSON.stringify({ text: fullResponse })}\n\n`);
        }

        res.write("data: [DONE]\n\n");
        res.end();

        // Persist conversation to history (fire-and-forget)
        if (fullResponse && !fullResponse.startsWith("⚠️")) {
            saveHistory({
                type: "chat",
                timestamp: new Date().toISOString(),
                messages: [
                    ...history,
                    { role: "user", content: message },
                    { role: "assistant", content: fullResponse },
                ],
            });
        }
    });

    return router;
}
