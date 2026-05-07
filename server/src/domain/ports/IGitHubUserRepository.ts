import { GitHubUser } from "../entities/GitHubUser";

export interface IGitHubUserRepository {
    getByUsername(username: string): Promise<GitHubUser>;
}
