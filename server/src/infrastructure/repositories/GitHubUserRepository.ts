import { IGitHubUserRepository } from "../../domain/ports/IGitHubUserRepository";
import { GitHubUser } from "../../domain/entities/GitHubUser";

export class GitHubUserRepository implements IGitHubUserRepository {
    async getByUsername(username: string): Promise<GitHubUser> {
        const response = await fetch(
            `https://api.github.com/users/${encodeURIComponent(username)}`,
            { headers: { Accept: "application/vnd.github+json" } },
        );

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as GitHubUser;
        return {
            login: data.login,
            name: data.name,
            bio: data.bio,
            public_repos: data.public_repos,
            followers: data.followers,
            following: data.following,
            html_url: data.html_url,
        };
    }
}
