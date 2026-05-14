"use strict";
/**
 * BM25 (Best Match 25) — Moteur de recherche documentaire local
 *
 * Formule BM25 :
 *   score(q, d) = Σ_{t∈q} IDF(t) × (f(t,d) × (k₁+1)) / (f(t,d) + k₁×(1-b+b×|d|/avgdl))
 *
 * Calcul de l'IDF (Inverse Document Frequency) :
 *   IDF(t) = log((N - nₜ + 0.5) / (nₜ + 0.5) + 1)
 *
 * Paramètres standards :
 *   k₁ = 1.5  (contrôle la saturation de la fréquence de terme)
 *   b  = 0.75 (contrôle la normalisation par la longueur du document)
 *
 * Lexique :
 *   f(t,d)  = fréquence du terme t dans le document d
 *   nₜ      = nombre de documents contenant le terme t
 *   N       = nombre total de documents
 *   |d|     = longueur du document d (en tokens)
 *   avgdl   = longueur moyenne des documents dans la collection
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenize = tokenize;
exports.buildIndex = buildIndex;
exports.search = search;
/** Paramètres BM25 */
const K1 = 1.5;
const B = 0.75;
// ─────────────────────────────────────────────────────────────────────────────
// Stop words français + anglais
// ─────────────────────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
    // Français
    "le", "la", "les", "de", "du", "des", "un", "une", "et", "est", "en",
    "au", "aux", "ce", "se", "sa", "son", "ses", "si", "sur", "par", "pour",
    "avec", "dans", "que", "qui", "ne", "pas", "plus", "ou", "il", "elle",
    "ils", "elles", "nous", "vous", "je", "tu", "on", "me", "te", "lui",
    "leur", "leurs", "mon", "ton", "ma", "ta", "mes", "tes", "nos", "vos",
    "etre", "avoir", "faire", "mais", "donc", "or", "ni", "car", "tout",
    "tous", "toute", "toutes", "tres", "bien", "ainsi", "comme", "meme",
    "aussi", "cet", "cette", "ces", "dont", "quand", "alors", "lors",
    "selon", "entre", "vers", "chez", "sans", "sous", "afin", "apres",
    "avant", "entre", "contre", "malgre", "depuis", "pendant", "jusque",
    // Anglais
    "the", "a", "an", "of", "to", "in", "is", "it", "that", "this",
    "are", "was", "be", "for", "on", "as", "at", "by", "from", "with",
    "his", "her", "they", "we", "you", "i", "have", "has", "had",
    "not", "all", "can", "do", "did", "will", "would", "could", "should",
    "may", "might", "must", "shall", "been", "being", "and", "but",
    "its", "which", "what", "when", "where", "who", "how", "if",
]);
// ─────────────────────────────────────────────────────────────────────────────
// Tokenisation
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Normalise et tokenise un texte :
 *   1. Minuscules
 *   2. Suppression des accents (NFD + strip combining chars)
 *   3. Suppression de la ponctuation et des chiffres
 *   4. Découpage sur les espaces
 *   5. Filtrage des tokens courts (≤ 2 chars) et des stop words
 */
function tokenize(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // retire les accents
        .replace(/[^\w\s]/g, " ") // retire la ponctuation
        .replace(/\d+/g, " ") // retire les chiffres
        .split(/\s+/)
        .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}
// ─────────────────────────────────────────────────────────────────────────────
// Construction de l'index
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Construit l'index BM25 à partir d'une liste de chunks.
 *
 * Complexité : O(total_tokens)
 * L'index peut ensuite servir pour autant de requêtes que nécessaire.
 */
function buildIndex(chunks) {
    const tf = new Map();
    const df = new Map();
    const docLengths = [];
    let totalLength = 0;
    for (let i = 0; i < chunks.length; i++) {
        const tokens = tokenize(chunks[i].text);
        docLengths.push(tokens.length);
        totalLength += tokens.length;
        // Compte la fréquence de chaque terme dans ce document
        const termCounts = new Map();
        for (const token of tokens) {
            termCounts.set(token, (termCounts.get(token) ?? 0) + 1);
        }
        // Met à jour l'index TF et le DF global
        for (const [term, count] of termCounts) {
            if (!tf.has(term))
                tf.set(term, new Map());
            tf.get(term).set(i, count);
            df.set(term, (df.get(term) ?? 0) + 1);
        }
    }
    return {
        chunks,
        tf,
        df,
        docLengths,
        avgdl: chunks.length > 0 ? totalLength / chunks.length : 1,
        N: chunks.length,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Scoring BM25
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Calcule le score BM25 d'un document pour une liste de tokens de requête.
 *
 *   score = Σ IDF(t) × [ f(t,d)×(k₁+1) / (f(t,d) + k₁×(1-b+b×|d|/avgdl)) ]
 */
function scoreBM25(index, docIdx, queryTokens) {
    const { tf, df, docLengths, avgdl, N } = index;
    let score = 0;
    const dl = docLengths[docIdx];
    for (const term of queryTokens) {
        const nt = df.get(term) ?? 0;
        if (nt === 0)
            continue;
        const ftd = tf.get(term)?.get(docIdx) ?? 0;
        if (ftd === 0)
            continue;
        // IDF avec lissage de Lucene (évite les valeurs négatives)
        const idf = Math.log((N - nt + 0.5) / (nt + 0.5) + 1);
        const numerator = ftd * (K1 + 1);
        const denominator = ftd + K1 * (1 - B + B * (dl / avgdl));
        score += idf * (numerator / denominator);
    }
    return score;
}
// ─────────────────────────────────────────────────────────────────────────────
// Recherche
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Recherche les `topK` chunks les plus pertinents pour une requête textuelle.
 *
 * @param index   - Index BM25 pré-construit via buildIndex()
 * @param query   - Question ou requête en langage naturel
 * @param topK    - Nombre maximum de résultats à retourner (défaut: 5)
 * @returns       - Liste triée par score décroissant
 */
function search(index, query, topK = 5) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || index.N === 0)
        return [];
    const scores = [];
    for (let i = 0; i < index.N; i++) {
        const score = scoreBM25(index, i, queryTokens);
        if (score > 0)
            scores.push({ idx: i, score });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores
        .slice(0, topK)
        .map(({ idx, score }) => ({ chunk: index.chunks[idx], score }));
}
