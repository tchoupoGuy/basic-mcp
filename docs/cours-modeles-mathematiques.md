# Les modèles mathématiques du projet

Ce projet utilise deux pipelines mathématiques distincts : un moteur de recherche documentaire (BM25) et un pipeline de traitement d'image pour l'OCR (Sharp + Tesseract). Ce cours explique chacun avec rigueur, en partant de l'intuition vers la formule.

---

## 1. BM25 — Moteur de recherche documentaire

### Problème posé

Vous posez une question : *"Quelle est la différence entre risk mitigation et risk avoidance ?"*  
Vous avez 120 pages de cours. Comment trouver les 5 pages les plus pertinentes **sans LLM** ?

La réponse naïve serait de compter combien de fois chaque mot de la question apparaît dans chaque page. C'est exactement TF (Term Frequency) — mais ça pose deux problèmes :

> **Problème 1** : Le mot *"le"* apparaît partout. Il ne veut rien dire.  
> **Problème 2** : Une page de 500 mots aura naturellement plus d'occurrences qu'une page de 50 mots — est-ce vraiment plus pertinente ?

BM25 résout ces deux problèmes.

---

### Étape 1 : IDF — Pénaliser les mots communs


$$
\text{IDF}(t) = \log\left(\frac{N - n_t + 0.5}{n_t + 0.5} + 1\right)
$$

| Variable | Signification |
|----------|---------------|
| $N$ | nombre total de pages (documents) |
| $n_t$ | nombre de pages contenant le terme $t$ |

**Intuition** : si $t = $ *"risk"* apparaît dans 2 pages sur 120 → $n_t = 2$, IDF élevé → mot rare → **informatif**.  
Si $t = $ *"projet"* apparaît dans 115 pages sur 120 → IDF ≈ 0 → mot banal → **non discriminant**.

Le $+1$ final garantit que l'IDF reste positif même quand $n_t = N$.

---

### Étape 2 : TF saturée — Pénaliser la répétition abusive

Sans saturation, un document qui répète *"risk"* 100 fois obtiendrait un score 100× plus grand qu'un document qui le cite 5 fois. C'est injuste.

BM25 applique une **fonction de saturation** sur $f(t, d)$ (la fréquence brute du terme dans le document) :

$$
\text{TF}_{\text{BM25}}(t, d) = \frac{f(t,d) \cdot (k_1 + 1)}{f(t,d) + k_1 \cdot \left(1 - b + b \cdot \frac{|d|}{\text{avgdl}}\right)}
$$

| Variable | Signification |
|----------|---------------|
| $f(t,d)$ | fréquence brute du terme $t$ dans le document $d$ |
| $k_1 = 1.5$ | contrôle la saturation — à $k_1=0$, TF = constante ; à $k_1 \to \infty$, TF = fréquence brute |
| $b = 0.75$ | contrôle la normalisation par longueur |
| $\|d\|$ | longueur du document $d$ en tokens |
| $\text{avgdl}$ | longueur moyenne de tous les documents |

**Comportement de $k_1$** — regardez la courbe de saturation :

$$
\text{quand } f \to \infty : \text{TF}_{\text{BM25}} \to k_1 + 1 = 2.5
$$

La contribution d'un terme ne peut **jamais** dépasser $k_1 + 1$. Après 5–10 occurrences, la courbe est quasi-plate.

**Rôle de $b$** :
- $b = 0$ → pas de normalisation par longueur (une page longue a l'avantage)
- $b = 1$ → normalisation complète (une page longue est pénalisée proportionnellement)
- $b = 0.75$ → compromis empirique validé sur des milliers de collections

---

### Score final BM25

$$
\text{score}(q, d) = \sum_{t \in q} \text{IDF}(t) \times \frac{f(t,d) \cdot (k_1 + 1)}{f(t,d) + k_1 \cdot \left(1 - b + b \cdot \frac{|d|}{\text{avgdl}}\right)}
$$

**Ce que fait le code** (extrait de `server/src/infrastructure/search/bm25Engine.ts`) :

```typescript
// Pour chaque terme de la requête
for (const term of queryTokens) {
    const nt  = index.df.get(term) ?? 0;                           // documents contenant ce terme
    const idf = Math.log((N - nt + 0.5) / (nt + 0.5) + 1);       // IDF
    const ftd = index.tf.get(term)?.get(i) ?? 0;                  // fréquence dans ce document
    const denom = ftd + K1 * (1 - B + B * docLen / avgdl);        // dénominateur
    score += idf * (ftd * (K1 + 1)) / denom;                      // accumulation
}
```

---

### Pré-traitement du texte : tokenisation

Avant d'indexer ou de scorer, chaque texte passe par une chaîne de normalisation :

1. **Minuscules** : `"Risk"` → `"risk"`
2. **Décomposition NFD + suppression des accents** : `"gérée"` → `"geree"`
3. **Suppression de la ponctuation et des chiffres**
4. **Découpage sur les espaces** (tokenisation)
5. **Filtrage** : tokens ≤ 2 caractères supprimés, stop words supprimés

Les stop words incluent les mots fonctionnels FR+EN : `"le"`, `"la"`, `"the"`, `"of"`, etc.

---

### Complexité algorithmique

| Phase | Complexité |
|-------|-----------|
| Construction de l'index | $O\!\left(\sum_d \|d\|\right)$ — linéaire en tokens totaux |
| Une requête de $q$ termes sur $N$ documents | $O(q \cdot N)$ — en pratique $O(q \cdot n_t)$ grâce à la map inversée |

---

### Exemple chiffré

Supposons 3 documents, $K_1 = 1.5$, $B = 0.75$ :

| Document | Texte (simplifié) | Longueur |
|----------|-------------------|----------|
| $d_1$ | "risk mitigation risk avoidance" | 4 tokens |
| $d_2$ | "planification projet gestion" | 3 tokens |
| $d_3$ | "risk" | 1 token |

$\text{avgdl} = (4 + 3 + 1) / 3 = 2.67$

Pour le terme `"risk"` : $N = 3$, $n_t = 2$ (présent dans $d_1$ et $d_3$)

$$
\text{IDF("risk")} = \log\!\left(\frac{3 - 2 + 0.5}{2 + 0.5} + 1\right) = \log(1.6) \approx 0.47
$$

Score de $d_1$ pour `"risk"` : $f(t, d_1) = 2$, $|d_1| = 4$

$$
\text{TF}_{\text{BM25}} = \frac{2 \times 2.5}{2 + 1.5 \times (1 - 0.75 + 0.75 \times 4/2.67)} = \frac{5}{2 + 1.5 \times 1.375} \approx \frac{5}{4.06} \approx 1.23
$$

$$
\text{score}(d_1) = 0.47 \times 1.23 \approx 0.58
$$

$d_1$ sera bien classé en premier. $d_3$ aura un score plus faible malgré une densité relative plus grande, car $d_1$ contient aussi le terme `"mitigation"` qui contribue supplémentairement.

---

## 2. Pipeline de prétraitement d'image (Sharp + Tesseract)

### Problème posé

Tesseract reçoit une image scannée. La qualité OCR dépend directement de la qualité des pixels. Chaque étape du pipeline est une transformation mathématique bien définie sur la matrice de pixels.

---

### Étape 1 : Conversion en niveaux de gris

$$
Y = 0.299 \cdot R + 0.587 \cdot G + 0.114 \cdot B
$$

Ce n'est **pas** une simple moyenne. Ce sont les coefficients de luminance du standard **ITU-R BT.601**, calibrés sur la sensibilité de l'œil humain :
- L'œil est très sensible au vert (58.7 %)
- Moyennement sensible au rouge (29.9 %)
- Peu sensible au bleu (11.4 %)

**Pourquoi** : Tesseract n'a pas besoin de couleur. Un seul canal réduit le bruit et divise la taille des données par 3. La luminance $Y$ est la grandeur perceptuellement significative.

---

### Étape 2 : Upscale (interpolation de Lanczos3)

Si l'image fait moins de 1800 px en largeur → facteur ×2.

L'interpolation de Lanczos utilise un noyau de convolution basé sur la fonction sinus cardinal :

$$
L(x) = \text{sinc}(x) \cdot \text{sinc}\!\left(\frac{x}{a}\right), \quad |x| < a
$$

où $\text{sinc}(x) = \frac{\sin(\pi x)}{\pi x}$ et $a = 3$ (Lanczos**3** = 3 lobes).

C'est supérieur à l'interpolation bilinéaire car elle préserve les **hautes fréquences** (les bords des caractères). L'interpolation bilinéaire lisse trop et crée du flou.

**Règle empirique** : Tesseract donne ses meilleurs résultats à ≥ 300 DPI.  
Pour un document A4, 300 DPI ≈ 2480 × 3508 px.

---

### Étape 3 : Normalisation des niveaux (Auto-levels)

$$
p_{\text{out}} = \frac{p_{\text{in}} - p_{\min}}{p_{\max} - p_{\min}} \times 255
$$

Cette transformation **étire l'histogramme** pour qu'il couvre tout l'espace $[0, 255]$.

Si le scanner a produit une image terne ($p_{\min} = 40$, $p_{\max} = 200$) :
- Un pixel à 40 devient 0 (noir pur)
- Un pixel à 200 devient 255 (blanc pur)
- Un pixel à 120 devient $\frac{120 - 40}{200 - 40} \times 255 = 127.5 \approx 128$

**Résultat** : contraste maximal, fond blanc uniforme, encre noire nette.

---

### Étape 4 : Unsharp Mask (accentuation des contours)

$$
I_{\text{sharp}} = I + \sigma \cdot (I - G_\sigma * I)
$$

où $G_\sigma * I$ est la convolution de l'image avec un filtre gaussien de variance $\sigma^2$.

La quantité $(I - G_\sigma * I)$ est le **Laplacien de Gaussienne** — elle extrait uniquement les détails haute fréquence (bords, contours).

Les paramètres utilisés dans le code :
- `sigma = 1.5` : rayon du flou gaussien
- `flat = 1.0` : intensité d'amplification sur les zones homogènes
- `jagged = 2.0` : intensité d'amplification sur les bords détectés (gradient élevé)

**Intuition** : on soustrait la version floue de l'image pour extraire les contours, puis on les réinjecte en les amplifiant. Les lettres deviennent plus tranchées.

---

### Étape 5 : Binarisation par seuillage

$$
p_{\text{out}} = \begin{cases} 255 & \text{si } p_{\text{in}} \geq 128 \\ 0 & \text{sinon} \end{cases}
$$

Ce seuillage global (seuil = 128) est une approximation efficace car les étapes 3 et 4 ont déjà normalisé et accentué l'image.

La méthode théoriquement optimale pour les scans à éclairage non uniforme est **Sauvola** (seuillage adaptatif local) :

$$
T(x, y) = \mu(x, y) \cdot \left[1 + k \cdot \left(\frac{\sigma(x, y)}{R} - 1\right)\right]
$$

où $\mu(x,y)$ et $\sigma(x,y)$ sont la moyenne et l'écart-type locaux dans une fenêtre autour du pixel $(x,y)$, $R = 128$ est la plage dynamique maximale, et $k \in [0.2, 0.5]$. Cette approche gère les variations d'éclairage local mais est plus coûteuse en calcul.

---

### Sortie : PNG sans compression

Le buffer est passé directement à Tesseract (pas de fichier temporaire). Le format PNG est utilisé car il est **sans perte** — les artefacts JPEG (compression DCT avec blocs 8×8) perturbent la segmentation des caractères par Tesseract.

---

## Synthèse du pipeline complet

```
Question utilisateur
       │
       ▼
  tokenize()          ← NFD + stop words + longueur > 2
       │
       ▼
  BM25 search()       ← IDF × TF saturée → top-5 passages
       │
       ▼
  LLM (Ollama)        ← ~3 000 chars de contexte ciblé au lieu de 20 000
       │
       ▼
  Réponse


Image scannée
       │
  greyscale()         ← Y = 0.299·R + 0.587·G + 0.114·B
       │
  resize (×2)         ← Lanczos3, si largeur < 1800 px
       │
  normalize()         ← stretch [pmin, pmax] → [0, 255]
       │
  sharpen()           ← Unsharp Mask, σ = 1.5
       │
  threshold(128)      ← binarisation
       │
  Tesseract OCR       ← OEM.DEFAULT, PSM.AUTO, fra+osd
       │
       ▼
  Texte extrait → BM25 Index
```

Les deux pipelines servent le même objectif : **maximiser la précision tout en minimisant le coût computationnel** — pas de GPU, pas d'API payante, tout tourne en local.

---

## Références

- Robertson, S. E., & Zaragoza, H. (2009). *The Probabilistic Relevance Framework: BM25 and Beyond*. Foundations and Trends in Information Retrieval.
- ITU-R BT.601 : *Studio encoding parameters of digital television for standard 4:3 and wide-screen 16:9 aspect ratios*.
- Lanczos, C. (1950). *An iteration method for the solution of the eigenvalue problem of linear differential and integral operators*.
- Sauvola, J., & Pietikäinen, M. (2000). *Adaptive document image binarization*. Pattern Recognition, 33(2), 225–236.
- Sharp documentation: https://sharp.pixelplumbing.com
- Tesseract OCR documentation: https://tesseract-ocr.github.io
