import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { config } from "dotenv";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp";
import { buildServer, buildUseCases, buildInProcessMcpClient } from "./src/compositionRoot";
import { createChatRouter } from "./src/interface/chat/chatRoute";
import { createHistoryRouter } from "./src/interface/history/historyRoute";
import { warmupTesseractWorker } from "./src/infrastructure/ocr/tesseractWorker";

config({ path: new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1") });

const app = express();
app.use(cors({
    exposedHeaders: ["Mcp-Session-Id"],
}));
app.use(express.json());

const PORT = 3001;
const sharedUseCases = buildUseCases();
const sessions = new Map<string, StreamableHTTPServerTransport>();

function isInitializeRequest(body: unknown): boolean {
    if (!body || typeof body !== "object") return false;
    const msg = body as { method?: string };
    return msg.method === "initialize";
}

// POST: client-to-server messages
// Timeout étendu à 10 min pour absorber l'OCR de documents volumineux
app.post("/mcp", (req, res, next) => { res.setTimeout(600_000); next(); }, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // Existing session
    if (sessionId && sessions.has(sessionId)) {
        const transport = sessions.get(sessionId)!;
        await transport.handleRequest(req, res, req.body);
        return;
    }

    // No session ID: must be an initialize request
    if (!isInitializeRequest(req.body)) {
        res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Bad Request: expected initialize request" },
            id: null,
        });
        return;
    }

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
            sessions.set(id, transport);
        },
    });

    transport.onclose = () => {
        if (transport.sessionId) {
            sessions.delete(transport.sessionId);
        }
    };

    const server = buildServer(sharedUseCases);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
});

// GET: SSE stream for server-to-client notifications
app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
        res.status(400).json({ error: "Invalid or missing session ID" });
        return;
    }
    const transport = sessions.get(sessionId)!;
    await transport.handleRequest(req, res);
});

// DELETE: close a session
app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
        const transport = sessions.get(sessionId)!;
        await transport.handleRequest(req, res);
        sessions.delete(sessionId);
    } else {
        res.status(404).json({ error: "Session not found" });
    }
});

async function init() {
    const mcpClient = await buildInProcessMcpClient();
    app.use(createChatRouter(mcpClient));
    app.use(createHistoryRouter());

    app.listen(PORT, () => {
        console.log(`MCP HTTP server running at http://localhost:${PORT}/mcp`);
        // Pré-initialiser le worker OCR en arrière-plan dès le démarrage
        // pour éviter un timeout lors de la première requête client
        warmupTesseractWorker();
    });
}

init().catch(console.error);
