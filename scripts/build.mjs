import { cp, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

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
let html = await readFile('dist/index.html', 'utf8');
for (const file of ['styles.css', 'theme.js', 'app.js']) {
  const bytes = await readFile('dist/' + file);
  const version = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  html = html.replace('./' + file + '"', './' + file + '?v=' + version + '"');
}
await writeFile('dist/index.html', html);
console.log('Built static site in dist/');
