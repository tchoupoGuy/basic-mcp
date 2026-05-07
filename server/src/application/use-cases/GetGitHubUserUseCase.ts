import { IGitHubUserRepository } from "../../domain/ports/IGitHubUserRepository";
import { GitHubUser } from "../../domain/entities/GitHubUser";

export class GetGitHubUserUseCase {
    constructor(private readonly repository: IGitHubUserRepository) {}

    execute(username: string): Promise<GitHubUser> {
        return this.repository.getByUsername(username);
    }
}
