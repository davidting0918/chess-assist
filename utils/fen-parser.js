// Chess Assist - FEN Parser Utilities
// Helper functions for FEN manipulation and move conversion

const FENParser = {
  // Parse FEN string into components
  parse(fen) {
    const parts = fen.split(' ');
    return {
      position: parts[0],
      turn: parts[1] || 'w',
      castling: parts[2] || '-',
      enPassant: parts[3] || '-',
      halfmove: parseInt(parts[4]) || 0,
      fullmove: parseInt(parts[5]) || 1
    };
  },
  
  // Convert algebraic square (e4) to coordinates
  squareToCoords(square) {
    if (!square || square.length !== 2) return null;
    const file = square.charCodeAt(0) - 97; // a=0, h=7
    const rank = parseInt(square[1]) - 1;   // 1=0, 8=7
    return { file, rank };
  },
  
  // Convert coordinates to algebraic square
  coordsToSquare(file, rank) {
    return String.fromCharCode(97 + file) + (rank + 1);
  },
  
  // Convert UCI move (e2e4) to more readable format
  uciToReadable(uciMove, fen) {
    if (!uciMove || uciMove.length < 4) return uciMove;
    
    const from = uciMove.substring(0, 2);
    const to = uciMove.substring(2, 4);
    const promotion = uciMove.length > 4 ? uciMove[4] : null;
    
    // Get piece on source square
    const position = this.fenToBoard(fen);
    const fromCoords = this.squareToCoords(from);
    
    if (!fromCoords) return uciMove;
    
    const piece = position[7 - fromCoords.rank][fromCoords.file];
    
    // Castling detection
    if (piece && piece.toUpperCase() === 'K') {
      if (from === 'e1' && to === 'g1') return 'O-O';
      if (from === 'e1' && to === 'c1') return 'O-O-O';
      if (from === 'e8' && to === 'g8') return 'O-O';
      if (from === 'e8' && to === 'c8') return 'O-O-O';
    }
    
    // Build readable notation
    let readable = '';
    
    if (piece) {
      const pieceUpper = piece.toUpperCase();
      if (pieceUpper !== 'P') {
        readable += pieceUpper;
      }
    }
    
    // Check if capture (there's a piece on target square or en passant)
    const toCoords = this.squareToCoords(to);
    const targetPiece = toCoords ? position[7 - toCoords.rank][toCoords.file] : null;
    const isCapture = targetPiece !== null;
    
    // For pawns, include file on captures
    if (piece && piece.toUpperCase() === 'P' && isCapture) {
      readable += from[0];
    }
    
    if (isCapture) {
      readable += 'x';
    }
    
    readable += to;
    
    // Promotion
    if (promotion) {
      readable += '=' + promotion.toUpperCase();
    }
    
    return readable;
  },
  
  // Convert FEN position to 2D board array
  fenToBoard(fen) {
    const position = fen.split(' ')[0];
    const board = [];
    
    const ranks = position.split('/');
    for (const rank of ranks) {
      const row = [];
      for (const char of rank) {
        if (char >= '1' && char <= '8') {
          // Empty squares
          for (let i = 0; i < parseInt(char); i++) {
            row.push(null);
          }
        } else {
          row.push(char);
        }
      }
      board.push(row);
    }
    
    return board;
  },
  
  // Get piece on a square from FEN
  getPiece(fen, square) {
    const board = this.fenToBoard(fen);
    const coords = this.squareToCoords(square);
    if (!coords) return null;
    return board[7 - coords.rank][coords.file];
  },
  
  // Format evaluation score for display
  formatScore(score, scoreType) {
    if (scoreType === 'mate') {
      return score > 0 ? `M${score}` : `M${score}`;
    }
    
    // Centipawn score
    const sign = score >= 0 ? '+' : '';
    return `${sign}${score.toFixed(2)}`;
  },
  
  // Get square color (for arrow drawing)
  getSquareColor(square) {
    const coords = this.squareToCoords(square);
    if (!coords) return 'light';
    return (coords.file + coords.rank) % 2 === 0 ? 'dark' : 'light';
  }
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.FENParser = FENParser;
}
