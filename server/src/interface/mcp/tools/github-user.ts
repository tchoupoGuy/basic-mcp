import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { GetGitHubUserUseCase } from "../../../application/use-cases/GetGitHubUserUseCase";

export function registerGithubUserTool(server: McpServer, useCase: GetGitHubUserUseCase) {
    server.registerTool(
        "get-github-user",
        {
            description: "Fetches public profile information for a GitHub user",
            inputSchema: z.object({ username: z.string() }),
        },
        async ({ username }) => {
            const user = await useCase.execute(username);
            return {
                content: [{ type: "text" as const, text: JSON.stringify(user, null, 2) }],
            };
        },
    );
}
