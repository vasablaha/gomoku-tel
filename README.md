# Gomoku - Telegram Mini App

Multiplayer Gomoku (piškvorky 5 v řadě) hra pro Telegram Mini Apps.

## Quick Deploy (Produkce)

### 1. Push na GitHub

```bash
./deploy.sh
```

### 2. Deploy Backend na Railway (zdarma)

1. Jdi na [railway.app](https://railway.app)
2. "New Project" → "Deploy from GitHub repo"
3. Vyber tento repo, nastav **Root Directory: `backend`**
4. Railway automaticky deployne
5. Zkopíruj URL (např. `https://gomoku-xxx.railway.app`)

### 3. Deploy Frontend na Vercel (zdarma)

1. Jdi na [vercel.com](https://vercel.com)
2. "Add New" → "Project" → Importuj repo
3. Nastav:
   - **Root Directory:** `frontend`
   - **Framework:** Vite
   - **Environment Variables:**
     - `VITE_BACKEND_URL` = Railway URL z kroku 2
     - `VITE_BOT_USERNAME` = jméno tvého bota
4. Deploy
5. Zkopíruj URL (např. `https://gomoku.vercel.app`)

### 4. Nastav Telegram Bot

1. Otevři [@BotFather](https://t.me/BotFather)
2. `/newbot` (pokud nemáš) nebo vyber existujícího
3. `/setmenubutton` → vyber bota → zadej Vercel URL
4. Hotovo!

## Lokální vývoj

```bash
# Backend
cd backend && npm install && npm start

# Frontend (nový terminál)
cd frontend && npm install && npm run dev
```

## Jak to funguje

1. Hráč A otevře Mini App → klikne "Nová hra"
2. Dostane odkaz `t.me/bot?startapp=gameId`
3. Pošle odkaz Hráči B
4. Oba hrají v reálném čase

## Tech Stack

- **Frontend:** React, Vite, Tailwind, @tma.js/sdk
- **Backend:** Node.js, Express, Socket.io
- **Hosting:** Railway (backend), Vercel (frontend)
