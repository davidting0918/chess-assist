# Chess Assist — Local Stockfish API

## Quick Start

```bash
# Install deps
pip install -r requirements.txt

# Install Stockfish (macOS)
brew install stockfish

# Install Stockfish (Ubuntu)
sudo apt install stockfish

# Run the server
python main.py
# or
uvicorn main:app --port 5555
```

Server runs at `http://127.0.0.1:5555`

## API

### `GET /health`
Check if engine is running.

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
      "pv_uci": ["e7e5", "g1f3", ...],
      "pv_san": ["e5", "Nf3", ...]
    }
  ]
}
```

## Config

| Env Var | Default | Description |
|---------|---------|-------------|
| `STOCKFISH_PATH` | `/usr/games/stockfish` | Path to Stockfish binary |

For macOS, usually: `STOCKFISH_PATH=/opt/homebrew/bin/stockfish python main.py`
