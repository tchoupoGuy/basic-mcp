import React from "react";

interface ToolCardProps {
    title: string;
    children: React.ReactNode;
    onSubmit: (e: React.FormEvent) => void;
    loading: boolean;
    buttonLabel?: string;
}

export function ToolCard({ title, children, onSubmit, loading, buttonLabel = "Run" }: ToolCardProps) {
    return (
        <div style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>{title}</h3>
            <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                {children}
                <button type="submit" disabled={loading}>
                    {loading ? "Loading…" : buttonLabel}
                </button>
            </form>
        </div>
    );
}
