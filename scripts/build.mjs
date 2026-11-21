import { cp, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Chess } from 'chess.js';
import { openingPositionKey } from '../src/book.js';

await cp('src', 'dist', { recursive: true });
await mkdir('dist/vendor', { recursive: true });
const assets = {
  'node_modules/chess.js/dist/esm/chess.js': 'chess.js',
  'node_modules/chess.js/LICENSE': 'chess-js-LICENSE.txt',
  'node_modules/stockfish/Copying.txt': 'stockfish-LICENSE.txt',
  'node_modules/stockfish/bin/stockfish-19-lite-single.js': 'stockfish-19-lite-single.js',
  'node_modules/stockfish/bin/stockfish-19-lite-single.wasm': 'stockfish-19-lite-single.wasm',
};
await Promise.all(Object.entries(assets).map(([source, name]) => copyFile(source, 'dist/vendor/' + name)));

// Index positions as well as named endpoints so different move orders can reach the same opening.
const positions = new Map();
for (const volume of 'abcde') {
  const rows = (await readFile('data/openings/' + volume + '.tsv', 'utf8')).trimEnd().split(/\r?\n/).slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    const game = new Chess();
    game.loadPgn(pgn);
    for (const move of game.history({ verbose: true })) {
      const key = openingPositionKey(move.after);
      if (!positions.has(key)) positions.set(key, []);
    }
    const entry = positions.get(openingPositionKey(game.fen()));
    if (!entry.length) entry.push(eco, name);
  }
}
await writeFile('dist/opening-book.json', JSON.stringify(Object.fromEntries(positions)));
await copyFile('data/openings/COPYING.txt', 'dist/vendor/chess-openings-LICENSE.txt');

async function versionedPath(file) {
  const bytes = await readFile('dist/' + file);
  const version = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  return './' + file + '?v=' + version;
}

const app = await readFile('dist/app.js', 'utf8');
await writeFile('dist/app.js', app.replace("'./engine.js'", "'" + await versionedPath('engine.js') + "'"));

let html = await readFile('dist/index.html', 'utf8');
for (const file of ['styles.css', 'theme.js', 'app.js']) {
  html = html.replace('./' + file + '"', await versionedPath(file) + '"');
}
await writeFile('dist/index.html', html);
console.log('Built static site in dist/');
