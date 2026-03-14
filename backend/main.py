"""
Chess Assist — Local Stockfish API
Run: uvicorn main:app --port 5555
"""

import asyncio
import os
from contextlib import asynccontextmanager
from typing import Optional

import chess
import chess.engine
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── Config ──────────────────────────────────────────────
STOCKFISH_PATH = os.getenv("STOCKFISH_PATH", "/usr/games/stockfish")
DEFAULT_DEPTH = 18
DEFAULT_MULTI_PV = 5
ENGINE_THREADS = 2
ENGINE_HASH_MB = 128

# ── Engine pool (one engine instance, reused across requests) ──
engine: Optional[chess.engine.SimpleEngine] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    print(f"[Chess Assist API] Starting Stockfish from {STOCKFISH_PATH}")
    try:
        engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
        engine.configure({"Threads": ENGINE_THREADS, "Hash": ENGINE_HASH_MB})
        print("[Chess Assist API] Stockfish ready ✓")
    except Exception as e:
        print(f"[Chess Assist API] Failed to start Stockfish: {e}")
        engine = None
    yield
    if engine:
        engine.quit()
        print("[Chess Assist API] Stockfish stopped")


app = FastAPI(title="Chess Assist API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ──────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    fen: str
    depth: int = Field(default=DEFAULT_DEPTH, ge=1, le=30)
    multipv: int = Field(default=DEFAULT_MULTI_PV, ge=1, le=10)


class MoveInfo(BaseModel):
    rank: int
    uci: str
    san: str
    score_cp: Optional[int] = None
    score_mate: Optional[int] = None
    score_display: str
    depth: int
    pv_uci: list[str]
    pv_san: list[str]


class AnalyzeResponse(BaseModel):
    fen: str
    depth: int
    moves: list[MoveInfo]
    turn: str  # "white" or "black"


# ── Helpers ─────────────────────────────────────────────
def format_score(score: chess.engine.PovScore, board: chess.Board) -> str:
    """Format score from the side-to-move's perspective."""
    relative = score.white()
    if relative.is_mate():
        m = relative.mate()
        return f"M{m}" if m and m > 0 else f"M{m}"
    cp = relative.score()
    if cp is None:
        return "?"
    val = cp / 100
    return f"{val:+.2f}"


def pv_to_san(board: chess.Board, pv: list[chess.Move]) -> list[str]:
    """Convert a PV line (list of moves) to SAN notation."""
    san_moves = []
    b = board.copy()
    for move in pv:
        try:
            san_moves.append(b.san(move))
            b.push(move)
        except Exception:
            san_moves.append(move.uci())
            break
    return san_moves


# ── Routes ──────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "engine": engine is not None}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    if engine is None:
        raise HTTPException(503, "Stockfish engine not available")

    # Validate FEN
    try:
        board = chess.Board(req.fen)
    except ValueError as e:
        raise HTTPException(400, f"Invalid FEN: {e}")

    # Run analysis in a thread (engine is synchronous)
    loop = asyncio.get_event_loop()
    try:
        results = await loop.run_in_executor(
            None,
            lambda: engine.analyse(
                board,
                chess.engine.Limit(depth=req.depth),
                multipv=req.multipv,
            ),
        )
    except chess.engine.EngineTerminatedError:
        raise HTTPException(503, "Engine crashed, please restart the server")
    except Exception as e:
        raise HTTPException(500, f"Analysis error: {e}")

    # Parse results
    moves: list[MoveInfo] = []
    for i, info in enumerate(results):
        pv = info.get("pv", [])
        if not pv:
            continue

        score: chess.engine.PovScore = info.get("score", chess.engine.PovScore(chess.engine.Cp(0), chess.WHITE))
        white_score = score.white()

        move_info = MoveInfo(
            rank=i + 1,
            uci=pv[0].uci(),
            san=board.san(pv[0]),
            score_cp=white_score.score() if not white_score.is_mate() else None,
            score_mate=white_score.mate() if white_score.is_mate() else None,
            score_display=format_score(score, board),
            depth=info.get("depth", req.depth),
            pv_uci=[m.uci() for m in pv],
            pv_san=pv_to_san(board, pv),
        )
        moves.append(move_info)

    return AnalyzeResponse(
        fen=req.fen,
        depth=req.depth,
        moves=moves,
        turn="white" if board.turn == chess.WHITE else "black",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=5555, reload=True)
