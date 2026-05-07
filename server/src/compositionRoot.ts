import { GitHubUserRepository } from "./infrastructure/repositories/GitHubUserRepository";
import { WeatherRepository } from "./infrastructure/repositories/WeatherRepository";
import { GetGitHubUserUseCase } from "./application/use-cases/GetGitHubUserUseCase";
import { GetWeatherUseCase } from "./application/use-cases/GetWeatherUseCase";
import { createMcpServer } from "./interface/mcp/serverFactory";

export function buildServer() {
    const githubRepo = new GitHubUserRepository();
    const weatherRepo = new WeatherRepository();

    const getGitHubUserUseCase = new GetGitHubUserUseCase(githubRepo);
    const getWeatherUseCase = new GetWeatherUseCase(weatherRepo);

    return createMcpServer(getGitHubUserUseCase, getWeatherUseCase);
}
