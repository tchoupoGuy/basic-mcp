"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubUserRepository = void 0;
class GitHubUserRepository {
    async getByUsername(username) {
        const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers: { Accept: "application/vnd.github+json" } });
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
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
exports.GitHubUserRepository = GitHubUserRepository;
