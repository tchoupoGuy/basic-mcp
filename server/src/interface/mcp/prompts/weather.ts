import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";

export function registerWeatherPrompts(server: McpServer) {
    server.registerPrompt(
        "analyze-weather",
        {
            description: "Generate a prompt to analyze the weather for a city and give actionable advice",
            argsSchema: {
                city: z.string().describe("City name to analyze weather for"),
                language: z.enum(["fr", "en"]).default("fr").describe("Response language"),
            },
        },
        ({ city, language }) => {
            const instruction = language === "fr"
                ? `Tu es un assistant météo. Récupère la météo actuelle de "${city}" via le tool get-weather, puis fournis une analyse claire avec : température ressentie, conditions, et des conseils pratiques pour la journée (tenue vestimentaire, activités recommandées).`
                : `You are a weather assistant. Fetch the current weather for "${city}" using the get-weather tool, then provide a clear analysis with: apparent temperature, conditions, and practical advice for the day (clothing, recommended activities).`;
            return {
                messages: [
                    {
                        role: "user",
                        content: { type: "text", text: instruction },
                    },
                ],
            };
        },
    );

    server.registerPrompt(
        "compare-weather",
        {
            description: "Generate a prompt to compare the weather between two cities",
            argsSchema: {
                city1: z.string().describe("First city"),
                city2: z.string().describe("Second city"),
            },
        },
        ({ city1, city2 }) => ({
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `Compare la météo actuelle de "${city1}" et "${city2}" en utilisant le tool get-weather pour chaque ville. Présente un tableau comparatif (température, humidité, vent, précipitations) et indique quelle ville a le meilleur temps aujourd'hui.`,
                    },
                },
            ],
        }),
    );
}
