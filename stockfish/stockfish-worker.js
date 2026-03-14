// Chess Assist - Stockfish Worker
// Runs inside a Web Worker spawned by the offscreen document
// importScripts works fine here because this is a classic Worker (not a Service Worker)

let isReady = false;
let engineLoaded = false;
let pendingMessages = [];
let engineOnMessage = null;

// Intercept postMessage BEFORE loading the engine.
// The engine uses postMessage(string) for UCI output and onmessage for UCI input.
// We wrap postMessage to capture engine output as structured messages.
const _originalPostMessage = self.postMessage.bind(self);
self.postMessage = function (data, transfer) {
  if (typeof data === 'string') {
    // Engine UCI output line — process and forward as structured message
    handleOutput(data);
  } else {
    // Our own structured messages — send normally
    _originalPostMessage(data, transfer);
  }
};

// Load the bundled stockfish engine
function loadEngine() {
  if (engineLoaded) return;
  try {
    _originalPostMessage({ type: 'status', message: 'Loading engine via importScripts...' });
    importScripts('stockfish-engine.js');
    engineLoaded = true;

    // The engine overwrites self.onmessage when loaded via importScripts.
    // Save a ref to it so we can feed it UCI commands.
    engineOnMessage = self.onmessage;

    _originalPostMessage({ type: 'status', message: 'Engine script loaded, sending uci...' });

    // Now install our own handler for structured messages from the offscreen doc.
    installHandler();

    // Kick off UCI init
    sendUCI('uci');
  } catch (e) {
    _originalPostMessage({ type: 'error', message: 'Failed to load Stockfish engine: ' + e.message });
  }
}

function installHandler() {
  self.onmessage = function (e) {
    const msg = e.data;

    // If it's a string, it might be a raw UCI command (shouldn't happen, but be safe)
    if (typeof msg === 'string') {
      if (engineOnMessage) engineOnMessage({ data: msg });
      return;
    }

    switch (msg.type) {
      case 'init':
        // Load engine if not yet loaded, then send 'uci'
        if (!engineLoaded) {
          loadEngine();
        } else if (!isReady) {
          // Already loaded but not ready — re-send uci
          sendUCI('uci');
        } else {
          // Already ready, just re-notify
          _originalPostMessage({ type: 'ready' });
        }
        break;

      case 'analyze':
        if (!isReady) {
          pendingMessages.push(msg);
          return;
        }
        sendUCI('stop');
        sendUCI('setoption name MultiPV value ' + (msg.multiPV || 3));
        sendUCI('position fen ' + msg.fen);
        sendUCI('go depth ' + (msg.depth || 18));
        break;

      case 'stop':
        sendUCI('stop');
        break;

      case 'quit':
        sendUCI('quit');
        break;
    }
  };
}

// Install a basic handler right away (before engine loads) to handle 'init'
installHandler();

// Send a raw UCI command string to the engine
function sendUCI(cmd) {
  if (engineOnMessage) {
    engineOnMessage({ data: cmd });
  }
}

function handleOutput(line) {
  if (typeof line !== 'string') return;

  if (line === 'uciok') {
    sendUCI('setoption name Threads value 1');
    sendUCI('setoption name Hash value 32');
    sendUCI('isready');
  }

  if (line === 'readyok') {
    isReady = true;
    _originalPostMessage({ type: 'ready' });

    while (pendingMessages.length > 0) {
      const msg = pendingMessages.shift();
      self.onmessage({ data: msg });
    }
  }

  if (line.startsWith('info depth') && line.includes(' pv ')) {
    const info = parseInfoLine(line);
    if (info) {
      _originalPostMessage({ type: 'info', data: info });
    }
  }

  if (line.startsWith('bestmove')) {
    const parts = line.split(' ');
    _originalPostMessage({ type: 'bestmove', move: parts[1] });
  }
}

function parseInfoLine(line) {
  const result = {};

  const depthMatch = line.match(/depth (\d+)/);
  if (depthMatch) result.depth = parseInt(depthMatch[1]);

  const mpvMatch = line.match(/multipv (\d+)/);
  result.multipv = mpvMatch ? parseInt(mpvMatch[1]) : 1;

  const cpMatch = line.match(/score cp (-?\d+)/);
  const mateMatch = line.match(/score mate (-?\d+)/);

  if (cpMatch) {
    result.score = parseInt(cpMatch[1]) / 100;
    result.scoreType = 'cp';
  } else if (mateMatch) {
    result.score = parseInt(mateMatch[1]);
    result.scoreType = 'mate';
  }

  const pvMatch = line.match(/ pv (.+)$/);
  if (pvMatch) {
    result.pv = pvMatch[1].split(' ');
    result.move = result.pv[0];
  }

  return result;
}

// Do NOT auto-load the engine. Wait for the 'init' message.
// This avoids a race condition where the engine loads and sends 'uci'
// before the offscreen document's message handler is ready.
