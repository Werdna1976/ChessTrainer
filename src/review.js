import { Chess } from './vendor/chess.js';
import { boardLine, describeMove, pieceNames, uci } from './engine.js';

export const chapters = [
  { id: 'opening', name: 'Opening', question: 'How did the pieces and plans take shape?' },
  { id: 'middle', name: 'Middlegame', question: 'Who set the threats, and who had to respond?' },
  { id: 'end', name: 'Endgame', question: 'Which pieces and pawns carried the result?' },
];

const whiteOrBlack = (color) => color === 'w' ? 'White' : 'Black';
const otherSide = (color) => color === 'w' ? 'b' : 'w';
const material = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const phaseThemes = {
  opening: 'Develop a piece toward the center, then check which opposing move could interrupt your plan.',
  middle: 'Before attacking, name the threat you are creating and the strongest check or capture your opponent could play.',
  end: 'Look for a way to activate your king or support a pawn that can reach the last rank.',
};
const savedThemes = new WeakMap();

function isEndgame(fen) {
  const pieces = fen.split(' ')[0];
  const totals = [pieces.match(/[NBRQ]/g) || [], pieces.match(/[nbrq]/g) || []];
  if (!/[qQ]/.test(pieces)) return totals.every((side) => side.length <= 3);
  return totals.every((side) => side.reduce((total, piece) => total + material[piece.toLowerCase()], 0) <= 12);
}

export function phasePositions(moves) {
  let phase = 0;
  return moves.map((move, index) => {
    if (index >= 12 && isEndgame(move.after)) phase = 2;
    else if (phase === 0 && index >= 20) phase = 1;
    return { ply: index + 1, move, chapter: chapters[phase].id };
  });
}

function newlyAttacked(before, after, move, color) {
  return after.board().flat().filter((piece) => {
    if (!piece || piece.color !== color || piece.type === 'k') return false;
    const oldSquare = color === move.color && piece.square === move.to ? move.from : piece.square;
    const attacker = otherSide(color);
    return after.isAttacked(piece.square, attacker) && !before.isAttacked(oldSquare, attacker);
  }).sort((a, b) => material[b.type] - material[a.type]);
}

export function moveThemes(move) {
  if (savedThemes.has(move)) return savedThemes.get(move);
  const before = new Chess(move.before);
  const after = new Chess(move.after);
  const player = whiteOrBlack(move.color);
  const opponent = otherSide(move.color);
  const attack = newlyAttacked(before, after, move, opponent)[0];
  const exposed = newlyAttacked(before, after, move, move.color).find((piece) =>
    piece.type !== 'p' && !after.isAttacked(piece.square, move.color));
  const escaped = before.board().flat().find((piece) => {
    if (!piece || piece.color !== move.color || !'nbrq'.includes(piece.type)) return false;
    const square = piece.square === move.from ? move.to : piece.square;
    return before.isAttacked(piece.square, opponent) && !before.isAttacked(piece.square, move.color)
      && !after.isAttacked(square, opponent);
  });
  const reinforced = after.board().flat().filter((piece) => piece?.color === move.color && piece.type !== 'k'
    && piece.square !== move.to && after.isAttacked(piece.square, opponent)
    && after.attackers(piece.square, move.color).includes(move.to)
    && !before.attackers(piece.square, move.color).includes(move.from))
    .sort((a, b) => material[b.type] - material[a.type])[0];
  const attackText = move.san.endsWith('#') ? player + ' closed the game with checkmate.'
    : move.san.endsWith('+') ? player + ' gave check, forcing ' + whiteOrBlack(opponent) + ' to address the king threat.'
    : attack ? player + ' opened an attack on the ' + pieceNames[attack.type] + ' on ' + attack.square + '.' : '';
  const defense = before.isCheck() ? player + ' had to get out of check.'
    : escaped ? player + ' took the undefended ' + pieceNames[escaped.type] + ' out of danger.'
      : reinforced ? player + ' added a defender to the attacked ' + pieceNames[reinforced.type] + ' on ' + reinforced.square + '.' : '';
  let plan = '';
  if (move.promotion) plan = player + ' turned the pawn into a ' + pieceNames[move.promotion] + '.';
  else if (move.flags === 'k' || move.flags === 'q') plan = player + ' castled, shielding the king and bringing a rook toward the center.';
  else if (move.piece === 'p' && /^[de][45]$/.test(move.to) && !isEndgame(move.after)) plan = player + ' claimed space in the center with the pawn on ' + move.to + '.';
  else if ('bn'.includes(move.piece) && before.moveNumber() <= 12 && move.from.endsWith(move.color === 'w' ? '1' : '8')) {
    plan = player + ' developed the ' + pieceNames[move.piece] + ' from ' + move.from + ' to ' + move.to + '.';
  } else if (isEndgame(move.after) && move.piece === 'p') {
    const opposingPawns = after.board().flat().filter((piece) => piece?.color === opponent && piece.type === 'p');
    if (!opposingPawns.some((piece) => Math.abs(piece.square.charCodeAt(0) - move.to.charCodeAt(0)) <= 1
      && (move.color === 'w' ? piece.square[1] > move.to[1] : piece.square[1] < move.to[1]))) {
      plan = player + ' advanced a passed pawn to ' + move.to + '. No opposing pawn is ahead of it on its file or either neighboring file.';
    }
  } else if (isEndgame(move.after) && move.piece === 'k') {
    const distance = (square) => Math.abs(square.charCodeAt(0) - 100.5) + Math.abs(Number(square[1]) - 4.5);
    if (distance(move.to) < distance(move.from)) plan = player + ' brought the king closer to the center with ' + move.san + '.';
  }
  const risk = exposed ? player + ' left the ' + pieceNames[exposed.type] + ' on ' + exposed.square + ' under attack and undefended.' : '';
  const themes = { attack: attackText, defense, plan, risk };
  savedThemes.set(move, themes);
  return themes;
}

export function moveNumber(ply) {
  return Math.ceil(ply / 2) + (ply % 2 ? '. ' : '… ');
}

function swing(note) {
  const before = note?.best;
  const after = note?.line;
  if (!before || !after) return 0;
  if (before.type === 'cp' && after.type === 'cp') return Math.max(0, before.score - after.score);
  if (before.type === 'mate' && before.score > 0 && (after.type !== 'mate' || after.score < 0)) return 1000;
  if (after.type === 'mate' && after.score < 0 && (before.type !== 'mate' || before.score > 0)) return 1000;
  return 0;
}

function edge(line, mover) {
  const white = line.score * (mover === 'w' ? 1 : -1);
  if (line.type === 'mate') return (white >= 0 ? 'White' : 'Black') + ' had a forced mate in the engine line';
  if (Math.abs(white) < 50) return 'the position was roughly even';
  return (white > 0 ? 'White' : 'Black') + (Math.abs(white) >= 175 ? ' had a clear edge' : ' had a small edge');
}

export function chapterStory(positions, notes, bookEntry) {
  const ranked = positions.map((item) => ({ ...item, swing: swing(notes[item.ply]) })).sort((a, b) => b.swing - a.swing);
  const turning = ranked.find((item) => item.swing >= 75);
  const tagged = positions.map((item) => ({ ...item, themes: moveThemes(item.move) }));
  const attacks = tagged.filter((item) => item.themes.attack);
  const attack = attacks.find((item) => /[+#]$/.test(item.move.san)) || attacks[0];
  const defense = tagged.find((item) => item.themes.defense);
  const plan = tagged.find((item) => ['k', 'q'].includes(item.move.flags)) || tagged.find((item) => item.themes.plan);
  const known = positions.map(({ move }) => bookEntry(move)?.[1]).filter(Boolean).at(-1);
  const scored = positions.filter(({ ply }) => notes[ply]?.best && notes[ply]?.line);
  const first = scored[0];
  const last = scored.at(-1);
  const chapter = positions[0].chapter;
  const arc = first && last ? (first === last
    ? 'After ' + moveNumber(last.ply) + last.move.san + ', ' + edge(notes[last.ply].line, last.move.color) + '.'
    : 'Before ' + moveNumber(first.ply) + first.move.san + ', ' + edge(notes[first.ply].best, first.move.color)
      + '. After ' + moveNumber(last.ply) + last.move.san + ', ' + edge(notes[last.ply].line, last.move.color) + '.') : '';
  const summary = turning ? whiteOrBlack(turning.move.color) + ' gave up ground at ' + moveNumber(turning.ply) + turning.move.san + '.'
    : chapter === 'opening' && known ? 'The game took shape in the ' + known + '.'
      : (attack?.themes.attack || defense?.themes.defense || plan?.themes.plan || 'Follow the moves to see how the position changed.');
  const moments = [
    turning && { ...turning, label: 'Turning point', text: 'Compare the move played with the stronger continuation.' },
    attack && { ...attack, label: 'Attack', text: attack.themes.attack },
    defense && { ...defense, label: 'Defense', text: defense.themes.defense },
    plan && { ...plan, label: 'Plan', text: plan.themes.plan },
  ].filter(Boolean);
  const byPly = new Map();
  for (const moment of moments) {
    const previous = byPly.get(moment.ply);
    if (previous) previous.text += ' ' + moment.text;
    else byPly.set(moment.ply, moment);
  }
  return { summary, arc, coverage: scored.length, focus: turning?.ply || attack?.ply || defense?.ply || plan?.ply || positions[0].ply,
    moments: [...byPly.values()].sort((a, b) => a.ply - b.ply), lesson: phaseThemes[chapter] };
}

function lineMaterial(moves, side) {
  return moves.reduce((total, move) => total + (move.color === side ? 1 : -1)
    * ((material[move.captured] || 0) + (move.promotion ? material[move.promotion] - 1 : 0)), 0);
}

export function compareChoices(played, note) {
  if (!note) return null;
  const initial = note.original ? boardLine(played.before, [note.original.move])[0] : played;
  if (!initial) return null;
  const initialLine = note.original?.line || (initial === played ? note.line : null);
  const best = boardLine(played.before, note.best?.moves || [])[0];
  const alternative = initial !== played ? played : best;
  const alternativeLine = initial !== played ? note.line : note.best;
  if (!alternative || uci(initial) === uci(alternative)) return null;
  const lineA = boardLine(played.before, initialLine?.moves || []);
  const lineB = boardLine(played.before, alternativeLine?.moves || []);
  const a = initialLine?.score;
  const b = alternativeLine?.score;
  const rank = (line) => line?.type === 'mate' ? Math.sign(line.score) * (10000 - Math.abs(line.score)) : line?.score;
  const difference = a !== undefined && b !== undefined ? rank(alternativeLine) - rank(initialLine) : null;
  const stronger = difference !== null && Math.abs(difference) >= 25 ? (difference > 0 ? 1 : 0) : null;
  const originalThemes = moveThemes(initial);
  const alternativeThemes = moveThemes(alternative);
  const replyText = (line) => line[1] ? whiteOrBlack(line[1].color) + ' could ' + describeMove(line[1]) + '.' : '';
  let reason = '';
  if (stronger !== null) {
    const better = stronger ? lineB : lineA;
    const weaker = stronger ? lineA : lineB;
    const theme = stronger ? alternativeThemes : originalThemes;
    const weakerTheme = stronger ? originalThemes : alternativeThemes;
    if (weaker[1]?.san.endsWith('#') && !better[1]?.san.endsWith('#')) {
      reason = 'The weaker move allows immediate checkmate. The stronger move avoids that immediate reply.';
    } else if (better.length >= 2 && weaker.length >= 2 && lineMaterial(better.slice(0, Math.min(3, weaker.length)), played.color)
      > lineMaterial(weaker.slice(0, Math.min(3, better.length)), played.color)) {
      reason = 'The stronger move keeps more material in Stockfish’s preview.' + (theme.defense ? ' ' + theme.defense : '');
    } else if (weakerTheme.risk && !theme.risk) {
      reason = weakerTheme.risk + ' The stronger move avoids leaving that piece exposed.';
    } else if (theme.defense && theme.defense !== weakerTheme.defense) {
      reason = theme.defense;
    } else if (theme.attack && theme.attack !== weakerTheme.attack) {
      reason = 'The stronger move changes the immediate threat. ' + theme.attack;
    } else if (theme.plan && theme.plan !== weakerTheme.plan) {
      reason = 'The stronger move advances a concrete plan. ' + theme.plan;
    } else {
      reason = 'The stronger move leads to a better position in Stockfish’s search. Compare the two replies on the board to see what changes.';
    }
  }
  return {
    choices: [
      { move: initial, label: note.original ? 'Your original idea' : 'Your played move', line: initialLine, reply: replyText(lineA), themes: originalThemes },
      { move: alternative, label: note.original ? 'Move you played' : 'Stockfish alternative', line: alternativeLine, reply: replyText(lineB), themes: alternativeThemes },
    ],
    stronger, reason,
  };
}
