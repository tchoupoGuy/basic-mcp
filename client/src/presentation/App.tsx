import { useState } from "react";
import { useMcpTool } from "../application/hooks/useMcpTool";
import { useMcpResource } from "../application/hooks/useMcpResource";
import { useMcpPrompt } from "../application/hooks/useMcpPrompt";
import { ToolCard } from "./components/ToolCard";
import { ResultList } from "./components/ResultList";
import { ChatBox } from "./components/ChatBox";
import "../App.css";

let nextId = 1;

type ResultEntry = { id: number; label: string; content: string; error?: boolean };

function App() {
    const [results, setResults] = useState<ResultEntry[]>([]);

    const { callTool, loading: toolLoading } = useMcpTool();
    const { readResource, loading: resourceLoading } = useMcpResource();
    const { getPrompt, loading: promptLoading } = useMcpPrompt();
    const loading = toolLoading || resourceLoading || promptLoading;

    const [pingMessage, setPingMessage] = useState("hello");
    const [githubUsername, setGithubUsername] = useState("tchoupoGuy");
    const [weatherCity, setWeatherCity] = useState("Paris");
    const [useCoords, setUseCoords] = useState(false);
    const [latitude, setLatitude] = useState("48.85");
    const [longitude, setLongitude] = useState("2.35");
    const [resourceUsername, setResourceUsername] = useState("tchoupoGuy");
    const [resourceCity, setResourceCity] = useState("Paris");
    const [resourceLat, setResourceLat] = useState("48.85");
    const [resourceLon, setResourceLon] = useState("2.35");
    const [promptWeatherCity, setPromptWeatherCity] = useState("Paris");
    const [promptWeatherLang, setPromptWeatherLang] = useState<"fr" | "en">("fr");
    const [promptCompareCity1, setPromptCompareCity1] = useState("Paris");
    const [promptCompareCity2, setPromptCompareCity2] = useState("Tokyo");
    const [promptGithubUser, setPromptGithubUser] = useState("tchoupoGuy");
    const [logFilename, setLogFilename] = useState("app.log");
    const [logLastLines, setLogLastLines] = useState("");
    const [logResourceFilename, setLogResourceFilename] = useState("app.log");

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

    async function handlePrompt(name: string, args: Record<string, string>, label: string) {
        try {
            const messages = await getPrompt(name, args);
            const text = messages.map((m) => `[${m.role}]: ${m.content}`).join("\n");
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

            <section style={{ marginBottom: 32 }}>
                <h2>Chat Agent (Claude + tools)</h2>
                <ChatBox />
            </section>

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
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (useCoords) {
                                handleTool("get-weather", { latitude: parseFloat(latitude), longitude: parseFloat(longitude) }, `Weather (${latitude}, ${longitude})`);
                            } else {
                                handleTool("get-weather", { city: weatherCity }, `Weather: ${weatherCity}`);
                            }
                        }}
                        loading={loading}
                        buttonLabel="Get Weather"
                    >
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                            <input type="checkbox" checked={useCoords} onChange={(e) => setUseCoords(e.target.checked)} />
                            Use coordinates
                        </label>
                        {useCoords ? (
                            <>
                                <input value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="Latitude" />
                                <input value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="Longitude" />
                            </>
                        ) : (
                            <input value={weatherCity} onChange={(e) => setWeatherCity(e.target.value)} placeholder="City name (e.g. Paris)" />
                        )}
                    </ToolCard>

                    <ToolCard
                        title="read-log-file"
                        onSubmit={(e) => {
                            e.preventDefault();
                            const args: Record<string, unknown> = { filename: logFilename };
                            if (logLastLines !== "") args.lastLines = parseInt(logLastLines);
                            handleTool("read-log-file", args, `Log: ${logFilename}${logLastLines ? ` (last ${logLastLines} lines)` : ""}`);
                        }}
                        loading={loading}
                        buttonLabel="Read Log"
                    >
                        <input value={logFilename} onChange={(e) => setLogFilename(e.target.value)} placeholder="File name (e.g. app.log)" />
                        <input value={logLastLines} onChange={(e) => setLogLastLines(e.target.value)} placeholder="Last N lines (optional)" type="number" min="1" />
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

                    <ToolCard
                        title={'weather://city/{city}'}
                        onSubmit={(e) => { e.preventDefault(); handleResource(`weather://city/${resourceCity}`); }}
                        loading={loading}
                        buttonLabel="Read Resource"
                    >
                        <input value={resourceCity} onChange={(e) => setResourceCity(e.target.value)} placeholder="City name (e.g. Paris)" />
                    </ToolCard>

                    <ToolCard
                        title={'logs://{filename}'}
                        onSubmit={(e) => { e.preventDefault(); handleResource(`logs://${logResourceFilename}`); }}
                        loading={loading}
                        buttonLabel="Read Resource"
                    >
                        <input value={logResourceFilename} onChange={(e) => setLogResourceFilename(e.target.value)} placeholder="File name (e.g. app.log)" />
                    </ToolCard>
                </section>

                <section>
                    <h2>Prompts</h2>

                    <ToolCard
                        title="analyze-weather"
                        onSubmit={(e) => {
                            e.preventDefault();
                            handlePrompt("analyze-weather", { city: promptWeatherCity, language: promptWeatherLang }, `Prompt: analyze-weather (${promptWeatherCity})`);
                        }}
                        loading={loading}
                        buttonLabel="Get Prompt"
                    >
                        <input value={promptWeatherCity} onChange={(e) => setPromptWeatherCity(e.target.value)} placeholder="City name" />
                        <select value={promptWeatherLang} onChange={(e) => setPromptWeatherLang(e.target.value as "fr" | "en")} style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid #ccc" }}>
                            <option value="fr">Français</option>
                            <option value="en">English</option>
                        </select>
                    </ToolCard>

                    <ToolCard
                        title="compare-weather"
                        onSubmit={(e) => {
                            e.preventDefault();
                            handlePrompt("compare-weather", { city1: promptCompareCity1, city2: promptCompareCity2 }, `Prompt: compare-weather (${promptCompareCity1} vs ${promptCompareCity2})`);
                        }}
                        loading={loading}
                        buttonLabel="Get Prompt"
                    >
                        <input value={promptCompareCity1} onChange={(e) => setPromptCompareCity1(e.target.value)} placeholder="City 1" />
                        <input value={promptCompareCity2} onChange={(e) => setPromptCompareCity2(e.target.value)} placeholder="City 2" />
                    </ToolCard>

                    <ToolCard
                        title="summarize-github-user"
                        onSubmit={(e) => {
                            e.preventDefault();
                            handlePrompt("summarize-github-user", { username: promptGithubUser }, `Prompt: summarize-github-user (${promptGithubUser})`);
                        }}
                        loading={loading}
                        buttonLabel="Get Prompt"
                    >
                        <input value={promptGithubUser} onChange={(e) => setPromptGithubUser(e.target.value)} placeholder="GitHub username" />
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
