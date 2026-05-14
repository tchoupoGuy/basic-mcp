"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.INDEX_PATH = void 0;
exports.getIndexPath = getIndexPath;
exports.listIndexedDocuments = listIndexedDocuments;
exports.registerExtractDocumentIndexTool = registerExtractDocumentIndexTool;
exports.registerListDocumentsTool = registerListDocumentsTool;
const zod_1 = require("zod");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const githubVisionService_1 = require("../../../infrastructure/vision/githubVisionService");
const tesseractWorker_1 = require("../../../infrastructure/ocr/tesseractWorker");
const imagePreprocessor_1 = require("../../../infrastructure/ocr/imagePreprocessor");
const documentExtractor_1 = require("../../../infrastructure/extractors/documentExtractor");
/**
 * Extrait le texte d'une image avec Tesseract + prétraitement Sharp.
 *
 * Pipeline mathématique appliqué avant l'OCR :
 *   Niveaux de gris → Upscale (×2 si < 1800px) → Normalize → Unsharp Mask → Binarisation
 *
 * Fallback : si Tesseract échoue et que GITHUB_TOKEN est présent,
 * on bascule sur GPT-4o Vision.
 */
async function extractTextWithFallback(imagePath, language) {
    // ── Priorité 1 : Tesseract + prétraitement Sharp (100% local) ──────────
    try {
        const ocrLang = process.env.OCR_LANGUAGE ?? "fra";
        const { buffer, width, height, scaleFactor } = await (0, imagePreprocessor_1.preprocessForOcr)(imagePath);
        const worker = await (0, tesseractWorker_1.getTesseractWorker)(ocrLang);
        const { data } = await worker.recognize(buffer);
        const text = data.text.trim();
        console.log(`[OCR] ${path.basename(imagePath)} ` +
            `${width}×${height}px (×${scaleFactor}) ` +
            `→ ${text.length} chars | conf. ${Math.round(data.confidence)}%`);
        // Si la confiance est trop faible et GPT-4o est disponible, on utilise le fallback
        if (data.confidence < 40 && process.env.GITHUB_TOKEN) {
            console.warn(`[OCR] Confiance faible (${Math.round(data.confidence)}%) pour "${path.basename(imagePath)}". ` +
                `Fallback GPT-4o...`);
            throw new Error(`Confiance OCR trop faible : ${data.confidence}%`);
        }
        return { text, method: "ocr" };
    }
    catch (ocrErr) {
        const msg = ocrErr instanceof Error ? ocrErr.message : String(ocrErr);
        // ── Priorité 2 : GPT-4o Vision (fallback optionnel) ────────────────
        if (process.env.GITHUB_TOKEN) {
            console.warn(`[OCR] Tesseract échoué pour "${path.basename(imagePath)}" (${msg.slice(0, 60)}). ` +
                `Fallback GPT-4o Vision...`);
            try {
                const text = await (0, githubVisionService_1.extractTextFromImage)(imagePath, language);
                return { text, method: "vision" };
            }
            catch (visionErr) {
                const vMsg = visionErr instanceof Error ? visionErr.message : String(visionErr);
                console.error(`[OCR] GPT-4o Vision également échoué : ${vMsg.slice(0, 80)}`);
                return { text: "", method: "ocr" };
            }
        }
        // Aucun fallback disponible — page ignorée
        console.error(`[OCR] Impossible d'extraire "${path.basename(imagePath)}" : ${msg.slice(0, 80)}`);
        return { text: "", method: "ocr" };
    }
}
/** Répertoire racine où sont stockés tous les index de documents */
const OUTPUT_BASE = path.resolve(process.cwd(), "output");
/**
 * Retourne le chemin de l'index pour un document donné.
 * Le nom est normalisé : lettres, chiffres, tirets et underscores uniquement.
 */
function getIndexPath(docName) {
    const safe = docName.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase().slice(0, 60);
    return path.join(OUTPUT_BASE, safe, "document-index.json");
}
/**
 * Liste tous les documents indexés disponibles.
 * Cherche les sous-dossiers de output/ contenant un document-index.json.
 * Inclut aussi l'ancien fichier output/document-index.json (compatibilité).
 */
function listIndexedDocuments() {
    if (!fs.existsSync(OUTPUT_BASE))
        return [];
    const results = [];
    // Nouveau format : output/{name}/document-index.json
    for (const entry of fs.readdirSync(OUTPUT_BASE, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        const indexPath = path.join(OUTPUT_BASE, entry.name, "document-index.json");
        if (!fs.existsSync(indexPath))
            continue;
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
        }
        catch { /* index corrompu, ignoré */ }
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
        }
        catch { /* ignoré */ }
    }
    return results;
}
/** @deprecated Utiliser getIndexPath() à la place. Conservé pour compatibilité. */
exports.INDEX_PATH = path.join(OUTPUT_BASE, "document-index.json");
/** Retourne le chemin de base des chapitres (lu au moment de l'appel) */
function getBasePath() {
    return process.env.DOCUMENT_BASE_PATH ||
        path.resolve(process.cwd(), "Management_de_project_Logiciels");
}
/**
 * Liste et trie tous les fichiers supportés d'un dossier par ordre alphanumérique.
 * Formats acceptés : images (png/jpg/...), PDF, Word (.docx), texte (.txt/.md/...)
 */
function listSupportedFiles(dir) {
    return fs.readdirSync(dir)
        .filter(f => {
        const full = path.join(dir, f);
        return fs.statSync(full).isFile() && (0, documentExtractor_1.isSupportedFile)(full);
    })
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
function registerExtractDocumentIndexTool(server) {
    server.registerTool("extract-document-index", {
        description: "Extracts text from documents in chapter subfolders and saves the index to output/{name}/document-index.json. " +
            `Supported formats: ${documentExtractor_1.SUPPORTED_EXTENSIONS}. ` +
            "For images: uses Tesseract OCR with Sharp preprocessing (local, offline). " +
            "For PDF (native text): uses pdf-parse (no binary required). " +
            "For Word (.docx): uses mammoth (no binary required). " +
            "For plain text (.txt, .md): reads directly. " +
            "Run once before using ask-document or generate-quiz. Skips already-indexed files unless force=true.",
        inputSchema: zod_1.z.object({
            name: zod_1.z
                .string()
                .optional()
                .describe("Identifier for this document (e.g. 'pmp', 'scrum-guide'). " +
                "Used to name the index file. Derived from basePath folder name if omitted."),
            basePath: zod_1.z
                .string()
                .optional()
                .describe("Absolute path to the folder containing chapter subfolders (Chap1/, Chap2/, ...). " +
                "Overrides the DOCUMENT_BASE_PATH environment variable."),
            chapters: zod_1.z
                .array(zod_1.z.number().int().min(1).max(99))
                .optional()
                .describe("Chapters to index (default: 1-9)"),
            force: zod_1.z
                .boolean()
                .optional()
                .describe("Re-extract even if already indexed (default: false)"),
        }),
    }, async ({ name, basePath: inputBasePath, chapters, force }) => {
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
        let index = { generatedAt: new Date().toISOString(), chapters: {} };
        if (fs.existsSync(indexPath) && !force) {
            try {
                index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
                console.log(`[Index] Index existant chargé (${Object.keys(index.chapters).length} chapitres déjà indexés)`);
            }
            catch {
                console.warn("[Index] Impossible de lire l'index existant, recréation...");
            }
        }
        const results = [];
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
                results.push(`Chapitre ${chapterNum} : aucun fichier supporté — ignoré (formats: ${documentExtractor_1.SUPPORTED_EXTENSIONS})`);
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
                    const result = await (0, documentExtractor_1.extractText)(filePath, ocrLang);
                    text = result.text;
                    method = result.method;
                    // Fallback GPT-4o Vision pour les images à faible confiance
                    if (result.method === "ocr" && text.length < 20 && process.env.GITHUB_TOKEN) {
                        console.warn(`[Index] OCR insuffisant pour "${file}". Fallback GPT-4o Vision...`);
                        try {
                            text = await (0, githubVisionService_1.extractTextFromImage)(filePath, "français");
                            method = "vision";
                        }
                        catch (vErr) {
                            console.error(`[Index] GPT-4o Vision échoué : ${vErr instanceof Error ? vErr.message : String(vErr)}`);
                        }
                    }
                }
                catch (err) {
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
        return { content: [{ type: "text", text: results.join("\n") }] };
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Outil : list-documents
// ─────────────────────────────────────────────────────────────────────────────
function registerListDocumentsTool(server) {
    server.registerTool("list-documents", {
        description: "Lists all documents that have been indexed and are available for study. " +
            "Returns the document names to use in the 'document' parameter of ask-document and generate-quiz.",
        inputSchema: zod_1.z.object({}),
    }, async () => {
        const docs = listIndexedDocuments();
        if (docs.length === 0) {
            return {
                content: [{
                        type: "text",
                        text: "Aucun document indexé. Lancez 'extract-document-index' avec un paramètre 'name' pour indexer un document.",
                    }],
            };
        }
        const lines = [
            `${docs.length} document(s) disponible(s) :\n`,
            ...docs.map(d => `• ${d.name}\n` +
                `  Chapitres : ${d.chapters} (n°: ${d.chapterNumbers.join(", ")})   |   Indexé le : ${d.generatedAt.slice(0, 10)}\n` +
                `  Index : ${d.indexPath}`),
            `\nUtilisez le paramètre document="<name>" dans ask-document et generate-quiz.`,
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
    });
}
