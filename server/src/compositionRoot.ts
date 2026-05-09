import { GitHubUserRepository } from "./infrastructure/repositories/GitHubUserRepository";
import { WeatherRepository } from "./infrastructure/repositories/WeatherRepository";
import { GetGitHubUserUseCase } from "./application/use-cases/GetGitHubUserUseCase";
import { GetWeatherUseCase } from "./application/use-cases/GetWeatherUseCase";
import { createMcpServer } from "./interface/mcp/serverFactory";

export function buildUseCases() {
    const githubRepo = new GitHubUserRepository();
    const weatherRepo = new WeatherRepository();
    return {
        getGitHubUserUseCase: new GetGitHubUserUseCase(githubRepo),
        getWeatherUseCase: new GetWeatherUseCase(weatherRepo),
    };
}

export function buildServer() {
    const { getGitHubUserUseCase, getWeatherUseCase } = buildUseCases();
    return createMcpServer(getGitHubUserUseCase, getWeatherUseCase);
}
