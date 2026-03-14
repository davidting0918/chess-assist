// Chess Assist - Background Service Worker (MV3)
// Routes messages between content scripts and the offscreen Stockfish engine.
// Uses chrome.runtime.connect (ports) for reliable offscreen ↔ background comms.

const DEFAULT_SETTINGS = {
  enabled: true,
  depth: 18,
  multiPV: 3,
  showArrows: true,
  showEvalBar: true,
  humanMode: false,
  theme: 'dark'
};

let activeTabId = null;
let offscreenPort = null;   // port to the offscreen document
let offscreenReady = false;
let pendingForOffscreen = []; // messages queued before offscreen port connects

// ─── Offscreen Document Lifecycle ───
async function ensureOffscreen() {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (contexts.length > 0) return;
  } catch (_) { /* getContexts might not exist */ }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Run Stockfish chess engine in a Web Worker'
    });
    console.log('[BG] Offscreen document created');
  } catch (e) {
    if (!e.message?.includes('Only a single offscreen')) {
      console.error('[BG] Failed to create offscreen doc:', e);
    }
  }
}

// Send a message to the offscreen document via port
function sendToOffscreen(msg) {
  if (offscreenPort) {
    try {
      offscreenPort.postMessage(msg);
      return;
    } catch (e) {
      console.warn('[BG] offscreenPort.postMessage failed:', e.message);
      offscreenPort = null;
    }
  }
  // Queue it — will be drained when offscreen connects
  pendingForOffscreen.push(msg);
  // Make sure offscreen doc exists
  ensureOffscreen();
}

// Forward engine messages from offscreen → active tab (content script)
function broadcastToTab(msg) {
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, msg).catch(() => {});
  } else {
    // Try to find a chess.com tab
    chrome.tabs.query({ url: ['https://www.chess.com/*', 'https://chess.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        activeTabId = tabs[0].id;
        chrome.tabs.sendMessage(activeTabId, msg).catch(() => {});
      }
    });
  }
}

// ─── Port-based communication with offscreen ───
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'offscreen-stockfish') {
    console.log('[BG] Offscreen port connected');
    offscreenPort = port;

    // Drain pending messages
    while (pendingForOffscreen.length > 0) {
      const msg = pendingForOffscreen.shift();
      try { port.postMessage(msg); } catch (_) {}
    }

    port.onMessage.addListener((msg) => {
      // Engine responses from offscreen → forward to active tab
      if (msg.type === 'sf-ready' || msg.type === 'sf-info' ||
          msg.type === 'sf-bestmove' || msg.type === 'sf-error') {
        console.log('[BG] Engine →', msg.type);
        broadcastToTab(msg);
      }
    });

    port.onDisconnect.addListener(() => {
      console.log('[BG] Offscreen port disconnected');
      offscreenPort = null;
    });
  }
});

// ─── Message Router (for content scripts & popup) ───
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ── Settings ──
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
          chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_UPDATED',
            settings: message.settings
          }).catch(() => {});
        });
      });
      sendResponse({ success: true });
    });
    return true;
  }

  // ── Engine init from content script ──
  if (message.type === 'sf-init') {
    if (sender.tab) activeTabId = sender.tab.id;
    console.log('[BG] sf-init from tab', activeTabId);
    sendToOffscreen({ type: 'sf-init' });
    sendResponse({ ok: true });
    return false;
  }

  // ── Engine commands from content script → offscreen ──
  if (message.type === 'sf-analyze' || message.type === 'sf-stop' || message.type === 'sf-quit') {
    if (sender.tab) activeTabId = sender.tab.id;
    sendToOffscreen(message);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

// ─── Extension Install / Startup ───
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get('settings');
  if (!stored.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  await ensureOffscreen();
  console.log('[BG] Extension installed');
});

// Pre-create offscreen on service worker startup
ensureOffscreen();
console.log('[BG] Service worker started');
