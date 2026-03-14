// Chess Assist - Offscreen Document
// Runs Stockfish engine in a classic DOM context where Workers + importScripts work fine

let stockfish = null;
let isReady = false;
let pendingMessages = [];

// Load Stockfish via a classic Web Worker (allowed in offscreen documents)
function initEngine() {
  if (stockfish) return;

  try {
    // Create a Worker that loads the engine
    stockfish = new Worker(chrome.runtime.getURL('stockfish/stockfish-worker.js'));

    stockfish.onmessage = function (e) {
      const msg = e.data;

      switch (msg.type) {
        case 'ready':
          isReady = true;
          chrome.runtime.sendMessage({ type: 'sf-ready' });
          // Drain pending
          while (pendingMessages.length > 0) {
            handleCommand(pendingMessages.shift());
          }
          break;

        case 'info':
          chrome.runtime.sendMessage({ type: 'sf-info', data: msg.data });
          break;

        case 'bestmove':
          chrome.runtime.sendMessage({ type: 'sf-bestmove', move: msg.move });
          break;

        case 'error':
          chrome.runtime.sendMessage({ type: 'sf-error', message: msg.message });
          break;

        case 'status':
          // Informational, ignore
          break;
      }
    };

    stockfish.onerror = function (err) {
      console.error('[Offscreen] Worker error:', err);
      chrome.runtime.sendMessage({
        type: 'sf-error',
        message: 'Worker error: ' + (err.message || 'unknown')
      });
    };

    // Tell worker to initialise the UCI engine
    stockfish.postMessage({ type: 'init' });
    console.log('[Offscreen] Stockfish worker created');
  } catch (e) {
    console.error('[Offscreen] Failed to create worker:', e);
    chrome.runtime.sendMessage({
      type: 'sf-error',
      message: 'Failed to create Stockfish worker: ' + e.message
    });
  }
}

function handleCommand(msg) {
  if (!stockfish) return;

  switch (msg.type) {
    case 'sf-analyze':
      if (!isReady) {
        pendingMessages.push(msg);
        return;
      }
      stockfish.postMessage({
        type: 'analyze',
        fen: msg.fen,
        depth: msg.depth || 18,
        multiPV: msg.multiPV || 3
      });
      break;

    case 'sf-stop':
      stockfish.postMessage({ type: 'stop' });
      break;

    case 'sf-quit':
      stockfish.postMessage({ type: 'quit' });
      break;
  }
}

// Listen for commands from the background service worker
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'sf-init') {
    initEngine();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'sf-analyze' || msg.type === 'sf-stop' || msg.type === 'sf-quit') {
    handleCommand(msg);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

// Auto-init on load
initEngine();
console.log('[Offscreen] Document loaded');
