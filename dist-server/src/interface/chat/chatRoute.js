"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChatRouter = createChatRouter;
const express_1 = require("express");
const ai_1 = require("ai");
const ollama_ai_provider_v2_1 = require("ollama-ai-provider-v2");
const historyStore_1 = require("../../infrastructure/history/historyStore");
function createChatRouter(mcpClient) {
    const router = (0, express_1.Router)();
    router.post("/chat", async (req, res) => {
        const { message, history = [] } = req.body;
        if (!message || typeof message !== "string") {
            res.status(400).json({ error: "Field 'message' is required" });
            return;
        }
        const { tools: mcpTools } = await mcpClient.listTools();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tools = {};
        for (const mcpTool of mcpTools) {
            const toolName = mcpTool.name;
            tools[toolName] = (0, ai_1.tool)({
                description: mcpTool.description ?? "",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                inputSchema: (0, ai_1.jsonSchema)(mcpTool.inputSchema),
                execute: async (input) => {
                    const result = await mcpClient.callTool({
                        name: toolName,
                        arguments: input,
                    });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const content = result.content;
                    if (result.isError) {
                        throw new Error(JSON.stringify(content));
                    }
                    const texts = content
                        .filter((c) => c.type === "text")
                        .map((c) => c.text);
                    return texts.join("\n") || JSON.stringify(content);
                },
            });
        }
        const messages = [
            ...history,
            { role: "user", content: message },
        ];
        const result = (0, ai_1.streamText)({
            model: (0, ollama_ai_provider_v2_1.ollama)(process.env.OLLAMA_MODEL ?? "llama3.2"),
            system: "Tu es un assistant utile avec accès à des outils météo et GitHub. Réponds toujours dans la langue de l'utilisateur.",
            messages,
            tools,
            stopWhen: (0, ai_1.stepCountIs)(5),
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
        }
        catch (err) {
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
            (0, historyStore_1.saveHistory)({
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
