import { Chess } from './vendor/chess.js';
import { Engine, levels, uci, pieceNames, assess, explain, formatScore, boardLine, describeMove, moveImpact } from './engine.js';
import { openings, challenges } from './content.js';
import { boards, sets, pieceArt, loadAppearance, saveAppearance, playMoveSound } from './appearance.js';
import { openingPositionKey } from './book.js';

const $ = (id) => document.getElementById(id);
const escape = (input) => String(input ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const buttons = (content) => '<div class="actions">' + content + '</div>';
const button = (action, label, style = 'secondary', value = '', disabled = false) =>
  '<button class="' + style + '" data-action="' + action + '" data-value="' + escape(value) + '"' + (disabled ? ' disabled' : '') + '>' + escape(label) + '</button>';
const playerName = (color) => color === 'w' ? 'White' : 'Black';
const squares = 'abcdefgh';
// Keep the existing key so history survives the site rename.
const storeKey = 'quiet-square-v1';
const appearance = loadAppearance();
document.documentElement.dataset.board = appearance.board;
document.documentElement.dataset.pieces = appearance.pieces;
const engine = new Engine();
const modes = {
  play: ['Coach & play', 'Explore a move before you commit to it.', 'New game'],
  challenges: ['Chess challenges', 'Find a forcing move and play the idea through.', 'Restart puzzle'],
  openings: ['Opening trainers', 'Practice the first moves and learn what each one sets up.', 'Restart lesson'],
  review: ['Game review', 'Replay your decisions and revisit the moments that mattered.', 'Export PGN'],
};
const classifications = ['Checkmate', 'Good move', 'Playable', 'Inaccuracy', 'Mistake', 'Blunder', 'Missed mate', 'Unrated'];
const gradeStyle = (grade) => ({ Checkmate: 'good', 'Good move': 'good', Inaccuracy: 'mistake', Mistake: 'mistake', Blunder: 'blunder', 'Missed mate': 'blunder' })[grade] || '';
const newRecord = (color = 'w', level = 'casual') => ({ id: crypto.randomUUID(), date: new Date().toISOString(), color, level, moves: [], notes: {} });
const defaultStore = () => ({ version: 1, current: newRecord(), archive: [], solved: [], learned: [] });
let library = loadStore();
let game = reconstruct(library.current);
let mode = 'play';
let facing = library.current.color;
let selected = '';
let proposal = null;
let variation = null;
let busy = false;
let engineError = '';
let generation = 0;
let opponentRequest = 0;
let challengeIndex = 0;
let openingIndex = 0;
let exercise = new Chess();
let exerciseStep = 0;
let exerciseMessage = '';
let hintOn = false;
let reviewId = library.current.id;
let reviewPly = 0;
let reviewRetry = null;
let livePly = null;
let toast = '';
let openingBook = {};
const scoring = new Map();

function reconstruct(record, limit = record.moves.length) {
  const position = new Chess();
  for (const code of record.moves.slice(0, limit)) position.move(code);
  return position;
}

function validateStore(raw) {
  if (raw?.version !== 1 || !Array.isArray(raw.archive) || !Array.isArray(raw.solved) || !Array.isArray(raw.learned)) throw new Error('Invalid training backup.');
  function record(input) {
    if (!input || typeof input.id !== 'string' || !['w', 'b'].includes(input.color) || !levels.some((x) => x.id === input.level)
      || !Array.isArray(input.moves) || !Number.isFinite(Date.parse(input.date))) throw new Error('Invalid game record.');
    if (!input.moves.every((code) => typeof code === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(code))) throw new Error('Invalid game moves.');
    const history = reconstruct(input).history({ verbose: true });
    const notes = {};
    const list = (items) => Array.isArray(items) ? items.filter((item) => typeof item === 'string').slice(0, 8) : [];
    for (const [key, note] of Object.entries(input.notes || {})) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 1 || index > input.moves.length || !classifications.includes(note?.grade)) continue;
      const line = (entry) => ['cp', 'mate'].includes(entry?.type) && Number.isFinite(entry.score) && Array.isArray(entry.moves)
        && entry.moves.every((code) => typeof code === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(code))
        ? { type: entry.type, score: entry.score, moves: entry.moves.slice(0, 6) } : null;
      const playedLine = line(note.line);
      const savedRisks = list(note.risks);
      const usesOldWording = savedRisks.some((risk) => /^(Test your idea against |Watch |Your opponent can (answer with|play) )/.test(risk));
      const currentRisks = playedLine && usesOldWording ? explain(history[index - 1], playedLine).risks : [];
      notes[index] = {
        grade: note.grade, benefits: list(note.benefits), risks: currentRisks.length ? currentRisks : savedRisks,
        highlights: list(note.highlights), tag: typeof note.tag === 'string' ? note.tag : '',
        line: playedLine, best: line(note.best),
      };
    }
    return { id: input.id, date: input.date, color: input.color, level: input.level, moves: history.map(uci), notes };
  }
  return {
    version: 1, current: record(raw.current), archive: raw.archive.map(record),
    solved: [...new Set(raw.solved.filter((index) => Number.isInteger(index) && challenges[index]))],
    learned: [...new Set(raw.learned.filter((index) => Number.isInteger(index) && openings[index]))],
  };
}

function loadStore() {
  try { return validateStore(JSON.parse(localStorage.getItem(storeKey))); }
  catch { return defaultStore(); }
}
function save() {
  try { localStorage.setItem(storeKey, JSON.stringify(library)); }
  catch { toast = 'Browser storage is unavailable. Export a backup to keep this session.'; }
}
function announce(message) { $('announcement').textContent = message; }
function getReview() { return [library.current, ...library.archive].find((record) => record.id === reviewId) || library.current; }
function playerTurn() { return !game.isGameOver() && game.turn() === library.current.color; }
function engineLevel() { return levels.find((level) => level.id === library.current.level); }
function soundFor(move, delay = 0) {
  if (appearance.sound) void playMoveSound(move, delay);
}

function syncDifficulty(input, label, levelId) {
  const index = levels.findIndex((level) => level.id === levelId);
  input.value = index;
  input.setAttribute('aria-valuetext', levels[index].label);
  label.textContent = levels[index].label;
}
function resultText(position) {
  if (position.isCheckmate()) return playerName(position.turn() === 'w' ? 'b' : 'w') + ' wins by checkmate.';
  if (position.isStalemate()) return 'Draw by stalemate.';
  if (position.isThreefoldRepetition()) return 'Draw by repetition.';
  if (position.isInsufficientMaterial()) return 'Draw by insufficient material.';
  if (position.isDrawByFiftyMoves()) return 'Draw by the fifty-move rule.';
  return '';
}

function enterMode(next) {
  if (!Object.hasOwn(modes, next)) next = 'play';
  mode = next;
  selected = '';
  variation = null;
  reviewRetry = null;
  if (next === 'play') {
    facing = library.current.color;
    livePly = null;
  }
  if (next === 'challenges') {
    if (!(exercise instanceof Chess) || exerciseMode !== next) resetExercise();
    facing = 'w';
  }
  if (next === 'openings') {
    if (exerciseMode !== next) resetExercise();
    facing = openings[openingIndex].color;
  }
  if (next === 'review') facing = getReview().color;
  render();
}

function goTo(next) {
  if (location.hash !== '#' + next) location.hash = next;
  else enterMode(next);
}

let exerciseMode = '';
function resetExercise() {
  exerciseMode = mode;
  exerciseStep = 0;
  exerciseMessage = '';
  hintOn = false;
  selected = '';
  if (mode === 'challenges') {
    exercise = new Chess(challenges[challengeIndex].fen);
    facing = 'w';
  } else {
    exercise = new Chess();
    const lesson = openings[openingIndex];
    if (lesson.color === 'b') exercise.move(lesson.moves[exerciseStep++]);
    facing = lesson.color;
  }
}

function activeCandidate() {
  return proposal?.selectedOption || proposal;
}

function boardContext() {
  if (variation) {
    const move = variation.moves[variation.index - 1];
    return { position: new Chess(move?.after || variation.fen), last: move };
  }
  if (mode === 'review') {
    if (reviewRetry) {
      return { position: new Chess(reviewRetry.move?.after || reviewRetry.fen), last: reviewRetry.move, highlights: reviewRetry.note?.highlights || [] };
    }
    const position = reconstruct(getReview(), reviewPly);
    return { position, last: position.history({ verbose: true }).at(-1) };
  }
  if (mode === 'play') {
    if (livePly !== null) {
      const position = reconstruct(library.current, livePly);
      return { position, last: position.history({ verbose: true }).at(-1) };
    }
    const candidate = activeCandidate();
    if (candidate) return { position: new Chess(candidate.move.after), last: candidate.move };
    return { position: game, last: game.history({ verbose: true }).at(-1) };
  }
  const hint = mode === 'openings' && hintOn && openings[openingIndex].moves[exerciseStep];
  const guide = hint ? exercise.moves({ verbose: true }).find((move) => move.san === hint) : null;
  return { position: exercise, last: exercise.history({ verbose: true }).at(-1), highlights: guide ? [guide.from, guide.to] : [] };
}

function canMove() {
  if (variation) return false;
  if (mode === 'review') return Boolean(reviewRetry && !reviewRetry.move);
  if (mode === 'play') return livePly === null && !busy && !proposal && playerTurn();
  return mode === 'challenges' ? exerciseStep < 2 : exerciseStep < openings[openingIndex].moves.length;
}

function renderBoard() {
  const { position, last, highlights = [] } = boardContext();
  const interactive = canMove();
  const legal = interactive && selected ? position.moves({ square: selected, verbose: true }).map((move) => move.to) : [];
  const board = position.board();
  const original = mode === 'play' && livePly === null ? proposal?.move : null;
  const originalSquares = original ? [original.from, original.to] : [];
  const onOriginalMove = last && original && last.before === original.before && uci(last) === uci(original);
  const lastSquares = last && !onOriginalMove ? [last.from, last.to] : [];
  const inCheck = position.isCheck();
  $('board-legend').hidden = !original;
  const coords = Array.from({ length: 8 }, (_, index) => index);
  const rows = facing === 'w' ? coords : [...coords].reverse();
  const cols = facing === 'w' ? coords : [...coords].reverse();
  const focused = document.activeElement?.dataset.square;
  $('board').innerHTML = rows.map((row, i) => cols.map((col, j) => {
    const square = squares[col] + (8 - row);
    const piece = board[row][col];
    const attacked = original && piece && position.isAttacked(square, piece.color === 'w' ? 'b' : 'w');
    const threatened = attacked && piece.color === library.current.color;
    const originalSquare = originalSquares.includes(square);
    const classes = [
      (row + col) % 2 ? 'dark' : 'light',
      lastSquares.includes(square) ? 'previous' : '',
      selected === square ? 'selected' : '',
      legal.includes(square) ? 'target' : '',
      highlights.includes(square) ? 'marked' : '',
      piece?.type === 'k' && piece.color === position.turn() && inCheck ? 'check' : '',
      originalSquare ? 'original-square' : '',
      attacked ? (threatened ? 'threatened' : 'attack-target') : '',
    ].join(' ');
    const label = square + (piece ? ', ' + playerName(piece.color) + ' ' + pieceNames[piece.type] : ', empty')
      + (attacked ? ', under attack' : '') + (originalSquare ? ', original move' : '');
    const pieceHtml = piece ? pieceArt(piece.type, piece.color, appearance.pieces) : '';
    return '<button class="square ' + classes + '" data-square="' + square + '" draggable="' + Boolean(interactive && piece?.color === position.turn()) + '" aria-label="' + label + '"' + (interactive ? ' aria-pressed="' + (selected === square) + '"' : ' disabled') + '>'
      + (j === 0 ? '<span class="coordinate rank">' + (8 - row) + '</span>' : '')
      + pieceHtml + (i === 7 ? '<span class="coordinate file">' + squares[col] + '</span>' : '') + '</button>';
  }).join('')).join('');
  if (focused) $('board').querySelector('[data-square="' + focused + '"]')?.focus({ preventScroll: true });
  const caption = (color) => {
    const human = mode === 'play' ? color === library.current.color : color === facing;
    const name = mode === 'play' ? (human ? 'You' : 'Stockfish') : playerName(color);
    const detail = mode === 'play' && !human ? engineLevel().label : '';
    return '<div class="player"><span class="avatar ' + (color === 'w' ? 'light' : '') + '" aria-hidden="true">' + (human ? '♙' : '♚') + '</span><div>' + name + (detail ? '<small>' + detail + '</small>' : '') + '</div></div>';
  };
  $('top-player').innerHTML = caption(facing === 'w' ? 'b' : 'w');
  $('bottom-player').innerHTML = caption(facing);
}

function render() {
  const [title, subtitle, action] = modes[mode];
  $('title').textContent = title;
  $('subtitle').textContent = subtitle;
  $('header-action').textContent = action;
  $('header-action').disabled = mode === 'review' && !getReview().moves.length;
  $('details').classList.toggle('move-tracker', mode === 'play' || mode === 'review');
  $('difficulty-control').hidden = mode !== 'play';
  syncDifficulty($('difficulty'), $('difficulty-level'), library.current.level);
  for (const link of document.querySelectorAll('[data-mode]')) {
    if (link.dataset.mode === mode) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  $('engine-status').firstElementChild.dataset.status = engineError ? 'error' : 'ready';
  $('engine-status').lastChild.textContent = engineError ? ' Stockfish unavailable' : ' Stockfish 19 Lite';
  renderBoard();
  if (mode === 'play') renderPlay();
  if (mode === 'challenges') renderChallenge();
  if (mode === 'openings') renderOpening();
  if (mode === 'review') renderReview();
  if (toast) $('details').insertAdjacentHTML('beforeend', '<p class="tip" role="status">' + escape(toast) + '</p>');
}

function bookEntry(move) {
  return openingBook[openingPositionKey(move.after)];
}

function bookBadge(move) {
  const entry = bookEntry(move);
  if (!entry) return '';
  const [eco, name] = entry;
  return '<p class="book-detail"><span class="badge book">Book move</span>'
    + (name ? ' <span>' + escape(name) + ' · ' + escape(eco) + '</span>' : '') + '</p>';
}

function moveList(list, notes = {}, active = -1) {
  if (!list.length) return '<p class="muted">Moves will appear here as you play.</p>';
  const rows = list.map((move, index) => {
    const note = notes[index + 1];
    const impact = moveImpact(note);
    const entry = bookEntry(move);
    const [eco, name] = entry || [];
    const book = entry ? '<span class="book-cell" title="' + escape(name ? name + ' · ' + eco : 'Book move') + '">'
      + escape(name || 'In book') + '</span>' : '';
    const activeRow = index + 1 === active;
    return '<tr data-ply="' + (index + 1) + '"' + (activeRow ? ' class="current"' : '') + '><td>' + (Math.floor(index / 2) + 1) + (index % 2 === 0 ? '.' : '…') + '</td><td>'
      + '<button data-action="timeline" data-value="' + (index + 1) + '"' + (activeRow ? ' aria-current="step"' : '') + ' aria-label="'
      + escape(playerName(move.color) + ' played ' + move.san + (note?.grade ? ', ' + note.grade : '')) + '">' + escape(move.san)
      + '</button></td><td>' + (impact
        ? '<span class="badge ' + impact.tone + '" title="' + escape(note.grade + ' · ' + playerName(move.color) + '’s evaluation change') + '">' + escape(impact.label) + '</span>'
        : '<span class="muted" title="Awaiting analysis">—</span>') + '</td><td>' + book + '</td></tr>';
  });
  return '<div class="moves"><table aria-label="Move tracker"><colgroup><col class="turn-col"><col class="move-col"><col class="impact-col"><col></colgroup>'
    + '<thead><tr><th scope="col">Turn</th><th scope="col">Move</th><th scope="col" title="Evaluation change for the side that moved">Change</th><th scope="col">Book</th></tr></thead>'
    + '<tbody>' + rows.join('') + '</tbody></table></div>';
}

function renderTracker(record, list, cursor, heading) {
  const details = $('details');
  const previousScroll = cursor ? details.querySelector('.moves')?.scrollTop || 0 : 0;
  const focused = details.contains(document.activeElement) ? document.activeElement : null;
  const end = list.length;
  const following = mode === 'play' && livePly === null;
  const pending = list.filter((_, index) => !moveImpact(record.notes[index + 1])).length;
  const job = scoring.get(record);
  const navigation = end ? '<div class="timeline-controls" aria-label="Game timeline">'
    + '<label for="timeline-position">' + (following ? 'Live position' : cursor ? 'After ' + Math.ceil(cursor / 2) + (cursor % 2 ? '. ' : '… ') + escape(list[cursor - 1].san) : 'Starting position') + '</label>'
    + '<input id="timeline-position" type="range" min="0" max="' + end + '" value="' + cursor + '">'
    + '<div class="timeline-buttons">'
    + button('timeline', 'Start', 'secondary', 0, cursor === 0)
    + button('timeline', 'Back', 'secondary', cursor - 1, cursor === 0)
    + button('timeline', 'Next', 'secondary', cursor + 1, cursor === end)
    + (mode === 'play' ? button('timeline', 'Live', 'secondary', 'live', following) : button('timeline', 'End', 'secondary', end, cursor === end))
    + '</div></div>' : '';
  details.innerHTML = heading + navigation + moveList(list, record.notes, cursor)
    + (end ? '<div class="tracker-footer"><p class="muted">Change is shown for the side that moved.</p>'
      + (pending ? (job?.running ? '<p role="status">Scoring moves… ' + (end - pending) + ' of ' + end + '</p>'
        : button('score-game', job?.failed ? 'Retry scoring' : 'Analyze game', 'secondary')) : '') + '</div>' : '');
  const scroll = details.querySelector('.moves');
  if (scroll) {
    scroll.scrollTop = previousScroll;
    const row = scroll.querySelector('tr.current');
    if (row) {
      const view = scroll.getBoundingClientRect();
      const bounds = row.getBoundingClientRect();
      const header = scroll.querySelector('thead').offsetHeight;
      if (bounds.top < view.top + header) scroll.scrollTop -= view.top + header - bounds.top;
      if (bounds.bottom > view.bottom) scroll.scrollTop += bounds.bottom - view.bottom;
    }
  }
  if (focused?.id) details.querySelector('#' + focused.id)?.focus({ preventScroll: true });
  else if (focused?.dataset.action === 'timeline') {
    const replacement = [...details.querySelectorAll('button[data-action="timeline"]')].find((control) =>
      !control.disabled && (focused.closest('table') ? control.closest('table') && control.dataset.value === focused.dataset.value : control.textContent === focused.textContent));
    (replacement || details.querySelector('#timeline-position'))?.focus({ preventScroll: true });
  }
}

function scoreSummary(note, color) {
  const impact = moveImpact(note);
  if (!impact) return '';
  return '<p class="evaluation-summary"><span class="badge ' + impact.tone + '">' + escape(impact.label) + '</span> '
    + playerName(color) + '’s evaluation went from ' + escape(formatScore(note.best)) + ' to ' + escape(formatScore(note.line)) + '.</p>';
}
function variationControls() {
  const move = variation.moves[variation.index - 1];
  const next = variation.moves[variation.index];
  return '<div class="tip"><strong>Stockfish preview</strong>'
    + '<p>' + (move ? playerName(move.color) + ' could ' + escape(describeMove(move)) + '.' : 'Position before the first move') + '</p>'
    + buttons(button('line-step', 'Back', 'secondary', variation.index - 1, variation.index === 0)
      + (next ? button('line-step', 'Show ' + playerName(next.color) + '’s move', 'secondary', variation.index + 1) : '')
      + button('close-line', 'Close preview')) + '</div>';
}

function noteCopy(note) {
  return (note.benefits.length ? '<h3>What it does</h3>' + note.benefits.map((item) => '<p>' + escape(item) + '</p>').join('') : '')
    + (note.risks.length ? '<h3>What your opponent might play</h3>' + note.risks.map((item) => '<p>' + escape(item) + '</p>').join('') : '');
}

function recordedMoveCopy(record, played, ply) {
  const note = record.notes[ply];
  return '<div class="card-head"><h2>' + Math.ceil(ply / 2) + (played.color === 'w' ? '. ' : '… ') + escape(played.san) + '</h2>'
    + (note ? '<span class="badge ' + gradeStyle(note.grade) + '">' + escape(note.grade) + '</span>' : '') + '</div>'
    + bookBadge(played) + scoreSummary(note, played.color)
    + (note && played.color === record.color ? noteCopy(note) : '<p class="muted">' + playerName(played.color) + ' played ' + escape(played.san) + '.</p>');
}

function renderPlay() {
  const focusedCandidate = document.activeElement?.dataset.action === 'option' ? document.activeElement.dataset.value : null;
  const record = library.current;
  const list = game.history({ verbose: true });
  const candidate = activeCandidate();
  const proposed = candidate?.move;
  const note = candidate?.note;
  let panel = '<p class="kicker">Position coach</p>';
  if (livePly !== null) {
    const played = list[livePly - 1];
    panel = '<p class="kicker">Game replay</p>' + (played ? recordedMoveCopy(record, played, livePly) : '<h2>Starting position</h2>')
      + buttons(button('timeline', 'Return to live game', 'primary', 'live') + button('review-live', 'Open game review', 'secondary', livePly));
  } else if (proposed) {
    if (proposal.choices.length) {
      panel += '<h2>Compare moves</h2><div class="lines candidates" role="group" aria-label="Moves to compare">';
      for (const [index, option] of [proposal, ...proposal.choices].entries()) {
        panel += '<button class="choice line' + (index === 0 ? ' original-candidate' : '') + '" data-action="option" data-value="' + index
          + '" aria-pressed="' + (option === candidate) + '"><span><strong>' + escape(option.move.san) + '</strong>'
          + '<small>' + (index === 0 ? 'Your original move' : 'Stockfish alternative') + '</small></span>'
          + '<span class="badge">' + escape(formatScore(option.note?.line) || option.note?.grade || '') + '</span></button>';
      }
      panel += '</div>';
    }
    panel += '<div class="card-head"><h2>' + escape(proposed.san) + '</h2>' + (note ? '<span class="badge ' + gradeStyle(note.grade) + '">' + escape(note.grade) + '</span>' : '') + '</div>';
    panel += bookBadge(proposed);
    if (busy) panel += '<p class="muted" role="status">Stockfish is comparing your move with alternatives…</p>';
    else if (proposal.error) panel += '<p role="status">' + escape(proposal.error) + '</p>' + buttons(button('analyze', 'Retry analysis'));
    else if (note) {
      panel += noteCopy(note);
      if (!note.benefits.length && !note.risks.length) panel += '<p class="muted">Stockfish didn’t show a follow-up for this move.</p>';
      if (note.line?.moves.length > 1 && !variation) panel += buttons(button('proposal-line', 'Show opponent’s reply on the board'));
    }
    if (variation) panel += variationControls();
    panel += buttons(button('commit', 'Play ' + proposed.san, 'primary') + button('cancel', 'Try another move'));
  } else if (game.isGameOver()) {
    panel += '<h2>' + escape(resultText(game)) + '</h2><p class="muted">Review the game to revisit your decisions.</p>' + buttons(button('review-live', 'Review game', 'primary', game.history().length));
  } else if (!playerTurn()) {
    panel += '<h2>Stockfish to move</h2><p class="muted" role="status">' + escape(engineError || 'Your opponent is thinking…') + '</p>';
    if (engineError) panel += buttons(button('opponent-retry', 'Retry'));
  } else {
    panel += '<h2>' + (game.isCheck() ? 'You’re in check' : 'Your move') + '</h2><p class="muted">Select a piece and choose a square. The coach will show what your move achieves and what your opponent might play in response.</p>'
      + '<div class="tip"><strong>' + (game.isCheck() ? 'Make your king safe' : 'Before you move') + '</strong><p>'
      + (game.isCheck() ? 'Look for a capture, a block, or a safe square for your king.' : 'Check what your opponent is attacking. After a trade, look one move farther and see who can recapture.') + '</p></div>';
  }
  $('panel').innerHTML = panel;
  if (focusedCandidate !== null) $('panel').querySelector('[data-action="option"][data-value="' + focusedCandidate + '"]')?.focus({ preventScroll: true });
  renderTracker(record, list, livePly ?? list.length, '<div class="card-head"><h2>Move tracker</h2>'
    + (list.length ? button('review-live', 'Review', 'text-button', livePly ?? list.length) : '') + '</div>');
}

function renderChallenge() {
  const challenge = challenges[challengeIndex];
  const done = exerciseStep === 2;
  const prompt = exerciseStep ? 'White to move. Finish the combination.' : (challenge.mate === 2 ? 'White to move and force mate in two.' : 'White to move. Find the strongest move.');
  $('panel').innerHTML = '<p class="kicker">' + challenge.type + '</p><h2>' + challenge.name + '</h2><p class="muted">'
    + escape(done ? challenge.takeaway : prompt) + '</p>'
    + (exerciseMessage ? '<p class="tip" role="status">' + escape(exerciseMessage) + '</p>' : '')
    + (hintOn && !done ? '<p class="tip">' + escape(exerciseStep ? challenge.follow : challenge.hint) + '</p>' : '')
    + buttons(done ? button('challenge', 'Next challenge', 'primary', (challengeIndex + 1) % challenges.length) : button('hint', hintOn ? 'Hide hint' : 'Get a hint'));
  $('details').innerHTML = '<div class="card-head"><h2>Challenge library</h2><span class="badge">' + library.solved.length + ' / ' + challenges.length + ' solved</span></div><div class="lesson-list">'
    + challenges.map((item, index) => '<button class="choice' + (index === challengeIndex ? ' active' : '') + '" data-action="challenge" data-value="' + index + '">' + escape(item.name) + '<small>' + [item.type, item.difficulty, library.solved.includes(index) ? 'Solved' : ''].filter(Boolean).join(' · ') + '</small></button>').join('')
    + '</div>';
}

function renderOpening() {
  const lesson = openings[openingIndex];
  const done = exerciseStep >= lesson.moves.length;
  const playerMoves = lesson.moves.filter((_, index) => index % 2 === (lesson.color === 'w' ? 0 : 1)).length;
  const index = done ? playerMoves : Math.floor(exerciseStep / 2);
  $('panel').innerHTML = '<div class="card-head"><p class="kicker">' + escape(lesson.variation) + '</p><span class="badge">' + playerName(lesson.color) + ' · ' + Math.min(index, playerMoves) + ' / ' + playerMoves + '</span></div>'
    + '<h2>' + lesson.name + '</h2><p class="muted">' + lesson.idea + '</p>'
    + '<div class="tip"><strong>' + (done ? 'Lesson complete' : 'Find the next move') + '</strong><p>' + (done ? lesson.recap : lesson.prompts[index]) + '</p></div>'
    + (exerciseMessage ? '<p role="status">' + escape(exerciseMessage) + '</p>' : '')
    + (hintOn && !done ? '<p class="tip">Try ' + escape(lesson.moves[exerciseStep]) + '.</p>' : '')
    + buttons(done ? button('opening', 'Next lesson', 'primary', (openingIndex + 1) % openings.length) : button('hint', hintOn ? 'Hide move' : 'Show move'));
  $('details').innerHTML = '<div class="card-head"><h2>Opening library</h2><span class="badge">' + library.learned.length + ' / ' + openings.length + ' practiced</span></div><div class="lesson-list">'
    + openings.map((item, i) => '<button class="choice' + (i === openingIndex ? ' active' : '') + '" data-action="opening" data-value="' + i + '">' + escape(item.name) + '<small>' + escape(item.variation) + ' · ' + playerName(item.color) + (library.learned.includes(i) ? ' · Practiced' : '') + '</small></button>').join('')
    + '</div>';
}

function dateLabel(record) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.date));
}

function renderReview() {
  const record = getReview();
  const list = reconstruct(record).history({ verbose: true });
  const played = list[reviewPly - 1];
  const note = record.notes[reviewPly];
  const keyPlies = Object.entries(record.notes).filter(([, item]) => ['Blunder', 'Mistake', 'Inaccuracy', 'Missed mate'].includes(item.grade)).map(([ply]) => Number(ply));
  let copy = '<p class="kicker">Analysis board</p>';
  if (played) {
    copy += recordedMoveCopy(record, played, reviewPly);
    if (note && !variation) copy += buttons((note.line?.moves.length > 1 ? button('review-line', 'Show reply', 'secondary', 'line') : '')
      + (note.best && note.best.moves[0] !== uci(played) ? button('review-line', 'See alternative', 'secondary', 'best') : '')
      + button('review-retry', 'Retry position'));
  } else copy += '<h2>Starting position</h2><p class="muted">' + (list.length ? 'Step through the moves or jump to a turning point.' : 'Play a game to build your review history.') + '</p>';
  if (variation) copy += variationControls();
  if (keyPlies.length) {
    const next = keyPlies.find((ply) => ply > reviewPly) ?? keyPlies[0];
    copy += buttons(button('review-ply', 'Next turning point', 'primary', next));
  }
  if (reviewRetry) {
    const attempt = reviewRetry;
    copy = '<p class="kicker">Retry position</p><h2>' + (attempt.move ? escape(attempt.move.san) : playerName(new Chess(attempt.fen).turn()) + ' to move') + '</h2>';
    if (!attempt.move) copy += '<p class="muted">Try a move on the board. Where is the opponent’s strongest reply?</p>';
    else if (attempt.note) {
      copy += '<p class="badge ' + gradeStyle(attempt.note.grade) + '">' + escape(attempt.note.grade) + '</p>' + noteCopy(attempt.note);
      const suggested = boardLine(attempt.fen, attempt.note.best?.moves || [])[0];
      if (suggested && uci(suggested) !== uci(attempt.move)) {
        copy += '<h3>Compare ' + escape(suggested.san) + '</h3>' + noteCopy(explain(suggested, attempt.note.best));
        if (!variation) copy += buttons(button('retry-line', 'Explore ' + suggested.san, 'secondary', 'best'));
      }
      if (!variation && attempt.note.line?.moves.length > 1) copy += buttons(button('retry-line', 'Show opponent’s reply', 'secondary', 'line'));
    } else copy += '<p role="status">' + (attempt.error || 'Stockfish is analyzing your move…') + '</p>';
    if (variation) copy += variationControls();
    copy += buttons((attempt.move && (attempt.note || attempt.error) ? button('review-retry', 'Try another move') : '') + button('retry-close', 'Back to game'));
  }
  const ownMistakes = keyPlies.filter((ply) => list[ply - 1].color === record.color);
  const habit = ownMistakes.map((ply) => record.notes[ply]).reduce((counts, item) => {
    if (item.tag) counts[item.tag] = (counts[item.tag] || 0) + 1;
    return counts;
  }, {});
  const theme = Object.entries(habit).sort((a, b) => b[1] - a[1])[0]?.[0];
  const tips = {
    'Loose pieces': 'After choosing a move, check which of your pieces it leaves open to capture.',
    'King safety': 'Before attacking, look at every check your opponent can play on the next move.',
    'Forcing replies': 'Look at your opponent’s checks and captures first. Play through the strongest one in your head.',
  };
  if (!reviewRetry) {
    const ownGrades = list.flatMap((move, index) => move.color === record.color && record.notes[index + 1] ? [record.notes[index + 1].grade] : []);
    if (ownGrades.length) copy += '<div class="actions" aria-label="Your move quality"><span class="badge good">'
      + ownGrades.filter((grade) => ['Good move', 'Checkmate'].includes(grade)).length + ' good</span><span class="badge mistake">'
      + ownGrades.filter((grade) => grade === 'Mistake').length + ' mistakes</span><span class="badge blunder">'
      + ownGrades.filter((grade) => grade === 'Blunder').length + ' blunders</span></div>';
  }
  if (ownMistakes.length && !reviewRetry) copy += '<div class="tip"><strong>For your next game</strong><p>' + (tips[theme] || 'Pause before committing and compare at least two candidate moves after each likely reply.') + '</p></div>';
  $('panel').innerHTML = copy;
  renderTracker(record, list, reviewPly, '<h2>Game review</h2><label class="field">Choose a game<select id="review-game">'
    + [library.current, ...library.archive].map((item, index) => '<option value="' + escape(item.id) + '"' + (item.id === record.id ? ' selected' : '') + '>'
      + escape(index ? dateLabel(item) + ' · ' + playerName(item.color) + ' · ' + item.moves.length + ' plies' : 'Current game') + '</option>').join('')
    + '</select></label>');
}

function prepareProposal(move) {
  proposal = { move, note: null, choices: [], selectedOption: null, error: '' };
  selected = '';
  void analyzeProposal();
}

async function evaluateMove(move, history, { fast = false, after = new Chess(move.after) } = {}) {
  const candidates = await engine.search({ history, count: fast ? 1 : 3, ms: fast ? 200 : 510 });
  const best = candidates.lines[0];
  if (!best) throw new Error('No evaluation available.');
  let chosen = candidates.lines.find((item) => item.moves[0] === uci(move));
  if (after.isCheckmate()) chosen = { type: 'mate', score: 1, moves: [uci(move)] };
  else if (after.isDraw()) chosen = { type: 'cp', score: 0, moves: [uci(move)] };
  else if (!chosen) {
    const forced = await engine.search({ history, restrict: uci(move), ms: fast ? 190 : 450 });
    chosen = forced.lines[0];
  }
  const note = { ...explain(move, chosen), grade: assess(chosen, best, after.isCheckmate()), line: chosen, best };
  return { note, candidates: candidates.lines };
}

function refreshScores(record) {
  if ($('timeline-position')?.matches(':active')) return;
  if (mode === 'play' && library.current === record) renderPlay();
  if (mode === 'review' && getReview() === record) renderReview();
}

function scoreMoves(record, plies) {
  const job = scoring.get(record) || { queue: new Set(), running: false, failed: false };
  for (const ply of plies) {
    if (!moveImpact(record.notes[ply])) job.queue.add(ply);
  }
  if (!job.queue.size) return;
  scoring.set(record, job);
  if (!job.running) void runScoring(record, job);
}

async function runScoring(record, job) {
  job.running = true;
  job.failed = false;
  refreshScores(record);
  const retained = () => record === library.current || library.archive.includes(record);
  try {
    while (job.queue.size && retained()) {
      const ply = job.queue.values().next().value;
      if (!moveImpact(record.notes[ply])) {
        const after = reconstruct(record, ply);
        const move = after.history({ verbose: true }).at(-1);
        const { note } = await evaluateMove(move, record.moves.slice(0, ply - 1), { fast: true, after });
        if (!moveImpact(note)) throw new Error('Stockfish did not score the move.');
        if (retained()) {
          record.notes[ply] = note;
          save();
        }
      }
      job.queue.delete(ply);
      if (retained() && job.queue.size) refreshScores(record);
    }
  } catch {
    job.failed = true;
    job.queue.clear();
  } finally {
    job.running = false;
    if (!job.failed || !retained()) scoring.delete(record);
    if (retained()) refreshScores(record);
  }
}

async function analyzeProposal() {
  if (!proposal || busy) return;
  const target = proposal;
  const move = target.move;
  target.error = '';
  busy = true;
  engineError = '';
  render();
  try {
    const { note, candidates } = await evaluateMove(move, library.current.moves.slice());
    if (proposal !== target) return;
    target.note = note;
    const seen = new Set([uci(move)]);
    target.choices = candidates.flatMap((line) => {
      if (seen.has(line.moves[0])) return [];
      const first = boardLine(move.before, line.moves)[0];
      if (!first) return [];
      seen.add(line.moves[0]);
      const explanation = explain(first, line);
      return [{
        move: first,
        note: { ...explanation, grade: assess(line, note.best, first.san.endsWith('#')), line, best: note.best },
      }];
    }).slice(0, 2);
    announce(move.san + '. ' + target.note.grade + '.');
  } catch {
    if (proposal === target) {
      target.error = 'Stockfish analysis is unavailable. You can retry or play this move.';
      engineError = target.error;
    }
  } finally {
    if (proposal === target) {
      busy = false;
      render();
    }
  }
}

function commit() {
  if (!proposal) return;
  const { move, note } = activeCandidate();
  const recorded = game.move(uci(move));
  const record = library.current;
  soundFor(recorded);
  library.current.moves.push(uci(recorded));
  library.current.notes[library.current.moves.length] = note || {
    ...explain(recorded), grade: recorded.san.endsWith('#') ? 'Checkmate' : 'Unrated', line: null, best: null,
  };
  clearProposal();
  save();
  render();
  void playOpponent();
  scoreMoves(record, [record.moves.length]);
}

function clearProposal() {
  proposal = null;
  variation = null;
  busy = false;
  selected = '';
}

async function playOpponent() {
  if (playerTurn() || game.isGameOver() || opponentRequest) return;
  const request = ++generation;
  opponentRequest = request;
  const level = engineLevel();
  const history = library.current.moves.slice();
  engineError = '';
  render();
  try {
    const { best } = await engine.search({ history, skill: level.skill, ms: level.ms });
    if (opponentRequest !== request) return;
    const move = game.move(best);
    soundFor(move);
    library.current.moves.push(uci(move));
    save();
    scoreMoves(library.current, [library.current.moves.length]);
    announce('Stockfish played ' + move.san + '.');
  } catch {
    if (opponentRequest === request) engineError = 'Stockfish couldn’t play its move. Try again.';
  } finally {
    if (opponentRequest === request) {
      opponentRequest = 0;
      render();
    }
  }
}

function playChallenge(move) {
  const challenge = challenges[challengeIndex];
  const correct = exerciseStep === 0 ? challenge.solutions.includes(move.san)
    : challenge.mate ? move.san.endsWith('#') : challenge.finish.includes(move.san);
  if (!correct) {
    exerciseMessage = 'Try another move. Look for a reply you can force.';
    return;
  }
  soundFor(exercise.move(uci(move)));
  hintOn = false;
  if (exerciseStep === 0 && challenge.reply) {
    soundFor(exercise.move(challenge.reply), .13);
    exerciseStep = 1;
    exerciseMessage = 'Black played ' + challenge.reply + '. Find the follow-up.';
    return;
  }
  exerciseStep = 2;
  exerciseMessage = 'Solved!';
  if (!library.solved.includes(challengeIndex)) library.solved.push(challengeIndex);
  save();
}

function playOpening(move) {
  const lesson = openings[openingIndex];
  if (move.san !== lesson.moves[exerciseStep]) {
    exerciseMessage = move.san + ' is legal. Try the move that fits the plan in this line.';
    return;
  }
  soundFor(exercise.move(uci(move)));
  exerciseStep++;
  const reply = lesson.moves[exerciseStep];
  if (reply) soundFor(exercise.move(lesson.moves[exerciseStep++]), .13);
  hintOn = false;
  const done = exerciseStep >= lesson.moves.length;
  exerciseMessage = done ? '' : 'You played ' + move.san + (reply ? '. The reply was ' + reply + '.' : '.');
  if (done && !library.learned.includes(openingIndex)) {
    library.learned.push(openingIndex);
    save();
  }
}

function moveTo(from, to) {
  if (!canMove() || !from) return;
  const { position } = boardContext();
  const moves = position.moves({ square: from, verbose: true }).filter((move) => move.to === to);
  if (!moves.length) return;
  if (moves.length > 1) {
    dialog('<h2>Promote your pawn</h2>' + buttons(moves.map((move) => button('promote', pieceNames[move.promotion], 'secondary', uci(move))).join('') + button('dismiss', 'Cancel')));
    return;
  }
  submitMove(moves[0]);
}

function submitMove(move) {
  selected = '';
  if (mode === 'play') prepareProposal(move);
  if (mode === 'challenges') playChallenge(move);
  if (mode === 'openings') playOpening(move);
  if (mode === 'review') void analyzeRetry(move);
  render();
}

async function analyzeRetry(move) {
  const attempt = reviewRetry;
  attempt.move = move;
  try {
    const { note } = await evaluateMove(move, getReview().moves.slice(0, reviewPly - 1));
    attempt.note = note;
    if (reviewRetry === attempt) announce(move.san + '. ' + note.grade + '.');
  } catch {
    attempt.error = 'Stockfish analysis is unavailable. Try the position again.';
  } finally {
    if (reviewRetry === attempt) render();
  }
}

function chooseSquare(square) {
  if (!canMove()) return;
  if (square !== selected && selected && boardContext().position.moves({ square: selected, verbose: true }).some((move) => move.to === square)) {
    moveTo(selected, square);
    return;
  }
  const { position } = boardContext();
  selected = square !== selected && position.get(square)?.color === position.turn() ? square : '';
  renderBoard();
}

function openVariation(fen, line, { index = 1 } = {}) {
  if (!line) return;
  const moves = boardLine(fen, line.moves);
  if (!moves.length) return;
  variation = { fen, moves, index: Math.min(index, moves.length) };
}

function download(filename, mime, content) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportPGN() {
  const record = getReview();
  const position = new Chess();
  position.setHeader('Event', 'Chess Trainer practice');
  position.setHeader('Date', record.date.slice(0, 10).replaceAll('-', '.'));
  position.setHeader('White', record.color === 'w' ? 'Player' : 'Stockfish');
  position.setHeader('Black', record.color === 'b' ? 'Player' : 'Stockfish');
  for (const [index, code] of record.moves.entries()) {
    position.move(code);
    const note = record.notes[index + 1];
    if (note) position.setComment([note.grade, ...note.benefits, ...note.risks].join(' '));
  }
  const result = position.isCheckmate() ? (position.turn() === 'w' ? '0-1' : '1-0') : (position.isDraw() ? '1/2-1/2' : '*');
  position.setHeader('Result', result);
  download('chess-trainer-' + record.date.slice(0, 10) + '.pgn', 'application/x-chess-pgn', position.pgn({ maxWidth: 78 }));
}

function dialog(content) {
  $('dialog-content').innerHTML = content;
  $('dialog').setAttribute('aria-label', $('dialog-content').querySelector('h2').textContent);
  if (!$('dialog').open) $('dialog').showModal();
}
const dismiss = () => $('dialog').close();

function newGameDialog() {
  dialog('<h2>New game</h2><p class="muted">Choose your side and the opponent’s difficulty.</p>'
    + '<label class="field">Play as<select id="game-color"><option value="w">White</option><option value="b"' + (library.current.color === 'b' ? ' selected' : '') + '>Black</option></select></label>'
    + '<div class="difficulty dialog-difficulty"><div class="difficulty-heading"><label for="game-level">Opponent difficulty</label><span id="game-level-label"></span></div>'
    + '<input id="game-level" type="range" min="0" max="' + (levels.length - 1) + '" step="1"><div class="difficulty-endpoints" aria-hidden="true"><span>Gentle</span><span>Strong</span></div></div>'
    + buttons(button('dismiss', 'Cancel') + button('new-game', 'Start game', 'primary')));
  syncDifficulty($('game-level'), $('game-level-label'), library.current.level);
}

function appearanceDialog() {
  const option = (kind, item, preview) => '<button class="choice appearance-option" data-action="appearance-option" data-kind="' + kind
    + '" data-value="' + item.id + '" aria-pressed="' + (appearance[kind] === item.id) + '">'
    + preview + '<span>' + item.name + '</span>' + (item.description ? '<small>' + item.description + '</small>' : '') + '</button>';
  dialog('<div class="appearance-menu"><h2>Appearance</h2><fieldset><legend>Board</legend><div class="appearance-options">'
    + boards.map((item) => option('board', item, '<span class="board-swatch" data-board="' + item.id + '" aria-hidden="true"></span>')).join('')
    + '</div></fieldset><fieldset><legend>Pieces</legend><div class="appearance-options">'
    + sets.map((item) => option('pieces', item, '<span class="piece-swatch" data-pieces="' + item.id + '">'
      + pieceArt('n', 'w', item.id) + pieceArt('q', 'b', item.id) + '</span>')).join('')
    + '</div></fieldset><div class="sound-controls"><label><input id="move-sounds" type="checkbox"' + (appearance.sound ? ' checked' : '')
    + '> Move sounds</label>' + button('preview-sound', 'Preview sound', 'text-button', '', !appearance.sound) + '</div>'
    + buttons(button('dismiss', 'Done', 'primary')) + '</div>');
}

function backupDialog() {
  dialog('<h2>Training backups</h2><p class="muted">Export a file with your games, coach notes, and training progress. Importing a backup replaces this browser’s current training data.</p>'
    + '<label class="field">Choose a backup to restore<input type="file" id="restore-file" accept=".json,application/json"></label><p id="backup-message" role="status"></p>'
    + buttons(button('save-backup', 'Export backup') + button('restore', 'Restore backup', 'primary') + button('dismiss', 'Close')));
}

const actions = {
  cancel() { clearProposal(); },
  analyze() { void analyzeProposal(); },
  commit() { commit(); },
  'opponent-retry'() { void playOpponent(); },
  option(index) {
    if (!proposal) return;
    proposal.selectedOption = proposal.choices[Number(index) - 1] || null;
    variation = null;
  },
  'proposal-line'() {
    const { move, note } = activeCandidate();
    openVariation(move.before, note.line, { index: 2 });
  },
  'line-step'(index) { if (variation) variation.index = Math.max(0, Math.min(Number(index), variation.moves.length)); },
  'close-line'() { variation = null; },
  hint() { hintOn = !hintOn; },
  challenge(index) { challengeIndex = Number(index); resetExercise(); },
  opening(index) { openingIndex = Number(index); resetExercise(); },
  'review-live'(index) { reviewId = library.current.id; reviewPly = Number(index); goTo('review'); },
  timeline(value) {
    if (mode === 'review') actions['review-ply'](value);
    else {
      livePly = value === 'live' ? null : Math.max(0, Math.min(Number(value), library.current.moves.length));
      variation = null;
      selected = '';
    }
  },
  'score-game'() {
    const record = mode === 'review' ? getReview() : library.current;
    scoreMoves(record, record.moves.map((_, index) => index + 1));
  },
  'review-ply'(index) {
    reviewPly = Math.max(0, Math.min(Number(index), getReview().moves.length));
    variation = null;
    reviewRetry = null;
    selected = '';
  },
  'review-retry'() {
    const record = getReview();
    reviewRetry = { fen: reconstruct(record, reviewPly - 1).fen() };
    variation = null;
    selected = '';
  },
  'retry-close'() { reviewRetry = null; variation = null; selected = ''; },
  'retry-line'(kind) { openVariation(reviewRetry.fen, reviewRetry.note?.[kind], { index: kind === 'line' ? 2 : 1 }); },
  'review-line'(kind) {
    const record = getReview();
    openVariation(reconstruct(record, reviewPly - 1).fen(), record.notes[reviewPly]?.[kind], { index: kind === 'line' ? 2 : 1 });
  },
  dismiss,
  'appearance-option'(value, control) {
    const kind = control.dataset.kind;
    appearance[kind] = value;
    document.documentElement.dataset[kind] = value;
    saveAppearance(appearance);
    for (const option of $('dialog').querySelectorAll('[data-kind="' + kind + '"]')) {
      option.setAttribute('aria-pressed', option === control);
    }
  },
  'preview-sound'() { soundFor(); },
  promote(code) {
    const move = boardContext().position.moves({ verbose: true }).find((item) => uci(item) === code);
    dismiss();
    if (move && canMove()) submitMove(move);
  },
  'new-game'() {
    if (library.current.moves.length) library.archive.unshift(library.current);
    library.current = newRecord($('game-color').value, levels[$('game-level').valueAsNumber].id);
    game = reconstruct(library.current);
    reviewId = library.current.id;
    reviewPly = 0;
    livePly = null;
    opponentRequest = 0;
    engineError = '';
    clearProposal();
    facing = library.current.color;
    save();
    dismiss();
    void playOpponent();
  },
  'save-backup'() { download('chess-trainer-backup.json', 'application/json', JSON.stringify(library, null, 2)); },
  async restore() {
    const input = $('restore-file').files[0];
    const message = $('backup-message');
    if (!input) { message.textContent = 'Choose a backup file first.'; return; }
    try {
      const restored = validateStore(JSON.parse(await input.text()));
      library = restored;
      game = reconstruct(library.current);
      reviewId = library.current.id;
      reviewPly = 0;
      livePly = null;
      opponentRequest = 0;
      engineError = '';
      clearProposal();
      toast = 'Training backup restored.';
      save();
      dismiss();
      enterMode(mode);
      void playOpponent();
    } catch {
      message.textContent = 'This file could not be read as a Chess Trainer backup.';
    }
  },
};

document.addEventListener('click', (event) => {
  const square = event.target.closest('[data-square]');
  if (square) { chooseSquare(square.dataset.square); return; }
  const control = event.target.closest('[data-action]');
  if (!control) {
    const row = event.target.closest('tr[data-ply]');
    if (row) {
      actions.timeline(row.dataset.ply);
      render();
    }
    return;
  }
  if (control.dataset.action !== 'restore') toast = '';
  actions[control.dataset.action]?.(control.dataset.value, control);
  render();
});
document.addEventListener('input', ({ target }) => {
  if (target.id === 'difficulty') {
    library.current.level = levels[target.valueAsNumber].id;
    save();
    render();
  }
  if (target.id === 'game-level') syncDifficulty(target, $('game-level-label'), levels[target.valueAsNumber].id);
});
document.addEventListener('change', ({ target }) => {
  if (target.id === 'timeline-position') {
    actions.timeline(target.value);
    render();
  }
  if (target.id === 'move-sounds') {
    appearance.sound = target.checked;
    saveAppearance(appearance);
    $('dialog').querySelector('[data-action="preview-sound"]').disabled = !appearance.sound;
  }
  if (target.id === 'review-game') {
    reviewId = target.value;
    reviewPly = 0;
    facing = getReview().color;
    variation = null;
    reviewRetry = null;
    selected = '';
    render();
  }
});
$('board').addEventListener('dragstart', (event) => {
  const square = event.target.closest('[data-square]');
  if (!square?.draggable) { event.preventDefault(); return; }
  event.dataTransfer.setData('text/plain', square.dataset.square);
  event.dataTransfer.effectAllowed = 'move';
});
$('board').addEventListener('dragover', (event) => { if (canMove()) event.preventDefault(); });
$('board').addEventListener('drop', (event) => {
  const target = event.target.closest('[data-square]');
  const from = event.dataTransfer.getData('text/plain');
  if (!target || !/^[a-h][1-8]$/.test(from)) return;
  event.preventDefault();
  moveTo(from, target.dataset.square);
});
$('flip').addEventListener('click', () => { facing = facing === 'w' ? 'b' : 'w'; renderBoard(); });
$('appearance').addEventListener('click', appearanceDialog);
$('backup').addEventListener('click', backupDialog);
$('credits').addEventListener('click', () => {
  dialog('<h2>Engine &amp; licenses</h2><p>Stockfish 19 Lite evaluates positions in this browser. Move labels reflect a short search and can change with deeper analysis.</p>'
    + '<p class="tip"><a href="https://github.com/nmrugg/stockfish.js/tree/v19.0.1">Stockfish.js 19.0.1 source and build instructions</a><br><a href="./vendor/stockfish-LICENSE.txt">Stockfish GPLv3 license</a><br><a href="./vendor/chess-js-LICENSE.txt">chess.js BSD license</a><br><a href="https://github.com/lichess-org/chess-openings">Lichess opening catalog</a> · <a href="./vendor/chess-openings-LICENSE.txt">CC0 license</a></p>'
    + buttons(button('dismiss', 'Close')));
});
$('header-action').addEventListener('click', () => {
  if (mode === 'play') newGameDialog();
  else if (mode === 'review') exportPGN();
  else { resetExercise(); render(); }
});
window.addEventListener('hashchange', () => enterMode(location.hash.slice(1)));
window.addEventListener('keydown', (event) => {
  if (!['play', 'review'].includes(mode) || (reviewRetry && !variation) || $('dialog').open
    || event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement
    || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const step = event.key === 'ArrowRight' ? 1 : -1;
  if (mode === 'play' && !variation && (!library.current.moves.length || (livePly === null && step > 0))) return;
  event.preventDefault();
  if (variation) actions['line-step'](variation.index + step);
  else actions.timeline((mode === 'review' ? reviewPly : livePly ?? library.current.moves.length) + step);
  render();
});

new ResizeObserver(([board]) => {
  $('details').style.setProperty('--board-height', board.contentRect.height + 'px');
}).observe($('board'));
enterMode(location.hash.slice(1));
void playOpponent();
fetch(new URL('./opening-book.json', import.meta.url))
  .then((response) => response.ok ? response.json() : {})
  .then((positions) => {
    openingBook = positions;
    if (mode === 'play') renderPlay();
    if (mode === 'review') renderReview();
  })
  .catch(() => {});
