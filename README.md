# Chess Trainer

Play either side against Stockfish at four difficulty settings using the slider above the board. Preview your move, compare replies and alternatives, and then make the final call yourself.

Open **Appearance** to mix and match board palettes and piece sets, choose a move sound profile, or set the volume. These settings are saved in your browser.

**Training Room** includes eight guided lessons, sixteen challenges, and a local practice log. Demonstrations, two-step hints, and board arrows cover forks, pins, king safety, stalemate, and promotion. Completed exercises return for review over time, and the room can suggest a lesson or a position from your recent mistakes.

The review board follows the opening, middlegame, and endgame, with jump points for turning points, attacks, defenses, and plans observed on the board. It preserves the coach’s notes and your original proposal when you play a different move. Save a position for practice or import a single standard-start PGN to review a game played elsewhere. There are eight opening trainers, including the French, Sicilian, Caro-Kann, and King’s Indian.

Use the move tracker to click a move, scrub the timeline, or step with the left and right arrow keys. **Live** returns to the current position in Coach & Play. The **Change** column compares Stockfish’s estimate for the move played with its estimate before the move, from the perspective of the side that moved. Use **Analyze game** to fill in missing scores from older games.

## Run locally

With Node.js 24 or newer installed, run these commands from the project directory.

```sh
npm ci
npm start
```

Open [Chess Trainer locally](http://127.0.0.1:4173/). The preview server listens only on your computer. Stop it with Ctrl+C.

## Publish to GitHub Pages

1. Create or choose a GitHub repository and push these project files to its `main` branch.
2. In the repository, open **Settings → Pages** and choose **GitHub Actions** as the source.
3. If the initial push ran before Pages was enabled, open **Actions → Publish Chess Trainer** and run the workflow manually.

After deployment, Pages shows the URL you can open on other computers. The workflow builds and uploads only the static site. The deployed app requires no server, API key, or database. [GitHub Pages publishing documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Keep your progress

Games and progress are saved in the browser. Use **Training backups** to export and restore progress between devices or sites. Restoring replaces the current browser’s training data. **Export PGN** in Game review downloads the selected game with its coach notes.

## Engine and chess rules

The build copies the unmodified Stockfish 19 Lite single-threaded worker and WebAssembly binary from the pinned Stockfish.js 19.0.1 npm package. The site includes its GPLv3 license, and the matching version of the source includes the build instructions. [Stockfish.js 19.0.1 source](https://github.com/nmrugg/stockfish.js/tree/v19.0.1)

The site uses chess.js 1.4.0 for legal moves and game state. The build includes its BSD-2-Clause license. [chess.js source](https://github.com/jhlywa/chess.js/tree/v1.4.0)

Book markers identify positions in the bundled Lichess opening catalog, including moves that reach the same position in a different order. The CC0 data snapshot and its source revision are in `data/openings/`. [Lichess chess-openings](https://github.com/lichess-org/chess-openings)
