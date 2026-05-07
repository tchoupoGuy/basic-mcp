interface ResultListProps {
    results: string[];
    onClear: () => void;
}

export function ResultList({ results, onClear }: ResultListProps) {
    if (results.length === 0) return null;

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3>Results</h3>
                <button onClick={onClear} style={{ fontSize: 12 }}>Clear</button>
            </div>
            {results.map((r, i) => (
                <pre
                    key={i}
                    style={{
                        background: "#f5f5f5",
                        padding: 12,
                        borderRadius: 6,
                        overflowX: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        marginBottom: 8,
                    }}
                >
                    {r}
                </pre>
            ))}
        </div>
    );
}
