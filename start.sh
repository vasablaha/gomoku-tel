#!/bin/bash

# Barvy pro výstup
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   GOMOKU - Telegram Mini App Starter${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Kontrola ngrok
if ! command -v ngrok &> /dev/null; then
    echo -e "${YELLOW}ngrok není nainstalován!${NC}"
    echo "Instaluj pomocí: brew install ngrok"
    echo "Nebo stáhni z: https://ngrok.com/download"
    exit 1
fi

# Získej cestu ke skriptu
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Ukončí předchozí procesy
echo -e "${YELLOW}Ukončuji předchozí procesy...${NC}"
pkill -f "node server.js" 2>/dev/null
pkill -f "vite" 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

# Spusť backend
echo -e "${GREEN}Spouštím backend...${NC}"
cd "$SCRIPT_DIR/backend"
npm start &
BACKEND_PID=$!
sleep 2

# Spusť frontend
echo -e "${GREEN}Spouštím frontend...${NC}"
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!
sleep 3

# Spusť ngrok pro oba porty
echo -e "${GREEN}Spouštím ngrok tunely...${NC}"

# Backend tunel
ngrok http 3001 --log=stdout > /tmp/ngrok_backend.log 2>&1 &
NGROK_BACKEND_PID=$!
sleep 3

# Frontend tunel
ngrok http 5173 --log=stdout > /tmp/ngrok_frontend.log 2>&1 &
NGROK_FRONTEND_PID=$!
sleep 3

# Získej ngrok URLs
echo -e "${YELLOW}Získávám ngrok URLs...${NC}"
sleep 2

BACKEND_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)
FRONTEND_URL=$(curl -s http://localhost:4041/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)

# Pokud ngrok API nefunguje, zkus alternativní metodu
if [ -z "$BACKEND_URL" ]; then
    BACKEND_URL=$(grep -o 'url=https://[^"]*' /tmp/ngrok_backend.log 2>/dev/null | head -1 | cut -d'=' -f2)
fi

if [ -z "$FRONTEND_URL" ]; then
    # Počkej déle a zkus znovu
    sleep 3
    TUNNELS=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null)
    BACKEND_URL=$(echo "$TUNNELS" | grep -o '"public_url":"https://[^"]*' | grep -v '5173' | head -1 | cut -d'"' -f4)
    FRONTEND_URL=$(echo "$TUNNELS" | grep -o '"public_url":"https://[^"]*' | grep '5173' | head -1 | cut -d'"' -f4)

    # Pokud stále nic, zkus všechny tunely
    if [ -z "$FRONTEND_URL" ]; then
        ALL_URLS=$(echo "$TUNNELS" | grep -o '"public_url":"https://[^"]*' | cut -d'"' -f4)
        BACKEND_URL=$(echo "$ALL_URLS" | head -1)
        FRONTEND_URL=$(echo "$ALL_URLS" | tail -1)
    fi
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Vše běží!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Backend URL:  ${YELLOW}${BACKEND_URL:-http://localhost:3001}${NC}"
echo -e "Frontend URL: ${YELLOW}${FRONTEND_URL:-http://localhost:5173}${NC}"
echo ""

# Aktualizuj .env soubor
if [ -n "$BACKEND_URL" ]; then
    cat > "$SCRIPT_DIR/frontend/.env" << EOF
VITE_BACKEND_URL=$BACKEND_URL
VITE_BOT_USERNAME=YOUR_BOT_USERNAME
EOF
    echo -e "${GREEN}.env soubor aktualizován${NC}"

    # Restartuj frontend aby načetl nový .env
    kill $FRONTEND_PID 2>/dev/null
    sleep 1
    cd "$SCRIPT_DIR/frontend"
    npm run dev &
    FRONTEND_PID=$!
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}NASTAVENÍ V BOTFATHER:${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "1. Otevři @BotFather v Telegramu"
echo "2. Pošli: /newbot (pokud nemáš bota)"
echo "3. Pošli: /setmenubutton"
echo "4. Vyber svého bota"
echo "5. Zadej URL: ${FRONTEND_URL:-FRONTEND_URL}"
echo "6. Zadej text tlačítka: Hrát Gomoku"
echo ""
echo "Nebo pro Mini App odkaz:"
echo "1. Pošli: /newapp"
echo "2. Vyber bota"
echo "3. Zadej název: Gomoku"
echo "4. Zadej URL: ${FRONTEND_URL:-FRONTEND_URL}"
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "Pro ukončení stiskni ${YELLOW}Ctrl+C${NC}"
echo -e "${BLUE}========================================${NC}"

# Cleanup při ukončení
cleanup() {
    echo ""
    echo -e "${YELLOW}Ukončuji...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    kill $NGROK_BACKEND_PID 2>/dev/null
    kill $NGROK_FRONTEND_PID 2>/dev/null
    pkill -f ngrok 2>/dev/null
    echo -e "${GREEN}Hotovo!${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Čekej
wait
