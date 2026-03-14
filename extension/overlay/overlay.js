// Chess Assist - Overlay UI Component
// Handles rendering and interaction of the analysis overlay

const ChessAssistOverlay = {
  container: null,
  isMinimized: false,
  isDragging: false,
  dragOffset: { x: 0, y: 0 },
  currentTheme: 'dark',
  
  // Create and inject the overlay HTML
  create() {
    if (this.container) return;
    
    this.container = document.createElement('div');
    this.container.id = 'chess-assist-overlay';
    this.container.innerHTML = this.getHTML();
    document.body.appendChild(this.container);
    
    this.setupDragging();
    this.setupEventListeners();
    
    console.log('[Chess Assist] Overlay created');
  },
  
  getHTML() {
    return `
      <div class="overlay-header">
        <div class="overlay-title">
          <span class="icon">♞</span>
          <span>Stockfish</span>
          <span class="overlay-depth">d=--</span>
          <span class="player-badge" title="Detecting side..."></span>
        </div>
        <div class="overlay-controls">
          <button class="overlay-btn restart-btn" title="Restart analysis">↻</button>
          <button class="overlay-btn minimize-btn" title="Minimize">−</button>
          <button class="overlay-btn close-btn" title="Hide">×</button>
        </div>
      </div>
      
      <div class="eval-bar-container">
        <div class="eval-bar" style="width: 50%"></div>
        <span class="eval-value">0.00</span>
      </div>
      
      <div class="overlay-body">
        <div class="overlay-status">
          <span class="status-dot"></span>
          <span class="status-text">Initializing...</span>
        </div>
        
        <div class="move-list">
          <div class="loading">
            <div class="loading-spinner"></div>
            <span>Loading engine...</span>
          </div>
        </div>
      </div>
      
      <div class="overlay-footer">
        <button class="footer-btn auto-btn active" title="Auto-analyze">
          🔄 Auto
        </button>
        <button class="footer-btn pause-btn" title="Pause analysis">
          <span class="pause-indicator"></span> Pause
        </button>
        <button class="footer-btn arrows-btn active" title="Show arrows">
          ➤ Arrows
        </button>
      </div>
    `;
  },
  
  setupDragging() {
    const header = this.container.querySelector('.overlay-header');
    
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.overlay-btn')) return;
      
      this.isDragging = true;
      this.container.classList.add('dragging');
      
      const rect = this.container.getBoundingClientRect();
      this.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      
      const x = e.clientX - this.dragOffset.x;
      const y = e.clientY - this.dragOffset.y;
      
      // Keep within viewport
      const maxX = window.innerWidth - this.container.offsetWidth;
      const maxY = window.innerHeight - this.container.offsetHeight;
      
      this.container.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
      this.container.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
      this.container.style.right = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.container.classList.remove('dragging');
    });
  },
  
  setupEventListeners() {
    // Minimize button
    this.container.querySelector('.minimize-btn').addEventListener('click', () => {
      this.isMinimized = !this.isMinimized;
      this.container.classList.toggle('minimized', this.isMinimized);
      this.container.querySelector('.minimize-btn').textContent = this.isMinimized ? '+' : '−';
    });
    
    // Close button
    this.container.querySelector('.close-btn').addEventListener('click', () => {
      this.hide();
      window.dispatchEvent(new CustomEvent('chess-assist-hidden'));
    });
    
    // Restart button
    this.container.querySelector('.restart-btn').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('chess-assist-restart'));
    });
    
    // Footer buttons dispatch events for content script to handle
    this.container.querySelector('.auto-btn').addEventListener('click', (e) => {
      e.target.classList.toggle('active');
      window.dispatchEvent(new CustomEvent('chess-assist-toggle-auto'));
    });
    
    this.container.querySelector('.pause-btn').addEventListener('click', (e) => {
      const btn = e.target.closest('.pause-btn');
      const isPaused = btn.classList.toggle('paused');
      btn.innerHTML = isPaused
        ? '<span class="pause-indicator paused"></span> Resume'
        : '<span class="pause-indicator"></span> Pause';
      window.dispatchEvent(new CustomEvent('chess-assist-toggle-pause'));
    });
    
    this.container.querySelector('.arrows-btn').addEventListener('click', (e) => {
      e.target.classList.toggle('active');
      window.dispatchEvent(new CustomEvent('chess-assist-toggle-arrows'));
    });
  },
  
  // Update status text
  setStatus(status, type = 'normal') {
    const statusDot = this.container.querySelector('.status-dot');
    const statusText = this.container.querySelector('.status-text');
    
    statusDot.className = 'status-dot';
    if (type === 'analyzing') statusDot.classList.add('analyzing');
    if (type === 'error') statusDot.classList.add('error');
    
    statusText.textContent = status;
  },
  
  // Update depth display
  setDepth(depth) {
    this.container.querySelector('.overlay-depth').textContent = `d=${depth}`;
  },
  
  // Update eval bar
  setEval(score, scoreType) {
    const evalBar = this.container.querySelector('.eval-bar');
    const evalValue = this.container.querySelector('.eval-value');
    
    let percentage, displayValue;
    
    if (scoreType === 'mate') {
      percentage = score > 0 ? 100 : 0;
      displayValue = `M${Math.abs(score)}`;
    } else {
      // Convert centipawn to percentage (sigmoid-ish)
      // Score of ±5 pawns = near 100%/0%
      const sigmoid = 1 / (1 + Math.exp(-score * 0.5));
      percentage = sigmoid * 100;
      displayValue = (score >= 0 ? '+' : '') + score.toFixed(2);
    }
    
    evalBar.style.width = percentage + '%';
    evalValue.textContent = displayValue;
  },
  
  // Update move list with analysis results
  setMoves(moves) {
    const moveList = this.container.querySelector('.move-list');
    
    if (!moves || moves.length === 0) {
      moveList.innerHTML = `
        <div class="no-game">
          <div class="icon">♟</div>
          <div>Waiting for position...</div>
        </div>
      `;
      return;
    }
    
    moveList.innerHTML = moves.map((move, index) => {
      const scoreClass = move.scoreType === 'mate' ? 'mate' : 
                        (move.score >= 0 ? 'positive' : 'negative');
      const scoreDisplay = move.scoreType === 'mate' ? 
                          `M${Math.abs(move.score)}` : 
                          (move.score >= 0 ? '+' : '') + move.score.toFixed(2);
      
      return `
        <div class="move-item ${index === 0 ? 'best' : ''}" data-move="${move.uci}">
          <span class="move-rank">${index + 1}.</span>
          <span class="move-notation">${move.san}</span>
          <span class="move-score ${scoreClass}">${scoreDisplay}</span>
          ${index === 0 ? '<span class="move-best-icon">★</span>' : ''}
        </div>
      `;
    }).join('');
    
    // Add click handlers for moves
    moveList.querySelectorAll('.move-item').forEach(item => {
      item.addEventListener('click', () => {
        const uci = item.dataset.move;
        window.dispatchEvent(new CustomEvent('chess-assist-highlight-move', { detail: uci }));
      });
    });
  },
  
  // Show loading state
  showLoading(message = 'Analyzing...') {
    this.container.querySelector('.move-list').innerHTML = `
      <div class="loading">
        <div class="loading-spinner"></div>
        <span>${message}</span>
      </div>
    `;
  },
  
  // Show/hide overlay
  show() {
    this.container.classList.remove('hidden');
  },
  
  hide() {
    this.container.classList.add('hidden');
  },
  
  // Set player color badge
  setPlayerColor(color) {
    const badge = this.container.querySelector('.player-badge');
    if (!badge) return;
    if (color === 'white') {
      badge.textContent = '♔ W';
      badge.title = 'Playing as White';
      badge.className = 'player-badge white';
    } else {
      badge.textContent = '♚ B';
      badge.title = 'Playing as Black';
      badge.className = 'player-badge black';
    }
  },
  
  // Set theme
  setTheme(theme) {
    this.currentTheme = theme;
    this.container.classList.toggle('light-theme', theme === 'light');
  },
  
  // Destroy overlay
  destroy() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
};

// Arrow drawing on board
const ArrowDrawer = {
  svgContainer: null,
  arrows: [],
  boardElement: null,
  isFlipped: false,
  
  init(boardElement, isFlipped = false) {
    this.boardElement = boardElement;
    this.isFlipped = isFlipped;
    this.createSVGOverlay();
  },
  
  createSVGOverlay() {
    if (!this.boardElement) return;
    
    // Remove existing overlay
    this.clear();
    
    // Create SVG container
    this.svgContainer = document.createElement('div');
    this.svgContainer.className = 'chess-assist-arrows';
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 800 800');
    svg.setAttribute('preserveAspectRatio', 'none');
    
    // Arrow marker definitions
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    ['best', 'second', 'third'].forEach((type, i) => {
      const colors = ['#27ae60', '#f1c40f', '#3498db'];
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', `arrowhead-${type}`);
      marker.setAttribute('markerWidth', '10');
      marker.setAttribute('markerHeight', '7');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '3.5');
      marker.setAttribute('orient', 'auto');
      
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
      polygon.setAttribute('fill', colors[i]);
      
      marker.appendChild(polygon);
      defs.appendChild(marker);
    });
    
    svg.appendChild(defs);
    this.svgContainer.appendChild(svg);
    
    // Position relative to board
    const boardRect = this.boardElement.getBoundingClientRect();
    this.svgContainer.style.position = 'absolute';
    this.svgContainer.style.width = boardRect.width + 'px';
    this.svgContainer.style.height = boardRect.height + 'px';
    
    // Insert into board
    this.boardElement.style.position = 'relative';
    this.boardElement.appendChild(this.svgContainer);
  },
  
  squareToPixel(square) {
    const file = square.charCodeAt(0) - 97; // a=0
    const rank = parseInt(square[1]) - 1;   // 1=0
    
    let x, y;
    if (this.isFlipped) {
      x = (7 - file) * 100 + 50; // Center of square
      y = rank * 100 + 50;
    } else {
      x = file * 100 + 50;
      y = (7 - rank) * 100 + 50;
    }
    
    return { x, y };
  },
  
  drawArrow(from, to, type = 'best') {
    if (!this.svgContainer) return;
    
    const svg = this.svgContainer.querySelector('svg');
    if (!svg) return;
    
    const fromPos = this.squareToPixel(from);
    const toPos = this.squareToPixel(to);
    
    // Shorten arrow slightly so it doesn't overlap arrowhead
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const shortenBy = 15;
    
    const endX = toPos.x - (dx / len) * shortenBy;
    const endY = toPos.y - (dy / len) * shortenBy;
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', fromPos.x);
    line.setAttribute('y1', fromPos.y);
    line.setAttribute('x2', endX);
    line.setAttribute('y2', endY);
    line.setAttribute('stroke-width', type === 'best' ? '14' : '10');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('marker-end', `url(#arrowhead-${type})`);
    line.classList.add(`arrow-${type}`);
    
    const colors = { best: 'rgba(39, 174, 96, 0.7)', second: 'rgba(241, 196, 15, 0.5)', third: 'rgba(52, 152, 219, 0.4)' };
    line.setAttribute('stroke', colors[type]);
    
    svg.appendChild(line);
    this.arrows.push(line);
  },
  
  drawMoves(moves, isFlipped) {
    this.isFlipped = isFlipped;
    this.clear();
    this.createSVGOverlay();
    
    if (!moves || moves.length === 0) return;
    
    const types = ['best', 'second', 'third'];
    moves.slice(0, 3).forEach((move, index) => {
      if (move.uci && move.uci.length >= 4) {
        const from = move.uci.substring(0, 2);
        const to = move.uci.substring(2, 4);
        this.drawArrow(from, to, types[index]);
      }
    });
  },
  
  clear() {
    if (this.svgContainer) {
      this.svgContainer.remove();
      this.svgContainer = null;
    }
    this.arrows = [];
  }
};

// Export for use in content script
if (typeof window !== 'undefined') {
  window.ChessAssistOverlay = ChessAssistOverlay;
  window.ArrowDrawer = ArrowDrawer;
}
