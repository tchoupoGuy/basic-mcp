import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { GetGitHubUserUseCase } from "../../application/use-cases/GetGitHubUserUseCase";
import { GetWeatherUseCase } from "../../application/use-cases/GetWeatherUseCase";
import { registerPingTool } from "./tools/ping";
import { registerGithubUserTool } from "./tools/github-user";
import { registerWeatherTool } from "./tools/weather";
import { registerGithubUserResource } from "./resources/github-user";
import { registerWeatherResource } from "./resources/weather";

export function createMcpServer(
    getGitHubUserUseCase: GetGitHubUserUseCase,
    getWeatherUseCase: GetWeatherUseCase,
): McpServer {
    const server = new McpServer({ name: "Basic MCP Server", version: "1.0.0" });

    registerPingTool(server);
    registerGithubUserTool(server, getGitHubUserUseCase);
    registerWeatherTool(server, getWeatherUseCase);
    registerGithubUserResource(server, getGitHubUserUseCase);
    registerWeatherResource(server, getWeatherUseCase);

    return server;
}
