// Chess Assist - Offscreen Document
// Connects to the background via a port, runs Stockfish in a Web Worker.

let stockfish = null;
let isReady = false;
let pendingMessages = [];
let bgPort = null;

// ─── Connect to background via port (reliable, survives service worker restarts) ───
function connectToBackground() {
  bgPort = chrome.runtime.connect({ name: 'offscreen-stockfish' });
  console.log('[Offscreen] Connected to background via port');

  bgPort.onMessage.addListener((msg) => {
    console.log('[Offscreen] Received from BG:', msg.type);

    if (msg.type === 'sf-init') {
      initEngine();
    } else if (msg.type === 'sf-analyze' || msg.type === 'sf-stop' || msg.type === 'sf-quit') {
      handleCommand(msg);
    }
  });

  bgPort.onDisconnect.addListener(() => {
    console.log('[Offscreen] Port disconnected, reconnecting in 500ms...');
    bgPort = null;
    setTimeout(connectToBackground, 500);
  });
}

function sendToBg(msg) {
  if (bgPort) {
    try {
      bgPort.postMessage(msg);
    } catch (e) {
      console.warn('[Offscreen] postMessage to BG failed:', e.message);
    }
  } else {
    console.warn('[Offscreen] No bgPort, message lost:', msg.type);
  }
}

// ─── Stockfish Worker ───
function initEngine() {
  if (stockfish) {
    if (isReady) {
      console.log('[Offscreen] Engine already ready, re-notifying');
      sendToBg({ type: 'sf-ready' });
    } else {
      console.log('[Offscreen] Worker exists but not ready, re-sending init');
      stockfish.postMessage({ type: 'init' });
    }
    return;
  }

  try {
    const workerUrl = chrome.runtime.getURL('stockfish/stockfish-worker.js');
    console.log('[Offscreen] Creating worker:', workerUrl);
    stockfish = new Worker(workerUrl);

    stockfish.onmessage = function (e) {
      const msg = e.data;
      switch (msg.type) {
        case 'ready':
          isReady = true;
          console.log('[Offscreen] Engine READY');
          sendToBg({ type: 'sf-ready' });
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
      }
    };

    stockfish.onerror = function (err) {
      console.error('[Offscreen] Worker error:', err);
      sendToBg({
        type: 'sf-error',
        message: 'Worker error: ' + (err.message || 'unknown')
      });
    };

    console.log('[Offscreen] Sending init to worker');
    stockfish.postMessage({ type: 'init' });
  } catch (e) {
    console.error('[Offscreen] Failed to create worker:', e);
    sendToBg({ type: 'sf-error', message: 'Worker creation failed: ' + e.message });
  }
}

function handleCommand(msg) {
  if (!stockfish) {
    pendingMessages.push(msg);
    return;
  }
  switch (msg.type) {
    case 'sf-analyze':
      if (!isReady) { pendingMessages.push(msg); return; }
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

// ─── Start ───
connectToBackground();
console.log('[Offscreen] Document loaded');
