/**
 * Prétraitement mathématique d'image pour améliorer la qualité OCR Tesseract
 *
 * Pipeline de transformations appliquées (dans l'ordre) :
 *
 *   1. Niveaux de gris
 *      RGB → Y = 0.299·R + 0.587·G + 0.114·B
 *
 *   2. Redimensionnement (300 DPI cible)
 *      Si l'image fait moins de 1800px en largeur, on l'upscale × 2
 *      pour atteindre un DPI effectif suffisant pour Tesseract.
 *      Règle empirique : Tesseract fonctionne mieux à ≥ 300 DPI.
 *
 *   3. Normalisation des niveaux (Auto-levels)
 *      Étire l'histogramme pour couvrir [0, 255] :
 *        pixel_out = (pixel_in - min) × 255 / (max - min)
 *      → Améliore le contraste global sans perte d'information.
 *
 *   4. Accentuation (Unsharp Mask)
 *      Rend les bords des caractères plus nets :
 *        I_sharp = I + σ × (I - GaussianBlur(I))
 *      Paramètres : sigma=1.5, flat=1.0, jagged=2.0
 *
 *   5. Binarisation (seuillage de Sauvola - approximé par threshold Sharp)
 *      Convertit chaque pixel en noir (0) ou blanc (255).
 *      Un fond blanc uniforme réduit les artefacts de segmentation Tesseract.
 *
 *   6. Sortie PNG non compressé
 *      Le PNG évite les artefacts JPEG qui perturbent la reconnaissance.
 *      Le buffer est passé directement à Tesseract (pas de fichier temporaire).
 */

import sharp from "sharp";
import * as fs from "fs";

/** DPI cible pour Tesseract — en dessous, la précision chute fortement */
const TARGET_DPI_PX = 1800; // ~300 DPI pour un document A4 scanné

/** Paramètres d'accentuation (Unsharp Mask) */
const SHARPEN_SIGMA    = 1.5;
const SHARPEN_FLAT     = 1.0;
const SHARPEN_JAGGED   = 2.0;

/** Seuil de binarisation (0-255). 128 = milieu. Plus bas = plus de noir. */
const BINARIZE_THRESHOLD = 128;

/**
 * Résultat du prétraitement
 */
export interface PreprocessResult {
    /** Buffer PNG prêt à être passé à Tesseract */
    buffer: Buffer;
    /** Largeur finale en pixels */
    width: number;
    /** Hauteur finale en pixels */
    height: number;
    /** Facteur d'upscale appliqué (1.0 = pas de redimensionnement) */
    scaleFactor: number;
}

/**
 * Applique le pipeline de prétraitement mathématique à une image.
 *
 * @param imagePath  Chemin absolu vers le fichier image source
 * @returns          Buffer PNG prétraité + métadonnées
 *
 * @example
 * const { buffer } = await preprocessForOcr("/path/to/scan.png");
 * const worker = await getTesseractWorker("fra");
 * const { data } = await worker.recognize(buffer);
 */
export async function preprocessForOcr(imagePath: string): Promise<PreprocessResult> {
    // Lire les métadonnées de l'image originale
    const meta = await sharp(imagePath).metadata();
    const originalWidth  = meta.width  ?? 800;
    const originalHeight = meta.height ?? 600;

    // ── Étape 2 : calcul du facteur d'upscale ────────────────────────────────
    // Si l'image est trop petite (< TARGET_DPI_PX px), on l'agrandit × 2
    // pour que Tesseract ait suffisamment de pixels par caractère.
    const scaleFactor = originalWidth < TARGET_DPI_PX ? 2.0 : 1.0;
    const targetWidth  = Math.round(originalWidth  * scaleFactor);
    const targetHeight = Math.round(originalHeight * scaleFactor);

    const buffer = await sharp(imagePath)
        // ── Étape 1 : niveaux de gris ────────────────────────────────────────
        // Y = 0.299·R + 0.587·G + 0.114·B (pondération perception humaine)
        .greyscale()

        // ── Étape 2 : upscale si nécessaire (Lanczos 3) ──────────────────────
        // Lanczos est le meilleur interpolateur pour agrandir du texte
        .resize(targetWidth, targetHeight, {
            kernel: sharp.kernel.lanczos3,
            withoutEnlargement: false,
        })

        // ── Étape 3 : normalisation automatique des niveaux ──────────────────
        // Étire l'histogramme pour couvrir [0, 255]
        .normalize()

        // ── Étape 4 : accentuation des contours (Unsharp Mask) ───────────────
        // Renforce les bords des caractères sans amplifier le bruit
        .sharpen({ sigma: SHARPEN_SIGMA, m1: SHARPEN_FLAT, m2: SHARPEN_JAGGED })

        // ── Étape 5 : binarisation ───────────────────────────────────────────
        // Tout pixel < 128 → 0 (noir) ; ≥ 128 → 255 (blanc)
        // Produit un document "encre noire sur fond blanc" idéal pour Tesseract
        .threshold(BINARIZE_THRESHOLD)

        // ── Étape 6 : sortie PNG (sans perte, pas d'artefacts JPEG) ──────────
        .png({ compressionLevel: 1 }) // compression minimale = décompression rapide
        .toBuffer();

    return {
        buffer,
        width:  targetWidth,
        height: targetHeight,
        scaleFactor,
    };
}
