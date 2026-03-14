// Chess Assist - Offscreen Document
// Runs Stockfish engine in a classic DOM context where Workers + importScripts work fine

let stockfish = null;
let isReady = false;
let pendingMessages = [];

// Safe wrapper to send messages to background (handles service worker sleep)
function sendToBg(msg) {
  try {
    chrome.runtime.sendMessage(msg).catch(e => {
      console.warn('[Offscreen] sendMessage failed (will retry):', e.message);
      // Retry once after a short delay (service worker might be waking up)
      setTimeout(() => {
        chrome.runtime.sendMessage(msg).catch(() => {});
      }, 100);
    });
  } catch (e) {
    console.error('[Offscreen] sendMessage threw:', e);
  }
}

// Load Stockfish via a classic Web Worker (allowed in offscreen documents)
function initEngine() {
  if (stockfish) {
    // Already have a worker — if ready, re-notify; if not, re-send init
    if (isReady) {
      console.log('[Offscreen] Engine already ready, re-notifying background');
      sendToBg({ type: 'sf-ready' });
    } else {
      console.log('[Offscreen] Engine worker exists but not ready, re-sending init');
      stockfish.postMessage({ type: 'init' });
    }
    return;
  }

  try {
    // Create a Worker that loads the engine
    const workerUrl = chrome.runtime.getURL('stockfish/stockfish-worker.js');
    console.log('[Offscreen] Creating worker from:', workerUrl);
    stockfish = new Worker(workerUrl);

    stockfish.onmessage = function (e) {
      const msg = e.data;

      switch (msg.type) {
        case 'ready':
          isReady = true;
          console.log('[Offscreen] Engine ready! Notifying background...');
          sendToBg({ type: 'sf-ready' });
          // Drain pending
          while (pendingMessages.length > 0) {
            handleCommand(pendingMessages.shift());
          }
          break;

        case 'info':
          sendToBg({ type: 'sf-info', data: msg.data });
          break;

        case 'bestmove':
          sendToBg({ type: 'sf-bestmove', move: msg.move });
          break;

        case 'error':
          console.error('[Offscreen] Engine error:', msg.message);
          sendToBg({ type: 'sf-error', message: msg.message });
          break;

        case 'status':
          console.log('[Offscreen] Engine status:', msg.message);
          break;

        default:
          console.log('[Offscreen] Unknown worker message:', msg);
      }
    };

    stockfish.onerror = function (err) {
      console.error('[Offscreen] Worker error:', err);
      sendToBg({
        type: 'sf-error',
        message: 'Worker error: ' + (err.message || err.filename + ':' + err.lineno || 'unknown')
      });
    };

    // Tell worker to initialise the UCI engine
    console.log('[Offscreen] Sending init to worker...');
    stockfish.postMessage({ type: 'init' });
    console.log('[Offscreen] Stockfish worker created and init sent');
  } catch (e) {
    console.error('[Offscreen] Failed to create worker:', e);
    sendToBg({
      type: 'sf-error',
      message: 'Failed to create Stockfish worker: ' + e.message
    });
  }
}

function handleCommand(msg) {
  if (!stockfish) {
    console.warn('[Offscreen] No worker, queueing command:', msg.type);
    pendingMessages.push(msg);
    return;
  }

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
    console.log('[Offscreen] Received sf-init');
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

// DO NOT auto-init on load — wait for explicit sf-init from background.
// Auto-init can race with the message listener setup, and the background
// might not have set activeTabId yet, so sf-ready would be lost.
console.log('[Offscreen] Document loaded, waiting for sf-init');
