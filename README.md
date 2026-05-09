# basic-mcp

Un serveur MCP (Model Context Protocol) avec une interface React, exposant des **outils**, **ressources** et **prompts** autour des utilisateurs GitHub et de la météo.

## Structure du projet

```
basic-mcp/
├── server/          # Serveur MCP (Node.js / TypeScript)
│   ├── main.ts      # Point d'entrée — transport stdio
│   ├── server-http.ts # Point d'entrée — transport HTTP (Streamable HTTP)
│   └── src/
│       ├── application/   # Cas d'usage (GetGitHubUser, GetWeather)
│       ├── domain/        # Entités et ports (interfaces)
│       ├── infrastructure/ # Implémentations des repositories
│       └── interface/mcp/
│           ├── tools/     # Outils MCP
│           ├── resources/ # Ressources MCP
│           └── prompts/   # Prompts MCP
└── client/          # Interface React + Vite
    └── src/
        ├── application/hooks/  # useMcpTool, useMcpResource, useMcpPrompt
        ├── domain/             # Entités côté client
        ├── infrastructure/mcp/ # Adaptateur MCP client
        └── presentation/       # Composants React
```

## Prérequis

- Node.js >= 18
- npm >= 9

## Installation

```bash
npm install
cd client && npm install
```

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

## Outils MCP disponibles

| Outil | Paramètres | Description |
|---|---|---|
| `ping-server` | `message` | Vérifie que le serveur répond |
| `get-github-user` | `username` | Retourne les infos d'un utilisateur GitHub |
| `get-weather` | `city` **ou** `latitude` + `longitude` | Retourne la météo actuelle (via Open-Meteo, sans clé API) |
| `read-log-file` | `filename`, `lastLines` *(optionnel)* | Lit un fichier `.log` du dossier `logs/`. Si `lastLines` est fourni, retourne uniquement les N dernières lignes |

## Ressources MCP disponibles

| URI | Description |
|---|---|
| `github://users/{username}` | Profil GitHub d'un utilisateur |
| `weather://forecast/{latitude},{longitude}` | Météo pour des coordonnées GPS |
| `weather://city/{city}` | Météo pour une ville (géocodage automatique) |
| `logs://{filename}` | Contenu brut d'un fichier `.log` du dossier `logs/` |

## Prompts MCP disponibles

Les prompts retournent des messages structurés prêts à être envoyés à un LLM.

| Prompt | Paramètres | Description |
|---|---|---|
| `analyze-weather` | `city`, `language` (`fr`/`en`) | Analyse la météo d'une ville avec conseils pratiques |
| `compare-weather` | `city1`, `city2` | Compare la météo entre deux villes |
| `summarize-github-user` | `username` | Rédige une biographie professionnelle à partir du profil GitHub |

## Architecture

Le projet suit les principes de la **Clean Architecture** :

- **Domain** — entités et interfaces de ports (aucune dépendance externe)
- **Application** — cas d'usage orchestrant la logique métier
- **Infrastructure** — appels HTTP aux APIs externes (GitHub, Open-Meteo, géocodage)
- **Interface** — exposition via le protocole MCP (outils, ressources, prompts)

## APIs externes utilisées

| API | Usage | Clé requise |
|---|---|---|
| [GitHub REST API](https://docs.github.com/en/rest) | Profils utilisateurs | Non |
| [Open-Meteo Forecast](https://open-meteo.com/) | Données météo | Non |
| [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | Conversion ville → coordonnées | Non |
