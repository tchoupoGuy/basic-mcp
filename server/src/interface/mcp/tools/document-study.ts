/**
 * Outils MCP d'étude PMP :
 *
 *   - ask-document   : pose une question sur le contenu du document indexé
 *   - generate-quiz  : génère des questions QCM style examen PMP sur un chapitre
 *
 * Stratégie LLM (priorité décroissante) :
 *   1. Ollama local (llama3.2) — toujours essayé en premier, 100% offline
 *   2. GPT-4o via GitHub Models — utilisé si GITHUB_TOKEN présent ET Ollama indisponible
 *   3. Mode BM25 pur — ask-document retourne les passages sans synthèse LLM
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import * as fs from "fs";
import OpenAI from "openai";
import { generateText } from "ai";
import { ollama } from "ollama-ai-provider-v2";
import { INDEX_PATH, getIndexPath, listIndexedDocuments } from "./document-index";
import { buildIndex as buildBm25Index, search as bm25Search, Chunk } from "../../../infrastructure/search/bm25Engine";

/** Endpoint GitHub Models (fallback GPT-4o) */
const GITHUB_MODELS_ENDPOINT = "https://models.inference.ai.azure.com";
const GITHUB_CHAT_MODEL = "gpt-4o";
/** Modèle Ollama local */
const LOCAL_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";

/**
 * Envoie un prompt à un LLM selon la disponibilité :
 *   1. Ollama local (priorité)
 *   2. GPT-4o via GitHub Models (fallback si GITHUB_TOKEN présent)
 * Lance une erreur si aucun LLM n'est disponible.
 */
async function chat(systemPrompt: string, userMessage: string): Promise<string> {
    // ── Tentative Ollama local ────────────────────────────────────────────────
    try {
        const { text } = await generateText({
            model: ollama(LOCAL_MODEL),
            system: systemPrompt,
            messages: [
                { role: "user", content: userMessage },
            ],
        });
        return text.trim();
    } catch (ollamaErr) {
        const msg = ollamaErr instanceof Error ? ollamaErr.message : String(ollamaErr);
        console.warn(`[Study] Ollama indisponible (${msg.slice(0, 80)}). Tentative GPT-4o...`);
    }

    // ── Fallback GPT-4o via GitHub Models ────────────────────────────────────
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error(
            "Aucun LLM disponible : Ollama ne répond pas et GITHUB_TOKEN est absent.\n" +
            "Solutions : démarrez Ollama (`ollama serve`) ou ajoutez GITHUB_TOKEN dans .env.",
        );
    }
    const client = new OpenAI({ baseURL: GITHUB_MODELS_ENDPOINT, apiKey: token });
    const timeoutMs = 180_000;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const response = await Promise.race([
                client.chat.completions.create({
                    model: GITHUB_CHAT_MODEL,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user",   content: userMessage },
                    ],
                    temperature: 0.5,
                    max_tokens: 2048,
                    stream: false as const,
                }),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Timeout GPT-4o (${timeoutMs / 1000}s)`)), timeoutMs),
                ),
            ]);
            return response.choices[0]?.message?.content?.trim() ?? "";
        } catch (err) {
            if (attempt === 2) throw err;
            console.warn(`[Study] GPT-4o tentative ${attempt} échouée. Retry dans 15s...`);
            await new Promise(r => setTimeout(r, 15_000));
        }
    }
    return "";
}

/** Structure d'une page dans l'index */
interface IndexPage { file: string; text: string; }
/** Structure d'un chapitre dans l'index */
interface IndexChapter { pages: IndexPage[]; }
/** Structure complète de l'index */
interface DocumentIndex {
    generatedAt: string;
    chapters: Record<string, IndexChapter>;
}

/**
 * Résout le chemin de l'index en fonction d'un nom de document optionnel.
 * - Si `docName` est fourni : utilise output/{docName}/document-index.json
 * - Si un seul document est indexé : l'utilise automatiquement
 * - Si plusieurs documents existent : lève une erreur avec la liste des choix
 * - Rétrocompat : vérifie aussi l'ancien output/document-index.json
 */
function resolveIndexPath(docName?: string): string {
    if (docName) return getIndexPath(docName);

    const docs = listIndexedDocuments();
    if (docs.length === 1) return docs[0].indexPath;
    if (docs.length > 1) {
        const names = docs.map(d => `"${d.name}"`).join(", ");
        throw new Error(
            `Plusieurs documents disponibles : ${names}. " +
            "Précisez le paramètre document (ex: document="pmp").`,
        );
    }
    // Aucun document dans le nouveau format — vérifier l'ancien chemin
    const legacy = INDEX_PATH;
    if (fs.existsSync(legacy)) return legacy;

    throw new Error(
        "Aucun document indexé. Lancez d'abord 'extract-document-index' " +
        "pour extraire le texte de vos chapitres.",
    );
}

/**
 * Charge et retourne l'index du document.
 * Lance une erreur claire si l'index n'existe pas encore.
 */
function loadIndex(docName?: string): DocumentIndex {
    const indexPath = resolveIndexPath(docName);
    if (!fs.existsSync(indexPath)) {
        throw new Error(
            `Index introuvable${docName ? ` pour le document "${docName}"` : ""}. ` +
            "Lancez d'abord l'outil 'extract-document-index' " +
            "pour extraire le texte de vos chapitres.",
        );
    }
    return JSON.parse(fs.readFileSync(indexPath, "utf-8")) as DocumentIndex;
}

/** Timeout par appel GPT-4o en ms */
const CALL_TIMEOUT_MS = 180_000;

/** Appelle GPT-4o avec timeout et 1 retry automatique */
async function chatWithTimeout(
    client: OpenAI,
    params: Parameters<OpenAI["chat"]["completions"]["create"]>[0],
): Promise<string> {
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout GPT-4o (${CALL_TIMEOUT_MS / 1000}s)`)), CALL_TIMEOUT_MS),
            );
            const response = await Promise.race([
                client.chat.completions.create({ ...params, stream: false as const }),
                timeoutPromise,
            ]);
            return response.choices[0]?.message?.content?.trim() ?? "";
        } catch (err) {
            if (attempt === 2) throw err;
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[Study] Échec tentative ${attempt} : ${msg}. Retry dans 15s...`);
            await new Promise(r => setTimeout(r, 15_000));
        }
    }
    return "";
}

/**
 * Construit le contexte textuel à partir de l'index.
 * Si un chapitre est spécifié, seul son texte est inclus.
 * Sinon, tous les chapitres sont concaténés (limité pour rester dans le contexte LLM).
 */
function buildContext(index: DocumentIndex, chapter?: number, maxChars = 20_000): string {
    if (chapter !== undefined) {
        const key = String(chapter);
        const chap = index.chapters[key];
        if (!chap) throw new Error(`Chapitre ${chapter} non trouvé dans l'index.`);
        const full = chap.pages.map(p => `[Page ${p.file}]\n${p.text}`).join("\n\n");
        return full.length > maxChars ? full.slice(0, maxChars) + "\n[... tronqué]" : full;
    }

    // Tous les chapitres — on tronque si trop long
    let context = "";
    for (const [num, chap] of Object.entries(index.chapters)) {
        const chapText = `=== CHAPITRE ${num} ===\n` +
            chap.pages.map(p => p.text).join("\n\n");
        if (context.length + chapText.length > maxChars) break;
        context += chapText + "\n\n";
    }
    return context;
}

/**
 * Convertit l'index de document en liste de Chunks pour le moteur BM25.
 * Filtre les pages vides ou inutilisables (réponse de refus du modèle vision).
 *
 * @param index   - Index complet du document
 * @param chapter - Si précisé, ne retourne que les chunks de ce chapitre
 */
function buildChunks(index: DocumentIndex, chapter?: number): Chunk[] {
    const chaptersToProcess = chapter !== undefined
        ? { [String(chapter)]: index.chapters[String(chapter)] }
        : index.chapters;

    const chunks: Chunk[] = [];
    for (const [chapNum, chapData] of Object.entries(chaptersToProcess)) {
        if (!chapData) continue;
        for (const page of chapData.pages) {
            const text = page.text?.trim() ?? "";
            // Ignore les réponses de refus du modèle vision et les pages vides
            if (text.length < 20 || text.startsWith("Je ne peux pas")) continue;
            chunks.push({
                id: `ch${chapNum}-${page.file}`,
                chapter: chapNum,
                pageFile: page.file,
                text,
            });
        }
    }
    return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Outil 1 : ask-document
// ─────────────────────────────────────────────────────────────────────────────

export function registerAskDocumentTool(server: McpServer) {
    server.registerTool(
        "ask-document",
        {
            description:
                "Answers any question about your course document using GPT-4o. " +
                "Perfect for PMP exam preparation: ask about concepts, processes, differences between approaches, etc. " +
                "Requires the index to be built first with extract-document-index.",
            inputSchema: z.object({
                question: z
                    .string()
                    .describe("Your question about the document (in French or English)"),
                document: z
                    .string()
                    .optional()
                    .describe("Document name to search in (use list-documents to see available). Auto-detected if only one document is indexed."),
                chapter: z
                    .number().int().min(1).max(99)
                    .optional()
                    .describe("Restrict the search to a specific chapter (optional)"),
                pmpFocus: z
                    .boolean()
                    .optional()
                    .describe("If true, frames the answer in PMP exam context (default: true)"),
            }),
        },
        async ({ question, document: docName, chapter, pmpFocus = true }) => {
            const index = loadIndex(docName);

            // ── Étape 1 : convertir l'index en chunks filtrés ────────────────
            const chunks = buildChunks(index, chapter);
            if (chunks.length === 0) {
                return {
                    content: [{
                        type: "text" as const,
                        text: "Aucun contenu exploitable dans l'index. Relancez 'extract-document-index'.",
                    }],
                };
            }

            // ── Étape 2 : BM25 — trouver les passages les plus pertinents ────
            //
            //   Avant : on envoyait 20 000 chars à GPT-4o (tout le chapitre)
            //   Après : on envoie seulement les top-5 passages (~3 000 chars)
            //           → 5-10x moins de tokens, réponse plus rapide et moins coûteuse
            //
            const bm25Index = buildBm25Index(chunks);
            const results   = bm25Search(bm25Index, question, 5);

            if (results.length === 0) {
                return {
                    content: [{
                        type: "text" as const,
                        text: `Aucun passage pertinent trouvé pour : "${question}"\n` +
                              "Vérifiez que l'index contient du texte extrait (extract-document-index).",
                    }],
                };
            }

            // ── Étape 3 : construire le contexte réduit ──────────────────────
            const MAX_CHARS_PER_CHUNK = 1_200;
            const reducedContext = results
                .map(r =>
                    `📖 Chapitre ${r.chunk.chapter} — ${r.chunk.pageFile} (BM25: ${r.score.toFixed(2)})\n` +
                    r.chunk.text.slice(0, MAX_CHARS_PER_CHUNK),
                )
                .join("\n\n" + "─".repeat(50) + "\n\n");

            // ── Étape 4a : synthèse LLM (Ollama → GPT-4o en fallback) ───────
            const systemPrompt = pmpFocus
                ? "Tu es un expert en management de projet et préparateur à la certification PMP (PMI). " +
                  "Tu réponds UNIQUEMENT en te basant sur les passages fournis (sélectionnés par BM25). " +
                  "Tes réponses sont claires, structurées, et orientées vers ce qu'un candidat PMP doit retenir. " +
                  "Cite les concepts clés, les processus PMBOK pertinents, et indique si le sujet est Prédictif, Agile ou Hybride."
                : "Tu es un assistant pédagogique. Réponds en te basant uniquement sur les passages fournis.";

            const userMessage =
                `Passages pertinents extraits par BM25 (${results.length} résultats) :\n\n` +
                `${reducedContext}\n\n---\n\nQuestion : ${question}`;

            try {
                const answer = await chat(systemPrompt, userMessage);
                return { content: [{ type: "text" as const, text: answer }] };
            } catch {
                // ── Étape 4b : mode BM25 pur — aucun LLM disponible ─────────
                //   Retourne directement les passages pertinents formatés.
                const header =
                    `🔍 Recherche BM25 — "${question}"\n` +
                    (chapter ? `📚 Chapitre ${chapter}\n` : "") +
                    `Passages pertinents : ${results.length}\n` +
                    "═".repeat(60) + "\n\n";
                return { content: [{ type: "text" as const, text: header + reducedContext }] };
            }
        },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Outil 2 : generate-quiz
// ─────────────────────────────────────────────────────────────────────────────

export function registerGenerateQuizTool(server: McpServer) {
    server.registerTool(
        "generate-quiz",
        {
            description:
                "Generates PMP-style multiple choice questions (MCQ) from a chapter of your course. " +
                "Questions follow the PMI exam format: situational, 4 options, one best answer with explanation. " +
                "Requires the index to be built first with extract-document-index.",
            inputSchema: z.object({
                chapter: z
                    .number().int().min(1).max(99)
                    .describe("Chapter number to generate questions from"),
                document: z
                    .string()
                    .optional()
                    .describe("Document name (use list-documents to see available). Auto-detected if only one document is indexed."),
                count: z
                    .number().int().min(1).max(20)
                    .optional()
                    .describe("Number of questions to generate (default: 5)"),
                domain: z
                    .enum(["predictive", "agile", "hybrid", "all"])
                    .optional()
                    .describe("PMI domain focus (default: all)"),
            }),
        },
        async ({ chapter, document: docName, count = 5, domain = "all" }) => {
            const index = loadIndex(docName);
            // ── BM25 : sélection uniforme de pages sur tout le chapitre ─────
            // Pour un quiz, on veut de la diversité (couvrir tout le chapitre),
            // pas uniquement les passages sur un terme précis.
            // Stratégie : prendre 1 page sur N pour avoir une couverture uniforme.
            const chunks = buildChunks(index, chapter);
            const step = Math.max(1, Math.floor(chunks.length / 10));
            const sampledChunks = chunks.filter((_, i) => i % step === 0).slice(0, 10);
            const context = sampledChunks.map(c => c.text).join("\n\n---\n\n").slice(0, 8_000);

            const domainInstruction = domain === "all"
                ? ""
                : `Focus sur l'approche ${domain === "predictive" ? "Prédictive (PMBOK)" : domain === "agile" ? "Agile (Scrum/Kanban)" : "Hybride"}.`;

            const systemPrompt =
                "Tu es un examinateur PMP certifié (PMI). " +
                "Tu génères des questions d'examen réalistes au format QCM, basées strictement sur le contenu fourni. " +
                "Chaque question doit être situationnelle (cas pratique), avoir 4 options (A/B/C/D), " +
                "une seule bonne réponse, et une explication pédagogique. " +
                domainInstruction;

            const userMessage =
                `Voici le contenu du chapitre ${chapter} de mon cours :\n\n` +
                `${context}\n\n` +
                `---\n\n` +
                `Génère exactement ${count} question${count > 1 ? "s" : ""} QCM style examen PMP basée${count > 1 ? "s" : ""} sur ce contenu.\n\n` +
                `Format pour chaque question :\n` +
                `**Question N** : [énoncé situationnel]\n` +
                `A) [option]\n` +
                `B) [option]\n` +
                `C) [option]\n` +
                `D) [option]\n` +
                `**Réponse correcte** : [lettre]\n` +
                `**Explication** : [pourquoi cette réponse est correcte et pourquoi les autres sont incorrectes]\n\n` +
                `---`;

            const quiz = await chat(systemPrompt, userMessage);

            const header = `Quiz PMP — Chapitre ${chapter} (${count} question${count > 1 ? "s" : ""})\n${"─".repeat(50)}\n\n`;
            return { content: [{ type: "text" as const, text: header + quiz }] };
        },
    );
}
