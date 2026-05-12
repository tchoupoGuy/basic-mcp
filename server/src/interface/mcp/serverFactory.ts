import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { GetGitHubUserUseCase } from "../../application/use-cases/GetGitHubUserUseCase";
import { GetWeatherUseCase } from "../../application/use-cases/GetWeatherUseCase";
import { registerPingTool } from "./tools/ping";
import { registerGithubUserTool } from "./tools/github-user";
import { registerWeatherTool } from "./tools/weather";
import { registerGithubUserResource } from "./resources/github-user";
import { registerWeatherResource } from "./resources/weather";
import { registerWeatherPrompts } from "./prompts/weather";
import { registerGithubUserPrompts } from "./prompts/github-user";
import { registerReadLogFileTool } from "./tools/log-file";
import { registerLogFileResource } from "./resources/log-file";
import { registerDocumentChaptersResource } from "./resources/document-chapters";
import { registerGenerateDocumentPdfTool } from "./tools/document-pdf";
import { registerExtractDocumentIndexTool, registerListDocumentsTool } from "./tools/document-index";
import { registerAskDocumentTool, registerGenerateQuizTool } from "./tools/document-study";

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
    registerWeatherPrompts(server);
    registerGithubUserPrompts(server);
    registerReadLogFileTool(server);
    registerLogFileResource(server);
    registerDocumentChaptersResource(server);
    registerGenerateDocumentPdfTool(server);
    registerExtractDocumentIndexTool(server);
    registerListDocumentsTool(server);
    registerAskDocumentTool(server);
    registerGenerateQuizTool(server);
    
    return server;
}

