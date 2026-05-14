"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHistoryRouter = createHistoryRouter;
const express_1 = require("express");
const historyStore_1 = require("../../infrastructure/history/historyStore");
function createHistoryRouter() {
    const router = (0, express_1.Router)();
    router.get("/history", (_req, res) => {
        res.json((0, historyStore_1.listHistory)());
    });
    router.get("/history/:id", (req, res) => {
        const entry = (0, historyStore_1.getHistory)(req.params.id);
        if (!entry) {
            res.status(404).json({ error: "Not found" });
            return;
        }
        res.json(entry);
    });
    return router;
}
