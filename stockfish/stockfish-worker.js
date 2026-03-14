// Chess Assist - Stockfish Worker
// Loads Stockfish.js from CDN and handles analysis

let stockfish = null;
let isReady = false;
let currentAnalysis = null;

// Stockfish.js CDN - using a well-maintained version
const STOCKFISH_CDN = 'https://unpkg.com/stockfish@16.0.0/src/stockfish-nnue-16.js';
const STOCKFISH_FALLBACK = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';

// Load Stockfish
async function loadStockfish() {
  try {
    // Try to load newer version first
    importScripts(STOCKFISH_CDN);
    stockfish = STOCKFISH();
  } catch (e) {
    console.log('[Stockfish Worker] Primary CDN failed, trying fallback...');
    try {
      importScripts(STOCKFISH_FALLBACK);
      stockfish = STOCKFISH ? STOCKFISH() : self;
    } catch (e2) {
      console.error('[Stockfish Worker] Failed to load Stockfish:', e2);
      postMessage({ type: 'error', message: 'Failed to load Stockfish engine' });
      return;
    }
  }
  
  // Set up message handler for Stockfish output
  if (stockfish.addMessageListener) {
    stockfish.addMessageListener(handleStockfishMessage);
  } else if (stockfish.onmessage !== undefined) {
    stockfish.onmessage = (e) => handleStockfishMessage(e.data || e);
  } else {
    // Fallback: poll for messages
    const originalPostMessage = postMessage;
    self.print = handleStockfishMessage;
  }
  
  // Initialize UCI
  sendToStockfish('uci');
}

function sendToStockfish(cmd) {
  if (!stockfish) return;
  
  if (stockfish.postMessage) {
    stockfish.postMessage(cmd);
  } else if (typeof stockfish === 'function') {
    stockfish(cmd);
  }
}

function handleStockfishMessage(line) {
  if (typeof line !== 'string') return;
  
  // Engine ready
  if (line === 'uciok') {
    sendToStockfish('setoption name Threads value 1');
    sendToStockfish('setoption name Hash value 64');
    sendToStockfish('isready');
  }
  
  if (line === 'readyok') {
    isReady = true;
    postMessage({ type: 'ready' });
  }
  
  // Analysis info
  if (line.startsWith('info depth') && line.includes(' pv ')) {
    const info = parseInfoLine(line);
    if (info) {
      postMessage({ type: 'info', data: info });
    }
  }
  
  // Best move found
  if (line.startsWith('bestmove')) {
    const parts = line.split(' ');
    const bestMove = parts[1];
    postMessage({ type: 'bestmove', move: bestMove });
  }
}

function parseInfoLine(line) {
  const result = {};
  
  // Extract depth
  const depthMatch = line.match(/depth (\d+)/);
  if (depthMatch) result.depth = parseInt(depthMatch[1]);
  
  // Extract multipv (which line this is)
  const mpvMatch = line.match(/multipv (\d+)/);
  result.multipv = mpvMatch ? parseInt(mpvMatch[1]) : 1;
  
  // Extract score (centipawns or mate)
  const cpMatch = line.match(/score cp (-?\d+)/);
  const mateMatch = line.match(/score mate (-?\d+)/);
  
  if (cpMatch) {
    result.score = parseInt(cpMatch[1]) / 100; // Convert to pawns
    result.scoreType = 'cp';
  } else if (mateMatch) {
    result.score = parseInt(mateMatch[1]);
    result.scoreType = 'mate';
  }
  
  // Extract principal variation
  const pvMatch = line.match(/ pv (.+)$/);
  if (pvMatch) {
    result.pv = pvMatch[1].split(' ');
    result.move = result.pv[0]; // First move in variation
  }
  
  // Extract nodes and nps for stats
  const nodesMatch = line.match(/nodes (\d+)/);
  if (nodesMatch) result.nodes = parseInt(nodesMatch[1]);
  
  const npsMatch = line.match(/nps (\d+)/);
  if (npsMatch) result.nps = parseInt(npsMatch[1]);
  
  return result;
}

// Handle messages from content script
self.onmessage = function(e) {
  const msg = e.data;
  
  switch (msg.type) {
    case 'init':
      loadStockfish();
      break;
      
    case 'analyze':
      if (!isReady) {
        postMessage({ type: 'error', message: 'Engine not ready' });
        return;
      }
      
      currentAnalysis = msg.fen;
      const multiPV = msg.multiPV || 3;
      const depth = msg.depth || 18;
      
      sendToStockfish('stop');
      sendToStockfish(`setoption name MultiPV value ${multiPV}`);
      sendToStockfish(`position fen ${msg.fen}`);
      sendToStockfish(`go depth ${depth}`);
      break;
      
    case 'stop':
      sendToStockfish('stop');
      break;
      
    case 'quit':
      sendToStockfish('quit');
      break;
  }
};
