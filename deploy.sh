#!/bin/bash

# Barvy
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   GOMOKU - Deployment Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Kontrola git
if ! command -v git &> /dev/null; then
    echo -e "${RED}Git není nainstalován!${NC}"
    exit 1
fi

# Kontrola gh CLI (pro Railway)
if ! command -v gh &> /dev/null; then
    echo -e "${YELLOW}GitHub CLI není nainstalován.${NC}"
    echo "Pro automatický deploy nainstaluj: brew install gh"
fi

# 1. Inicializace Git repozitáře
echo -e "${GREEN}1. Inicializace Git...${NC}"
cd "$SCRIPT_DIR"

if [ ! -d ".git" ] || [ -z "$(git remote -v)" ]; then
    git init 2>/dev/null
    git add .
    git commit -m "Initial commit - Gomoku Telegram Mini App"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}DEPLOYMENT INSTRUKCE${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}KROK 1: Deploy Backend na Railway${NC}"
echo "----------------------------------------"
echo "1. Jdi na https://railway.app"
echo "2. Přihlaš se přes GitHub"
echo "3. Klikni 'New Project' → 'Deploy from GitHub repo'"
echo "4. Vyber tento repozitář"
echo "5. Railway detekuje backend složku - vyber 'backend'"
echo "6. Po deployi získáš URL jako: https://xxx.railway.app"
echo "7. Zkopíruj tuto URL!"
echo ""
echo -e "${GREEN}KROK 2: Deploy Frontend na Vercel${NC}"
echo "----------------------------------------"
echo "1. Jdi na https://vercel.com"
echo "2. Přihlaš se přes GitHub"
echo "3. Klikni 'Add New' → 'Project'"
echo "4. Importuj tento repozitář"
echo "5. Nastav:"
echo "   - Root Directory: frontend"
echo "   - Framework Preset: Vite"
echo "   - Environment Variables:"
echo "     VITE_BACKEND_URL = (URL z Railway)"
echo "     VITE_BOT_USERNAME = tvuj_bot_username"
echo "6. Klikni Deploy"
echo "7. Získáš URL jako: https://gomoku-xxx.vercel.app"
echo ""
echo -e "${GREEN}KROK 3: Nastav BotFather${NC}"
echo "----------------------------------------"
echo "1. Otevři @BotFather v Telegramu"
echo "2. /setmenubutton → vyber bota → zadej Vercel URL"
echo "3. Nebo /newapp pro sdílený odkaz"
echo ""
echo -e "${BLUE}========================================${NC}"
echo ""

# Nabídka pro push na GitHub
read -p "Chceš vytvořit GitHub repo a pushnout? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v gh &> /dev/null; then
        echo -e "${GREEN}Vytvářím GitHub repozitář...${NC}"

        # Kontrola jestli už remote existuje
        if git remote get-url origin &>/dev/null; then
            echo "Remote 'origin' již existuje"
        else
            gh repo create gomoku-telegram --public --source=. --push
        fi

        echo ""
        echo -e "${GREEN}Repozitář vytvořen!${NC}"
        echo "Teď můžeš pokračovat s Railway a Vercel deploymenty."
    else
        echo -e "${YELLOW}GitHub CLI není nainstalován.${NC}"
        echo "Vytvoř repo ručně na https://github.com/new"
        echo "Pak spusť:"
        echo "  git remote add origin https://github.com/TVUJ_USERNAME/gomoku-telegram.git"
        echo "  git push -u origin main"
    fi
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Hotovo! Postupuj podle instrukcí výše.${NC}"
echo -e "${BLUE}========================================${NC}"
