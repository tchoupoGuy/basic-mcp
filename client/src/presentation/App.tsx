import { useState, useRef, useEffect } from "react";
import { useMcpTool } from "../application/hooks/useMcpTool";
import { useDocuments } from "../application/hooks/useDocuments";
import "../App.css";

let nextId = 1;

type ResultEntry = { id: number; label: string; content: string; error?: boolean };

function App() {
    const { callTool } = useMcpTool();
    const { documents, loading: docsLoading, refresh: refreshDocs } = useDocuments();

    // Document actif (vide = auto-détection côté serveur)
    const [activeDoc, setActiveDoc] = useState<string>("");

    const [results, setResults] = useState<ResultEntry[]>([]);
    const [loadingKey, setLoadingKey] = useState<string | null>(null);
    const [doneKey, setDoneKey] = useState<string | null>(null);

    // États : Révision
    const [summaryChapter, setSummaryChapter] = useState("1");
    const [stars, setStars] = useState<Record<number, number>>({});
    const [hoverStar, setHoverStar] = useState<{ ch: number; s: number } | null>(null);

    // États : Indexation
    const [indexChapters, setIndexChapters] = useState("1");
    const [indexForce, setIndexForce] = useState(false);
    const [indexName, setIndexName] = useState("");
    const [indexBasePath, setIndexBasePath] = useState("");

    // États : Question libre
    const [askQuestion, setAskQuestion] = useState("");
    const [askChapter, setAskChapter] = useState("");

    // États : Quiz
    const [quizChapter, setQuizChapter] = useState("1");
    const [quizCount, setQuizCount] = useState("5");
    const [quizDomain, setQuizDomain] = useState<"all" | "predictive" | "agile" | "hybrid">("all");

    // États : Génération PDF
    const [pdfChapters, setPdfChapters] = useState("1,2,3,4,5,6,7,8,9");
    const [pdfMode, setPdfMode] = useState<"images" | "text" | "images+text" | "vision">("images");
    const [pdfFilename, setPdfFilename] = useState("document-complet.pdf");

    const resultsRef = useRef<HTMLDivElement>(null);
    const latestResultRef = useRef<HTMLDivElement>(null);

    function addResult(label: string, content: string, error = false) {
        setResults((prev) => [{ id: nextId++, label, content, error }, ...prev]);
    }

    // Scroll automatique vers le dernier résultat ajouté
    useEffect(() => {
        if (results.length > 0) {
            latestResultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }, [results[0]?.id]);

    async function run(toolName: string, args: Record<string, unknown>, label: string, key: string) {
        setLoadingKey(key);
        setDoneKey(null);
        try {
            const text = await callTool(toolName, args);
            addResult(label, text);
            setDoneKey(key);
            setTimeout(() => setDoneKey(null), 3000);
        } catch (e: unknown) {
            addResult(label, e instanceof Error ? e.message : String(e), true);
            setDoneKey(key);
            setTimeout(() => setDoneKey(null), 3000);
        } finally {
            setLoadingKey(null);
        }
    }

    const isLoading = (key: string) => loadingKey === key;
    const isDone = (key: string) => doneKey === key;

    /**
     * Lance le résumé du chapitre.
     * Si l'index est absent, indexe automatiquement le chapitre d'abord puis relance.
     */
    async function runSummary(chapter: string) {
        const chapNum = parseInt(chapter);
        const label = `Résumé Chapitre ${chapter}`;
        const askArgs: Record<string, unknown> = {
            question: "Fais un résumé détaillé et structuré de ce chapitre, avec les concepts clés, termes importants et points essentiels pour l'examen PMP.",
            chapter: chapNum,
            pmpFocus: true,
        };
        if (activeDoc) askArgs.document = activeDoc;

        setLoadingKey("summary");
        try {
            const text = await callTool("ask-document", askArgs);
            addResult(label, text);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("Index introuvable")) {
                // Auto-indexation du chapitre manquant
                addResult(
                    `⏳ Index absent — indexation auto du chapitre ${chapter}...`,
                    "L'index de ce chapitre n'existe pas encore. Indexation en cours, merci de patienter...",
                );
                try {
                    await callTool("extract-document-index", { chapters: [chapNum], force: false });
                    // Relancer le résumé
                    const text = await callTool("ask-document", askArgs);
                    addResult(label, text);
                } catch (e2: unknown) {
                    addResult(label, e2 instanceof Error ? e2.message : String(e2), true);
                }
            } else {
                addResult(label, msg, true);
            }
        } finally {
            setLoadingKey(null);
        }
    }

    return (
        <div className="app">

            {/* En-tête */}
            <div className="app-header">
                <h1>Assistant <span>PMP</span></h1>
                <p>Préparez votre certification à partir de vos cours numérisés</p>
            </div>

            {/* Sélecteur de document */}
            <div className="step" style={{ marginBottom: 12 }}>
                <div className="step-header">
                    <div className="step-badge" style={{ background: "#0ea5e9" }}>📚</div>
                    <div className="step-title">Document actif</div>
                    <div className="step-subtitle">Source utilisée pour les questions et quiz</div>
                </div>
                <div className="step-body">
                    <div className="field-row">
                        <span className="field-label">Document</span>
                        <select
                            value={activeDoc}
                            onChange={(e) => setActiveDoc(e.target.value)}
                            style={{ minWidth: 180 }}
                        >
                            <option value="">Auto-détection</option>
                            {documents.map(d => (
                                <option key={d.name} value={d.name}>
                                    {d.name} ({d.chapters} chap.)
                                </option>
                            ))}
                        </select>
                        <button
                            className="btn btn-secondary"
                            style={{ fontSize: "0.75rem", padding: "4px 10px" }}
                            disabled={docsLoading}
                            onClick={refreshDocs}
                        >
                            {docsLoading ? "…" : "↺ Actualiser"}
                        </button>
                        {documents.length === 0 && !docsLoading && (
                            <span className="hint" style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                                Aucun document indexé — utilisez l'étape 1 ci-dessous
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="workflow">

                {/* Étape 1 : Indexation */}
                <div className="step">
                    <div className="step-header">
                        <div className="step-badge">1</div>
                        <div className="step-title">Indexer les chapitres</div>
                        <div className="step-subtitle">À faire une seule fois par chapitre</div>
                    </div>
                    <div className="step-body">
                        <p className="hint">
                            Extrait le texte de vos images via Tesseract OCR et le sauvegarde localement.
                            Les étapes 2 et 3 utilisent cet index sans relancer l'extraction.
                        </p>
                        <div className="field-row">
                            <span className="field-label">Nom</span>
                            <input
                                value={indexName}
                                onChange={(e) => setIndexName(e.target.value)}
                                placeholder="ex: pmp, scrum-guide"
                                style={{ width: 140 }}
                            />
                        </div>
                        <div className="field-row">
                            <span className="field-label">Dossier source</span>
                            <input
                                value={indexBasePath}
                                onChange={(e) => setIndexBasePath(e.target.value)}
                                placeholder="Chemin absolu vers le dossier (optionnel)"
                                style={{ width: 300 }}
                            />
                        </div>
                        <div className="field-row">
                            <span className="field-label">Chapitres</span>
                            <input
                                value={indexChapters}
                                onChange={(e) => setIndexChapters(e.target.value)}
                                placeholder="ex: 1  ou  1,2,3"
                                style={{ width: 160 }}
                            />
                            <label className="check-label">
                                <input
                                    type="checkbox"
                                    checked={indexForce}
                                    onChange={(e) => setIndexForce(e.target.checked)}
                                />
                                Forcer la réindexation
                            </label>
                        </div>
                        <div>
                            <button
                                className="btn btn-primary"
                                disabled={isLoading("index")}
                                onClick={async () => {
                                    const chapters = indexChapters
                                        .split(",").map(c => parseInt(c.trim())).filter(n => !isNaN(n));
                                    const args: Record<string, unknown> = { chapters, force: indexForce };
                                    if (indexName.trim()) args.name = indexName.trim();
                                    if (indexBasePath.trim()) args.basePath = indexBasePath.trim();
                                    await run("extract-document-index", args,
                                        `Indexation${indexName ? ` "${indexName}"` : ""} chapitres [${chapters.join(",")}]`, "index");
                                    refreshDocs();
                                }}
                            >
                                {isLoading("index") ? "Extraction en cours…" : "Lancer l'indexation"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Étape 2 : Question libre */}
                <div className="step">
                    <div className="step-header">
                        <div className="step-badge">2</div>
                        <div className="step-title">Poser une question</div>
                        <div className="step-subtitle">Basé sur votre cours</div>
                    </div>
                    <div className="step-body">
                        <textarea
                            value={askQuestion}
                            onChange={(e) => setAskQuestion(e.target.value)}
                            placeholder={"Ex: Quelle est la différence entre risk mitigation et risk avoidance ?\nEx: Explique la valeur acquise (EVM) et ses indicateurs CPI / SPI"}
                            rows={3}
                        />
                        <div className="field-row">
                            <span className="field-label">Chapitre</span>
                            <select
                                value={askChapter}
                                onChange={(e) => setAskChapter(e.target.value)}
                            >
                                <option value="">Tous les chapitres</option>
                                {[1,2,3,4,5,6,7,8,9].map(n => (
                                    <option key={n} value={String(n)}>Chapitre {n}</option>
                                ))}
                            </select>
                            <button
                                className="btn btn-primary"
                                disabled={isLoading("ask") || !askQuestion.trim()}
                                onClick={() => {
                                    const args: Record<string, unknown> = { question: askQuestion, pmpFocus: true };
                                    if (askChapter) args.chapter = parseInt(askChapter);
                                    if (activeDoc) args.document = activeDoc;
                                    run("ask-document", args,
                                        `Q: ${askQuestion.slice(0, 50)}…`, "ask");
                                }}
                            >
                                {isLoading("ask") ? "Réponse en cours…" : isDone("ask") ? "✓ Résultat ajouté ↓" : "Poser la question"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Étape 3 : Quiz */}
                <div className="step">
                    <div className="step-header">
                        <div className="step-badge">3</div>
                        <div className="step-title">Générer un quiz QCM</div>
                        <div className="step-subtitle">Format examen PMI</div>
                    </div>
                    <div className="step-body">
                        <p className="hint">
                            Questions situationnelles avec 4 options, réponse correcte et explication détaillée.
                        </p>
                        <div className="field-row">
                            <span className="field-label">Chapitre</span>
                            <select value={quizChapter} onChange={(e) => setQuizChapter(e.target.value)}>
                                {[1,2,3,4,5,6,7,8,9].map(n => (
                                    <option key={n} value={String(n)}>Chapitre {n}</option>
                                ))}
                            </select>
                            <span className="field-label">Questions</span>
                            <input
                                type="number" min={1} max={20}
                                value={quizCount}
                                onChange={(e) => setQuizCount(e.target.value)}
                                style={{ width: 70 }}
                            />
                            <span className="field-label">Domaine</span>
                            <select
                                value={quizDomain}
                                onChange={(e) => setQuizDomain(e.target.value as typeof quizDomain)}
                            >
                                <option value="all">Tous</option>
                                <option value="predictive">Prédictif (PMBOK)</option>
                                <option value="agile">Agile</option>
                                <option value="hybrid">Hybride</option>
                            </select>
                        </div>
                        <div>
                            <button
                                className="btn btn-primary"
                                disabled={isLoading("quiz")}
                                onClick={() => run("generate-quiz",
                                    { chapter: parseInt(quizChapter), count: parseInt(quizCount), domain: quizDomain, ...(activeDoc ? { document: activeDoc } : {}) },
                                    `Quiz Chap.${quizChapter} – ${quizCount} questions (${quizDomain})`, "quiz")}
                            >
                                {isLoading("quiz") ? "Génération en cours…" : isDone("quiz") ? "✓ Résultat ajouté ↓" : "Générer le quiz"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* PDF du cours */}
                <div className="step">
                    <div className="step-header">
                        <div className="step-badge" style={{ background: "#475569" }}>↓</div>
                        <div className="step-title">Exporter en PDF</div>
                        <div className="step-subtitle">Support de révision</div>
                    </div>
                    <div className="step-body">
                        <div className="field-row">
                            <span className="field-label">Mode</span>
                            <select
                                value={pdfMode}
                                onChange={(e) => setPdfMode(e.target.value as typeof pdfMode)}
                            >
                                <option value="images">Images (fidèle à l'original)</option>
                                <option value="vision">Texte GPT-4o (recherchable)</option>
                                <option value="images+text">Images + texte OCR</option>
                                <option value="text">Texte OCR Tesseract</option>
                            </select>
                        </div>
                        <div className="field-row">
                            <span className="field-label">Chapitres</span>
                            <input
                                value={pdfChapters}
                                onChange={(e) => setPdfChapters(e.target.value)}
                                placeholder="ex: 1,2,3"
                                style={{ width: 160 }}
                            />
                            <span className="field-label">Fichier</span>
                            <input
                                value={pdfFilename}
                                onChange={(e) => setPdfFilename(e.target.value)}
                                style={{ width: 200 }}
                            />
                        </div>
                        <div>
                            <button
                                className="btn btn-secondary"
                                disabled={isLoading("pdf")}
                                onClick={() => {
                                    const chapters = pdfChapters
                                        .split(",").map(c => parseInt(c.trim())).filter(n => !isNaN(n));
                                    run("generate-document-pdf",
                                        { chapters, mode: pdfMode, outputFilename: pdfFilename },
                                        `PDF [${pdfMode}] chapitres [${chapters.join(",")}]`, "pdf");
                                }}
                            >
                                {isLoading("pdf") ? "Génération en cours…" : "Générer le PDF"}
                            </button>
                        </div>
                    </div>
                </div>

            </div>

                   {/* Résultats — affichés juste après le header */}
            {results.length > 0 && (
                <div className="results-panel" ref={resultsRef}>
                    <div className="results-panel-header">
                        <span className="results-panel-title">Résultats ({results.length})</span>
                        <button className="btn btn-secondary btn-sm" onClick={() => setResults([])}>
                            Tout effacer
                        </button>
                    </div>
                    {results.map((r, i) => (
                        <div
                            key={r.id}
                            ref={i === 0 ? latestResultRef : undefined}
                            className={`result-entry${r.error ? " error" : ""}`}
                        >
                            <div className="result-label">
                                <div className={`status-dot${r.error ? " warn" : ""}`} />
                                {r.label}
                            </div>
                            <div className="result-content">{r.content}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Révision par chapitre */}
            <div className="review-section">
                <div className="review-header">
                    <span className="review-title">Révision par chapitre</span>
                    <span className="review-subtitle">Résumé GPT-4o + suivi de maîtrise</span>
                </div>

                {/* Grille de progression */}
                <div className="chapter-grid">
                    {[1,2,3,4,5,6,7,8,9].map(n => (
                        <div
                            key={n}
                            className={`chapter-card${summaryChapter === String(n) ? " active" : ""}`}
                            onClick={() => setSummaryChapter(String(n))}
                        >
                            <div className="chapter-card-num">Ch.{n}</div>
                            <div className="chapter-card-stars">
                                {[1,2,3,4,5].map(s => (
                                    <span
                                        key={s}
                                        className={`star${
                                            (hoverStar?.ch === n ? hoverStar.s : (stars[n] ?? 0)) >= s
                                                ? " filled" : ""
                                        }`}
                                        onMouseEnter={() => setHoverStar({ ch: n, s })}
                                        onMouseLeave={() => setHoverStar(null)}
                                        onClick={(e) => { e.stopPropagation(); setStars(prev => ({ ...prev, [n]: s })); }}
                                    >★</span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Demande de résumé */}
                <div className="review-body">
                    <div className="field-row">
                        <span className="field-label">Chapitre</span>
                        <select value={summaryChapter} onChange={(e) => setSummaryChapter(e.target.value)}>
                            {[1,2,3,4,5,6,7,8,9].map(n => (
                                <option key={n} value={String(n)}>Chapitre {n}</option>
                            ))}
                        </select>
                        <button
                            className="btn btn-primary"
                            disabled={isLoading("summary")}
                            onClick={() => runSummary(summaryChapter)}
                        >
                            {isLoading("summary") ? "En cours…" : "Obtenir le résumé"}
                        </button>
                        <span className="hint" style={{ fontSize: "0.75rem" }}>
                            Indexe automatiquement si nécessaire
                        </span>
                    </div>
                </div>
            </div>

        </div>
    );
}

export default App;
