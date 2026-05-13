import { useState, useEffect } from "react";
import { useHistory, type HistoryEntry, type HistoryMeta } from "../../application/hooks/useHistory";

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleString(undefined, {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

function EntryDetail({ entry }: { entry: HistoryEntry }) {
    if (entry.type === "quiz") {
        return (
            <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6 }}>
                {entry.content}
            </div>
        );
    }
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {entry.messages.map((m, i) => {
                const isUser = m.role === "user";
                return (
                    <div key={i} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
                        <div style={{
                            maxWidth: "85%",
                            padding: "8px 12px",
                            borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                            background: isUser ? "#0070f3" : "#f0f0f0",
                            color: isUser ? "white" : "black",
                            fontSize: 13,
                            whiteSpace: "pre-wrap",
                            lineHeight: 1.5,
                        }}>
                            {m.content}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function HistoryPanel() {
    const { items, loading, refresh, fetchItem } = useHistory();
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<HistoryMeta | null>(null);
    const [detail, setDetail] = useState<HistoryEntry | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    useEffect(() => {
        if (open && items.length === 0) refresh();
    }, [open]);

    async function handleSelect(item: HistoryMeta) {
        setSelected(item);
        setDetail(null);
        setDetailLoading(true);
        const entry = await fetchItem(item.id);
        setDetail(entry);
        setDetailLoading(false);
    }

    return (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
            {/* Header */}
            <div
                style={{
                    background: "#f8fafc", padding: "12px 16px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    cursor: "pointer", userSelect: "none",
                }}
                onClick={() => { setOpen(o => !o); if (!open) refresh(); }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>🗂</span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Historique</span>
                    {items.length > 0 && (
                        <span style={{
                            background: "#e2e8f0", borderRadius: 10,
                            padding: "1px 7px", fontSize: 12, color: "#64748b",
                        }}>{items.length}</span>
                    )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {open && (
                        <button
                            onClick={(e) => { e.stopPropagation(); refresh(); }}
                            style={{ fontSize: 12, padding: "2px 8px", cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 4, background: "white" }}
                        >
                            ↻ Rafraîchir
                        </button>
                    )}
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
                </div>
            </div>

            {open && (
                <div style={{ display: "flex", height: 380 }}>
                    {/* Sidebar list */}
                    <div style={{
                        width: 260, minWidth: 220, borderRight: "1px solid #e2e8f0",
                        overflowY: "auto", background: "#fafafa",
                    }}>
                        {loading && (
                            <div style={{ padding: 16, color: "#94a3b8", fontSize: 13 }}>Chargement…</div>
                        )}
                        {!loading && items.length === 0 && (
                            <div style={{ padding: 16, color: "#94a3b8", fontSize: 13 }}>
                                Aucun historique.<br />Les conversations chat et quiz seront sauvegardées ici.
                            </div>
                        )}
                        {items.map(item => (
                            <div
                                key={item.id}
                                onClick={() => handleSelect(item)}
                                style={{
                                    padding: "10px 14px",
                                    cursor: "pointer",
                                    borderBottom: "1px solid #f1f5f9",
                                    background: selected?.id === item.id ? "#eff6ff" : "transparent",
                                    borderLeft: selected?.id === item.id ? "3px solid #0070f3" : "3px solid transparent",
                                }}
                            >
                                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                                    <span style={{ fontSize: 11 }}>{item.type === "chat" ? "💬" : "📝"}</span>
                                    <span style={{
                                        fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                                        color: item.type === "chat" ? "#0070f3" : "#7c3aed",
                                    }}>{item.type}</span>
                                    <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: "auto" }}>
                                        {formatDate(item.timestamp)}
                                    </span>
                                </div>
                                <div style={{
                                    fontSize: 12, color: "#374151",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                    {item.label}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Detail pane */}
                    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                        {!selected && (
                            <div style={{ color: "#94a3b8", fontSize: 13 }}>
                                ← Sélectionnez une entrée pour voir le détail
                            </div>
                        )}
                        {selected && detailLoading && (
                            <div style={{ color: "#94a3b8", fontSize: 13 }}>Chargement…</div>
                        )}
                        {selected && !detailLoading && detail && (
                            <div>
                                <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #e2e8f0" }}>
                                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{formatDate(selected.timestamp)}</div>
                                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{selected.label}</div>
                                </div>
                                <EntryDetail entry={detail} />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
