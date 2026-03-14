// Chess Assist - Background Service Worker
// Handles Stockfish engine + settings storage

const DEFAULT_SETTINGS = {
  enabled: true,
  depth: 18,
  multiPV: 3,
  showArrows: true,
  showEvalBar: true,
  humanMode: false,
  theme: 'dark'
};

// ─── Stockfish Engine State ───
let stockfish = null;
let isReady = false;
let pendingMessages = [];
let activeTabId = null;

// Load & initialize Stockfish in the service worker context
function initStockfishEngine() {
  if (stockfish) return; // already loaded

  try {
    // Import the engine script into the service worker
    importScripts('stockfish/stockfish-engine.js');

    // Detect how the engine was exported
    if (typeof STOCKFISH === 'function') {
      stockfish = STOCKFISH();
    } else if (typeof Stockfish === 'function') {
      stockfish = Stockfish();
    } else if (typeof Module !== 'undefined' && Module.ccall) {
      // Emscripten Module-style export — use postMessage / print interface
      stockfish = Module;
    } else {
      console.error('[Chess Assist BG] Stockfish export not found after importScripts');
      return;
    }

    // Set up output handler
    const handleLine = (line) => {
      if (typeof line !== 'string') return;

      if (line === 'uciok') {
        sendCmd('setoption name Threads value 1');
        sendCmd('setoption name Hash value 32');
        sendCmd('isready');
      }
      if (line === 'readyok') {
        isReady = true;
        broadcastToTab({ type: 'sf-ready' });
        // Process queued
        while (pendingMessages.length > 0) {
          handleIncoming(pendingMessages.shift());
        }
      }
      if (line.startsWith('info depth') && line.includes(' pv ')) {
        const info = parseInfoLine(line);
        if (info) broadcastToTab({ type: 'sf-info', data: info });
      }
      if (line.startsWith('bestmove')) {
        const parts = line.split(' ');
        broadcastToTab({ type: 'sf-bestmove', move: parts[1] });
      }
    };

    if (stockfish.addMessageListener) {
      stockfish.addMessageListener(handleLine);
    } else if (stockfish.onmessage !== undefined) {
      stockfish.onmessage = (e) => handleLine(e.data || e);
    } else if (typeof stockfish === 'object' && stockfish.print === undefined) {
      stockfish.print = handleLine;
    } else {
      // fallback
      self.print = handleLine;
    }

    sendCmd('uci');
    console.log('[Chess Assist BG] Stockfish engine loaded');
  } catch (e) {
    console.error('[Chess Assist BG] Failed to load Stockfish:', e);
    broadcastToTab({ type: 'sf-error', message: 'Failed to load Stockfish: ' + e.message });
  }
}

function sendCmd(cmd) {
  if (!stockfish) return;
  if (typeof stockfish === 'function') {
    stockfish(cmd);
  } else if (stockfish.postMessage) {
    stockfish.postMessage(cmd);
  } else if (stockfish.ccall) {
    stockfish.ccall('uci_command', 'number', ['string'], [cmd]);
  }
}

function handleIncoming(msg) {
  switch (msg.type) {
    case 'sf-analyze':
      if (!isReady) { pendingMessages.push(msg); return; }
      sendCmd('stop');
      sendCmd(`setoption name MultiPV value ${msg.multiPV || 3}`);
      sendCmd(`position fen ${msg.fen}`);
      sendCmd(`go depth ${msg.depth || 18}`);
      break;
    case 'sf-stop':
      sendCmd('stop');
      break;
    case 'sf-quit':
      sendCmd('quit');
      break;
  }
}

function broadcastToTab(msg) {
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, msg).catch(() => {});
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
  if (cpMatch) { result.score = parseInt(cpMatch[1]) / 100; result.scoreType = 'cp'; }
  else if (mateMatch) { result.score = parseInt(mateMatch[1]); result.scoreType = 'mate'; }
  const pvMatch = line.match(/ pv (.+)$/);
  if (pvMatch) { result.pv = pvMatch[1].split(' '); result.move = result.pv[0]; }
  return result;
}

// ─── Message Router ───
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Settings
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get('settings').then(({ settings }) => {
      sendResponse(settings || DEFAULT_SETTINGS);
    });
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set({ settings: message.settings }).then(() => {
      chrome.tabs.query({ url: ['https://www.chess.com/*', 'https://chess.com/*'] }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings: message.settings });
        });
      });
      sendResponse({ success: true });
    });
    return true;
  }

  // Stockfish commands from content script
  if (message.type === 'sf-init') {
    if (sender.tab) activeTabId = sender.tab.id;
    initStockfishEngine();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'sf-analyze' || message.type === 'sf-stop' || message.type === 'sf-quit') {
    if (sender.tab) activeTabId = sender.tab.id;
    handleIncoming(message);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

// Initialize settings on install
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get('settings');
  if (!stored.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  console.log('[Chess Assist] Extension installed');
});

console.log('[Chess Assist] Background service worker started');
