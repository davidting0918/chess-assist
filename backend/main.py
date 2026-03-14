"""
Chess Assist — Stockfish Analysis API
Run: python main.py
  or: uvicorn main:app --host 127.0.0.1 --port 5555
"""

import asyncio
import logging
import os
import platform
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import chess
import chess.engine

# Suppress noisy python-chess PV parsing warnings (non-fatal)
logging.getLogger("chess.engine").setLevel(logging.ERROR)

logger = logging.getLogger("chess_assist")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── .env support (optional) ─────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed, that's fine

# ── Config ──────────────────────────────────────────────
DEFAULT_DEPTH = 18
DEFAULT_MULTI_PV = 5
ENGINE_THREADS = int(os.getenv("ENGINE_THREADS", "2"))
ENGINE_HASH_MB = int(os.getenv("ENGINE_HASH_MB", "128"))
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "5555"))


def find_stockfish() -> Optional[str]:
    """Auto-detect Stockfish binary across Windows, macOS, and Linux."""
    # 1) Explicit env var always wins
    env_path = os.getenv("STOCKFISH_PATH")
    if env_path and Path(env_path).is_file():
        return env_path

    # 2) Check if it's on PATH
    on_path = shutil.which("stockfish")
    if on_path:
        return on_path

    # 3) OS-specific common locations
    system = platform.system()
    candidates: list[str] = []

    if system == "Windows":
        candidates = [
            r"C:\stockfish\stockfish.exe",
            r"C:\stockfish\stockfish-windows-x86-64-avx2.exe",
            r"C:\Program Files\Stockfish\stockfish.exe",
            r"C:\Program Files (x86)\Stockfish\stockfish.exe",
            os.path.expanduser(r"~\stockfish\stockfish.exe"),
            os.path.expanduser(r"~\Downloads\stockfish\stockfish.exe"),
            os.path.expanduser(r"~\Desktop\stockfish\stockfish.exe"),
        ]
    elif system == "Darwin":  # macOS
        candidates = [
            "/opt/homebrew/bin/stockfish",
            "/usr/local/bin/stockfish",
            os.path.expanduser("~/stockfish/stockfish"),
            os.path.expanduser("~/Downloads/stockfish/stockfish"),
        ]
    else:  # Linux
        candidates = [
            "/usr/games/stockfish",
            "/usr/bin/stockfish",
            "/usr/local/bin/stockfish",
            "/snap/bin/stockfish",
            os.path.expanduser("~/stockfish/stockfish"),
        ]

    for path in candidates:
        if Path(path).is_file():
            return path

    return None


# ── Engine pool (one engine instance, reused across requests) ──
engine: Optional[chess.engine.SimpleEngine] = None
stockfish_path: Optional[str] = None
engine_lock: asyncio.Lock = None  # initialized in lifespan


def start_engine() -> Optional[chess.engine.SimpleEngine]:
    """Start (or restart) the Stockfish engine. Returns the engine or None."""
    global stockfish_path
    if not stockfish_path:
        return None
    try:
        eng = chess.engine.SimpleEngine.popen_uci(stockfish_path)
        eng.configure({"Threads": ENGINE_THREADS, "Hash": ENGINE_HASH_MB})
        logger.info("Stockfish engine started ✓")
        return eng
    except Exception as e:
        logger.error("Failed to start Stockfish: %s", e)
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine, stockfish_path, engine_lock

    engine_lock = asyncio.Lock()
    stockfish_path = find_stockfish()

    if not stockfish_path:
        print()
        print("=" * 60)
        print("  ERROR: Stockfish not found!")
        print()
        print(f"  OS detected: {platform.system()}")
        print()
        if platform.system() == "Windows":
            print("  Install options:")
            print("    1. Download from https://stockfishchess.org/download/")
            print("    2. Extract to C:\\stockfish\\")
            print("    3. Set STOCKFISH_PATH=C:\\stockfish\\stockfish.exe")
        elif platform.system() == "Darwin":
            print("  Install: brew install stockfish")
        else:
            print("  Install: sudo apt install stockfish")
        print()
        print("  Or set the STOCKFISH_PATH environment variable:")
        print("    STOCKFISH_PATH=/path/to/stockfish python main.py")
        print("=" * 60)
        print()
        logger.warning("Running WITHOUT engine (health endpoint available)")
    else:
        logger.info("Found Stockfish at: %s", stockfish_path)
        engine = start_engine()

    yield

    if engine:
        try:
            engine.quit()
        except Exception:
            pass
        logger.info("Stockfish stopped")


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
    """Format score from white's perspective."""
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
    return {
        "status": "ok",
        "engine": engine is not None,
        "stockfish_path": stockfish_path,
        "platform": platform.system(),
    }


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    global engine

    if engine is None:
        detail = "Stockfish engine not available."
        if not stockfish_path:
            detail += " Stockfish binary not found — see server logs for install instructions."
        raise HTTPException(503, detail)

    # Validate FEN
    try:
        board = chess.Board(req.fen)
    except ValueError as e:
        raise HTTPException(400, f"Invalid FEN: {e}")

    # Serialize access — SimpleEngine is NOT thread-safe
    async with engine_lock:
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
            logger.error("Engine crashed (EngineTerminatedError) — attempting restart")
            engine = start_engine()
            if engine is None:
                raise HTTPException(503, "Engine crashed and restart failed")
            # Retry once with the fresh engine
            try:
                results = await loop.run_in_executor(
                    None,
                    lambda: engine.analyse(
                        board,
                        chess.engine.Limit(depth=req.depth),
                        multipv=req.multipv,
                    ),
                )
            except Exception as retry_err:
                logger.error("Retry after restart also failed: %s", retry_err)
                raise HTTPException(503, f"Engine crashed, restart retry failed: {retry_err}")
        except Exception as e:
            logger.error("Analysis error: %s", e)
            raise HTTPException(500, f"Analysis error: {e}")

    # Parse results
    moves: list[MoveInfo] = []
    for i, info in enumerate(results):
        pv = info.get("pv", [])
        if not pv:
            continue

        score: chess.engine.PovScore = info.get(
            "score", chess.engine.PovScore(chess.engine.Cp(0), chess.WHITE)
        )
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

    print(f"[Chess Assist API] Starting on http://{HOST}:{PORT}")
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
