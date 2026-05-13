import { useState, useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface HistoryMeta {
    id: string;
    type: "chat" | "quiz";
    timestamp: string;
    label: string;
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

export function useHistory() {
    const [items, setItems] = useState<HistoryMeta[]>([]);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/history`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setItems(await res.json() as HistoryMeta[]);
        } catch (e) {
            console.error("[History] Failed to load list:", e);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchItem = useCallback(async (id: string): Promise<HistoryEntry | null> => {
        try {
            const res = await fetch(`${API_URL}/history/${encodeURIComponent(id)}`);
            if (!res.ok) return null;
            return await res.json() as HistoryEntry;
        } catch {
            return null;
        }
    }, []);

    return { items, loading, refresh, fetchItem };
}
