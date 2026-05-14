"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGithubUserTool = registerGithubUserTool;
const zod_1 = require("zod");
function registerGithubUserTool(server, useCase) {
    server.registerTool("get-github-user", {
        description: "Fetches public profile information for a GitHub user",
        inputSchema: zod_1.z.object({ username: zod_1.z.string() }),
    }, async ({ username }) => {
        const user = await useCase.execute(username);
        return {
            content: [{ type: "text", text: JSON.stringify(user, null, 2) }],
        };
    });
}
