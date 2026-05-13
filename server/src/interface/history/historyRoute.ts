import { Router } from "express";
import { listHistory, getHistory } from "../../infrastructure/history/historyStore";

export function createHistoryRouter(): Router {
    const router = Router();

    router.get("/history", (_req, res) => {
        res.json(listHistory());
    });

    router.get("/history/:id", (req, res) => {
        const entry = getHistory(req.params.id);
        if (!entry) {
            res.status(404).json({ error: "Not found" });
            return;
        }
        res.json(entry);
    });

    return router;
}
