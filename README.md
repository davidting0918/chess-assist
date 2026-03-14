# Chess Assist - Stockfish Analysis for Chess.com

A Chrome extension that provides real-time Stockfish analysis while playing on Chess.com.

## Features

- **Real-time Analysis**: Automatically analyzes the current position as you play
- **Top 3 Best Moves**: Shows the three best moves with evaluation scores
- **Eval Bar**: Visual indication of who's winning
- **Move Arrows**: Optional arrows drawn on the board showing suggested moves
- **Auto-recalculate**: Updates when position changes (opponent moves or you play a different move)
- **Human Mode**: Occasionally shuffles top moves to appear more human
- **Customizable**: Adjustable depth (10-24), number of lines (1-5), and more

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `chess-assist` folder
6. The extension icon should appear in your toolbar

## Usage

1. Go to [Chess.com](https://www.chess.com) and start a game (live or daily)
2. The analysis overlay will appear automatically in the top-right corner
3. Use the overlay controls:
   - **🔄 Auto**: Toggle auto-analysis on position change
   - **⏸ Pause**: Pause/resume analysis
   - **➤ Arrows**: Show/hide move arrows on the board

### Keyboard Shortcuts

- `Alt + A`: Toggle analysis on/off
- `Alt + R`: Re-analyze current position

### Settings (click extension icon)

- **Search Depth**: How deep Stockfish searches (10-24, default 18)
- **Lines to Show**: Number of best moves to display (1-5, default 3)
- **Human Mode**: Occasionally shows 2nd-best move first
- **Show Move Arrows**: Draw arrows on the board
- **Show Eval Bar**: Display evaluation bar
- **Theme**: Dark or light overlay theme

## Supported Pages

- `chess.com/game/live/*` - Live games
- `chess.com/play/*` - Play page
- `chess.com/game/daily/*` - Daily games
- `chess.com/live/*` - Live page
- `chess.com/daily/*` - Daily page

## Technical Details

- Uses Stockfish.js loaded from CDN (no WASM bundling needed)
- Runs Stockfish in a Web Worker for non-blocking analysis
- Parses Chess.com's DOM to read board position
- Uses MutationObserver to detect position changes
- Chrome Extension Manifest V3 compliant

## Notes

- The extension loads Stockfish.js from a CDN on first use
- Analysis is done locally in your browser (no data sent to servers)
- First analysis may take a moment while the engine initializes

## Disclaimer

This extension is for educational and training purposes. Using engine assistance during rated games on Chess.com violates their fair play policy. Use responsibly.

## License

MIT
