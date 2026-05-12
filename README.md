# basic-mcp

Un serveur MCP (Model Context Protocol) avec une interface React, exposant des **outils**, **ressources** et **prompts** autour des utilisateurs GitHub, de la météo et d'un système d'étude de documents (PMP).

## Structure du projet

```
basic-mcp/
├── server/
│   ├── main.ts            # Point d'entrée — transport stdio
│   ├── server-http.ts     # Point d'entrée — transport HTTP (Streamable HTTP)
│   └── src/
│       ├── application/   # Cas d'usage (GetGitHubUser, GetWeather)
│       ├── domain/        # Entités et ports (interfaces)
│       ├── infrastructure/
│       │   ├── ocr/
│       │   │   ├── tesseractWorker.ts   # Worker Tesseract singleton (cache local)
│       │   └── └── imagePreprocessor.ts # Pipeline Sharp (gris → upscale → normalize → sharpen → binarize)
│       │   ├── repositories/    # Appels APIs externes
│       │   ├── search/
│       │   │   └── bm25Engine.ts    # Moteur BM25 (TypeScript pur, zéro dépendance)
│       │   └── vision/
│       │       └── githubVisionService.ts # GPT-4o Vision (fallback optionnel)
│       └── interface/
│           ├── chat/      # Route /chat (Ollama + outils via MCP in-process)
│           └── mcp/
│               ├── tools/     # Outils MCP
│               ├── resources/ # Ressources MCP
│               └── prompts/   # Prompts MCP
├── client/
│   └── src/
│       ├── application/hooks/  # useMcpTool, useMcpResource, useMcpPrompt, useChat
│       ├── domain/             # Entités côté client
│       ├── infrastructure/mcp/ # Adaptateur MCP client (HTTP)
│       └── presentation/       # Composants React
└── output/
    └── document-index.json     # Index BM25 du document (généré par extract-document-index)
```

## Prérequis

- Node.js >= 18
- npm >= 9
- [Ollama](https://ollama.com/) avec le modèle `llama3.2` pour le chat local

```bash
ollama pull llama3.2
```

## Installation

```bash
npm install
cd client && npm install
```

## Variables d'environnement

Créez un fichier `.env` à la racine du projet :

```env
# Optionnel — fallback GPT-4o Vision si confiance OCR < 40%
# Sans ce token, l'extraction est 100% locale (Tesseract + Sharp)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Optionnel — langue OCR Tesseract (défaut : fra)
OCR_LANGUAGE=fra

# Optionnel — modèle Ollama pour le chat et generate-quiz (défaut : llama3.2)
OLLAMA_MODEL=llama3.2

# Optionnel — chemin vers le dossier de chapitres à indexer
DOCUMENT_BASE_PATH=./Management_de_project_Logiciels
```

> Sans `GITHUB_TOKEN`, tout le projet fonctionne **100% hors ligne** :
> - OCR via Tesseract + prétraitement Sharp
> - Chat et quiz via Ollama local
> - Recherche documentaire via BM25

## Démarrage

### Serveur seul (stdio)

```bash
npm run start
```

### Serveur HTTP (port 3001)

```bash
npm run start:http
```

### Serveur HTTP + Interface React

```bash
npm run start:ui
```

L'interface est accessible sur `http://localhost:5173`.  
Le serveur MCP HTTP écoute sur `http://localhost:3001/mcp`.  
Le endpoint de chat est disponible sur `http://localhost:3001/chat`.

## Outils MCP disponibles

### Outils généraux

| Outil | Paramètres | Description |
|---|---|---|
| `ping-server` | `message` | Vérifie que le serveur répond |
| `get-github-user` | `username` | Retourne les infos d'un utilisateur GitHub |
| `get-weather` | `city` **ou** `latitude` + `longitude` | Retourne la météo actuelle (Open-Meteo, sans clé API) |
| `read-log-file` | `filename`, `lastLines` *(optionnel)* | Lit un fichier `.log` du dossier `logs/` |

### Outils document / étude PMP

| Outil | Paramètres | Description |
|---|---|---|
| `extract-document-index` | `chapters`, `force` | Extrait le texte des images via **Tesseract + Sharp** (local). Fallback GPT-4o Vision si confiance OCR < 40% et `GITHUB_TOKEN` présent |
| `ask-document` | `question`, `chapter`, `pmpFocus` | Recherche les passages pertinents via **BM25** puis synthèse via **Ollama** (fallback GPT-4o). Mode BM25 pur si aucun LLM disponible |
| `generate-quiz` | `chapter`, `count`, `domain` | Génère des QCM style examen PMP via **Ollama** (fallback GPT-4o) |
| `generate-document-pdf` | `chapters`, `mode`, `filename` | Génère un PDF du document (images, texte ou mixte) |

## Ressources MCP disponibles

| URI | Description |
|---|---|
| `github://users/{username}` | Profil GitHub d'un utilisateur |
| `weather://forecast/{latitude},{longitude}` | Météo pour des coordonnées GPS |
| `weather://city/{city}` | Météo pour une ville |
| `logs://{filename}` | Contenu brut d'un fichier `.log` |
| `document://chapters` | Liste des chapitres disponibles dans l'index |

## Prompts MCP disponibles

| Prompt | Paramètres | Description |
|---|---|---|
| `analyze-weather` | `city`, `language` (`fr`/`en`) | Analyse la météo d'une ville avec conseils pratiques |
| `compare-weather` | `city1`, `city2` | Compare la météo entre deux villes |
| `summarize-github-user` | `username` | Rédige une biographie professionnelle à partir du profil GitHub |

## Architecture

Le projet suit les principes de la **Clean Architecture** :

- **Domain** — entités et interfaces de ports (aucune dépendance externe)
- **Application** — cas d'usage orchestrant la logique métier
- **Infrastructure** — implémentations des ports : repositories, OCR, vision, **moteur BM25**
- **Interface** — exposition via MCP (tools, resources, prompts) et via REST (`/chat`)

### Chat et MCP : intégration in-process

Le endpoint `/chat` ne duplique pas les outils MCP. Il crée un client MCP connecté au serveur
**en mémoire** via `InMemoryTransport`, découvre dynamiquement tous les outils enregistrés
et les expose au LLM (Ollama `llama3.2`) via le Vercel AI SDK :

```
/chat request
    └─► mcpClient.listTools()       ← tous les outils MCP automatiquement
    └─► streamText(ollama, tools)   ← le LLM choisit et appelle les outils
    └─► mcpClient.callTool(...)     ← exécution via MCP in-process
```

### Pipeline OCR local (Tesseract + Sharp)

L'extraction de texte est entièrement locale. `imagePreprocessor.ts` applique
une chaîne de transformations mathématiques avant de passer l'image à Tesseract :

```
Image originale
    │
    ├─ 1. Niveaux de gris      Y = 0.299·R + 0.587·G + 0.114·B
    ├─ 2. Upscale ×2           si largeur < 1800px (interpolation Lanczos 3)
    ├─ 3. Normalize             étire l'histogramme → [0, 255]
    ├─ 4. Unsharp Mask          renforce les bords des caractères (σ=1.5)
    ├─ 5. Binarisation          seuil 128 → noir/blanc pur
    └─ Buffer PNG → Tesseract
```

Si la confiance Tesseract est < 40% **et** que `GITHUB_TOKEN` est présent,
GPT-4o Vision prend le relais pour cette page uniquement.

### Moteur de recherche BM25

`ask-document` utilise un moteur **BM25** implémenté en TypeScript pur (zéro dépendance) :

$$\text{score}(q, d) = \sum_{t \in q} \log\frac{N - n_t + 0.5}{n_t + 0.5} \times \frac{f(t,d) \cdot (k_1+1)}{f(t,d) + k_1 \cdot \left(1 - b + b \cdot \frac{|d|}{\text{avgdl}}\right)}$$

Avec $k_1 = 1.5$ et $b = 0.75$. Cela permet de retrouver les 5 passages les plus pertinents
avant de les envoyer au LLM, réduisant la consommation de tokens de **5 à 10×**.

## Dépendances externes et niveau d'autonomie

| Composant | Sans clé API | Avec `GITHUB_TOKEN` |
|-----------|-------------|---------------------|
| OCR / indexation | Tesseract local | Tesseract + fallback GPT-4o Vision |
| Chat (`/chat`) | Ollama local | Ollama local |
| `ask-document` | BM25 + Ollama | BM25 + Ollama (fallback GPT-4o) |
| `generate-quiz` | Ollama local | Ollama local (fallback GPT-4o) |
| Météo / GitHub | APIs publiques (sans clé) | idem |

## APIs externes utilisées

| API | Usage | Clé requise |
|---|---|---|
| [GitHub REST API](https://docs.github.com/en/rest) | Profils utilisateurs | Non |
| [Open-Meteo Forecast](https://open-meteo.com/) | Données météo | Non |
| [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | Ville → coordonnées | Non |
| [GitHub Models (GPT-4o)](https://github.com/marketplace/models) | Fallback vision OCR uniquement | Optionnel (`GITHUB_TOKEN`) |
