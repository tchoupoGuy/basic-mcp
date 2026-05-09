import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { GetWeatherUseCase } from "../../../application/use-cases/GetWeatherUseCase";

export function registerWeatherTool(server: McpServer, useCase: GetWeatherUseCase) {
    server.registerTool(
        "get-weather",
        {
            description: "Get current weather conditions for a location. Provide either a city name OR latitude+longitude coordinates.",
            inputSchema: z.object({
                city: z.string().optional().describe("City name (e.g. 'Paris', 'Tokyo', 'New York')"),
                latitude: z.number().optional().describe("Latitude of the location (e.g. 48.85 for Paris)"),
                longitude: z.number().optional().describe("Longitude of the location (e.g. 2.35 for Paris)"),
            }).refine(
                (data) => data.city !== undefined || (data.latitude !== undefined && data.longitude !== undefined),
                { message: "Provide either 'city' or both 'latitude' and 'longitude'" },
            ),
        },
        async ({ city, latitude, longitude }) => {
            const weather = city
                ? await useCase.executeByCity(city)
                : await useCase.execute(latitude!, longitude!);
            return {
                content: [{ type: "text" as const, text: JSON.stringify(weather, null, 2) }],
            };
        },
    );
}
