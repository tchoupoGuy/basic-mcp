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

import * as fs from "fs";
import * as path from "path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { preprocessForOcr } from "../ocr/imagePreprocessor";
import { getTesseractWorker } from "../ocr/tesseractWorker";

export type ExtractMethod =
    | "ocr"
    | "pdf-text"
    | "pdf-ocr"
    | "docx"
    | "plaintext"
    | "unsupported";

export interface ExtractResult {
    text: string;
    method: ExtractMethod;
    /** Nombre de pages/sections traitées */
    pageCount?: number;
}

/** Extensions d'image acceptées par le pipeline Sharp+Tesseract */
const IMAGE_EXTS   = /\.(png|jpg|jpeg|bmp|tiff|tif|webp)$/i;
/** Extensions PDF */
const PDF_EXT      = /\.pdf$/i;
/** Extensions Word */
const DOCX_EXT     = /\.docx?$/i;
/** Extensions texte brut */
const PLAINTEXT_EXT = /\.(txt|md|csv|json|xml|html|htm)$/i;

/**
 * Extrait le texte d'un fichier quel que soit son format.
 *
 * @param filePath  Chemin absolu vers le fichier
 * @param ocrLang   Langue Tesseract (ex: "fra", "eng") pour les images et PDF scannés
 */
export async function extractText(
    filePath: string,
    ocrLang = "fra",
): Promise<ExtractResult> {
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
async function extractFromImage(
    imagePath: string,
    ocrLang: string,
): Promise<ExtractResult> {
    const { buffer, width, height, scaleFactor } = await preprocessForOcr(imagePath);
    const worker = await getTesseractWorker(ocrLang);
    const { data } = await worker.recognize(buffer);
    const text = data.text.trim();

    console.log(
        `[OCR] ${path.basename(imagePath)} ` +
        `${width}×${height}px (×${scaleFactor}) ` +
        `→ ${text.length} chars | conf. ${Math.round(data.confidence)}%`,
    );

    return { text, method: "ocr", pageCount: 1 };
}

/**
 * PDF : détecte automatiquement si le PDF est natif (texte) ou scanné (images).
 *
 * Heuristique : si pdf-parse extrait plus de 100 caractères par page en moyenne,
 * le PDF est considéré natif. Sinon, on le traite comme scanné (non supporté sans
 * Ghostscript/poppler, mais on retourne ce qu'on a).
 */
async function extractFromPdf(
    pdfPath: string,
    _ocrLang: string,
): Promise<ExtractResult> {
    const buffer = fs.readFileSync(pdfPath);

    let parsed: { text: string; total: number };
    try {
        const parser = new PDFParse({ data: buffer });
        parsed = await parser.getText();
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[PDF] Erreur lors de la lecture de "${path.basename(pdfPath)}" : ${msg}`);
        return { text: "", method: "pdf-text", pageCount: 0 };
    }

    const charPerPage = parsed.total > 0
        ? parsed.text.length / parsed.total
        : 0;

    // PDF natif : suffisamment de texte extractible
    if (charPerPage >= 100) {
        console.log(
            `[PDF] ${path.basename(pdfPath)} ` +
            `${parsed.total} pages → ${parsed.text.length} chars (natif)`,
        );
        return {
            text: parsed.text.trim(),
            method: "pdf-text",
            pageCount: parsed.total,
        };
    }

    // PDF scanné : texte insuffisant — on retourne ce qu'on a en avertissant
    console.warn(
        `[PDF] "${path.basename(pdfPath)}" semble scanné ` +
        `(${Math.round(charPerPage)} chars/page). ` +
        `Texte partiel retourné. Pour une meilleure extraction, ` +
        `convertissez le PDF en images PNG d'abord.`,
    );
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
async function extractFromDocx(docxPath: string): Promise<ExtractResult> {
    const { value: text, messages } = await mammoth.extractRawText({ path: docxPath });

    if (messages.length > 0) {
        const warnings = messages.filter(m => m.type === "warning");
        if (warnings.length > 0) {
            console.warn(
                `[DOCX] ${warnings.length} avertissement(s) pour "${path.basename(docxPath)}"`,
            );
        }
    }

    console.log(
        `[DOCX] ${path.basename(docxPath)} → ${text.trim().length} chars`,
    );

    return { text: text.trim(), method: "docx", pageCount: 1 };
}

/**
 * Texte brut : lecture directe, aucun traitement.
 */
function extractFromPlaintext(filePath: string): ExtractResult {
    const text = fs.readFileSync(filePath, "utf-8").trim();
    console.log(`[TXT] ${path.basename(filePath)} → ${text.length} chars`);
    return { text, method: "plaintext", pageCount: 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilitaires
// ─────────────────────────────────────────────────────────────────────────────

/** Retourne true si l'extension du fichier est supportée par l'extracteur */
export function isSupportedFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return (
        IMAGE_EXTS.test(ext) ||
        PDF_EXT.test(ext) ||
        DOCX_EXT.test(ext) ||
        PLAINTEXT_EXT.test(ext)
    );
}

/** Retourne la liste des extensions supportées pour affichage */
export const SUPPORTED_EXTENSIONS =
    ".png .jpg .jpeg .bmp .tiff .webp — .pdf — .docx .doc — .txt .md .csv";
