/**
 * Outil MCP : extract-document-index
 *
 * Extrait le texte de tous les chapitres et sauvegarde
 * le résultat dans output/document-index.json.
 *
 * Stratégie d'extraction (priorité décroissante) :
 *   1. Tesseract OCR local (100% offline, zéro coût)
 *      - Prétraitement Sharp : niveaux de gris → upscale → normalize → sharpen → binarize
 *   2. GPT-4o Vision via GitHub Models (fallback si GITHUB_TOKEN présent)
 *
 * Ce fichier JSON est la "base de connaissances" utilisée ensuite par
 * les outils ask-document et generate-quiz sans avoir à relancer l'OCR.
 *
 * Structure du fichier :
 * {
 *   "generatedAt": "2026-05-11T...",
 *   "chapters": {
 *     "1": { "pages": [{ "file": "p1.png", "text": "..." }, ...] },
 *     "2": { ... },
 *     ...
 *   }
 * }
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { extractTextFromImage } from "../../../infrastructure/vision/githubVisionService";
import { getTesseractWorker } from "../../../infrastructure/ocr/tesseractWorker";
import { preprocessForOcr } from "../../../infrastructure/ocr/imagePreprocessor";
import { extractText, isSupportedFile, SUPPORTED_EXTENSIONS } from "../../../infrastructure/extractors/documentExtractor";

/**
 * Extrait le texte d'une image avec Tesseract + prétraitement Sharp.
 *
 * Pipeline mathématique appliqué avant l'OCR :
 *   Niveaux de gris → Upscale (×2 si < 1800px) → Normalize → Unsharp Mask → Binarisation
 *
 * Fallback : si Tesseract a une confiance < 60%, bascule automatiquement sur LLaVA Vision
 * via Ollama (modèle local, gratuit). Prérequis : Ollama lancé + `ollama pull llava`.
 */
async function extractTextWithFallback(imagePath: string, language: string): Promise<{ text: string; method: "vision" | "ocr" }> {
    // ── Priorité 1 : Tesseract + prétraitement Sharp (100% local) ──────────
    try {
        const ocrLang = process.env.OCR_LANGUAGE ?? "fra";
        const { buffer, width, height, scaleFactor } = await preprocessForOcr(imagePath);
        const worker = await getTesseractWorker(ocrLang);
        const { data } = await worker.recognize(buffer);
        const text = data.text.trim();

        console.log(
            `[OCR] ${path.basename(imagePath)} ` +
            `${width}×${height}px (×${scaleFactor}) ` +
            `→ ${text.length} chars | conf. ${Math.round(data.confidence)}%`,
        );

        // Si la confiance Tesseract est trop faible, on bascule sur LLaVA Vision
        if (data.confidence < 60) {
            console.warn(
                `[OCR] Confiance faible (${Math.round(data.confidence)}%) pour "${path.basename(imagePath)}". ` +
                `Fallback LLaVA Vision...`,
            );
            throw new Error(`Confiance OCR trop faible : ${data.confidence}%`);
        }

        return { text, method: "ocr" };
    } catch (ocrErr) {
        const msg = ocrErr instanceof Error ? ocrErr.message : String(ocrErr);

        // ── Priorité 2 : LLaVA Vision via Ollama (fallback automatique) ────
        console.warn(
            `[OCR] Tesseract insuffisant pour "${path.basename(imagePath)}" (${msg.slice(0, 60)}). ` +
            `Fallback LLaVA Vision...`,
        );
        try {
            const text = await extractTextFromImage(imagePath, language);
            return { text, method: "vision" };
        } catch (visionErr) {
            const vMsg = visionErr instanceof Error ? visionErr.message : String(visionErr);
            console.error(`[OCR] LLaVA Vision échoué (Ollama lancé ? ollama pull llava ?) : ${vMsg.slice(0, 80)}`);
            return { text: "", method: "ocr" };
        }
    }
}

/** Répertoire racine où sont stockés tous les index de documents */
const OUTPUT_BASE = path.resolve(process.cwd(), "output");

/**
 * Retourne le chemin de l'index pour un document donné.
 * Le nom est normalisé : lettres, chiffres, tirets et underscores uniquement.
 */
export function getIndexPath(docName: string): string {
    const safe = docName.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase().slice(0, 60);
    return path.join(OUTPUT_BASE, safe, "document-index.json");
}

/**
 * Liste tous les documents indexés disponibles.
 * Cherche les sous-dossiers de output/ contenant un document-index.json.
 * Inclut aussi l'ancien fichier output/document-index.json (compatibilité).
 */
export function listIndexedDocuments(): Array<{ name: string; indexPath: string; generatedAt: string; chapters: number; chapterNumbers: number[] }> {
    if (!fs.existsSync(OUTPUT_BASE)) return [];
    const results: Array<{ name: string; indexPath: string; generatedAt: string; chapters: number; chapterNumbers: number[] }> = [];

    // Nouveau format : output/{name}/document-index.json
    for (const entry of fs.readdirSync(OUTPUT_BASE, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const indexPath = path.join(OUTPUT_BASE, entry.name, "document-index.json");
        if (!fs.existsSync(indexPath)) continue;
        try {
            const idx = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
            const chapterNumbers = Object.keys(idx.chapters ?? {}).map(k => parseInt(k)).sort((a, b) => a - b);
            results.push({
                name: entry.name,
                indexPath,
                generatedAt: idx.generatedAt ?? "unknown",
                chapters: chapterNumbers.length,
                chapterNumbers,
            });
        } catch { /* index corrompu, ignoré */ }
    }

    // Ancien format : output/document-index.json (rétrocompatibilité)
    const legacyPath = path.join(OUTPUT_BASE, "document-index.json");
    if (fs.existsSync(legacyPath) && !results.some(r => r.name === "legacy")) {
        try {
            const idx = JSON.parse(fs.readFileSync(legacyPath, "utf-8"));
            const chapterNumbers = Object.keys(idx.chapters ?? {}).map(k => parseInt(k)).sort((a, b) => a - b);
            results.push({
                name: "legacy",
                indexPath: legacyPath,
                generatedAt: idx.generatedAt ?? "unknown",
                chapters: chapterNumbers.length,
                chapterNumbers,
            });
        } catch { /* ignoré */ }
    }

    return results;
}

/** @deprecated Utiliser getIndexPath() à la place. Conservé pour compatibilité. */
export const INDEX_PATH = path.join(OUTPUT_BASE, "document-index.json");

/** Retourne le chemin de base des chapitres (lu au moment de l'appel) */
function getBasePath(): string {
    return process.env.DOCUMENT_BASE_PATH ||
        path.resolve(process.cwd(), "Management_de_project_Logiciels");
}

/**
 * Liste et trie tous les fichiers supportés d'un dossier par ordre alphanumérique.
 * Formats acceptés : images (png/jpg/...), PDF, Word (.docx), texte (.txt/.md/...)
 */
function listSupportedFiles(dir: string): string[] {
    return fs.readdirSync(dir)
        .filter(f => {
            const full = path.join(dir, f);
            return fs.statSync(full).isFile() && isSupportedFile(full);
        })
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function registerExtractDocumentIndexTool(server: McpServer) {
    server.registerTool(
        "extract-document-index",
        {
            description:
                "Extracts text from documents in chapter subfolders and saves the index to output/{name}/document-index.json. " +
                `Supported formats: ${SUPPORTED_EXTENSIONS}. ` +
                "For images: uses Tesseract OCR with Sharp preprocessing (local, offline). " +
                "For PDF (native text): uses pdf-parse (no binary required). " +
                "For Word (.docx): uses mammoth (no binary required). " +
                "For plain text (.txt, .md): reads directly. " +
                "Run once before using ask-document or generate-quiz. Skips already-indexed files unless force=true.",
            inputSchema: z.object({
                name: z
                    .string()
                    .optional()
                    .describe(
                        "Identifier for this document (e.g. 'pmp', 'scrum-guide'). " +
                        "Used to name the index file. Derived from basePath folder name if omitted."
                    ),
                basePath: z
                    .string()
                    .optional()
                    .describe(
                        "Absolute path to the folder containing chapter subfolders (Chap1/, Chap2/, ...). " +
                        "Overrides the DOCUMENT_BASE_PATH environment variable."
                    ),
                chapters: z
                    .array(z.number().int().min(1).max(99))
                    .optional()
                    .describe("Chapters to index (default: 1-9)"),
                force: z
                    .boolean()
                    .optional()
                    .describe("Re-extract even if already indexed (default: false)"),
            }),
        },
        async ({ name, basePath: inputBasePath, chapters, force }) => {
            const chapterList = chapters ?? [1, 2, 3, 4, 5, 6, 7, 8, 9];
            const documentBasePath = inputBasePath ?? getBasePath();
            const safeBase = path.resolve(documentBasePath);

            // Déterminer le nom du document (pour nommer l'index)
            const docName = name ?? path.basename(safeBase).replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase().slice(0, 60);
            const indexPath = getIndexPath(docName);

            // Créer le dossier output/{docName}/ si nécessaire
            const outputDir = path.dirname(indexPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Charger l'index existant ou créer un nouveau
            let index: {
                generatedAt: string;
                chapters: Record<string, { pages: Array<{ file: string; text: string }> }>;
            } = { generatedAt: new Date().toISOString(), chapters: {} };

            if (fs.existsSync(indexPath) && !force) {
                try {
                    index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
                    console.log(`[Index] Index existant chargé (${Object.keys(index.chapters).length} chapitres déjà indexés)`);
                } catch {
                    console.warn("[Index] Impossible de lire l'index existant, recréation...");
                }
            }

            const results: string[] = [];
            let newPages = 0;

            for (const chapterNum of chapterList) {
                const chapterDir = path.join(documentBasePath, `Chap${chapterNum}`);
                const safeDir = path.resolve(chapterDir);

                // Sécurité : rester dans DOCUMENT_BASE_PATH
                if (!safeDir.startsWith(safeBase + path.sep)) {
                    results.push(`Chapitre ${chapterNum} : chemin invalide — ignoré`);
                    continue;
                }

                if (!fs.existsSync(safeDir)) {
                    results.push(`Chapitre ${chapterNum} : dossier absent — ignoré`);
                    continue;
                }

                const allFiles = listSupportedFiles(safeDir);
                if (allFiles.length === 0) {
                    results.push(`Chapitre ${chapterNum} : aucun fichier supporté — ignoré (formats: ${SUPPORTED_EXTENSIONS})`);
                    continue;
                }

                const key = String(chapterNum);
                if (!index.chapters[key]) {
                    index.chapters[key] = { pages: [] };
                }

                // Index des fichiers déjà traités pour ce chapitre
                const alreadyIndexed = new Set(index.chapters[key].pages.map(p => p.file));

                // Filtrer les fichiers non encore indexés
                const pendingFiles = force
                    ? allFiles
                    : allFiles.filter(f => !alreadyIndexed.has(f));

                if (pendingFiles.length === 0) {
                    results.push(`Chapitre ${chapterNum} : déjà indexé (${allFiles.length} fichiers) — ignoré`);
                    continue;
                }

                if (force) {
                    index.chapters[key] = { pages: [] };
                }

                console.log(`[Index] Indexation du chapitre ${chapterNum} (${pendingFiles.length}/${allFiles.length} fichiers restants)...`);

                const ocrLang = process.env.OCR_LANGUAGE ?? "fra";

                for (const file of pendingFiles) {
                    const filePath = path.join(safeDir, file);
                    let text = "";
                    let method = "unsupported";

                    try {
                        const result = await extractText(filePath, ocrLang);
                        text = result.text;
                        method = result.method;

                        // Fallback GPT-4o Vision pour les images à faible confiance
                        if (result.method === "ocr" && text.length < 20 && process.env.GITHUB_TOKEN) {
                            console.warn(`[Index] OCR insuffisant pour "${file}". Fallback GPT-4o Vision...`);
                            try {
                                text = await extractTextFromImage(filePath, "français");
                                method = "vision";
                            } catch (vErr) {
                                console.error(`[Index] GPT-4o Vision échoué : ${vErr instanceof Error ? vErr.message : String(vErr)}`);
                            }
                        }
                    } catch (err) {
                        console.error(`[Index] Erreur sur "${file}" : ${err instanceof Error ? err.message : String(err)}`);
                    }

                    index.chapters[key].pages.push({ file, text });
                    newPages++;

                    // Sauvegarder après chaque fichier pour ne pas perdre la progression
                    index.generatedAt = new Date().toISOString();
                    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf-8");
                    console.log(`[Index] Sauvegarde intermédiaire après "${file}" (${method})`);
                }

                results.push(`Chapitre ${chapterNum} : ${pendingFiles.length} fichier(s) indexé(s) ✓`);
            }

            // Sauvegarder (déjà sauvegardé au fil des images, mais on rafraîchit la date)
            index.generatedAt = new Date().toISOString();
            fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf-8");

            results.push(`\nDocument : ${docName}`);
            results.push(`Index sauvegardé : ${indexPath}`);
            results.push(`Nouvelles pages extraites : ${newPages}`);
            results.push(`Chapitres dans l'index : ${Object.keys(index.chapters).join(", ")}`);

            return { content: [{ type: "text" as const, text: results.join("\n") }] };
        },
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Outil : list-documents
// ─────────────────────────────────────────────────────────────────────────────

export function registerListDocumentsTool(server: McpServer) {
    server.registerTool(
        "list-documents",
        {
            description:
                "Lists all documents that have been indexed and are available for study. " +
                "Returns the document names to use in the 'document' parameter of ask-document and generate-quiz.",
            inputSchema: z.object({}),
        },
        async () => {
            const docs = listIndexedDocuments();
            if (docs.length === 0) {
                return {
                    content: [{
                        type: "text" as const,
                        text: "Aucun document indexé. Lancez 'extract-document-index' avec un paramètre 'name' pour indexer un document.",
                    }],
                };
            }

            const lines = [
                `${docs.length} document(s) disponible(s) :\n`,
                ...docs.map(d =>
                    `• ${d.name}\n` +
                    `  Chapitres : ${d.chapters} (n°: ${d.chapterNumbers.join(", ")})   |   Indexé le : ${d.generatedAt.slice(0, 10)}\n` +
                    `  Index : ${d.indexPath}`,
                ),
                `\nUtilisez le paramètre document="<name>" dans ask-document et generate-quiz.`,
            ];

            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
        },
    );
}
