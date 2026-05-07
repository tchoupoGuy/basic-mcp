import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp";
import { GetGitHubUserUseCase } from "../../../application/use-cases/GetGitHubUserUseCase";

export function registerGithubUserResource(server: McpServer, useCase: GetGitHubUserUseCase) {
    const template = new ResourceTemplate("github://users/{username}", { list: undefined });

    server.registerResource(
        "github-user",
        template,
        {
            description: "Public profile information for a GitHub user. Use the URI pattern github://users/{username}",
            mimeType: "application/json",
        },
        async (uri: URL, variables: Record<string, string | string[]>) => {
            const username = Array.isArray(variables.username) ? variables.username[0] : variables.username;
            const user = await useCase.execute(username);
            return {
                contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(user, null, 2),
                }],
            };
        },
    );
}
