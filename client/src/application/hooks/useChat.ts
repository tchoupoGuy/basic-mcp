import { useState, useCallback } from "react";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export function useChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);

    const sendMessage = useCallback(async (userMessage: string) => {
        const history = messages;
        const newMessages: ChatMessage[] = [...history, { role: "user", content: userMessage }];
        setMessages(newMessages);
        setLoading(true);

        let assistantText = "";
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        try {
            const response = await fetch("http://localhost:3001/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMessage, history }),
            });

            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const lines = decoder.decode(value).split("\n");
                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const data = line.slice(6);
                    if (data === "[DONE]") break;
                    try {
                        const { text } = JSON.parse(data) as { text: string };
                        assistantText += text;
                        setMessages((prev) => {
                            const updated = [...prev];
                            updated[updated.length - 1] = { role: "assistant", content: assistantText };
                            return updated;
                        });
                    } catch {
                        // ignore malformed chunks
                    }
                }
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: `Error: ${errorMsg}` };
                return updated;
            });
        } finally {
            setLoading(false);
        }
    }, [messages]);

    const clearMessages = useCallback(() => setMessages([]), []);

    return { messages, sendMessage, loading, clearMessages };
}
