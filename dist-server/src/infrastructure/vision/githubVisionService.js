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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromImage = extractTextFromImage;
/**
 * Service Vision — LLaVA via Ollama (local, gratuit)
 *
 * Utilise LLaVA hébergé localement avec Ollama pour extraire le texte
 * d'une image avec un LLM vision multimodal.
 *
 * Avantages vs Tesseract :
 *   - Bien meilleure qualité sur les tableaux, schémas et mises en page complexes
 *   - Compréhension contextuelle du contenu
 *   - Entièrement local, gratuit, sans dépendance externe
 *
 * Prérequis :
 *   - Ollama installé et lancé (https://ollama.com)
 *   - Le modèle LLaVA téléchargé : ollama pull llava
 *
 * Variables d'environnement (optionnelles) :
 *   OLLAMA_BASE_URL      = URL de l'instance Ollama (défaut: http://localhost:11434)
 *   OLLAMA_VISION_MODEL  = Modèle vision à utiliser (défaut: llava)
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const sharp_1 = __importDefault(require("sharp"));
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const VISION_MODEL = process.env.OLLAMA_VISION_MODEL ?? "llava";
/** Timeout par appel en ms (300 secondes) */
const CALL_TIMEOUT_MS = 300000;
/** Nombre maximum de tentatives en cas d'erreur */
const MAX_RETRIES = 2;
/** Taille maximale (px) du côté le plus long avant envoi au modèle */
const MAX_IMAGE_PX = 1536;
/**
 * Redimensionne et compresse l'image avec sharp pour réduire le payload.
 */
async function prepareImage(imagePath) {
    const resized = await (0, sharp_1.default)(imagePath)
        .resize(MAX_IMAGE_PX, MAX_IMAGE_PX, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 95 })
        .toBuffer();
    return {
        data: resized.toString("base64"),
        sizeKB: Math.round(resized.byteLength / 1024),
    };
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Extrait le texte d'une image en utilisant LLaVA via Ollama.
 *
 * @param imagePath  Chemin absolu vers le fichier image (png, jpg, jpeg, webp)
 * @param language   Langue attendue pour guider le modèle (ex: "français", "anglais")
 * @returns          Texte extrait, mise en forme préservée autant que possible
 */
async function extractTextFromImage(imagePath, language = "français") {
    const filename = path.basename(imagePath);
    console.log(`[Vision] Envoi de "${filename}" à ${VISION_MODEL} (Ollama)...`);
    const { data: imageData, sizeKB } = await prepareImage(imagePath);
    const rawSizeKB = Math.round(fs.statSync(imagePath).size / 1024);
    console.log(`[Vision] Taille originale : ${rawSizeKB} KB → envoyée : ${sizeKB} KB (jpeg ${MAX_IMAGE_PX}px max)`);
    const prompt = `Extrais tout le texte de cette image en ${language}. ` +
        "Préserve la structure : titres, sous-titres, listes à puces, tableaux (en Markdown si possible). " +
        "Ne reformule pas, ne résume pas, donne uniquement le contenu textuel de l'image.";
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        if (attempt > 1) {
            const waitMs = 5000 * (attempt - 1);
            console.log(`[Vision] Tentative ${attempt}/${MAX_RETRIES + 1} pour "${filename}" (attente ${waitMs / 1000}s)...`);
            await sleep(waitMs);
        }
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
            const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    model: VISION_MODEL,
                    messages: [
                        {
                            role: "user",
                            content: prompt,
                            images: [imageData],
                        },
                    ],
                    stream: false,
                }),
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama HTTP ${response.status}: ${errorText}`);
            }
            const json = await response.json();
            const result = json.message?.content?.trim() ?? "";
            console.log(`[Vision] "${filename}" traité — ${result.length} caractères extraits`);
            return result;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (attempt <= MAX_RETRIES) {
                console.warn(`[Vision] Echec tentative ${attempt} pour "${filename}" : ${msg}`);
            }
            else {
                throw new Error(`[Vision] Echec après ${MAX_RETRIES + 1} tentatives pour "${filename}" : ${msg}`);
            }
        }
    }
    return "";
}
