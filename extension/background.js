// Chess Assist - Background Service Worker (MV3)
// Minimal — just manages settings. Engine work is done by local API.

const DEFAULT_SETTINGS = {
  enabled: true,
  depth: 18,
  multiPV: 5,
  showArrows: true,
  showEvalBar: true,
  humanMode: false,
  theme: 'dark',
  apiUrl: 'http://127.0.0.1:5555'
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  return false;
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get('settings');
  if (!stored.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  console.log('[Chess Assist] Extension installed');
});

console.log('[Chess Assist] Background started');
