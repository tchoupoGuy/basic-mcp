"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildUseCases = buildUseCases;
exports.buildServer = buildServer;
exports.buildInProcessMcpClient = buildInProcessMcpClient;
const GitHubUserRepository_1 = require("./infrastructure/repositories/GitHubUserRepository");
const WeatherRepository_1 = require("./infrastructure/repositories/WeatherRepository");
const GetGitHubUserUseCase_1 = require("./application/use-cases/GetGitHubUserUseCase");
const GetWeatherUseCase_1 = require("./application/use-cases/GetWeatherUseCase");
const serverFactory_1 = require("./interface/mcp/serverFactory");
const inMemory_1 = require("@modelcontextprotocol/sdk/inMemory");
const index_1 = require("@modelcontextprotocol/sdk/client/index");
function buildUseCases() {
    const githubRepo = new GitHubUserRepository_1.GitHubUserRepository();
    const weatherRepo = new WeatherRepository_1.WeatherRepository();
    return {
        getGitHubUserUseCase: new GetGitHubUserUseCase_1.GetGitHubUserUseCase(githubRepo),
        getWeatherUseCase: new GetWeatherUseCase_1.GetWeatherUseCase(weatherRepo),
    };
}
function buildServer(useCases) {
    const { getGitHubUserUseCase, getWeatherUseCase } = useCases ?? buildUseCases();
    return (0, serverFactory_1.createMcpServer)(getGitHubUserUseCase, getWeatherUseCase);
}
async function buildInProcessMcpClient() {
    const [clientTransport, serverTransport] = inMemory_1.InMemoryTransport.createLinkedPair();
    const server = buildServer();
    await server.connect(serverTransport);
    const client = new index_1.Client({ name: "chat-internal-client", version: "1.0.0" });
    await client.connect(clientTransport);
    return client;
}
