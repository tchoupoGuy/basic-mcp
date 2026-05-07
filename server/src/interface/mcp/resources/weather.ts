import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp";
import { GetWeatherUseCase } from "../../../application/use-cases/GetWeatherUseCase";

export function registerWeatherResource(server: McpServer, useCase: GetWeatherUseCase) {
    const template = new ResourceTemplate("weather://forecast/{latitude},{longitude}", { list: undefined });

    server.registerResource(
        "weather-forecast",
        template,
        {
            description: "Current weather conditions for a location. Use URI pattern weather://forecast/{latitude},{longitude}",
            mimeType: "application/json",
        },
        async (uri: URL, variables: Record<string, string | string[]>) => {
            const lat = parseFloat(Array.isArray(variables.latitude) ? variables.latitude[0] : variables.latitude);
            const lon = parseFloat(Array.isArray(variables.longitude) ? variables.longitude[0] : variables.longitude);
            const weather = await useCase.execute(lat, lon);
            return {
                contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(weather, null, 2),
                }],
            };
        },
    );
}
