/**
 * Service Vision — GitHub Models (GPT-4o)
 *
 * Utilise l'API GitHub Models (compatible OpenAI) pour extraire le texte
 * d'une image avec un LLM vision.
 *
 * Avantages vs Tesseract :
 *   - Bien meilleure qualité sur les tableaux, schémas et mises en page complexes
 *   - Pas d'installation locale de données OCR
 *   - Compréhension contextuelle du contenu
 *
 * Prérequis :
 *   - Un Personal Access Token (PAT) GitHub avec la permission "Models: read"
 *   - Variable d'environnement GITHUB_TOKEN dans le fichier .env
 *
 * Rate limits : inclus dans l'abonnement GitHub Copilot (gratuit avec quotas).
 * Doc : https://docs.github.com/en/github-models
 */
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

/** Endpoint GitHub Models — compatible avec le SDK OpenAI */
const GITHUB_MODELS_ENDPOINT = "https://models.inference.ai.azure.com";

/** Modèle vision utilisé — gpt-4o pour une meilleure extraction (gpt-4o-mini refuse souvent les images) */
const VISION_MODEL = process.env.VISION_MODEL ?? "gpt-4o";

/**
 * Retourne le client OpenAI configuré.
 * - Si OPENAI_API_KEY est défini → API OpenAI directe (quotas élevés)
 * - Sinon → GitHub Models (gratuit mais rate limité)
 */
function getClient(): OpenAI {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
        console.log("[Vision] Utilisation de l'API OpenAI directe");
        return new OpenAI({ apiKey: openaiKey });
    }
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error(
            "Variable d'environnement GITHUB_TOKEN manquante. " +
            "Créez un PAT GitHub (permission 'Models: read') et ajoutez-le dans votre fichier .env.",
        );
    }
    return new OpenAI({
        baseURL: GITHUB_MODELS_ENDPOINT,
        apiKey: token,
    });
}

/**
 * Extrait le texte d'une image en utilisant GPT-4o via GitHub Models.
 *
 * @param imagePath  Chemin absolu vers le fichier image (png, jpg, jpeg, webp)
 * @param language   Langue attendue pour guider le modèle (ex: "français", "anglais")
 * @returns          Texte extrait, mise en forme préservée autant que possible
 */
/** Timeout par appel GPT-4o en ms (300 secondes) */
const CALL_TIMEOUT_MS = 300_000;

/** Délai entre chaque appel pour respecter le rate limit GitHub Models */
const DELAY_BETWEEN_CALLS_MS = 5_000;

/** Nombre maximum de tentatives en cas d'erreur */
const MAX_RETRIES = 2;

/** Taille maximale (px) du côté le plus long avant envoi à l'API */
const MAX_IMAGE_PX = 1536;

/**
 * Redimensionne et compresse l'image avec sharp pour réduire le payload.
 * Retourne { data: base64, mimeType }.
 */
async function prepareImage(imagePath: string): Promise<{ data: string; mimeType: string; sizeKB: number }> {
    const resized = await sharp(imagePath)
        .resize(MAX_IMAGE_PX, MAX_IMAGE_PX, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 95 })
        .toBuffer();
    return {
        data: resized.toString("base64"),
        mimeType: "image/jpeg",
        sizeKB: Math.round(resized.byteLength / 1024),
    };
}

/** Attendre N millisecondes */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function extractTextFromImage(
    imagePath: string,
    language = "français",
): Promise<string> {
    const filename = path.basename(imagePath);
    console.log(`[Vision] Envoi de "${filename}" à GPT-4o...`);

    // Redimensionner et compresser l'image avant envoi
    const { data: imageData, mimeType, sizeKB } = await prepareImage(imagePath);
    const rawSizeKB = Math.round(fs.statSync(imagePath).size / 1024);
    console.log(`[Vision] Taille originale : ${rawSizeKB} KB → envoyée : ${sizeKB} KB (jpeg ${MAX_IMAGE_PX}px max)`);

    const client = getClient();

    // Retry avec backoff exponentiel en cas de rate limit ou d'erreur réseau
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        if (attempt > 1) {
            // Backoff plus long pour laisser le rate limit se réinitialiser
            const waitMs = 30_000 * (attempt - 1);
            console.log(`[Vision] Tentative ${attempt}/${MAX_RETRIES + 1} pour "${filename}" (attente ${waitMs / 1000}s)...`);
            await sleep(waitMs);
        }

        try {
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout (${CALL_TIMEOUT_MS / 1000}s) pour "${filename}"`)), CALL_TIMEOUT_MS),
            );

            const apiCall = client.chat.completions.create({
                model: VISION_MODEL,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:${mimeType};base64,${imageData}`,
                                    detail: "low",
                                },
                            },
                            {
                                type: "text",
                                text:
                                    `Extrais tout le texte de cette image en ${language}. ` +
                                    "Préserve la structure : titres, sous-titres, listes à puces, tableaux (en Markdown si possible). " +
                                    "Ne reformule pas, ne résume pas, donne uniquement le contenu textuel de l'image.",
                            },
                        ],
                    },
                ],
                temperature: 0.1,
                max_tokens: 4096,
            });

            const response = await Promise.race([apiCall, timeoutPromise]);
            const result = response.choices[0]?.message?.content?.trim() ?? "";
            console.log(`[Vision] "${filename}" traité — ${result.length} caractères extraits`);

            // Délai après chaque appel réussi pour éviter le rate limit sur le suivant
            await sleep(DELAY_BETWEEN_CALLS_MS);

            return result;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (attempt <= MAX_RETRIES) {
                console.warn(`[Vision] Echec tentative ${attempt} pour "${filename}" : ${msg}`);
            } else {
                // Dernière tentative échouée : propager l'erreur
                throw new Error(`[Vision] Echec après ${MAX_RETRIES + 1} tentatives pour "${filename}" : ${msg}`);
            }
        }
    }

    return "";
}
