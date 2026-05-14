"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGithubUserPrompts = registerGithubUserPrompts;
const zod_1 = require("zod");
function registerGithubUserPrompts(server) {
    server.registerPrompt("summarize-github-user", {
        description: "Generate a prompt to summarize a GitHub user's profile and activity",
        argsSchema: {
            username: zod_1.z.string().describe("GitHub username"),
        },
    }, ({ username }) => ({
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `Récupère le profil GitHub de "${username}" via le tool get-github-user, puis rédige une courte biographie professionnelle (3-4 phrases) basée sur ses informations publiques : nom, bio, entreprise, localisation, nombre de repos et de followers.`,
                },
            },
        ],
    }));
}
