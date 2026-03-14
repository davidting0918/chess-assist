// Chess Assist - Popup Settings

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const elements = {
    enabled: document.getElementById('enabled'),
    depth: document.getElementById('depth'),
    depthValue: document.getElementById('depth-value'),
    multipv: document.getElementById('multipv'),
    multipvValue: document.getElementById('multipv-value'),
    humanMode: document.getElementById('humanMode'),
    showArrows: document.getElementById('showArrows'),
    showEvalBar: document.getElementById('showEvalBar'),
    theme: document.getElementById('theme')
  };
  
  // Load current settings
  try {
    const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (settings) {
      elements.enabled.checked = settings.enabled !== false;
      elements.depth.value = settings.depth || 18;
      elements.depthValue.textContent = settings.depth || 18;
      elements.multipv.value = settings.multiPV || 3;
      elements.multipvValue.textContent = settings.multiPV || 3;
      elements.humanMode.checked = settings.humanMode || false;
      elements.showArrows.checked = settings.showArrows !== false;
      elements.showEvalBar.checked = settings.showEvalBar !== false;
      elements.theme.value = settings.theme || 'dark';
    }
  } catch (e) {
    console.log('Error loading settings:', e);
  }
  
  // Save settings on change
  async function saveSettings() {
    const settings = {
      enabled: elements.enabled.checked,
      depth: parseInt(elements.depth.value),
      multiPV: parseInt(elements.multipv.value),
      humanMode: elements.humanMode.checked,
      showArrows: elements.showArrows.checked,
      showEvalBar: elements.showEvalBar.checked,
      theme: elements.theme.value
    };
    
    try {
      await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
    } catch (e) {
      console.log('Error saving settings:', e);
    }
  }
  
  // Event listeners
  elements.enabled.addEventListener('change', saveSettings);
  elements.humanMode.addEventListener('change', saveSettings);
  elements.showArrows.addEventListener('change', saveSettings);
  elements.showEvalBar.addEventListener('change', saveSettings);
  elements.theme.addEventListener('change', saveSettings);
  
  elements.depth.addEventListener('input', () => {
    elements.depthValue.textContent = elements.depth.value;
  });
  elements.depth.addEventListener('change', saveSettings);
  
  elements.multipv.addEventListener('input', () => {
    elements.multipvValue.textContent = elements.multipv.value;
  });
  elements.multipv.addEventListener('change', saveSettings);
});
