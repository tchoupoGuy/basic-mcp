"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetGitHubUserUseCase = void 0;
class GetGitHubUserUseCase {
    constructor(repository) {
        this.repository = repository;
    }
    execute(username) {
        return this.repository.getByUsername(username);
    }
}
exports.GetGitHubUserUseCase = GetGitHubUserUseCase;
