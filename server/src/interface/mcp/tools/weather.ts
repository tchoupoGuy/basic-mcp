import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { GetWeatherUseCase } from "../../../application/use-cases/GetWeatherUseCase";

export function registerWeatherTool(server: McpServer, useCase: GetWeatherUseCase) {
    server.registerTool(
        "get-weather",
        {
            description: "Get current weather conditions for a location using Open-Meteo (free, no API key required)",
            inputSchema: z.object({
                latitude: z.number().describe("Latitude of the location (e.g. 48.85 for Paris)"),
                longitude: z.number().describe("Longitude of the location (e.g. 2.35 for Paris)"),
            }),
        },
        async ({ latitude, longitude }) => {
            const weather = await useCase.execute(latitude, longitude);
            return {
                content: [{ type: "text" as const, text: JSON.stringify(weather, null, 2) }],
            };
        },
    );
}
