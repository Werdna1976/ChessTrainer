import { cp, mkdir, copyFile } from 'node:fs/promises';

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
console.log('Built static site in dist/');
