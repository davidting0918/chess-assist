# ♞ Chess Assist

> Real-time Stockfish analysis overlay for [Chess.com](https://chess.com) — powered by a local API.

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Chess.com-green?style=flat-square" />
  <img src="https://img.shields.io/badge/Engine-Stockfish%2016-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/Chrome-Extension%20MV3-yellow?style=flat-square" />
  <img src="https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square" />
</p>

---

## ✨ Features

- 🔍 **Top 5 best moves** with evaluation scores and full PV lines
- 🏹 **Move arrows** drawn directly on the chess board
- 📊 **Eval bar** showing who's winning
- ♔ **Auto-detects your color** (white/black) and shows a badge
- ⏸️ **Pause / Resume** analysis with one click
- 🔄 **Restart button** to re-analyze the current position
- 🎯 **Human Mode** — occasionally shows 2nd-best move to look more natural
- 🌙 **Dark / Light theme**
- ⚡ **Native Stockfish** — runs locally, 10x faster than browser-based engines
- 🌐 **Configurable API URL** — run locally or deploy to a remote server

---

## 📁 Project Structure

```
chess-assist/
├── extension/              ← Chrome Extension
│   ├── manifest.json       ← Extension config
│   ├── background.js       ← Service worker (settings only)
│   ├── content.js          ← Main logic: reads board → calls API → shows results
│   ├── popup/              ← Settings UI (click extension icon)
│   ├── overlay/            ← Analysis overlay (moves, eval bar, arrows)
│   ├── utils/              ← Board reader & FEN parser
│   └── icons/              ← Extension icons
│
├── backend/                ← Python FastAPI Server
│   ├── main.py             ← Stockfish API (analyze + health endpoints)
│   ├── requirements.txt    ← Python dependencies
│   └── README.md           ← Backend-specific docs
│
└── README.md               ← You are here
```

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.10+**
- **Google Chrome** (or Chromium-based browser)
- **Stockfish** chess engine

### Step 1: Install Stockfish

<details>
<summary><b>🪟 Windows</b></summary>

1. Go to [stockfishchess.org/download](https://stockfishchess.org/download/)
2. Download the **Windows** version (pick AVX2 if your CPU supports it)
3. Extract to `C:\stockfish\`
4. You should have something like `C:\stockfish\stockfish-windows-x86-64-avx2.exe`

</details>

<details>
<summary><b>🍎 macOS</b></summary>

```bash
brew install stockfish
```

</details>

<details>
<summary><b>🐧 Linux</b></summary>

```bash
sudo apt install stockfish
```

</details>

### Step 2: Start the Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

You should see:
```
[Chess Assist API] Found Stockfish at: /path/to/stockfish
[Chess Assist API] Stockfish ready ✓
[Chess Assist API] Starting on http://127.0.0.1:5555
```

> **💡 Stockfish not found?** Set the path manually:
> ```bash
> # Windows (PowerShell)
> $env:STOCKFISH_PATH="C:\stockfish\stockfish-windows-x86-64-avx2.exe"
> python main.py
>
> # macOS / Linux
> STOCKFISH_PATH=/path/to/stockfish python main.py
> ```
>
> Or create a `.env` file in the `backend/` folder:
> ```env
> STOCKFISH_PATH=C:\stockfish\stockfish-windows-x86-64-avx2.exe
> ```

### Step 3: Load the Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select the `extension/` folder from this project
5. You'll see the ♞ Chess Assist icon in your toolbar

### Step 4: Play Chess!

1. Go to [chess.com](https://www.chess.com) and start a game
2. The analysis overlay appears automatically on the board
3. **That's it!** You'll see the top moves, arrows, and eval bar

---

## 🎮 Usage Guide

### Overlay Controls

| Button | Action |
|--------|--------|
| `Auto` | Toggle automatic analysis on board changes |
| `Pause` / `Resume` | Pause or resume the engine |
| `Arrows` | Toggle move arrows on the board |
| `↻` (restart) | Re-connect to API and re-analyze |
| `—` (minimize) | Minimize the overlay panel |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + A` | Toggle analysis on/off |
| `Alt + R` | Re-analyze current position |

### Extension Popup (click ♞ icon)

| Setting | Description | Default |
|---------|-------------|---------|
| **Enable Analysis** | Master on/off toggle | ✅ On |
| **Search Depth** | How many moves ahead (10–24) | 18 |
| **Lines to Show** | Number of best moves (1–5) | 5 |
| **Human Mode** | Sometimes shows 2nd-best move first | Off |
| **API URL** | Backend server address | `http://127.0.0.1:5555` |
| **Show Arrows** | Draw move arrows on board | ✅ On |
| **Show Eval Bar** | Show evaluation bar | ✅ On |
| **Theme** | Dark or Light | Dark |

---

## 🌐 Deploy Backend Remotely (Optional)

You can host the backend on any server (Render, Railway, VPS, etc.):

```bash
# On your server
cd backend
pip install -r requirements.txt
HOST=0.0.0.0 PORT=5555 python main.py
```

Then update the **API URL** in the extension popup to your server's address (e.g., `https://your-app.onrender.com`).

---

## 🔌 API Reference

### `GET /health`

Check if the engine is running.

```json
{
  "status": "ok",
  "engine": true,
  "stockfish_path": "/usr/games/stockfish",
  "platform": "Linux"
}
```

### `POST /analyze`

Analyze a chess position.

**Request:**
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  "depth": 18,
  "multipv": 5
}
```

**Response:**
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  "depth": 18,
  "turn": "black",
  "moves": [
    {
      "rank": 1,
      "uci": "e7e5",
      "san": "e5",
      "score_cp": -25,
      "score_mate": null,
      "score_display": "+0.25",
      "depth": 18,
      "pv_uci": ["e7e5", "g1f3", "b8c6", "..."],
      "pv_san": ["e5", "Nf3", "Nc6", "..."]
    }
  ]
}
```

---

## ⚙️ Backend Configuration

All settings can be configured via environment variables or a `.env` file in the `backend/` folder:

| Variable | Default | Description |
|----------|---------|-------------|
| `STOCKFISH_PATH` | Auto-detected | Path to Stockfish binary |
| `ENGINE_THREADS` | `2` | Number of CPU threads for Stockfish |
| `ENGINE_HASH_MB` | `128` | Hash table size in MB |
| `HOST` | `127.0.0.1` | Server bind address |
| `PORT` | `5555` | Server port |

---

## 🔧 Troubleshooting

<details>
<summary><b>"Start local API server" in overlay</b></summary>

The extension can't reach the backend. Make sure:
1. The backend is running (`python main.py`)
2. The API URL in extension settings matches the backend address
3. No firewall blocking port 5555

</details>

<details>
<summary><b>"Engine not loaded" in overlay</b></summary>

The backend is running but Stockfish wasn't found. Check the terminal for error messages and set `STOCKFISH_PATH` manually.

</details>

<details>
<summary><b>No overlay on Chess.com</b></summary>

- Make sure the extension is enabled in `chrome://extensions/`
- Refresh the Chess.com page
- The overlay only appears on game pages (`/game/live/*`, `/play/*`, etc.)

</details>

<details>
<summary><b>Extension permission error on API calls</b></summary>

If you changed the API URL to a remote server, make sure the URL is allowed in the extension's `host_permissions` in `manifest.json`.

</details>

---

## 📋 Supported Pages

| Chess.com URL Pattern | Description |
|----------------------|-------------|
| `/game/live/*` | Live games |
| `/play/*` | Play page |
| `/game/daily/*` | Daily / correspondence |
| `/live/*` | Live games (alt URL) |
| `/daily/*` | Daily games (alt URL) |

---

## ⚠️ Disclaimer

This tool is intended for **educational and training purposes only** — such as post-game analysis and studying positions.

Using engine assistance during rated games violates [Chess.com's Fair Play Policy](https://www.chess.com/article/view/chess-com-fair-play-policy). Use responsibly.

---

## 📄 License

MIT
