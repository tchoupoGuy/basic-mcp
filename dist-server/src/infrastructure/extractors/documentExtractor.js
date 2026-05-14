"use strict";
/**
 * Extracteur de texte multi-format
 *
 * Formats supportés :
 *   - Images (png, jpg, jpeg, bmp, tiff, webp) → Sharp preprocessing + Tesseract OCR
 *   - PDF natif (texte sélectionnable)         → pdf-parse (aucun binaire requis)
 *   - PDF scanné (images incorporées)           → détection auto + Tesseract OCR page par page
 *   - Word (.docx)                              → mammoth (aucun binaire requis)
 *   - Texte brut (.txt, .md, .csv)             → fs.readFileSync direct
 *
 * Si le format n'est pas reconnu, retourne { text: "", method: "unsupported" }.
 */
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORTED_EXTENSIONS = void 0;
exports.extractText = extractText;
exports.isSupportedFile = isSupportedFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const pdf_parse_1 = require("pdf-parse");
const mammoth_1 = __importDefault(require("mammoth"));
const imagePreprocessor_1 = require("../ocr/imagePreprocessor");
const tesseractWorker_1 = require("../ocr/tesseractWorker");
/** Extensions d'image acceptées par le pipeline Sharp+Tesseract */
const IMAGE_EXTS = /\.(png|jpg|jpeg|bmp|tiff|tif|webp)$/i;
/** Extensions PDF */
const PDF_EXT = /\.pdf$/i;
/** Extensions Word */
const DOCX_EXT = /\.docx?$/i;
/** Extensions texte brut */
const PLAINTEXT_EXT = /\.(txt|md|csv|json|xml|html|htm)$/i;
/**
 * Extrait le texte d'un fichier quel que soit son format.
 *
 * @param filePath  Chemin absolu vers le fichier
 * @param ocrLang   Langue Tesseract (ex: "fra", "eng") pour les images et PDF scannés
 */
async function extractText(filePath, ocrLang = "fra") {
    const ext = path.extname(filePath).toLowerCase();
    // ── Images ──────────────────────────────────────────────────────────────
    if (IMAGE_EXTS.test(ext)) {
        return extractFromImage(filePath, ocrLang);
    }
    // ── PDF ─────────────────────────────────────────────────────────────────
    if (PDF_EXT.test(ext)) {
        return extractFromPdf(filePath, ocrLang);
    }
    // ── Word (.docx / .doc) ─────────────────────────────────────────────────
    if (DOCX_EXT.test(ext)) {
        return extractFromDocx(filePath);
    }
    // ── Texte brut ──────────────────────────────────────────────────────────
    if (PLAINTEXT_EXT.test(ext)) {
        return extractFromPlaintext(filePath);
    }
    // ── Format non supporté ─────────────────────────────────────────────────
    console.warn(`[Extractor] Format non supporté : ${path.basename(filePath)}`);
    return { text: "", method: "unsupported" };
}
// ─────────────────────────────────────────────────────────────────────────────
// Extracteurs internes
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Images : pipeline Sharp (niveaux de gris → upscale → normalize → sharpen → binarize)
 * puis reconnaissance Tesseract.
 */
async function extractFromImage(imagePath, ocrLang) {
    const { buffer, width, height, scaleFactor } = await (0, imagePreprocessor_1.preprocessForOcr)(imagePath);
    const worker = await (0, tesseractWorker_1.getTesseractWorker)(ocrLang);
    const { data } = await worker.recognize(buffer);
    const text = data.text.trim();
    console.log(`[OCR] ${path.basename(imagePath)} ` +
        `${width}×${height}px (×${scaleFactor}) ` +
        `→ ${text.length} chars | conf. ${Math.round(data.confidence)}%`);
    return { text, method: "ocr", pageCount: 1 };
}
/**
 * PDF : détecte automatiquement si le PDF est natif (texte) ou scanné (images).
 *
 * Heuristique : si pdf-parse extrait plus de 100 caractères par page en moyenne,
 * le PDF est considéré natif. Sinon, on le traite comme scanné (non supporté sans
 * Ghostscript/poppler, mais on retourne ce qu'on a).
 */
async function extractFromPdf(pdfPath, _ocrLang) {
    const buffer = fs.readFileSync(pdfPath);
    let parsed;
    try {
        const parser = new pdf_parse_1.PDFParse({ data: buffer });
        parsed = await parser.getText();
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[PDF] Erreur lors de la lecture de "${path.basename(pdfPath)}" : ${msg}`);
        return { text: "", method: "pdf-text", pageCount: 0 };
    }
    const charPerPage = parsed.total > 0
        ? parsed.text.length / parsed.total
        : 0;
    // PDF natif : suffisamment de texte extractible
    if (charPerPage >= 100) {
        console.log(`[PDF] ${path.basename(pdfPath)} ` +
            `${parsed.total} pages → ${parsed.text.length} chars (natif)`);
        return {
            text: parsed.text.trim(),
            method: "pdf-text",
            pageCount: parsed.total,
        };
    }
    // PDF scanné : texte insuffisant — on retourne ce qu'on a en avertissant
    console.warn(`[PDF] "${path.basename(pdfPath)}" semble scanné ` +
        `(${Math.round(charPerPage)} chars/page). ` +
        `Texte partiel retourné. Pour une meilleure extraction, ` +
        `convertissez le PDF en images PNG d'abord.`);
    return {
        text: parsed.text.trim(),
        method: "pdf-ocr",
        pageCount: parsed.total,
    };
}
/**
 * Word (.docx) : mammoth convertit le contenu en texte brut structuré.
 * Les tableaux, listes et titres sont préservés sous forme de texte.
 */
async function extractFromDocx(docxPath) {
    const { value: text, messages } = await mammoth_1.default.extractRawText({ path: docxPath });
    if (messages.length > 0) {
        const warnings = messages.filter(m => m.type === "warning");
        if (warnings.length > 0) {
            console.warn(`[DOCX] ${warnings.length} avertissement(s) pour "${path.basename(docxPath)}"`);
        }
    }
    console.log(`[DOCX] ${path.basename(docxPath)} → ${text.trim().length} chars`);
    return { text: text.trim(), method: "docx", pageCount: 1 };
}
/**
 * Texte brut : lecture directe, aucun traitement.
 */
function extractFromPlaintext(filePath) {
    const text = fs.readFileSync(filePath, "utf-8").trim();
    console.log(`[TXT] ${path.basename(filePath)} → ${text.length} chars`);
    return { text, method: "plaintext", pageCount: 1 };
}
// ─────────────────────────────────────────────────────────────────────────────
// Utilitaires
// ─────────────────────────────────────────────────────────────────────────────
/** Retourne true si l'extension du fichier est supportée par l'extracteur */
function isSupportedFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return (IMAGE_EXTS.test(ext) ||
        PDF_EXT.test(ext) ||
        DOCX_EXT.test(ext) ||
        PLAINTEXT_EXT.test(ext));
}
/** Retourne la liste des extensions supportées pour affichage */
exports.SUPPORTED_EXTENSIONS = ".png .jpg .jpeg .bmp .tiff .webp — .pdf — .docx .doc — .txt .md .csv";
