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
exports.getTesseractWorker = getTesseractWorker;
exports.warmupTesseractWorker = warmupTesseractWorker;
/**
 * Singleton Tesseract Worker
 *
 * Problème résolu : si createWorker() est appelé à chaque requête MCP,
 * tesseract.js doit à chaque fois télécharger les données d'entraînement
 * (~30 MB depuis GitHub), ce qui dépasse le timeout du serveur MCP.
 *
 * Solution : un worker unique par langue, initialisé une seule fois et
 * réutilisé pour toutes les requêtes. Les données sont stockées dans
 * tesseract-data/ à la racine du projet pour éviter tout re-téléchargement.
 */
const tesseract_js_1 = require("tesseract.js");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
/** Map language → promesse de worker (évite les initialisations parallèles) */
const workerCache = new Map();
/** Dossier local où sont stockées les données d'entraînement Tesseract */
const LANG_DATA_PATH = path.resolve(process.cwd(), "tesseract-data");
/**
 * Retourne un worker Tesseract prêt à l'emploi pour la langue donnée.
 * - Premier appel pour une langue : initialise le worker et le met en cache.
 * - Appels suivants : retourne le worker déjà initialisé (instantané).
 */
async function getTesseractWorker(language) {
    // Créer le dossier de cache s'il n'existe pas
    if (!fs.existsSync(LANG_DATA_PATH)) {
        fs.mkdirSync(LANG_DATA_PATH, { recursive: true });
    }
    // Réutiliser le worker existant pour cette langue
    if (workerCache.has(language)) {
        return workerCache.get(language);
    }
    // Créer et mettre en cache la promesse d'initialisation, puis configurer les paramètres
    // pour maximiser la qualité de reconnaissance sur des documents scannés.
    const workerPromise = (async () => {
        // OEM.DEFAULT (3) : sélectionne automatiquement le moteur disponible dans traineddata.
        // - Version "best" / LSTM-only → utilise LSTM
        // - Version "fast" / legacy-only → utilise le moteur legacy
        // Évite les erreurs "LSTM requested, but not present" et "legacy engine not present"
        // qui surviennent quand on force un moteur absent du fichier .traineddata.
        const w = await (0, tesseract_js_1.createWorker)(`${language}+osd`, tesseract_js_1.OEM.DEFAULT, {
            // Stocker les données d'entraînement localement pour ne pas re-télécharger
            cachePath: LANG_DATA_PATH,
        });
        // PSM.AUTO (mode 3) : segmentation automatique sans détection d'orientation forcée.
        // osd.traineddata est chargé pour satisfaire l'Init() de Tesseract mais PSM.AUTO
        // n'effectue pas de rotation automatique — adapté aux documents scannés droits.
        await w.setParameters({
            tessedit_pageseg_mode: tesseract_js_1.PSM.AUTO,
            // Préserver les espaces entre les mots (améliore la lisibilité)
            preserve_interword_spaces: "1",
            // DPI explicite : améliore la précision si les images n'ont pas de métadonnées DPI
            user_defined_dpi: "300",
        });
        return w;
    })();
    workerCache.set(language, workerPromise);
    return workerPromise;
}
/**
 * Pré-initialise le worker avec la langue par défaut au démarrage du serveur.
 * Appeler cette fonction au boot permet d'absorber le délai de premier téléchargement
 * avant que les requêtes clients n'arrivent.
 */
async function warmupTesseractWorker() {
    const lang = process.env.OCR_LANGUAGE ?? "fra";
    console.log(`[Tesseract] Initialisation du worker OCR (langue: ${lang})…`);
    try {
        await getTesseractWorker(lang);
        console.log(`[Tesseract] Worker OCR prêt (langue: ${lang})`);
    }
    catch (err) {
        console.error("[Tesseract] Échec de l'initialisation du worker OCR :", err);
    }
}
