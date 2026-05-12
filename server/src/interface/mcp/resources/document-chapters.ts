/**
 * Ressource MCP : document-chapter
 *
 * Expose le contenu OCR d'un chapitre via l'URI pattern : chapters://{n}
 * (n = numéro du chapitre, de 1 à 9)
 *
 * Les images de chaque chapitre doivent être organisées ainsi :
 *   <DOCUMENT_BASE_PATH>/
 *     Chap1/  ← images du chapitre 1 (png, jpg, tiff…)
 *     Chap2/
 *     ...
 *     Chap9/
 *
 * Configuration via le fichier .env :
 *   DOCUMENT_BASE_PATH  = chemin absolu vers le dossier racine des chapitres
 *   OCR_LANGUAGE        = code langue Tesseract (ex: fra, eng, fra+eng)
 */
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp";
import * as fs from "fs";
import * as path from "path";
import { getTesseractWorker } from "../../../infrastructure/ocr/tesseractWorker";

/** Extensions d'image acceptées pour l'OCR */
const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|bmp|tiff|tif|webp)$/i;

/**
 * Retourne le chemin de base des chapitres.
 * Lire process.env à chaque appel (et non au chargement du module)
 * garantit que dotenv a eu le temps d'injecter les variables.
 */
function getBasePath(): string {
    return process.env.DOCUMENT_BASE_PATH ||
        path.resolve(process.cwd(), "Management_de_project_Logiciels");
}

/**
 * Construit le chemin absolu du dossier d'un chapitre.
 * Valide que le numéro est compris entre 1 et 9.
 */
function getChapterDir(chapter: string): string {
    const chapterNum = parseInt(chapter, 10);
    if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > 9) {
        throw new Error("Chapter must be a number between 1 and 9");
    }
    return path.join(getBasePath(), `Chap${chapterNum}`);
}

/**
 * Liste et trie les fichiers image d'un dossier par ordre alphanumérique.
 * Le tri naturel (numeric: true) garantit l'ordre page 1, 2, 10… et non 1, 10, 2.
 */
function listImageFiles(dir: string): string[] {
    return fs.readdirSync(dir)
        .filter(f => IMAGE_EXTENSIONS.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function registerDocumentChaptersResource(server: McpServer) {
    const template = new ResourceTemplate("chapters://{chapter}", { list: undefined });

    server.registerResource(
        "document-chapter",
        template,
        {
            description:
                "Extracts text from chapter images using OCR (tesseract.js). " +
                "Use URI pattern chapters://{n} where n is 1–9. " +
                "The base folder is configured via DOCUMENT_BASE_PATH (default: 'Management_de_project_Logiciels/' in cwd).",
            mimeType: "text/plain",
        },
        async (uri: URL, variables: Record<string, string | string[]>) => {
            // Tesseract peut retourner un tableau si le paramètre est répété — on prend le premier
            const chapter = Array.isArray(variables.chapter)
                ? variables.chapter[0]
                : variables.chapter;

            const chapterDir = getChapterDir(chapter);
            const safeDir = path.resolve(chapterDir);
            const safeBase = path.resolve(getBasePath());

            // Sécurité : empêcher un path traversal (ex: chapters://../secret)
            if (!safeDir.startsWith(safeBase + path.sep) && safeDir !== safeBase) {
                throw new Error("Access denied: path is outside the document directory");
            }

            // Vérifier que le dossier du chapitre existe réellement
            if (!fs.existsSync(safeDir)) {
                throw new Error(
                    `Chapter ${chapter} folder not found at: ${safeDir}\n` +
                    `Set DOCUMENT_BASE_PATH in your .env file to point to the correct base folder.`
                );
            }

            // Vérifier qu'il y a bien des images dans le dossier
            const imageFiles = listImageFiles(safeDir);
            if (imageFiles.length === 0) {
                throw new Error(`No image files found in chapter ${chapter} (${safeDir})`);
            }

            // Récupérer le worker singleton (déjà initialisé au boot du serveur — aucun téléchargement)
            const ocrLanguage = process.env.OCR_LANGUAGE || "fra";
            const worker = await getTesseractWorker(ocrLanguage);

            let fullText = `=== CHAPITRE ${chapter} ===\n\n`;

            // Parcourir chaque image et extraire le texte via OCR
            for (const imageFile of imageFiles) {
                const imagePath = path.join(safeDir, imageFile);
                const { data: { text } } = await worker.recognize(imagePath);
                if (text.trim()) {
                    fullText += text.trim() + "\n\n";
                }
            }

            // Ne pas terminer le worker — il est réutilisé par les requêtes suivantes

            return {
                contents: [{
                    uri: uri.href,
                    mimeType: "text/plain",
                    text: fullText,
                }],
            };
        },
    );
}
