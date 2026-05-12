import { GitHubUserRepository } from "./infrastructure/repositories/GitHubUserRepository";
import { WeatherRepository } from "./infrastructure/repositories/WeatherRepository";
import { GetGitHubUserUseCase } from "./application/use-cases/GetGitHubUserUseCase";
import { GetWeatherUseCase } from "./application/use-cases/GetWeatherUseCase";
import { createMcpServer } from "./interface/mcp/serverFactory";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory";
import { Client } from "@modelcontextprotocol/sdk/client/index";

export function buildUseCases() {
    const githubRepo = new GitHubUserRepository();
    const weatherRepo = new WeatherRepository();
    return {
        getGitHubUserUseCase: new GetGitHubUserUseCase(githubRepo),
        getWeatherUseCase: new GetWeatherUseCase(weatherRepo),
    };
}

export function buildServer(useCases?: ReturnType<typeof buildUseCases>) {
    const { getGitHubUserUseCase, getWeatherUseCase } = useCases ?? buildUseCases();
    return createMcpServer(getGitHubUserUseCase, getWeatherUseCase);
}

export async function buildInProcessMcpClient(): Promise<Client> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = buildServer();
    await server.connect(serverTransport);
    const client = new Client({ name: "chat-internal-client", version: "1.0.0" });
    await client.connect(clientTransport);
    return client;
}
