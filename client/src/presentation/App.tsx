import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n/i18n";
import { useMcpTool } from "../application/hooks/useMcpTool";
import { useDocuments } from "../application/hooks/useDocuments";
import { ChatBox } from "./components/ChatBox";
import { HistoryPanel } from "./components/HistoryPanel";
import "../App.css";

let nextId = 1;

type ResultEntry = { id: number; label: string; content: string; error?: boolean };
type Tab = "home" | "review" | "ask" | "quiz" | "chat" | "history" | "tools";

const TABS: { id: Tab; icon: string; label: string }[] = [
    { id: "home",    icon: "🏠", label: "Accueil" },
    { id: "review",  icon: "📚", label: "Révision" },
    { id: "ask",     icon: "❓", label: "Question" },
    { id: "quiz",    icon: "📝", label: "Quiz" },
    { id: "chat",    icon: "💬", label: "Chat" },
    { id: "history", icon: "🗂", label: "Historique" },
    { id: "tools",   icon: "⚙️", label: "Outils" },
];

function App() {
    const { t } = useTranslation();
    const { callTool } = useMcpTool();
    const { documents, loading: docsLoading, refresh: refreshDocs } = useDocuments();

    function changeLang(lng: string) {
        i18n.changeLanguage(lng);
        localStorage.setItem("lang", lng);
    }

    // Document actif (vide = auto-détection côté serveur)
    const [activeDoc, setActiveDoc] = useState<string>("");

    function handleDocChange(name: string) {
        setActiveDoc(name);
        const info = documents.find(d => d.name === name);
        const firstChap = info?.chapterNumbers[0] ? String(info.chapterNumbers[0]) : "1";
        setSummaryChapter(firstChap);
        setQuizChapter(firstChap);
        setAskChapter("");
    }

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

    const [activeTab, setActiveTab] = useState<Tab>("home");
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

    /** Chapitres disponibles pour le document actif (fallback 1-9 si inconnu) */
    const activeDocInfo = documents.find(d => d.name === activeDoc);
    const availableChapters: number[] = activeDocInfo?.chapterNumbers.length
        ? activeDocInfo.chapterNumbers
        : [1, 2, 3, 4, 5, 6, 7, 8, 9];

    /**
     * Lance le résumé du chapitre.
     * Si l'index est absent, indexe automatiquement le chapitre d'abord puis relance.
     */
    async function runSummary(chapter: string) {
        const chapNum = parseInt(chapter);
        const label = t("review.resultLabel", { chapter });
        const askArgs: Record<string, unknown> = {
            question: t("review.summaryQuestion"),
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
                    t("step1.autoLabel", { chapter }),
                    t("step1.autoMsg"),
                );
                try {
                    await callTool("extract-document-index", { chapters: [chapNum], force: false });
                    // Relancer le résumé
                    const text = await callTool("ask-document", askArgs);
                    addResult(label, text);
                } catch (e2: unknown) {
                    addResult(label, e2 instanceof Error ? e2.message : String(e2), true);
                }
            } else if (msg.includes("Plusieurs documents disponibles") && documents.length > 0 && !activeDoc) {
                // Auto-sélection du premier document disponible puis relance
                const firstDoc = documents[0].name;
                setActiveDoc(firstDoc);
                askArgs.document = firstDoc;
                try {
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

    // ── Shared: document context bar ───────────────────────────────────────
    const docBar = (
        <div className="doc-bar">
            <span className="doc-bar-label">📄 Document</span>
            <select value={activeDoc} onChange={(e) => handleDocChange(e.target.value)}>
                <option value="">{t("docSelector.autoDetect")}</option>
                {documents.map(d => (
                    <option key={d.name} value={d.name}>
                        {d.name} ({d.chapterNumbers.length > 0 ? `Ch. ${d.chapterNumbers.join(", ")}` : `${d.chapters} ch.`})
                    </option>
                ))}
            </select>
            <button className="btn btn-secondary btn-sm" disabled={docsLoading} onClick={refreshDocs}>
                {docsLoading ? "…" : "↻"}
            </button>
            {activeDoc && <span className="doc-bar-active">{activeDoc}</span>}
        </div>
    );

    // ── Shared: results panel ───────────────────────────────────────────────
    const resultsPanel = results.length > 0 && (
        <div className="results-panel">
            <div className="results-panel-header">
                <span className="results-panel-title">{t("results.title", { count: results.length })}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setResults([])}>{t("results.clear")}</button>
            </div>
            {results.map((r, i) => (
                <div key={r.id} ref={i === 0 ? latestResultRef : undefined} className={`result-entry${r.error ? " error" : ""}`}>
                    <div className="result-label">
                        <div className={`status-dot${r.error ? " warn" : ""}`} />
                        {r.label}
                    </div>
                    <div className="result-content">{r.content}</div>
                </div>
            ))}
        </div>
    );

    return (
        <div className="app">

            {/* ── Header ── */}
            <header className="app-header">
                <div>
                    <h1>Assistant <span>PMP</span></h1>
                    <p>{t("header.subtitle")}</p>
                </div>
                <div className="lang-switch">
                    <button className={`lang-btn${i18n.language === "fr" ? " active" : ""}`} onClick={() => changeLang("fr")}>FR</button>
                    <button className={`lang-btn${i18n.language === "en" ? " active" : ""}`} onClick={() => changeLang("en")}>EN</button>
                </div>
            </header>

            {/* ── Tab bar ── */}
            <nav className="tab-nav">
                {TABS.map(tab => (
                    <button key={tab.id} className={`tab-btn${activeTab === tab.id ? " active" : ""}`} onClick={() => setActiveTab(tab.id)}>
                        <span className="tab-icon">{tab.icon}</span>
                        <span className="tab-label">{tab.label}</span>
                    </button>
                ))}
            </nav>

            {/* ── HOME ── */}
            {activeTab === "home" && (
                <div className="page home-page">
                    <div className="home-hero">
                        <h2>Préparez votre certification <span>PMP</span></h2>
                        <p>Posez des questions, générez des quiz, révisez par chapitre — tout depuis votre cours indexé.</p>
                    </div>
                    <div className="home-grid">
                        {([
                            { id: "review"  as Tab, icon: "📚", title: "Révision",        desc: "Résumé par chapitre avec progression en étoiles" },
                            { id: "ask"     as Tab, icon: "❓", title: "Question libre",   desc: "Posez n'importe quelle question sur votre cours" },
                            { id: "quiz"    as Tab, icon: "📝", title: "Quiz PMP",          desc: "Générez des QCM style examen PMI" },
                            { id: "chat"    as Tab, icon: "💬", title: "Chat IA",           desc: "Discutez avec Ollama (outils météo, GitHub…)" },
                            { id: "history" as Tab, icon: "🗂", title: "Historique",        desc: "Retrouvez vos conversations et quiz passés" },
                            { id: "tools"   as Tab, icon: "⚙️", title: "Outils",           desc: "Indexation OCR, export PDF" },
                        ] as { id: Tab; icon: string; title: string; desc: string }[]).map(card => (
                            <button key={card.id} className="home-card" onClick={() => setActiveTab(card.id)}>
                                <span className="home-card-icon">{card.icon}</span>
                                <span className="home-card-title">{card.title}</span>
                                <span className="home-card-desc">{card.desc}</span>
                            </button>
                        ))}
                    </div>
                    {documents.length > 0 && (
                        <div className="home-docs">
                            <span className="home-docs-label">Documents indexés :</span>
                            {documents.map(d => <span key={d.name} className="home-doc-badge">{d.name}</span>)}
                        </div>
                    )}
                </div>
            )}

            {/* ── RÉVISION ── */}
            {activeTab === "review" && (
                <div className="page">
                    {docBar}
                    <div className="page-card">
                        <div className="page-card-header">
                            <span className="page-card-title">📚 {t("review.title")}</span>
                            <span className="page-card-subtitle">{t("review.subtitle")}</span>
                        </div>
                        <div className="chapter-grid" style={{ padding: "1rem 1.25rem 0" }}>
                            {availableChapters.map(n => (
                                <div key={n} className={`chapter-card${summaryChapter === String(n) ? " active" : ""}`} onClick={() => setSummaryChapter(String(n))}>
                                    <div className="chapter-card-num">Ch.{n}</div>
                                    <div className="chapter-card-stars">
                                        {[1,2,3,4,5].map(s => (
                                            <span key={s}
                                                className={`star${(hoverStar?.ch === n ? hoverStar.s : (stars[n] ?? 0)) >= s ? " filled" : ""}`}
                                                onMouseEnter={() => setHoverStar({ ch: n, s })}
                                                onMouseLeave={() => setHoverStar(null)}
                                                onClick={(e) => { e.stopPropagation(); setStars(prev => ({ ...prev, [n]: s })); }}
                                            >★</span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="page-card-body">
                            <div className="field-row">
                                <span className="field-label">{t("review.chapterLabel")}</span>
                                <select value={summaryChapter} onChange={(e) => setSummaryChapter(e.target.value)}>
                                    {availableChapters.map(n => <option key={n} value={String(n)}>{t("common.chapterN", { n })}</option>)}
                                </select>
                                <button className="btn btn-primary" disabled={isLoading("summary")} onClick={() => runSummary(summaryChapter)}>
                                    {isLoading("summary") ? t("review.btnLoading") : t("review.btn")}
                                </button>
                                <span className="hint">{t("review.hint")}</span>
                            </div>
                        </div>
                    </div>
                    {resultsPanel}
                </div>
            )}

            {/* ── QUESTION LIBRE ── */}
            {activeTab === "ask" && (
                <div className="page">
                    {docBar}
                    <div className="page-card">
                        <div className="page-card-header">
                            <span className="page-card-title">❓ {t("step2.title")}</span>
                            <span className="page-card-subtitle">{t("step2.subtitle")}</span>
                        </div>
                        <div className="page-card-body">
                            <textarea value={askQuestion} onChange={(e) => setAskQuestion(e.target.value)} placeholder={t("step2.placeholder")} rows={5} />
                            <div className="field-row">
                                <span className="field-label">{t("step2.chapterLabel")}</span>
                                <select value={askChapter} onChange={(e) => setAskChapter(e.target.value)}>
                                    <option value="">{t("step2.allChapters")}</option>
                                    {availableChapters.map(n => <option key={n} value={String(n)}>{t("common.chapterN", { n })}</option>)}
                                </select>
                                <button
                                    className="btn btn-primary"
                                    disabled={isLoading("ask") || !askQuestion.trim()}
                                    onClick={() => {
                                        const args: Record<string, unknown> = { question: askQuestion, pmpFocus: true };
                                        if (askChapter) args.chapter = parseInt(askChapter);
                                        const doc = activeDoc || (documents.length === 1 ? documents[0].name : undefined);
                                        if (doc) args.document = doc;
                                        run("ask-document", args, `Q: ${askQuestion.slice(0, 50)}…`, "ask");
                                    }}
                                >
                                    {isLoading("ask") ? t("step2.btnLoading") : isDone("ask") ? t("step2.btnDone") : t("step2.btn")}
                                </button>
                            </div>
                        </div>
                    </div>
                    {resultsPanel}
                </div>
            )}

            {/* ── QUIZ ── */}
            {activeTab === "quiz" && (
                <div className="page">
                    {docBar}
                    <div className="page-card">
                        <div className="page-card-header">
                            <span className="page-card-title">📝 {t("step3.title")}</span>
                            <span className="page-card-subtitle">{t("step3.subtitle")}</span>
                        </div>
                        <div className="page-card-body">
                            <p className="hint">{t("step3.hint")}</p>
                            <div className="field-row">
                                <span className="field-label">{t("step3.chapterLabel")}</span>
                                <select value={quizChapter} onChange={(e) => setQuizChapter(e.target.value)}>
                                    {availableChapters.map(n => <option key={n} value={String(n)}>{t("common.chapterN", { n })}</option>)}
                                </select>
                                <span className="field-label">{t("step3.countLabel")}</span>
                                <input type="number" min={1} max={20} value={quizCount} onChange={(e) => setQuizCount(e.target.value)} style={{ width: 80 }} />
                            </div>
                            <div className="field-row">
                                <span className="field-label">{t("step3.domainLabel")}</span>
                                <select value={quizDomain} onChange={(e) => setQuizDomain(e.target.value as typeof quizDomain)}>
                                    <option value="all">{t("step3.domainAll")}</option>
                                    <option value="predictive">{t("step3.domainPredictive")}</option>
                                    <option value="agile">{t("step3.domainAgile")}</option>
                                    <option value="hybrid">{t("step3.domainHybrid")}</option>
                                </select>
                            </div>
                            <div>
                                <button
                                    className="btn btn-primary"
                                    disabled={isLoading("quiz")}
                                    onClick={() => {
                                        const doc = activeDoc || (documents.length === 1 ? documents[0].name : undefined);
                                        run("generate-quiz",
                                            { chapter: parseInt(quizChapter), count: parseInt(quizCount), domain: quizDomain, ...(doc ? { document: doc } : {}) },
                                            t("step3.resultLabel", { chapter: quizChapter, count: quizCount, domain: quizDomain }), "quiz");
                                    }}
                                >
                                    {isLoading("quiz") ? t("step3.btnLoading") : isDone("quiz") ? t("step3.btnDone") : t("step3.btn")}
                                </button>
                            </div>
                        </div>
                    </div>
                    {resultsPanel}
                </div>
            )}

            {/* ── CHAT ── */}
            {activeTab === "chat" && (
                <div className="page">
                    <ChatBox />
                </div>
            )}

            {/* ── HISTORIQUE ── */}
            {activeTab === "history" && (
                <div className="page">
                    <HistoryPanel />
                </div>
            )}

            {/* ── OUTILS ── */}
            {activeTab === "tools" && (
                <div className="page">
                    {docBar}
                    <div className="page-card">
                        <div className="page-card-header">
                            <span className="page-card-title">🔍 {t("step1.title")}</span>
                            <span className="page-card-subtitle">{t("step1.subtitle")}</span>
                        </div>
                        <div className="page-card-body">
                            <p className="hint" dangerouslySetInnerHTML={{ __html: t("step1.hint") }} />
                            <div className="field-row">
                                <span className="field-label">{t("step1.nameLabel")}</span>
                                <input value={indexName} onChange={(e) => setIndexName(e.target.value)} placeholder={t("step1.namePlaceholder")} style={{ width: 140 }} />
                            </div>
                            <div className="field-row">
                                <span className="field-label">{t("step1.folderLabel")}</span>
                                <input value={indexBasePath} onChange={(e) => setIndexBasePath(e.target.value)} placeholder={t("step1.folderPlaceholder")} style={{ width: 300 }} />
                            </div>
                            <div className="field-row">
                                <span className="field-label">{t("step1.chaptersLabel")}</span>
                                <input value={indexChapters} onChange={(e) => setIndexChapters(e.target.value)} placeholder={t("step1.chaptersPlaceholder")} style={{ width: 160 }} />
                                <label className="check-label">
                                    <input type="checkbox" checked={indexForce} onChange={(e) => setIndexForce(e.target.checked)} />
                                    {t("step1.reanalyze")}
                                </label>
                            </div>
                            <div>
                                <button
                                    className="btn btn-primary"
                                    disabled={isLoading("index")}
                                    onClick={async () => {
                                        const chapters = indexChapters.split(",").map(c => parseInt(c.trim())).filter(n => !isNaN(n));
                                        const args: Record<string, unknown> = { chapters, force: indexForce };
                                        if (indexName.trim()) args.name = indexName.trim();
                                        if (indexBasePath.trim()) args.basePath = indexBasePath.trim();
                                        await run("extract-document-index", args,
                                            t("step1.resultLabel", { name: indexName ? ` "${indexName}"` : "", chapters: chapters.join(",") }), "index");
                                        refreshDocs();
                                    }}
                                >
                                    {isLoading("index") ? t("step1.btnLoading") : t("step1.btn")}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="page-card">
                        <div className="page-card-header">
                            <span className="page-card-title">↓ {t("pdf.title")}</span>
                            <span className="page-card-subtitle">{t("pdf.subtitle")}</span>
                        </div>
                        <div className="page-card-body">
                            <div className="field-row">
                                <span className="field-label">{t("pdf.modeLabel")}</span>
                                <select value={pdfMode} onChange={(e) => setPdfMode(e.target.value as typeof pdfMode)}>
                                    <option value="images">{t("pdf.modeImages")}</option>
                                    <option value="vision">{t("pdf.modeVision")}</option>
                                    <option value="images+text">{t("pdf.modeImagesText")}</option>
                                    <option value="text">{t("pdf.modeText")}</option>
                                </select>
                            </div>
                            <div className="field-row">
                                <span className="field-label">{t("pdf.chaptersLabel")}</span>
                                <input value={pdfChapters} onChange={(e) => setPdfChapters(e.target.value)} placeholder={t("pdf.chaptersPlaceholder")} style={{ width: 160 }} />
                                <span className="field-label">{t("pdf.fileLabel")}</span>
                                <input value={pdfFilename} onChange={(e) => setPdfFilename(e.target.value)} style={{ width: 200 }} />
                            </div>
                            <div>
                                <button
                                    className="btn btn-secondary"
                                    disabled={isLoading("pdf")}
                                    onClick={() => {
                                        const chapters = pdfChapters.split(",").map(c => parseInt(c.trim())).filter(n => !isNaN(n));
                                        run("generate-document-pdf", { chapters, mode: pdfMode, outputFilename: pdfFilename },
                                            t("pdf.resultLabel", { mode: pdfMode, chapters: chapters.join(",") }), "pdf");
                                    }}
                                >
                                    {isLoading("pdf") ? t("pdf.btnLoading") : t("pdf.btn")}
                                </button>
                            </div>
                        </div>
                    </div>
                    {resultsPanel}
                </div>
            )}

        </div>
    );
}

export default App;
