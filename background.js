// Chess Assist - Background Service Worker (MV3)
// Delegates Stockfish to an Offscreen Document (no importScripts needed)

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
let offscreenReady = false;

// ─── Offscreen Document Lifecycle ───
async function ensureOffscreen() {
  // Check if already exists
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (contexts.length > 0) {
      offscreenReady = true;
      return;
    }
  } catch (e) {
    // getContexts might not exist in older Chrome — fall through to create
    console.warn('[Chess Assist BG] getContexts failed:', e.message);
  }

  // Create offscreen document
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Run Stockfish chess engine in a Web Worker'
    });
    offscreenReady = true;
    console.log('[Chess Assist BG] Offscreen document created');
  } catch (e) {
    // If it already exists (race condition), that's fine
    if (e.message?.includes('Only a single offscreen')) {
      offscreenReady = true;
    } else {
      console.error('[Chess Assist BG] Failed to create offscreen doc:', e);
    }
  }
}

// Forward a command to the offscreen document
async function sendToOffscreen(msg) {
  await ensureOffscreen();
  // Short delay to ensure offscreen document's listener is registered
  await new Promise(r => setTimeout(r, 50));
  try {
    await chrome.runtime.sendMessage(msg);
  } catch (e) {
    console.warn('[Chess Assist BG] sendToOffscreen failed, retrying:', e.message);
    // Retry once after delay — offscreen doc might not be fully loaded yet
    await new Promise(r => setTimeout(r, 200));
    try {
      await chrome.runtime.sendMessage(msg);
    } catch (e2) {
      console.error('[Chess Assist BG] sendToOffscreen retry failed:', e2.message);
      // Notify the tab about the error
      broadcastToTab({ type: 'sf-error', message: 'Failed to reach engine: ' + e2.message });
    }
  }
}

// Forward engine messages from offscreen → active tab (content script)
function broadcastToTab(msg) {
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, msg).catch(() => {
      console.warn('[Chess Assist BG] Failed to send to tab', activeTabId);
    });
  } else {
    console.warn('[Chess Assist BG] No active tab to broadcast to');
    // Try to find a chess.com tab
    chrome.tabs.query({ url: ['https://www.chess.com/*', 'https://chess.com/*'] }, (tabs) => {
      if (tabs && tabs.length > 0) {
        activeTabId = tabs[0].id;
        chrome.tabs.sendMessage(activeTabId, msg).catch(() => {});
      }
    });
  }
}

// ─── Message Router ───
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ── Settings ──
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get('settings').then(({ settings }) => {
      sendResponse(settings || DEFAULT_SETTINGS);
    });
    return true; // async
  }

  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set({ settings: message.settings }).then(() => {
      // Notify all chess.com tabs
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
    return true; // async
  }

  // ── Engine init request from content script ──
  if (message.type === 'sf-init') {
    if (sender.tab) {
      activeTabId = sender.tab.id;
      console.log('[Chess Assist BG] sf-init from tab', activeTabId);
    }
    // Forward to offscreen
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

  // ── Engine responses from offscreen → content script ──
  if (message.type === 'sf-ready' || message.type === 'sf-info' ||
      message.type === 'sf-bestmove' || message.type === 'sf-error') {
    // These come from the offscreen doc, forward to the active tab
    console.log('[Chess Assist BG] Engine →', message.type);
    broadcastToTab(message);
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
  // Pre-create offscreen document (but don't init engine yet — wait for tab)
  await ensureOffscreen();
  console.log('[Chess Assist] Extension installed');
});

// Also create offscreen on service worker startup (after browser restart)
ensureOffscreen();

console.log('[Chess Assist] Background service worker started');
