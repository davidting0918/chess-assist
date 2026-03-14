// Chess Assist - Content Script
// Main entry point for Chess.com integration

(function() {
  'use strict';
  
  console.log('[Chess Assist] Content script loaded');
  
  // State
  let settings = {
    enabled: true,
    depth: 18,
    multiPV: 3,
    showArrows: true,
    showEvalBar: true,
    humanMode: false,
    theme: 'dark'
  };
  
  let isEngineReady = false;
  let currentFEN = null;
  let currentAnalysis = [];
  let isAnalyzing = false;
  let isPaused = false;
  let isAutoMode = true;
  let boardObserver = null;
  let boardElement = null;
  let isFlipped = false;
  
  // Initialize extension
  async function init() {
    console.log('[Chess Assist] Initializing...');
    
    // Load settings
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response) {
        settings = { ...settings, ...response };
      }
    } catch (e) {
      console.log('[Chess Assist] Using default settings');
    }
    
    // Wait for board to be available
    await waitForBoard();
    
    // Create overlay
    ChessAssistOverlay.create();
    ChessAssistOverlay.setTheme(settings.theme);
    
    // Initialize Stockfish worker
    initStockfish();
    
    // Set up board observer
    setupBoardObserver();
    
    // Set up event listeners
    setupEventListeners();
    
    // Initial position read
    setTimeout(() => {
      readAndAnalyze();
    }, 500);
    
    console.log('[Chess Assist] Initialized successfully');
  }
  
  // Wait for chess board to appear
  function waitForBoard() {
    return new Promise((resolve) => {
      const check = () => {
        boardElement = BoardReader.getBoardElement();
        if (boardElement) {
          console.log('[Chess Assist] Board found');
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }
  
  // Initialize Stockfish via background service worker (no direct Worker needed)
  function initStockfish() {
    try {
      // Ask background to load the engine
      chrome.runtime.sendMessage({ type: 'sf-init' }).catch(e => {
        console.error('[Chess Assist] Failed to init engine in background:', e);
        ChessAssistOverlay.setStatus('Failed to load engine', 'error');
      });
      ChessAssistOverlay.setStatus('Loading engine...', 'analyzing');
    } catch (e) {
      console.error('[Chess Assist] Failed to send init:', e);
      ChessAssistOverlay.setStatus('Failed to load engine', 'error');
    }
  }
  
  // Handle Stockfish messages from background service worker
  function handleStockfishMessage(msg) {
    switch (msg.type) {
      case 'sf-ready':
        isEngineReady = true;
        ChessAssistOverlay.setStatus('Ready', 'normal');
        console.log('[Chess Assist] Stockfish ready');
        if (currentFEN) {
          analyzePosition(currentFEN);
        }
        break;
        
      case 'sf-info':
        handleAnalysisInfo(msg.data);
        break;
        
      case 'sf-bestmove':
        isAnalyzing = false;
        ChessAssistOverlay.setStatus('Ready', 'normal');
        break;
        
      case 'sf-error':
        console.error('[Chess Assist] Engine error:', msg.message);
        ChessAssistOverlay.setStatus(msg.message, 'error');
        break;
    }
  }
  
  // Handle analysis info from Stockfish
  function handleAnalysisInfo(info) {
    if (!info.move || !info.pv) return;
    
    // Update depth display
    if (info.depth) {
      ChessAssistOverlay.setDepth(info.depth);
    }
    
    // Store analysis by multipv line
    const lineIndex = (info.multipv || 1) - 1;
    
    // Convert UCI move to readable SAN
    const san = FENParser.uciToReadable(info.move, currentFEN);
    
    currentAnalysis[lineIndex] = {
      uci: info.move,
      san: san,
      score: info.score,
      scoreType: info.scoreType,
      depth: info.depth,
      pv: info.pv
    };
    
    // Adjust score for black's perspective
    const turn = currentFEN.split(' ')[1];
    if (turn === 'b') {
      currentAnalysis[lineIndex].score = -info.score;
    }
    
    // Update UI
    updateOverlay();
  }
  
  // Update overlay with current analysis
  function updateOverlay() {
    const validMoves = currentAnalysis.filter(m => m && m.uci);
    
    if (validMoves.length > 0) {
      // Apply human mode - occasionally shuffle top moves
      let displayMoves = [...validMoves];
      if (settings.humanMode && Math.random() < 0.15 && displayMoves.length > 1) {
        // 15% chance to swap first two moves
        [displayMoves[0], displayMoves[1]] = [displayMoves[1], displayMoves[0]];
      }
      
      ChessAssistOverlay.setMoves(displayMoves);
      
      // Update eval bar with best move score
      if (validMoves[0]) {
        ChessAssistOverlay.setEval(validMoves[0].score, validMoves[0].scoreType);
      }
      
      // Draw arrows if enabled
      if (settings.showArrows) {
        ArrowDrawer.init(boardElement, isFlipped);
        ArrowDrawer.drawMoves(displayMoves, isFlipped);
      }
    }
  }
  
  // Read board and trigger analysis
  function readAndAnalyze() {
    if (isPaused || !settings.enabled) return;
    
    try {
      const newFEN = BoardReader.getFEN();
      const positionHash = BoardReader.getPositionHash();
      
      // Check board orientation
      isFlipped = BoardReader.isFlipped();
      
      // Only analyze if position changed
      if (positionHash !== currentFEN?.split(' ').slice(0, 2).join('_')) {
        currentFEN = newFEN;
        currentAnalysis = [];
        
        console.log('[Chess Assist] Position changed:', newFEN);
        
        if (isEngineReady) {
          analyzePosition(newFEN);
        }
      }
    } catch (e) {
      console.error('[Chess Assist] Error reading board:', e);
    }
  }
  
  // Send position to Stockfish (via background service worker)
  function analyzePosition(fen) {
    if (!isEngineReady || isPaused) return;
    
    isAnalyzing = true;
    currentAnalysis = [];
    
    ChessAssistOverlay.setStatus('Analyzing...', 'analyzing');
    ChessAssistOverlay.showLoading('Analyzing...');
    
    // Clear previous arrows
    ArrowDrawer.clear();
    
    chrome.runtime.sendMessage({
      type: 'sf-analyze',
      fen: fen,
      depth: settings.depth,
      multiPV: settings.multiPV
    }).catch(e => console.error('[Chess Assist] analyze send failed:', e));
  }
  
  // Set up MutationObserver to detect board changes
  function setupBoardObserver() {
    if (boardObserver) {
      boardObserver.disconnect();
    }
    
    boardElement = BoardReader.getBoardElement();
    if (!boardElement) {
      console.log('[Chess Assist] Board not found for observer');
      return;
    }
    
    // Debounce position checks
    let debounceTimer = null;
    
    boardObserver = new MutationObserver((mutations) => {
      // Filter for relevant changes (piece movements)
      const isRelevant = mutations.some(m => {
        if (m.type === 'childList') return true;
        if (m.type === 'attributes' && m.attributeName === 'class') {
          return m.target.classList.contains('piece');
        }
        return false;
      });
      
      if (isRelevant && isAutoMode) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          readAndAnalyze();
        }, 100);
      }
    });
    
    boardObserver.observe(boardElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    
    console.log('[Chess Assist] Board observer started');
  }
  
  // Set up event listeners
  function setupEventListeners() {
    // Messages from background (Stockfish + settings)
    chrome.runtime.onMessage.addListener((msg) => {
      // Stockfish engine messages
      if (msg.type && msg.type.startsWith('sf-')) {
        handleStockfishMessage(msg);
      }
      
      if (msg.type === 'SETTINGS_UPDATED') {
        settings = { ...settings, ...msg.settings };
        ChessAssistOverlay.setTheme(settings.theme);
        
        if (!settings.showArrows) {
          ArrowDrawer.clear();
        } else if (currentAnalysis.length > 0) {
          ArrowDrawer.init(boardElement, isFlipped);
          ArrowDrawer.drawMoves(currentAnalysis, isFlipped);
        }
        
        // Re-analyze with new settings
        if (currentFEN && isEngineReady) {
          analyzePosition(currentFEN);
        }
      }
    });
    
    // Overlay control events
    window.addEventListener('chess-assist-toggle-auto', () => {
      isAutoMode = !isAutoMode;
      console.log('[Chess Assist] Auto mode:', isAutoMode);
    });
    
    window.addEventListener('chess-assist-toggle-pause', () => {
      isPaused = !isPaused;
      console.log('[Chess Assist] Paused:', isPaused);
      
      if (isPaused) {
        chrome.runtime.sendMessage({ type: 'sf-stop' }).catch(() => {});
        ChessAssistOverlay.setStatus('Paused', 'normal');
      } else {
        readAndAnalyze();
      }
    });
    
    window.addEventListener('chess-assist-toggle-arrows', () => {
      settings.showArrows = !settings.showArrows;
      
      if (!settings.showArrows) {
        ArrowDrawer.clear();
      } else if (currentAnalysis.length > 0) {
        ArrowDrawer.init(boardElement, isFlipped);
        ArrowDrawer.drawMoves(currentAnalysis, isFlipped);
      }
    });
    
    window.addEventListener('chess-assist-hidden', () => {
      ArrowDrawer.clear();
    });
    
    window.addEventListener('chess-assist-highlight-move', (e) => {
      const uci = e.detail;
      if (uci && uci.length >= 4) {
        // Highlight single move
        ArrowDrawer.clear();
        ArrowDrawer.init(boardElement, isFlipped);
        ArrowDrawer.drawArrow(uci.substring(0, 2), uci.substring(2, 4), 'best');
      }
    });
    
    // Handle page navigation (SPA)
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log('[Chess Assist] URL changed, reinitializing...');
        setTimeout(() => {
          setupBoardObserver();
          readAndAnalyze();
        }, 1000);
      }
    }).observe(document.body, { childList: true, subtree: true });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Alt+A: Toggle analysis
      if (e.altKey && e.key === 'a') {
        isPaused = !isPaused;
        ChessAssistOverlay.setStatus(isPaused ? 'Paused' : 'Ready');
        if (!isPaused) readAndAnalyze();
      }
      
      // Alt+R: Re-analyze
      if (e.altKey && e.key === 'r') {
        if (currentFEN && isEngineReady) {
          analyzePosition(currentFEN);
        }
      }
    });
  }
  
  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
