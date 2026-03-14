# Chess Assist

Real-time Stockfish analysis overlay for Chess.com — a Chrome extension + local API server.

```
chess-assist/
├── extension/     ← Chrome Extension (reads board, shows analysis)
└── backend/       ← Python FastAPI server (runs Stockfish)
```

## How It Works

1. **Backend** runs Stockfish locally and exposes a simple REST API
2. **Extension** reads the Chess.com board DOM, sends the FEN to the API, and displays best moves with arrows and eval bar

## Setup

### 1. Backend (Stockfish API)

```bash
# Install Stockfish
# Windows: download from https://stockfishchess.org/download/ → extract to C:\stockfish\
# macOS:   brew install stockfish
# Linux:   sudo apt install stockfish

# Install Python deps & run
cd backend
pip install -r requirements.txt
python main.py
```

The server auto-detects Stockfish. If it can't find it, set `STOCKFISH_PATH`:
```bash
# Windows
set STOCKFISH_PATH=C:\stockfish\stockfish.exe
python main.py

# macOS/Linux
STOCKFISH_PATH=/path/to/stockfish python main.py
```

Server runs at `http://127.0.0.1:5555`. See [backend/README.md](backend/README.md) for config options.

### 2. Chrome Extension

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension/` folder
4. Open a game on [Chess.com](https://www.chess.com)
5. The analysis overlay appears automatically

#### Settings (click extension icon)

- **API URL** — where to reach the Stockfish server (default: `http://127.0.0.1:5555`)
- **Search Depth** — how deep Stockfish analyses (10–24)
- **Lines to Show** — number of best moves (1–5)
- **Human Mode** — occasionally shows 2nd-best move first
- **Show Arrows / Eval Bar** — toggle visual overlays
- **Theme** — dark or light

#### Keyboard Shortcuts

| Key | Action |
|---|---|
| `Alt+A` | Toggle analysis on/off |
| `Alt+R` | Re-analyze current position |

## Deploying the Backend Remotely

You can run the backend on any server (e.g. Render, Railway, a VPS):

```bash
# On your server
cd backend
pip install -r requirements.txt
HOST=0.0.0.0 PORT=5555 python main.py
```

Then in the extension popup, change **API URL** to `https://your-server.onrender.com` (or wherever it's hosted).

## Supported Chess.com Pages

- `/game/live/*` — Live games
- `/play/*` — Play page
- `/game/daily/*` — Daily games
- `/live/*`, `/daily/*`

## Disclaimer

For educational and training purposes. Using engine assistance during rated games violates Chess.com's fair play policy.

## License

MIT
