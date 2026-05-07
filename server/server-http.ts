import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp";
import { buildServer } from "./src/compositionRoot";

const app = express();
app.use(cors({
    exposedHeaders: ["Mcp-Session-Id"],
}));
app.use(express.json());

const PORT = 3001;

const sessions = new Map<string, StreamableHTTPServerTransport>();

function isInitializeRequest(body: unknown): boolean {
    if (!body || typeof body !== "object") return false;
    const msg = body as { method?: string };
    return msg.method === "initialize";
}

// POST: client-to-server messages
app.post("/mcp", async (req, res) => {
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

    const server = buildServer();
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

app.listen(PORT, () => {
    console.log(`MCP HTTP server running at http://localhost:${PORT}/mcp`);
});
