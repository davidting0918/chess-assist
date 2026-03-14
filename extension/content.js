// Chess Assist - Content Script
// Reads Chess.com board, sends FEN to local Stockfish API, displays results.

(function() {
  'use strict';

  console.log('[Chess Assist] Content script loaded');

  // State
  let settings = {
    enabled: true,
    depth: 18,
    multiPV: 5,
    showArrows: true,
    showEvalBar: true,
    humanMode: false,
    theme: 'dark',
    apiUrl: 'http://127.0.0.1:5555'
  };

  let isApiReady = false;
  let currentFEN = null;
  let currentAnalysis = [];
  let isAnalyzing = false;
  let isPaused = false;
  let isAutoMode = true;
  let boardObserver = null;
  let boardElement = null;
  let isFlipped = false;
  let abortController = null;

  // ─── Init ───
  async function init() {
    console.log('[Chess Assist] Initializing...');

    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response) settings = { ...settings, ...response };
    } catch (e) {
      console.log('[Chess Assist] Using default settings');
    }

    await waitForBoard();

    ChessAssistOverlay.create();
    ChessAssistOverlay.setTheme(settings.theme);

    // Check API health
    checkApiHealth();

    setupBoardObserver();
    setupEventListeners();

    setTimeout(() => readAndAnalyze(), 500);

    console.log('[Chess Assist] Initialized successfully');
  }

  // ─── API Communication ───
  async function checkApiHealth() {
    ChessAssistOverlay.setStatus('Connecting to engine...', 'analyzing');
    try {
      const resp = await fetch(`${settings.apiUrl}/health`, { signal: AbortSignal.timeout(3000) });
      const data = await resp.json();
      if (data.engine) {
        isApiReady = true;
        ChessAssistOverlay.setStatus('Ready', 'normal');
        console.log('[Chess Assist] API connected ✓');
        if (currentFEN) analyzePosition(currentFEN);
      } else {
        ChessAssistOverlay.setStatus('Engine not loaded', 'error');
        retryApiHealth();
      }
    } catch (e) {
      console.log('[Chess Assist] API not reachable:', e.message);
      ChessAssistOverlay.setStatus('Start local API server', 'error');
      retryApiHealth();
    }
  }

  function retryApiHealth() {
    setTimeout(checkApiHealth, 5000);
  }

  async function analyzePosition(fen) {
    if (!isApiReady || isPaused) return;

    // Abort previous request
    if (abortController) abortController.abort();
    abortController = new AbortController();

    isAnalyzing = true;
    currentAnalysis = [];
    ChessAssistOverlay.setStatus('Analyzing...', 'analyzing');
    ChessAssistOverlay.showLoading('Analyzing...');
    ArrowDrawer.clear();

    try {
      const resp = await fetch(`${settings.apiUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fen: fen,
          depth: settings.depth,
          multipv: settings.multiPV
        }),
        signal: abortController.signal
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      handleAnalysisResult(data);
    } catch (e) {
      if (e.name === 'AbortError') return; // Superseded by newer request
      console.error('[Chess Assist] Analysis error:', e.message);
      isAnalyzing = false;

      if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
        isApiReady = false;
        ChessAssistOverlay.setStatus('API disconnected', 'error');
        retryApiHealth();
      } else {
        ChessAssistOverlay.setStatus('Error: ' + e.message, 'error');
      }
    }
  }

  function handleAnalysisResult(data) {
    isAnalyzing = false;
    currentAnalysis = [];

    for (const move of data.moves) {
      // Score from white's perspective → adjust for display
      let displayScore;
      if (move.score_mate !== null) {
        displayScore = move.score_mate;
      } else if (move.score_cp !== null) {
        displayScore = move.score_cp / 100;
      } else {
        displayScore = 0;
      }

      // If it's black's turn, negate for "side to move" perspective
      const sideScore = data.turn === 'black' ? -displayScore : displayScore;

      currentAnalysis.push({
        uci: move.uci,
        san: move.san,
        score: sideScore,
        scoreType: move.score_mate !== null ? 'mate' : 'cp',
        depth: move.depth,
        pv: move.pv_uci,
        pvSan: move.pv_san,
        scoreDisplay: move.score_display
      });
    }

    ChessAssistOverlay.setStatus('Ready', 'normal');

    if (currentAnalysis.length > 0) {
      // Depth from best line
      ChessAssistOverlay.setDepth(currentAnalysis[0].depth);

      // Apply human mode
      let displayMoves = [...currentAnalysis];
      if (settings.humanMode && Math.random() < 0.15 && displayMoves.length > 1) {
        [displayMoves[0], displayMoves[1]] = [displayMoves[1], displayMoves[0]];
      }

      ChessAssistOverlay.setMoves(displayMoves);

      if (displayMoves[0]) {
        ChessAssistOverlay.setEval(displayMoves[0].score, displayMoves[0].scoreType);
      }

      if (settings.showArrows) {
        ArrowDrawer.init(boardElement, isFlipped);
        ArrowDrawer.drawMoves(displayMoves, isFlipped);
      }
    }
  }

  // ─── Board Reading ───
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

  function readAndAnalyze() {
    if (isPaused || !settings.enabled) return;

    try {
      const newFEN = BoardReader.getFEN();
      isFlipped = BoardReader.isFlipped();

      const positionHash = BoardReader.getPositionHash();
      if (positionHash !== currentFEN?.split(' ').slice(0, 2).join('_')) {
        currentFEN = newFEN;
        currentAnalysis = [];
        console.log('[Chess Assist] Position changed:', newFEN);

        if (isApiReady) {
          analyzePosition(newFEN);
        }
      }
    } catch (e) {
      console.error('[Chess Assist] Error reading board:', e);
    }
  }

  // ─── Board Observer ───
  function setupBoardObserver() {
    if (boardObserver) boardObserver.disconnect();

    boardElement = BoardReader.getBoardElement();
    if (!boardElement) return;

    let debounceTimer = null;

    boardObserver = new MutationObserver((mutations) => {
      const isRelevant = mutations.some(m => {
        if (m.type === 'childList') return true;
        if (m.type === 'attributes' && m.attributeName === 'class') {
          return m.target.classList.contains('piece');
        }
        return false;
      });

      if (isRelevant && isAutoMode) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => readAndAnalyze(), 100);
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

  // ─── Event Listeners ───
  function setupEventListeners() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'SETTINGS_UPDATED') {
        settings = { ...settings, ...msg.settings };
        ChessAssistOverlay.setTheme(settings.theme);

        if (!settings.showArrows) {
          ArrowDrawer.clear();
        } else if (currentAnalysis.length > 0) {
          ArrowDrawer.init(boardElement, isFlipped);
          ArrowDrawer.drawMoves(currentAnalysis, isFlipped);
        }

        if (currentFEN && isApiReady) {
          analyzePosition(currentFEN);
        }
      }
    });

    window.addEventListener('chess-assist-toggle-auto', () => {
      isAutoMode = !isAutoMode;
    });

    window.addEventListener('chess-assist-toggle-pause', () => {
      isPaused = !isPaused;
      if (isPaused) {
        if (abortController) abortController.abort();
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
        ArrowDrawer.clear();
        ArrowDrawer.init(boardElement, isFlipped);
        ArrowDrawer.drawArrow(uci.substring(0, 2), uci.substring(2, 4), 'best');
      }
    });

    // Handle SPA navigation
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
      if (e.altKey && e.key === 'a') {
        isPaused = !isPaused;
        ChessAssistOverlay.setStatus(isPaused ? 'Paused' : 'Ready');
        if (!isPaused) readAndAnalyze();
      }
      if (e.altKey && e.key === 'r') {
        if (currentFEN && isApiReady) analyzePosition(currentFEN);
      }
    });
  }

  // ─── Start ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
