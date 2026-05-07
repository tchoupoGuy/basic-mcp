import { useState } from "react";
import { useMcpTool } from "../application/hooks/useMcpTool";
import { useMcpResource } from "../application/hooks/useMcpResource";
import { ToolCard } from "./components/ToolCard";
import { ResultList } from "./components/ResultList";
import "../App.css";

let nextId = 1;

type ResultEntry = { id: number; label: string; content: string; error?: boolean };

function App() {
    const [results, setResults] = useState<ResultEntry[]>([]);

    const { callTool, loading: toolLoading } = useMcpTool();
    const { readResource, loading: resourceLoading } = useMcpResource();
    const loading = toolLoading || resourceLoading;

    const [pingMessage, setPingMessage] = useState("hello");
    const [githubUsername, setGithubUsername] = useState("tchoupoGuy");
    const [latitude, setLatitude] = useState("48.85");
    const [longitude, setLongitude] = useState("2.35");
    const [resourceUsername, setResourceUsername] = useState("tchoupoGuy");
    const [resourceLat, setResourceLat] = useState("48.85");
    const [resourceLon, setResourceLon] = useState("2.35");

    function addResult(label: string, content: string, error = false) {
        setResults((prev) => [{ id: nextId++, label, content, error }, ...prev]);
    }

    async function handleTool(toolName: string, args: Record<string, unknown>, label: string) {
        try {
            const text = await callTool(toolName, args);
            addResult(label, text);
        } catch (e: unknown) {
            addResult(label, e instanceof Error ? e.message : String(e), true);
        }
    }

    async function handleResource(uri: string) {
        try {
            const text = await readResource(uri);
            addResult(`Resource: ${uri}`, text);
        } catch (e: unknown) {
            addResult(`Resource: ${uri}`, e instanceof Error ? e.message : String(e), true);
        }
    }

    return (
        <div className="app">
            <h1>MCP Server UI</h1>

            <div className="sections">
                <section>
                    <h2>Tools</h2>

                    <ToolCard
                        title="ping-server"
                        onSubmit={(e) => { e.preventDefault(); handleTool("ping-server", { message: pingMessage }, `ping ? "${pingMessage}"`); }}
                        loading={loading}
                        buttonLabel="Ping"
                    >
                        <input value={pingMessage} onChange={(e) => setPingMessage(e.target.value)} placeholder="Message" />
                    </ToolCard>

                    <ToolCard
                        title="get-github-user"
                        onSubmit={(e) => { e.preventDefault(); handleTool("get-github-user", { username: githubUsername }, `GitHub user: ${githubUsername}`); }}
                        loading={loading}
                        buttonLabel="Fetch User"
                    >
                        <input value={githubUsername} onChange={(e) => setGithubUsername(e.target.value)} placeholder="GitHub username" />
                    </ToolCard>

                    <ToolCard
                        title="get-weather"
                        onSubmit={(e) => { e.preventDefault(); handleTool("get-weather", { latitude: parseFloat(latitude), longitude: parseFloat(longitude) }, `Weather (${latitude}, ${longitude})`); }}
                        loading={loading}
                        buttonLabel="Get Weather"
                    >
                        <input value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="Latitude" />
                        <input value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="Longitude" />
                    </ToolCard>
                </section>

                <section>
                    <h2>Resources</h2>

                    <ToolCard
                        title={'github://users/{username}'}
                        onSubmit={(e) => { e.preventDefault(); handleResource(`github://users/${resourceUsername}`); }}
                        loading={loading}
                        buttonLabel="Read Resource"
                    >
                        <input value={resourceUsername} onChange={(e) => setResourceUsername(e.target.value)} placeholder="GitHub username" />
                    </ToolCard>

                    <ToolCard
                        title={'weather://forecast/{lat},{lon}'}
                        onSubmit={(e) => { e.preventDefault(); handleResource(`weather://forecast/${resourceLat},${resourceLon}`); }}
                        loading={loading}
                        buttonLabel="Read Resource"
                    >
                        <input value={resourceLat} onChange={(e) => setResourceLat(e.target.value)} placeholder="Latitude" />
                        <input value={resourceLon} onChange={(e) => setResourceLon(e.target.value)} placeholder="Longitude" />
                    </ToolCard>
                </section>
            </div>

            <ResultList
                results={results.map((r) => `[${r.label}]\n${r.content}`)}
                onClear={() => setResults([])}
            />
        </div>
    );
}

export default App;
