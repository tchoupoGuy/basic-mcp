.PHONY: help install server client dev stop-server stop-client stop ollama

OLLAMA := $(LOCALAPPDATA)/Programs/Ollama/ollama.exe
SERVER_PID_FILE := .server.pid
CLIENT_PID_FILE := .client.pid

help: ## Afficher l'aide
	@echo ""
	@echo "  make install       Installer les dependances (server + client)"
	@echo "  make ollama        Telecharger le modele llama3.2"
	@echo "  make server        Demarrer le serveur HTTP (port 3001)"
	@echo "  make client        Demarrer le client Vite (port 5173)"
	@echo "  make dev           Demarrer serveur + client en meme temps"
	@echo "  make stop          Arreter tous les processus"
	@echo ""

## ── Installation ──────────────────────────────────────────────────────────────

install: ## Installer toutes les dependances
	npm install
	cd client && npm install

## ── Ollama ────────────────────────────────────────────────────────────────────

ollama: ## Telecharger le modele llama3.2
	"$(OLLAMA)" pull llama3.2

## ── Demarrer ──────────────────────────────────────────────────────────────────

server: ## Demarrer le serveur HTTP (port 3001)
	npm run start:http

client: ## Demarrer le client Vite (port 5173)
	cd client && npm run dev

dev: ## Demarrer serveur + client (deux terminaux)
	start "MCP Server" cmd /k "npm run start:http"
	start "MCP Client" cmd /k "cd client && npm run dev"

## ── Arreter ───────────────────────────────────────────────────────────────────

stop: ## Arreter les processus sur les ports 3001 et 5173
	@echo Arret du serveur (port 3001)...
	-for /f "tokens=5" %p in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do taskkill /PID %p /F
	@echo Arret du client (port 5173)...
	-for /f "tokens=5" %p in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /PID %p /F
	@echo Done.
