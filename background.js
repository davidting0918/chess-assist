// Chess Assist - Background Service Worker
// Handles settings storage and communication

const DEFAULT_SETTINGS = {
  enabled: true,
  depth: 18,
  multiPV: 3,
  showArrows: true,
  showEvalBar: true,
  humanMode: false,
  theme: 'dark'
};

// Initialize settings on install
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get('settings');
  if (!stored.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  console.log('[Chess Assist] Extension installed');
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SETTINGS') {
    chrome.storage.local.get('settings').then(({ settings }) => {
      sendResponse(settings || DEFAULT_SETTINGS);
    });
    return true; // async response
  }
  
  if (message.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set({ settings: message.settings }).then(() => {
      // Notify all tabs of settings change
      chrome.tabs.query({ url: ['https://www.chess.com/*', 'https://chess.com/*'] }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings: message.settings });
        });
      });
      sendResponse({ success: true });
    });
    return true;
  }
  
  return false;
});

console.log('[Chess Assist] Background service worker started');
