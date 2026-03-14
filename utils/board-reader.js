// Chess Assist - Board Reader
// Parses Chess.com DOM to extract board position

const BoardReader = {
  // Piece type mapping from Chess.com class names
  pieceMap: {
    'wp': 'P', 'wr': 'R', 'wn': 'N', 'wb': 'B', 'wq': 'Q', 'wk': 'K',
    'bp': 'p', 'br': 'r', 'bn': 'n', 'bb': 'b', 'bq': 'q', 'bk': 'k'
  },
  
  // Get the chess board element
  getBoardElement() {
    // Try modern web component first
    const wcBoard = document.querySelector('wc-chess-board');
    if (wcBoard) return wcBoard;
    
    // Try classic board container
    const board = document.querySelector('.board');
    if (board) return board;
    
    // Try game board
    const gameBoard = document.querySelector('#board-single') || 
                      document.querySelector('#board-play-computer') ||
                      document.querySelector('[id^="board-"]');
    return gameBoard;
  },
  
  // Detect board orientation (are we playing as black?)
  isFlipped() {
    const board = this.getBoardElement();
    if (!board) return false;
    
    // Check for flipped class
    if (board.classList.contains('flipped')) return true;
    
    // Check coordinates - if a1 is in top-right, board is flipped
    const coords = document.querySelector('.coordinate-light, .coordinates');
    if (coords) {
      const firstCoord = coords.textContent.trim()[0];
      if (firstCoord === '8') return true;
    }
    
    // Check piece positions - white pieces at top means flipped
    const pieces = document.querySelectorAll('.piece');
    let whiteKingSquare = null;
    pieces.forEach(piece => {
      const classes = Array.from(piece.classList);
      if (classes.includes('wk')) {
        const squareClass = classes.find(c => c.startsWith('square-'));
        if (squareClass) {
          whiteKingSquare = parseInt(squareClass.replace('square-', ''));
        }
      }
    });
    
    // If white king is on rank 7-8 at start, we might be flipped
    // This is a heuristic, not perfect
    return false;
  },
  
  // Parse all pieces from DOM and build board array
  parsePieces() {
    // Initialize empty board (8x8)
    const board = Array(8).fill(null).map(() => Array(8).fill(null));
    
    // Find all piece elements
    const pieces = document.querySelectorAll('.piece');
    
    pieces.forEach(piece => {
      const classes = Array.from(piece.classList);
      
      // Find piece type (wp, bn, etc.)
      let pieceType = null;
      for (const cls of classes) {
        if (this.pieceMap[cls]) {
          pieceType = this.pieceMap[cls];
          break;
        }
      }
      
      // Find square (square-44 format: file=4, rank=4 → e4)
      let square = null;
      for (const cls of classes) {
        if (cls.startsWith('square-')) {
          square = cls.replace('square-', '');
          break;
        }
      }
      
      if (pieceType && square && square.length === 2) {
        const file = parseInt(square[0]) - 1; // 0-7 (a-h)
        const rank = parseInt(square[1]) - 1; // 0-7 (1-8)
        
        if (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
          board[7 - rank][file] = pieceType; // Convert to array indices
        }
      }
    });
    
    return board;
  },
  
  // Get move list from notation panel
  getMoveList() {
    const moves = [];
    
    // Chess.com move notation selectors
    const moveElements = document.querySelectorAll('.move, .node .san, [data-ply]');
    
    moveElements.forEach(el => {
      const move = el.textContent.trim();
      if (move && !move.match(/^\d+\.?$/)) { // Skip move numbers
        moves.push(move);
      }
    });
    
    // Alternative: look for move list in vertical notation
    if (moves.length === 0) {
      const verticalMoves = document.querySelectorAll('.vertical-move-list .move-text-component, .move-text');
      verticalMoves.forEach(el => {
        const move = el.textContent.trim();
        if (move && !move.match(/^\d+\.?$/)) {
          moves.push(move);
        }
      });
    }
    
    return moves;
  },
  
  // Determine whose turn it is
  getTurn() {
    const moves = this.getMoveList();
    // Even number of moves = white's turn, odd = black's turn
    return moves.length % 2 === 0 ? 'w' : 'b';
  },
  
  // Analyze move list to determine castling rights
  getCastlingRights() {
    const moves = this.getMoveList();
    let rights = { K: true, Q: true, k: true, q: true };
    
    for (const move of moves) {
      const cleanMove = move.replace(/[+#!?]/g, '');
      
      // King moved
      if (cleanMove.startsWith('K') || cleanMove === 'O-O' || cleanMove === 'O-O-O') {
        // Determine color based on position in move list
        const isWhite = moves.indexOf(move) % 2 === 0;
        if (isWhite) {
          rights.K = false;
          rights.Q = false;
        } else {
          rights.k = false;
          rights.q = false;
        }
      }
      
      // Rook moved from original square (harder to track, simplified)
      if (cleanMove.startsWith('R')) {
        // Check if it mentions a1, h1, a8, h8
        if (cleanMove.includes('a1')) rights.Q = false;
        if (cleanMove.includes('h1')) rights.K = false;
        if (cleanMove.includes('a8')) rights.q = false;
        if (cleanMove.includes('h8')) rights.k = false;
      }
    }
    
    // Build castling string
    let castling = '';
    if (rights.K) castling += 'K';
    if (rights.Q) castling += 'Q';
    if (rights.k) castling += 'k';
    if (rights.q) castling += 'q';
    
    return castling || '-';
  },
  
  // Get en passant square from last move
  getEnPassant() {
    const moves = this.getMoveList();
    if (moves.length === 0) return '-';
    
    const lastMove = moves[moves.length - 1].replace(/[+#!?]/g, '');
    
    // Check if last move was a pawn moving two squares
    // Pawn moves look like: e4, d5, exd5 (capture), etc.
    // Two square pawn moves: e4 (from e2), d5 (from d7)
    
    if (lastMove.match(/^[a-h][45]$/) && !lastMove.includes('x')) {
      const file = lastMove[0];
      const rank = parseInt(lastMove[1]);
      
      // Check if it was a two-square move
      const isWhiteMove = moves.length % 2 === 1; // Last move was white's
      
      if (isWhiteMove && rank === 4) {
        // White pawn from rank 2 to 4, en passant on rank 3
        return file + '3';
      } else if (!isWhiteMove && rank === 5) {
        // Black pawn from rank 7 to 5, en passant on rank 6
        return file + '6';
      }
    }
    
    return '-';
  },
  
  // Convert board array to FEN string
  boardToFEN(board) {
    const rows = [];
    
    for (let rank = 0; rank < 8; rank++) {
      let row = '';
      let emptyCount = 0;
      
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece) {
          if (emptyCount > 0) {
            row += emptyCount;
            emptyCount = 0;
          }
          row += piece;
        } else {
          emptyCount++;
        }
      }
      
      if (emptyCount > 0) {
        row += emptyCount;
      }
      
      rows.push(row);
    }
    
    return rows.join('/');
  },
  
  // Main function: get full FEN string
  getFEN() {
    const board = this.parsePieces();
    const boardFEN = this.boardToFEN(board);
    const turn = this.getTurn();
    const castling = this.getCastlingRights();
    const enPassant = this.getEnPassant();
    const halfmove = 0; // Simplified
    const fullmove = Math.floor(this.getMoveList().length / 2) + 1;
    
    return `${boardFEN} ${turn} ${castling} ${enPassant} ${halfmove} ${fullmove}`;
  },
  
  // Quick position hash for change detection
  getPositionHash() {
    const board = this.parsePieces();
    return this.boardToFEN(board) + '_' + this.getTurn();
  }
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.BoardReader = BoardReader;
}
