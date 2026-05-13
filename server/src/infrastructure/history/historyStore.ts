import * as fs from "fs";
import * as path from "path";

const HISTORY_DIR = path.resolve("logs/history");

function ensureDir() {
    if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

export interface ChatHistoryEntry {
    type: "chat";
    timestamp: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface QuizHistoryEntry {
    type: "quiz";
    timestamp: string;
    document?: string;
    chapter: number;
    count: number;
    domain: string;
    content: string;
}

export type HistoryEntry = ChatHistoryEntry | QuizHistoryEntry;

export interface HistoryMeta {
    id: string;
    type: "chat" | "quiz";
    timestamp: string;
    label: string;
}

export function saveHistory(entry: HistoryEntry): void {
    try {
        ensureDir();
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `${entry.type}-${ts}.json`;
        fs.writeFileSync(path.join(HISTORY_DIR, filename), JSON.stringify(entry, null, 2), "utf-8");
    } catch (err) {
        console.warn("[History] Failed to save:", err instanceof Error ? err.message : err);
    }
}

export function listHistory(): HistoryMeta[] {
    try {
        ensureDir();
        const files = fs.readdirSync(HISTORY_DIR)
            .filter(f => f.endsWith(".json"))
            .sort()
            .reverse();

        return files.flatMap(filename => {
            try {
                const entry = JSON.parse(
                    fs.readFileSync(path.join(HISTORY_DIR, filename), "utf-8"),
                ) as HistoryEntry;

                let label = "";
                if (entry.type === "chat") {
                    const first = entry.messages.find(m => m.role === "user");
                    label = first ? first.content.slice(0, 70) : "Chat";
                } else {
                    label = `Quiz Ch.${entry.chapter}${entry.document ? ` (${entry.document})` : ""} — ${entry.count} q.`;
                }

                return [{ id: filename.replace(".json", ""), type: entry.type, timestamp: entry.timestamp, label }];
            } catch {
                return [];
            }
        });
    } catch {
        return [];
    }
}

export function getHistory(id: string): HistoryEntry | null {
    try {
        // Prevent path traversal
        const safe = path.basename(id);
        const filepath = path.join(HISTORY_DIR, `${safe}.json`);
        if (!fs.existsSync(filepath)) return null;
        return JSON.parse(fs.readFileSync(filepath, "utf-8")) as HistoryEntry;
    } catch {
        return null;
    }
}
