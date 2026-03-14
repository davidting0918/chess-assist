// Chess Assist - Stockfish Worker
// Uses bundled Stockfish.js engine

let stockfish = null;
let isReady = false;
let pendingMessages = [];

// Load the bundled stockfish engine
importScripts('stockfish-engine.js');

// Handle messages from content script
self.onmessage = function(e) {
  const msg = e.data;
  
  switch (msg.type) {
    case 'init':
      initStockfish();
      break;
      
    case 'analyze':
      if (!isReady) {
        pendingMessages.push(msg);
        return;
      }
      
      const multiPV = msg.multiPV || 3;
      const depth = msg.depth || 18;
      
      sendCmd('stop');
      sendCmd(`setoption name MultiPV value ${multiPV}`);
      sendCmd(`position fen ${msg.fen}`);
      sendCmd(`go depth ${depth}`);
      break;
      
    case 'stop':
      sendCmd('stop');
      break;
      
    case 'quit':
      sendCmd('quit');
      break;
  }
};

function sendCmd(cmd) {
  if (!stockfish) return;
  
  if (typeof stockfish === 'function') {
    stockfish(cmd);
  } else if (stockfish.postMessage) {
    stockfish.postMessage(cmd);
  }
}

function handleOutput(line) {
  if (typeof line !== 'string') return;
  
  // Engine ready
  if (line === 'uciok') {
    sendCmd('setoption name Threads value 1');
    sendCmd('setoption name Hash value 32');
    sendCmd('isready');
  }
  
  if (line === 'readyok') {
    isReady = true;
    postMessage({ type: 'ready' });
    
    // Process any pending messages
    while (pendingMessages.length > 0) {
      const msg = pendingMessages.shift();
      self.onmessage({ data: msg });
    }
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
    result.score = parseInt(cpMatch[1]) / 100;
    result.scoreType = 'cp';
  } else if (mateMatch) {
    result.score = parseInt(mateMatch[1]);
    result.scoreType = 'mate';
  }
  
  // Extract principal variation
  const pvMatch = line.match(/ pv (.+)$/);
  if (pvMatch) {
    result.pv = pvMatch[1].split(' ');
    result.move = result.pv[0];
  }
  
  return result;
}

function initStockfish() {
  postMessage({ type: 'status', message: 'Initializing Stockfish...' });
  
  try {
    // Check how stockfish was exported
    if (typeof STOCKFISH === 'function') {
      stockfish = STOCKFISH();
    } else if (typeof Stockfish === 'function') {
      stockfish = Stockfish();
    } else {
      throw new Error('Stockfish not found');
    }
    
    // Set up output handler
    if (stockfish.addMessageListener) {
      stockfish.addMessageListener(handleOutput);
    } else if (stockfish.onmessage !== undefined) {
      stockfish.onmessage = function(e) {
        handleOutput(e.data || e);
      };
    } else {
      // Use print function for output
      self.print = handleOutput;
    }
    
    // Initialize UCI
    sendCmd('uci');
    
  } catch (e) {
    console.error('Failed to initialize Stockfish:', e);
    postMessage({ type: 'error', message: 'Failed to initialize Stockfish: ' + e.message });
  }
}
