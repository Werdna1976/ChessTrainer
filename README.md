# Chess Trainer

Play either side against Stockfish at four difficulty settings using the slider above the board. Preview your move, compare replies and alternatives, and then make the final call yourself.

Open **Appearance** to mix and match board palettes and piece sets or mute the move sounds. These settings are saved in your browser.

The review board preserves the coach’s notes, highlights turning points, and lets you retry a position from your own game. The training library includes four puzzles and practice lines for the French Defense, Sicilian Defense, London System, and Italian Game.

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
