"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWeatherTool = registerWeatherTool;
const zod_1 = require("zod");
function registerWeatherTool(server, useCase) {
    server.registerTool("get-weather", {
        description: "Get current weather conditions for a location. Provide either a city name OR latitude+longitude coordinates.",
        inputSchema: zod_1.z.object({
            city: zod_1.z.string().optional().describe("City name (e.g. 'Paris', 'Tokyo', 'New York')"),
            latitude: zod_1.z.number().optional().describe("Latitude of the location (e.g. 48.85 for Paris)"),
            longitude: zod_1.z.number().optional().describe("Longitude of the location (e.g. 2.35 for Paris)"),
        }).refine((data) => data.city !== undefined || (data.latitude !== undefined && data.longitude !== undefined), { message: "Provide either 'city' or both 'latitude' and 'longitude'" }),
    }, async ({ city, latitude, longitude }) => {
        const weather = city
            ? await useCase.executeByCity(city)
            : await useCase.execute(latitude, longitude);
        return {
            content: [{ type: "text", text: JSON.stringify(weather, null, 2) }],
        };
    });
}
