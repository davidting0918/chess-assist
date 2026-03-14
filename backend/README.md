# Chess Assist — Stockfish API Backend

Local (or remote) FastAPI server that wraps Stockfish for the Chess Assist extension.

## Quick Start

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Server runs at `http://127.0.0.1:5555` by default.

## Install Stockfish

The server auto-detects Stockfish in common locations. If it can't find it:

### Windows
1. Download from https://stockfishchess.org/download/
2. Extract to `C:\stockfish\`
3. Either add to PATH or set: `set STOCKFISH_PATH=C:\stockfish\stockfish.exe`

### macOS
```bash
brew install stockfish
```

### Linux
```bash
sudo apt install stockfish
```

## Configuration

Set via environment variables or a `.env` file in this directory:

| Variable | Default | Description |
|---|---|---|
| `STOCKFISH_PATH` | (auto-detect) | Path to Stockfish binary |
| `ENGINE_THREADS` | `2` | CPU threads for Stockfish |
| `ENGINE_HASH_MB` | `128` | Hash table size in MB |
| `HOST` | `127.0.0.1` | Server bind address |
| `PORT` | `5555` | Server port |

Example `.env`:
```
STOCKFISH_PATH=C:\stockfish\stockfish.exe
ENGINE_THREADS=4
ENGINE_HASH_MB=256
PORT=5555
```

## API

### `GET /health`
```json
{ "status": "ok", "engine": true, "stockfish_path": "/usr/games/stockfish", "platform": "Linux" }
```

### `POST /analyze`
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  "depth": 18,
  "multipv": 5
}
```

Response:
```json
{
  "fen": "...",
  "depth": 18,
  "turn": "black",
  "moves": [
    {
      "rank": 1,
      "uci": "e7e5",
      "san": "e5",
      "score_cp": -25,
      "score_mate": null,
      "score_display": "-0.25",
      "depth": 18,
      "pv_uci": ["e7e5", "g1f3"],
      "pv_san": ["e5", "Nf3"]
    }
  ]
}
```
