import { Router } from "express";
import { streamText, tool, stepCountIs } from "ai";
import { ollama } from "ollama-ai-provider-v2";
import { z } from "zod";
import { GetWeatherUseCase } from "../../application/use-cases/GetWeatherUseCase";
import { GetGitHubUserUseCase } from "../../application/use-cases/GetGitHubUserUseCase";

export function createChatRouter(
    getWeatherUseCase: GetWeatherUseCase,
    getGitHubUserUseCase: GetGitHubUserUseCase,
): Router {
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

        const tools = {
            get_weather: tool({
                description: "Get current weather for a city or coordinates",
                inputSchema: z.object({
                    city: z.string().optional().describe("City name (e.g. 'Paris', 'Tokyo')"),
                    latitude: z.number().optional().describe("Latitude"),
                    longitude: z.number().optional().describe("Longitude"),
                }),
                execute: async ({ city, latitude, longitude }) => {
                    if (city) return getWeatherUseCase.executeByCity(city);
                    return getWeatherUseCase.execute(latitude!, longitude!);
                },
            }),
            get_github_user: tool({
                description: "Get public profile information for a GitHub user",
                inputSchema: z.object({
                    username: z.string().describe("GitHub username"),
                }),
                execute: async ({ username }) => getGitHubUserUseCase.execute(username),
            }),
        };

        const messages: Array<{ role: "user" | "assistant"; content: string }> = [
            ...history,
            { role: "user", content: message },
        ];

        const result = streamText({
            model: ollama("llama3.2"),
            system: "Tu es un assistant utile avec accès à des outils météo et GitHub. Réponds toujours dans la langue de l'utilisateur.",
            messages,
            tools,
            stopWhen: stepCountIs(5),
        });

        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        for await (const chunk of result.textStream) {
            res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
        }

        res.write("data: [DONE]\n\n");
        res.end();
    });

    return router;
}
