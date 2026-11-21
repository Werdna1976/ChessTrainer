import { Chess } from './vendor/chess.js';

export const levels = [
  { id: 'gentle', label: 'Gentle', skill: 0, ms: 140 },
  { id: 'casual', label: 'Casual', skill: 4, ms: 200 },
  { id: 'club', label: 'Club', skill: 10, ms: 350 },
  { id: 'strong', label: 'Strong', skill: 20, ms: 550 },
];

export const uci = (move) => move.from + move.to + (move.promotion || '');
export const pieceNames = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function boardLine(fen, moves) {
  const game = new Chess(fen);
  const line = [];
  for (const code of moves.slice(0, 6)) {
    try { line.push(game.move(code)); }
    catch { break; }
  }
  return line;
}

export function describeMove(move) {
  if (move.flags === 'k') return 'castle kingside (' + move.san + ')';
  if (move.flags === 'q') return 'castle queenside (' + move.san + ')';
  const piece = pieceNames[move.piece];
  let text = move.captured
    ? 'use the ' + piece + ' on ' + move.from + ' to take the ' + pieceNames[move.captured]
      + (move.flags.includes('e') ? ' en passant, landing on ' : ' on ') + move.to
    : 'move the ' + piece + ' from ' + move.from + ' to ' + move.to;
  if (move.promotion) text += ' and promote it to a ' + pieceNames[move.promotion];
  if (move.san.endsWith('#')) text += ' for checkmate';
  else if (move.san.endsWith('+')) text += ' to give check';
  return text + (move.san === move.to ? '' : ' (' + move.san + ')');
}

function waitFor(worker, command, done, consume = () => {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Stockfish timed out.')), 12000);
    function finish(error, line) {
      clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve(line);
    }
    function onMessage(event) {
      for (const line of String(event.data).trim().split(/\r?\n/)) {
        consume(line);
        if (done(line)) {
          finish(null, line);
          break;
        }
      }
    }
    function onError() { finish(new Error('Stockfish could not load.')); }
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage(command);
  });
}

export class Engine {
  #worker;
  #tail = Promise.resolve();

  async #start() {
    const worker = new Worker(new URL('./vendor/stockfish-19-lite-single.js', import.meta.url));
    this.#worker = worker;
    await waitFor(worker, 'uci', (line) => line === 'uciok');
    worker.postMessage('setoption name Hash value 16');
    await waitFor(worker, 'isready', (line) => line === 'readyok');
  }

  search({ fen, history = [], count = 1, ms = 400, skill = 20, restrict = '' }) {
    const job = this.#tail.then(async () => {
      if (!this.#worker) await this.#start();
      const worker = this.#worker;
      const lines = new Map();
      worker.postMessage('setoption name Skill Level value ' + skill);
      worker.postMessage('setoption name MultiPV value ' + count);
      worker.postMessage(fen ? 'position fen ' + fen : 'position startpos' + (history.length ? ' moves ' + history.join(' ') : ''));
      const last = await waitFor(worker, 'go movetime ' + ms + (restrict ? ' searchmoves ' + restrict : ''), (line) => line.startsWith('bestmove '), (line) => {
        const info = line.match(/^info depth (\d+).*? multipv (\d+) score (cp|mate) (-?\d+)(.*?) pv (.+)$/);
        if (!info || /bound/.test(info[5])) return;
        const [, depth, index, type, score, , moves] = info;
        const pv = moves.trim().split(/\s+/);
        lines.set(Number(index), { depth: Number(depth), type, score: Number(score), moves: pv });
      });
      return { best: last.split(/\s+/)[1], lines: [...lines.entries()].sort(([a], [b]) => a - b).map(([, line]) => line) };
    }).catch((error) => {
      this.#worker?.terminate();
      this.#worker = undefined;
      throw error;
    });
    this.#tail = job.catch(() => {});
    return job;
  }
}

export function assess(chosen, best, mate) {
  if (mate) return 'Checkmate';
  if (!chosen || !best) return 'Unrated';
  if (best.type === 'mate' && best.score > 0 && (chosen.type !== 'mate' || chosen.score < 0)) return 'Missed mate';
  if (chosen.type === 'mate' && chosen.score < 0 && (best.type !== 'mate' || best.score > 0)) return 'Blunder';
  const evalOf = (line) => line.type === 'cp' ? line.score : Math.sign(line.score) * (10000 - Math.abs(line.score) * 4);
  const loss = evalOf(best) - evalOf(chosen);
  if (loss < 25) return 'Good move';
  if (loss < 80) return 'Playable';
  if (loss < 160) return 'Inaccuracy';
  if (loss < 300) return 'Mistake';
  return 'Blunder';
}

export function explain(move, line) {
  const before = new Chess(move.before);
  const after = new Chess(move.after);
  const highlights = [];
  const benefits = [];
  if (move.san.endsWith('#')) benefits.push('This gives checkmate.');
  else if (move.san.endsWith('+')) benefits.push('This gives check, so your opponent has to respond.');
  if (move.captured) benefits.push('You take the ' + pieceNames[move.captured] + (move.flags.includes('e') ? ' en passant.' : ' on ' + move.to + '.'));
  if (move.flags === 'k' || move.flags === 'q') benefits.push('You tuck your king away and bring your rook into play.');
  const homeRank = move.color === 'w' ? '1' : '8';
  if ('bn'.includes(move.piece) && move.from.endsWith(homeRank) && !move.to.endsWith(homeRank) && before.moveNumber() <= 12) {
    benefits.push('This brings a ' + pieceNames[move.piece] + ' off its starting rank.');
  }
  if (move.piece === 'p' && /^[de][45]$/.test(move.to)) benefits.push('Your pawn occupies the center.');
  if (move.promotion) benefits.push('Your pawn promotes to a ' + pieceNames[move.promotion] + '.');

  const continuation = line?.moves[0] === uci(move) ? boardLine(move.before, line.moves) : [];
  const reply = continuation[1];
  const answer = continuation[2];
  const risks = [];
  let tag = '';
  if (reply) {
    risks.push('If you play ' + move.san + ', your opponent could ' + describeMove(reply) + '.');
    if (answer) risks.push('You could then ' + describeMove(answer) + '.');
  }
  if (reply?.san.endsWith('#')) {
    highlights.push(reply.to);
    tag = 'King safety';
  } else if (reply?.captured && (reply.to !== move.to || values[reply.captured] > (values[move.captured] || 0))) {
    const recovered = answer?.captured ? values[answer.captured] : 0;
    const net = values[reply.captured] - (values[move.captured] || 0) - recovered;
    highlights.push(reply.to);
    if (net > 0) tag = 'Loose pieces';
    if (reply.to !== move.to && !reply.flags.includes('e') && !after.attackers(reply.to, move.color).length
      && before.attackers(reply.to, move.color).includes(move.from)) {
      risks.push('Moving from ' + move.from + ' removes your last defender of ' + reply.to + '.');
    }
  } else if (reply?.san.endsWith('+')) {
    tag = 'Forcing replies';
  }
  const center = ['d4', 'e4', 'd5', 'e5'].filter((square) => after.attackers(square, move.color).includes(move.to)
    && !before.attackers(square, move.color).includes(move.from));
  if ('bn'.includes(move.piece) && center.length) {
    benefits.push('From ' + move.to + ', your ' + pieceNames[move.piece] + ' adds control of ' + center.join(' and ') + '.');
  }
  return { benefits, risks, tag, highlights };
}

export function formatScore(line) {
  if (!line) return '';
  if (line.type === 'mate') return (line.score < 0 ? '−' : '+') + 'M' + Math.abs(line.score);
  return (line.score >= 0 ? '+' : '−') + (Math.abs(line.score) / 100).toFixed(2);
}
