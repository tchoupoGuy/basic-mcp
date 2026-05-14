/**
 * Outil MCP : generate-document-pdf
 *
 * Genere un PDF complet a partir des images de chaque chapitre.
 * Quatre modes disponibles :
 *
 *   - "images" (defaut) : chaque image est inseree pleine page dans le PDF.
 *     Rendu 100 % fidele a l'original (mise en page, schemas, tableaux preserves).
 *
 *   - "text" : texte extrait via Tesseract OCR uniquement.
 *     Compact et recherchable, mais perd la mise en forme.
 *
 *   - "images+text" : image en haut de chaque page + texte OCR Tesseract en dessous.
 *     Le meilleur des deux : visuel fidele ET texte cherchable.
 *
 *   - "vision" : extraction de texte par LLM vision (LLaVA via Ollama, local et gratuit).
 *     Meilleure qualite que Tesseract sur les tableaux et mises en page complexes.
 *     Necessite Ollama installe et le modele llava : ollama pull llava
 *
 * Le PDF est ecrit dans le dossier output/ a la racine du projet.
 *
 * Configuration via le fichier .env :
 *   DOCUMENT_BASE_PATH   = chemin absolu vers le dossier racine des chapitres
 *   OCR_LANGUAGE         = code langue Tesseract (ex: fra, eng, fra+eng)
 *   OLLAMA_BASE_URL      = URL Ollama (defaut: http://localhost:11434)
 *   OLLAMA_VISION_MODEL  = modele vision Ollama (defaut: llava)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { getTesseractWorker } from "../../../infrastructure/ocr/tesseractWorker";
import { extractTextFromImage } from "../../../infrastructure/vision/githubVisionService";

/**
 * Retourne le chemin de base des chapitres.
 * Lu a chaque appel (pas en constante de module) pour etre sur
 * que dotenv a injecte les variables avant la premiere utilisation.
 */
function getBasePath(): string {
    return process.env.DOCUMENT_BASE_PATH ||
        path.resolve(process.cwd(), "Management_de_project_Logiciels");
}

/** Dossier de sortie pour les PDF generes */
const OUTPUT_DIR = path.resolve(process.cwd(), "output");

/** Extensions d'image acceptees */
const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|bmp|tiff|tif|webp)$/i;

/**
 * Liste et trie les fichiers image d'un dossier par ordre alphanumerique.
 * Le tri naturel garantit l'ordre : page1, page2... page10 (et non page1, page10, page2).
 */
function listImageFiles(dir: string): string[] {
    return fs.readdirSync(dir)
        .filter(f => IMAGE_EXTENSIONS.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Marges en points pour le mode "images" (quasi pleine page) */
const IMAGE_MARGIN = 20;

/** Marges standard pour les modes texte */
const TEXT_MARGINS = { top: 60, bottom: 60, left: 72, right: 72 };

/**
 * Seuil de detection du format paysage "double page".
 * Si largeur > hauteur * LANDSCAPE_RATIO, l'image est consideree comme deux pages cote a cote.
 */
const LANDSCAPE_RATIO = 1.3;

/**
 * Insere une image dans le PDF.
 * Si l'image est en format paysage (largeur / hauteur > LANDSCAPE_RATIO),
 * elle est automatiquement decoupee en deux demi-pages portrait,
 * chacune sur sa propre page A4.
 * Sinon, l'image est inseree telle quelle pleine page.
 */
async function addImagePages(doc: InstanceType<typeof PDFDocument>, imagePath: string): Promise<void> {
    const margin = IMAGE_MARGIN;
    const margins = { top: margin, bottom: margin, left: margin, right: margin };

    // Lire les dimensions de l'image sans la decoder entierement
    const metadata = await sharp(imagePath).metadata();
    const w = metadata.width ?? 0;
    const h = metadata.height ?? 0;

    if (w > 0 && h > 0 && w > h * LANDSCAPE_RATIO) {
        // Image paysage "double page" : decoupe en moitie gauche + moitie droite
        const halfWidth = Math.floor(w / 2);

        const leftBuffer = await sharp(imagePath)
            .extract({ left: 0, top: 0, width: halfWidth, height: h })
            .toBuffer();

        const rightBuffer = await sharp(imagePath)
            .extract({ left: halfWidth, top: 0, width: w - halfWidth, height: h })
            .toBuffer();

        const availableW = doc.page.width - margin * 2;
        const availableH = doc.page.height - margin * 2;

        // Page gauche
        doc.addPage({ size: "A4", margins });
        doc.image(leftBuffer, margin, margin, { fit: [availableW, availableH], align: "center", valign: "center" });

        // Page droite
        doc.addPage({ size: "A4", margins });
        doc.image(rightBuffer, margin, margin, { fit: [availableW, availableH], align: "center", valign: "center" });
    } else {
        // Image portrait : une page par image
        const availableW = doc.page.width - margin * 2;
        const availableH = doc.page.height - margin * 2;
        doc.addPage({ size: "A4", margins });
        doc.image(imagePath, margin, margin, { fit: [availableW, availableH], align: "center", valign: "center" });
    }
}

export function registerGenerateDocumentPdfTool(server: McpServer) {
    server.registerTool(
        "generate-document-pdf",
        {
            description:
                "Generates a complete PDF from chapter image folders. " +
                "Mode 'images' (default): inserts original images full-page, faithful to the original layout. " +
                "Mode 'text': Tesseract OCR text only. " +
                "Mode 'images+text': each original image followed by its Tesseract OCR text. " +
                "Mode 'vision': LLaVA (Ollama local) extracts text -- best quality for complex layouts, requires Ollama running with llava model.",
            inputSchema: z.object({
                chapters: z
                    .array(z.number().int().min(1).max(9))
                    .optional()
                    .describe("Chapters to include (default: 1-9)"),
                language: z
                    .string()
                    .optional()
                    .describe("Tesseract OCR language code (default: env OCR_LANGUAGE or 'fra'). Ignored in vision mode."),
                outputFilename: z
                    .string()
                    .optional()
                    .describe("Output PDF filename (default: 'document-complet.pdf')"),
                mode: z
                    .enum(["images", "text", "images+text", "vision"])
                    .optional()
                    .describe(
                        "'images' (default): original images full-page, faithful rendering. " +
                        "'text': Tesseract OCR text only. " +
                        "'images+text': image + Tesseract OCR text per page. " +
                        "'vision': LLaVA vision text extraction via Ollama (local, requires ollama pull llava).",
                    ),
            }),
        },
        async ({ chapters, language, outputFilename, mode }) => {
            // Valeurs par defaut
            const chapterList = chapters ?? [1, 2, 3, 4, 5, 6, 7, 8, 9];
            const ocrLanguage = language ?? process.env.OCR_LANGUAGE ?? "fra";
            const filename = outputFilename ?? "document-complet.pdf";
            // "images" par defaut = rendu le plus fidele a l'original
            const renderMode = mode ?? "images";
            const documentBasePath = getBasePath();
            // Indique si Tesseract OCR est necessaire pour ce mode
            const needsOcr = renderMode === "text" || renderMode === "images+text";
            // Indique si le mode vision (GPT-4o) est active
            const needsVision = renderMode === "vision";

            // Creer le dossier output/ s'il n'existe pas encore
            if (!fs.existsSync(OUTPUT_DIR)) {
                fs.mkdirSync(OUTPUT_DIR, { recursive: true });
            }

            const outputPath = path.join(OUTPUT_DIR, filename);
            const safeBase = path.resolve(documentBasePath);

            // Marges pour la page de garde et les pages texte
            const defaultMargins = renderMode === "text" || renderMode === "vision"
                ? TEXT_MARGINS
                : { top: IMAGE_MARGIN, bottom: IMAGE_MARGIN, left: IMAGE_MARGIN, right: IMAGE_MARGIN };

            // Initialiser le document PDF au format A4
            const doc = new PDFDocument({ size: "A4", margins: defaultMargins, autoFirstPage: false });

            // Connecter le flux d'ecriture vers le fichier de sortie
            const writeStream = fs.createWriteStream(outputPath);
            doc.pipe(writeStream);

            // --- Page de garde ---
            doc.addPage({ size: "A4", margins: TEXT_MARGINS });
            doc.fontSize(22).font("Helvetica-Bold")
                .text("Management de Project Logiciels", { align: "center" });
            doc.moveDown();
            doc.fontSize(14).font("Helvetica")
                .text("Document complet - Chapitres 1 a 9", { align: "center" });
            doc.moveDown(2);
            doc.fontSize(10).fillColor("gray")
                .text(`Genere le : ${new Date().toLocaleDateString("fr-FR")}`, { align: "center" });
            doc.moveDown(0.5);
            doc.text(`Mode : ${renderMode}`, { align: "center" });

            // Recuperer le worker singleton Tesseract si l'OCR est necessaire
            const worker = needsOcr ? await getTesseractWorker(ocrLanguage) : null;

            let processedChapters = 0;
            const skippedChapters: number[] = [];

            // --- Boucle sur chaque chapitre demande ---
            for (const chapterNum of chapterList) {
                const chapterDir = path.join(documentBasePath, `Chap${chapterNum}`);
                const safeDir = path.resolve(chapterDir);

                // Securite : verifier que le chemin reste dans DOCUMENT_BASE_PATH
                if (!safeDir.startsWith(safeBase + path.sep)) {
                    skippedChapters.push(chapterNum);
                    continue;
                }

                // Passer les chapitres dont le dossier est absent
                if (!fs.existsSync(safeDir)) {
                    skippedChapters.push(chapterNum);
                    continue;
                }

                // Passer les chapitres sans images
                const imageFiles = listImageFiles(safeDir);
                if (imageFiles.length === 0) {
                    skippedChapters.push(chapterNum);
                    continue;
                }

                // --- Traitement de chaque image du chapitre ---
                for (const imageFile of imageFiles) {
                    const imagePath = path.join(safeDir, imageFile);

                    if (renderMode === "images" || renderMode === "images+text") {
                        // Mode fidele : decoupe automatique si image paysage double-page
                        await addImagePages(doc, imagePath);
                    }

                    if (renderMode === "images+text" && worker) {
                        // Ajouter une page avec le texte Tesseract OCR apres l'image
                        const { data: { text } } = await worker.recognize(imagePath);
                        const trimmed = text.trim();
                        if (trimmed) {
                            doc.addPage({ size: "A4", margins: TEXT_MARGINS });
                            doc.fontSize(9).fillColor("#555")
                                .text(`[OCR Tesseract - Chap. ${chapterNum} / ${imageFile}]`, { align: "right" });
                            doc.moveDown(0.3);
                            doc.fontSize(10).fillColor("black")
                                .text(trimmed, { align: "justify", lineGap: 3 });
                        }
                    }

                    if (renderMode === "text" && worker) {
                        // Mode texte Tesseract uniquement
                        const { data: { text } } = await worker.recognize(imagePath);
                        const trimmed = text.trim();
                        if (trimmed) {
                            doc.addPage({ size: "A4", margins: TEXT_MARGINS });
                            doc.fontSize(9).fillColor("#555")
                                .text(`[OCR Tesseract - Chap. ${chapterNum} / ${imageFile}]`, { align: "right" });
                            doc.moveDown(0.3);
                            doc.fontSize(10).fillColor("black")
                                .text(trimmed, { align: "justify", lineGap: 3 });
                        }
                    }

                    if (needsVision) {
                        // Mode vision : extraction par LLaVA via Ollama (local, gratuit)
                        // Meilleure qualite que Tesseract sur les tableaux et mises en page complexes
                        let visionText = "";
                        try {
                            visionText = await extractTextFromImage(imagePath, "francais");
                        } catch (err) {
                            // En cas d'erreur (rate limit, timeout...), on insere un message d'erreur dans le PDF
                            // et on continue avec les images suivantes
                            const msg = err instanceof Error ? err.message : String(err);
                            console.error(`[Vision] Erreur sur "${imageFile}" : ${msg}`);
                            visionText = `[ERREUR extraction vision : ${msg}]`;
                        }
                        const trimmed = visionText.trim();
                        if (trimmed) {
                            doc.addPage({ size: "A4", margins: TEXT_MARGINS });
                            doc.fontSize(9).fillColor("#555")
                                .text(`[Vision LLaVA - Chap. ${chapterNum} / ${imageFile}]`, { align: "right" });
                            doc.moveDown(0.3);
                            doc.fontSize(10).fillColor("black")
                                .text(trimmed, { align: "justify", lineGap: 3 });
                        }
                    }
                }

                processedChapters++;
            }

            // Finaliser et fermer le document PDF
            doc.end();

            // Attendre que le fichier soit completement ecrit sur le disque
            await new Promise<void>((resolve, reject) => {
                writeStream.on("finish", resolve);
                writeStream.on("error", reject);
            });

            const lines: string[] = [
                `PDF genere : ${outputPath}`,
                `Mode : ${renderMode}`,
                `Chapitres traites : ${processedChapters}`,
            ];
            if (skippedChapters.length > 0) {
                lines.push(`Chapitres ignores (dossier absent) : ${skippedChapters.join(", ")}`);
            }

            return {
                content: [{ type: "text" as const, text: lines.join("\n") }],
            };
        },
    );
}