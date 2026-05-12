import { useState, useRef, useEffect } from "react";
import { useChat, type ChatMessage } from "../../application/hooks/useChat";

export function ChatBox() {
    const { messages, sendMessage, loading, clearMessages } = useChat();
    const [input, setInput] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const text = input.trim();
        if (!text || loading) return;
        setInput("");
        sendMessage(text);
    }

    return (
        <div style={{ border: "1px solid #ccc", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ background: "#f5f5f5", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Chat (Ollama · tools MCP)</h3>
                <button onClick={clearMessages} style={{ fontSize: 12, padding: "2px 8px", cursor: "pointer" }}>
                    Effacer
                </button>
            </div>

            <div style={{ height: 320, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {messages.length === 0 && (
                    <p style={{ color: "#999", margin: 0, fontSize: 13 }}>
                        Essaie : "Quelle est la météo à Paris ?" ou "Donne-moi le profil GitHub de torvalds"
                    </p>
                )}
                {messages.map((msg, i) => (
                    <MessageBubble key={i} msg={msg} />
                ))}
                <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", borderTop: "1px solid #eee" }}>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Pose une question..."
                    disabled={loading}
                    style={{ flex: 1, border: "none", padding: "12px 16px", outline: "none", fontSize: 14 }}
                />
                <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    style={{ padding: "12px 20px", border: "none", borderLeft: "1px solid #eee", cursor: "pointer", background: "white", fontWeight: 600 }}
                >
                    {loading ? "…" : "Envoyer"}
                </button>
            </form>
        </div>
    );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
    const isUser = msg.role === "user";
    return (
        <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
            <div style={{
                maxWidth: "80%",
                padding: "8px 12px",
                borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                background: isUser ? "#0070f3" : "#f0f0f0",
                color: isUser ? "white" : "black",
                fontSize: 14,
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
            }}>
                {msg.content || <span style={{ opacity: 0.5 }}>…</span>}
            </div>
        </div>
    );
}
