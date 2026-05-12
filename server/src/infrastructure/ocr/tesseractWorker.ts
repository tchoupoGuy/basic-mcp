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
import { createWorker, Worker, PSM, OEM } from "tesseract.js";
import * as path from "path";
import * as fs from "fs";

/** Map language → promesse de worker (évite les initialisations parallèles) */
const workerCache = new Map<string, Promise<Worker>>();

/** Dossier local où sont stockées les données d'entraînement Tesseract */
const LANG_DATA_PATH = path.resolve(process.cwd(), "tesseract-data");

/**
 * Retourne un worker Tesseract prêt à l'emploi pour la langue donnée.
 * - Premier appel pour une langue : initialise le worker et le met en cache.
 * - Appels suivants : retourne le worker déjà initialisé (instantané).
 */
export async function getTesseractWorker(language: string): Promise<Worker> {
    // Créer le dossier de cache s'il n'existe pas
    if (!fs.existsSync(LANG_DATA_PATH)) {
        fs.mkdirSync(LANG_DATA_PATH, { recursive: true });
    }

    // Réutiliser le worker existant pour cette langue
    if (workerCache.has(language)) {
        return workerCache.get(language)!;
    }

    // Créer et mettre en cache la promesse d'initialisation, puis configurer les paramètres
    // pour maximiser la qualité de reconnaissance sur des documents scannés.
    const workerPromise = (async () => {
        // OEM.DEFAULT (3) : sélectionne automatiquement le moteur disponible dans traineddata.
        // - Version "best" / LSTM-only → utilise LSTM
        // - Version "fast" / legacy-only → utilise le moteur legacy
        // Évite les erreurs "LSTM requested, but not present" et "legacy engine not present"
        // qui surviennent quand on force un moteur absent du fichier .traineddata.
        const w = await createWorker(`${language}+osd`, OEM.DEFAULT, {
            // Stocker les données d'entraînement localement pour ne pas re-télécharger
            cachePath: LANG_DATA_PATH,
        });

        // PSM.AUTO (mode 3) : segmentation automatique sans détection d'orientation forcée.
        // osd.traineddata est chargé pour satisfaire l'Init() de Tesseract mais PSM.AUTO
        // n'effectue pas de rotation automatique — adapté aux documents scannés droits.
        await w.setParameters({
            tessedit_pageseg_mode: PSM.AUTO,
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
export async function warmupTesseractWorker(): Promise<void> {
    const lang = process.env.OCR_LANGUAGE ?? "fra";
    console.log(`[Tesseract] Initialisation du worker OCR (langue: ${lang})…`);
    try {
        await getTesseractWorker(lang);
        console.log(`[Tesseract] Worker OCR prêt (langue: ${lang})`);
    } catch (err) {
        console.error("[Tesseract] Échec de l'initialisation du worker OCR :", err);
    }
}
