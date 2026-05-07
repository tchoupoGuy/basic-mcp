# basic-mcp

Un serveur MCP (Model Context Protocol) avec une interface React, exposant des outils et ressources autour des utilisateurs GitHub et de la météo.

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
│       └── interface/mcp/ # Outils et ressources MCP exposés
└── client/          # Interface React + Vite
    └── src/
        ├── application/hooks/  # useMcpTool, useMcpResource
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

| Outil | Description |
|---|---|
| `ping` | Vérifie que le serveur répond |
| `get-github-user` | Retourne les infos d'un utilisateur GitHub |
| `get-weather` | Retourne la météo pour une latitude/longitude |

## Ressources MCP disponibles

| URI | Description |
|---|---|
| `github-user://{username}` | Profil GitHub d'un utilisateur |
| `weather://{lat},{lon}` | Météo pour des coordonnées GPS |

## Architecture

Le projet suit les principes de la **Clean Architecture** :

- **Domain** — entités et interfaces de ports (aucune dépendance externe)
- **Application** — cas d'usage orchestrant la logique métier
- **Infrastructure** — appels HTTP aux APIs externes (GitHub, Open-Meteo)
- **Interface** — exposition via le protocole MCP
