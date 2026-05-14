"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGithubUserResource = registerGithubUserResource;
const mcp_1 = require("@modelcontextprotocol/sdk/server/mcp");
function registerGithubUserResource(server, useCase) {
    const template = new mcp_1.ResourceTemplate("github://users/{username}", { list: undefined });
    server.registerResource("github-user", template, {
        description: "Public profile information for a GitHub user. Use the URI pattern github://users/{username}",
        mimeType: "application/json",
    }, async (uri, variables) => {
        const username = Array.isArray(variables.username) ? variables.username[0] : variables.username;
        const user = await useCase.execute(username);
        return {
            contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(user, null, 2),
                }],
        };
    });
}
