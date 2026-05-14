"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWeatherResource = registerWeatherResource;
const mcp_1 = require("@modelcontextprotocol/sdk/server/mcp");
function registerWeatherResource(server, useCase) {
    // Resource by coordinates
    const coordTemplate = new mcp_1.ResourceTemplate("weather://forecast/{latitude},{longitude}", { list: undefined });
    server.registerResource("weather-forecast-coords", coordTemplate, {
        description: "Current weather for a location by coordinates. URI: weather://forecast/{latitude},{longitude}",
        mimeType: "application/json",
    }, async (uri, variables) => {
        const lat = parseFloat(Array.isArray(variables.latitude) ? variables.latitude[0] : variables.latitude);
        const lon = parseFloat(Array.isArray(variables.longitude) ? variables.longitude[0] : variables.longitude);
        const weather = await useCase.execute(lat, lon);
        return {
            contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(weather, null, 2) }],
        };
    });
    // Resource by city name
    const cityTemplate = new mcp_1.ResourceTemplate("weather://city/{city}", { list: undefined });
    server.registerResource("weather-forecast-city", cityTemplate, {
        description: "Current weather for a location by city name. URI: weather://city/{city} (e.g. weather://city/Paris)",
        mimeType: "application/json",
    }, async (uri, variables) => {
        const city = Array.isArray(variables.city) ? variables.city[0] : variables.city;
        const weather = await useCase.executeByCity(city);
        return {
            contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(weather, null, 2) }],
        };
    });
}
