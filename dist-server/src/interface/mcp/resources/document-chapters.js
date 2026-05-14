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
exports.registerDocumentChaptersResource = registerDocumentChaptersResource;
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
const mcp_1 = require("@modelcontextprotocol/sdk/server/mcp");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const tesseractWorker_1 = require("../../../infrastructure/ocr/tesseractWorker");
/** Extensions d'image acceptées pour l'OCR */
const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|bmp|tiff|tif|webp)$/i;
/**
 * Retourne le chemin de base des chapitres.
 * Lire process.env à chaque appel (et non au chargement du module)
 * garantit que dotenv a eu le temps d'injecter les variables.
 */
function getBasePath() {
    return process.env.DOCUMENT_BASE_PATH ||
        path.resolve(process.cwd(), "Management_de_project_Logiciels");
}
/**
 * Construit le chemin absolu du dossier d'un chapitre.
 * Valide que le numéro est compris entre 1 et 9.
 */
function getChapterDir(chapter) {
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
function listImageFiles(dir) {
    return fs.readdirSync(dir)
        .filter(f => IMAGE_EXTENSIONS.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
function registerDocumentChaptersResource(server) {
    const template = new mcp_1.ResourceTemplate("chapters://{chapter}", { list: undefined });
    server.registerResource("document-chapter", template, {
        description: "Extracts text from chapter images using OCR (tesseract.js). " +
            "Use URI pattern chapters://{n} where n is 1–9. " +
            "The base folder is configured via DOCUMENT_BASE_PATH (default: 'Management_de_project_Logiciels/' in cwd).",
        mimeType: "text/plain",
    }, async (uri, variables) => {
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
            throw new Error(`Chapter ${chapter} folder not found at: ${safeDir}\n` +
                `Set DOCUMENT_BASE_PATH in your .env file to point to the correct base folder.`);
        }
        // Vérifier qu'il y a bien des images dans le dossier
        const imageFiles = listImageFiles(safeDir);
        if (imageFiles.length === 0) {
            throw new Error(`No image files found in chapter ${chapter} (${safeDir})`);
        }
        // Récupérer le worker singleton (déjà initialisé au boot du serveur — aucun téléchargement)
        const ocrLanguage = process.env.OCR_LANGUAGE || "fra";
        const worker = await (0, tesseractWorker_1.getTesseractWorker)(ocrLanguage);
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
    });
}
