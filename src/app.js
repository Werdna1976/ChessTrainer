import { Chess } from './vendor/chess.js';
import { Engine, levels, uci, pieceNames, assess, explain, formatScore, boardLine } from './engine.js';
import { openings, challenges } from './content.js';
import { boards, sets, pieceArt, loadAppearance, saveAppearance, playMoveSound } from './appearance.js';

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
applyTheme();
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
let toast = '';

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
    const position = reconstruct(input);
    const notes = {};
    const list = (items) => Array.isArray(items) ? items.filter((item) => typeof item === 'string').slice(0, 8) : [];
    for (const [key, note] of Object.entries(input.notes || {})) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 1 || index > input.moves.length || !classifications.includes(note?.grade)) continue;
      const line = (entry) => ['cp', 'mate'].includes(entry?.type) && Number.isFinite(entry.score) && Array.isArray(entry.moves)
        && entry.moves.every((code) => typeof code === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(code))
        ? { type: entry.type, score: entry.score, moves: entry.moves.slice(0, 6) } : null;
      notes[index] = {
        grade: note.grade, benefits: list(note.benefits), risks: list(note.risks),
        highlights: list(note.highlights), tag: typeof note.tag === 'string' ? note.tag : '',
        line: line(note.line), best: line(note.best),
      };
    }
    return { id: input.id, date: input.date, color: input.color, level: input.level, moves: position.history({ verbose: true }).map(uci), notes };
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
function applyTheme() {
  document.documentElement.dataset.theme = appearance.theme;
  $('theme-toggle').setAttribute('aria-pressed', String(appearance.theme === 'dark'));
}

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
  if (next === 'play') facing = library.current.color;
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
    if (proposal) return { position: new Chess(proposal.move.after), last: proposal.move, highlights: proposal.note?.highlights || [] };
    return { position: game, last: game.history({ verbose: true }).at(-1) };
  }
  const hint = mode === 'openings' && hintOn && openings[openingIndex].moves[exerciseStep];
  const guide = hint ? exercise.moves({ verbose: true }).find((move) => move.san === hint) : null;
  return { position: exercise, last: exercise.history({ verbose: true }).at(-1), highlights: guide ? [guide.from, guide.to] : [] };
}

function canMove() {
  if (variation) return false;
  if (mode === 'review') return Boolean(reviewRetry && !reviewRetry.move);
  if (mode === 'play') return !busy && !proposal && playerTurn();
  return mode === 'challenges' ? exerciseStep < 2 : exerciseStep < openings[openingIndex].moves.length;
}

function renderBoard() {
  const { position, last, highlights = [] } = boardContext();
  const legal = canMove() && selected ? position.moves({ square: selected, verbose: true }).map((move) => move.to) : [];
  const board = position.board();
  const coords = Array.from({ length: 8 }, (_, index) => index);
  const rows = facing === 'w' ? coords : [...coords].reverse();
  const cols = facing === 'w' ? coords : [...coords].reverse();
  const focused = document.activeElement?.dataset.square;
  $('board').innerHTML = rows.map((row, i) => cols.map((col, j) => {
    const square = squares[col] + (8 - row);
    const piece = board[row][col];
    const classes = [
      (row + col) % 2 ? 'dark' : 'light',
      [last?.from, last?.to].includes(square) ? 'previous' : '',
      selected === square ? 'selected' : '',
      legal.includes(square) ? 'target' : '',
      highlights.includes(square) ? 'marked' : '',
      piece?.type === 'k' && piece.color === position.turn() && position.isCheck() ? 'check' : '',
    ].join(' ');
    const label = square + (piece ? ', ' + playerName(piece.color) + ' ' + pieceNames[piece.type] : ', empty');
    const pieceHtml = piece ? pieceArt(piece.type, piece.color, appearance.pieces) : '';
    return '<button class="square ' + classes + '" data-square="' + square + '" draggable="' + Boolean(canMove() && piece?.color === position.turn()) + '" aria-label="' + label + '"' + (canMove() ? ' aria-pressed="' + (selected === square) + '"' : ' disabled') + '>'
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

function moveList(list, notes = {}, active = -1) {
  if (!list.length) return '<p class="muted">Moves will appear here as you play.</p>';
  const cells = list.map((move, index) => {
    const grade = notes[index + 1]?.grade;
    return '<button data-action="' + (mode === 'play' ? 'review-live' : 'review-ply') + '" data-value="' + (index + 1) + '" class="' + (index + 1 === active ? 'current' : '') + '" aria-label="' + escape(move.san + (grade ? ', ' + grade : '')) + '">' + escape(move.san)
      + (grade ? '<span class="badge ' + gradeStyle(grade) + '" title="' + escape(grade) + '"></span>' : '') + '</button>';
  });
  let rows = '';
  for (let i = 0; i < cells.length; i += 2) rows += '<div class="move-row"><span>' + (i / 2 + 1) + '.</span>' + cells[i] + (cells[i + 1] || '') + '</div>';
  return '<div class="moves">' + rows + '</div>';
}

function variationControls() {
  const move = variation.moves[variation.index - 1];
  return '<div class="tip"><strong>Explore the line</strong><p>' + variation.moves.map((item) => escape(item.san)).join(' ') + '</p>'
    + '<p>' + (move ? playerName(move.color) + ' played ' + escape(move.san) : 'Starting position') + '</p>'
    + buttons(button('line-step', 'Back', 'secondary', variation.index - 1, variation.index === 0)
      + button('line-step', 'Next move', 'secondary', variation.index + 1, variation.index === variation.moves.length)
      + button('close-line', 'Close line')) + '</div>';
}

function noteCopy(note) {
  return (note.benefits.length ? '<h3>What it does</h3>' + note.benefits.map((item) => '<p>' + escape(item) + '</p>').join('') : '')
    + (note.risks.length ? '<h3>What to watch</h3>' + note.risks.map((item) => '<p>' + escape(item) + '</p>').join('') : '');
}

function renderPlay() {
  const notes = library.current.notes;
  const proposed = proposal?.move;
  const note = proposal?.note;
  let panel = '<p class="kicker">Position coach</p>';
  if (proposed) {
    panel += '<div class="card-head"><h2>' + escape(proposed.san) + '</h2>' + (note ? '<span class="badge ' + gradeStyle(note.grade) + '">' + escape(note.grade) + '</span>' : '') + '</div>';
    if (busy) panel += '<p class="muted" role="status">Stockfish is comparing your move with alternatives…</p>';
    else if (proposal.error) panel += '<p role="status">' + escape(proposal.error) + '</p>' + buttons(button('analyze', 'Retry analysis'));
    else if (note) {
      panel += noteCopy(note);
      if (!note.benefits.length && !note.risks.length) panel += '<p class="muted">The position ends after this move.</p>';
      if (proposal.choices.length) {
        panel += '<h3>Compare alternatives</h3><div class="lines">';
        for (const [i, option] of proposal.choices.entries()) {
          panel += '<button class="choice line" data-action="option" data-value="' + i + '"><span>' + escape(option.move.san) + '<small>' + escape(option.summary) + '</small></span><span class="badge">' + escape(formatScore(option.line)) + '</span></button>';
        }
        panel += '</div>';
      }
      if (variation?.option) {
        const other = variation.option;
        panel += '<h3>' + escape(other.move.san) + '</h3>' + noteCopy(other.note);
        panel += buttons(button('commit-option', 'Play ' + other.move.san, 'secondary', other.index));
      }
      if (note.line?.moves.length > 1 && !variation) panel += buttons(button('proposal-line', 'See the reply'));
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
  const list = game.history({ verbose: true });
  const latest = Object.entries(notes).at(-1);
  const quality = latest ? '<div class="move-quality"><span>' + escape(list[Number(latest[0]) - 1].san)
    + '</span><span class="badge ' + gradeStyle(latest[1].grade) + '">' + escape(latest[1].grade) + '</span></div>' : '';
  $('details').innerHTML = '<div class="card-head"><h2>Move history</h2>' + (list.length ? button('review-live', 'Review', 'text-button', list.length) : '') + '</div>'
    + quality + moveList(list, notes);
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
  const grades = Object.values(record.notes).map((item) => item.grade);
  const keyPlies = Object.entries(record.notes).filter(([, item]) => ['Blunder', 'Mistake', 'Inaccuracy', 'Missed mate'].includes(item.grade)).map(([ply]) => Number(ply));
  let copy = '<p class="kicker">Analysis board</p>';
  if (played) {
    copy += '<div class="card-head"><h2>' + Math.ceil(reviewPly / 2) + (played.color === 'w' ? '. ' : '… ') + escape(played.san) + '</h2>'
      + (note ? '<span class="badge ' + gradeStyle(note.grade) + '">' + escape(note.grade) + '</span>' : '') + '</div>';
    copy += note ? noteCopy(note) || '<p class="muted">Explore the engine line to see what follows.</p>' : '<p class="muted">' + playerName(played.color) + ' played ' + escape(played.san) + '.</p>';
    if (note && !variation) copy += buttons((note.line?.moves.length > 1 ? button('review-line', 'See played line', 'secondary', 'line') : '')
      + (note.best && note.best.moves[0] !== uci(played) ? button('review-line', 'See alternative', 'secondary', 'best') : '')
      + button('review-retry', 'Retry position'));
  } else copy += '<h2>Starting position</h2><p class="muted">' + (list.length ? 'Step through the moves or jump to a turning point.' : 'Play a game to build your review history.') + '</p>';
  if (variation) copy += variationControls();
  else copy += buttons(button('review-ply', 'First', 'secondary', 0, !reviewPly) + button('review-ply', 'Back', 'secondary', reviewPly - 1, !reviewPly)
    + button('review-ply', 'Next', 'secondary', reviewPly + 1, reviewPly === list.length) + button('review-ply', 'Last', 'secondary', list.length, reviewPly === list.length));
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
      if (!variation && attempt.note.line?.moves.length > 1) copy += buttons(button('retry-line', 'See your reply line', 'secondary', 'line'));
    } else copy += '<p role="status">' + (attempt.error || 'Stockfish is analyzing your move…') + '</p>';
    if (variation) copy += variationControls();
    copy += buttons((attempt.move && (attempt.note || attempt.error) ? button('review-retry', 'Try another move') : '') + button('retry-close', 'Back to game'));
  }
  $('panel').innerHTML = copy;
  const habit = Object.values(record.notes).filter((item) => ['Blunder', 'Mistake', 'Inaccuracy', 'Missed mate'].includes(item.grade)).reduce((counts, item) => {
    if (item.tag) counts[item.tag] = (counts[item.tag] || 0) + 1;
    return counts;
  }, {});
  const theme = Object.entries(habit).sort((a, b) => b[1] - a[1])[0]?.[0];
  const tips = {
    'Loose pieces': 'After choosing a move, check which of your pieces it leaves open to capture.',
    'King safety': 'Before attacking, look at every check your opponent can play on the next move.',
    'Forcing replies': 'Look at your opponent’s checks and captures first. Play through the strongest one in your head.',
  };
  $('details').innerHTML = '<h2>Game history</h2><label class="field">Choose a game<select id="review-game">'
    + [library.current, ...library.archive].map((item, index) => '<option value="' + escape(item.id) + '"' + (item.id === record.id ? ' selected' : '') + '>'
      + escape(index ? dateLabel(item) + ' · ' + playerName(item.color) + ' · ' + item.moves.length + ' plies' : 'Current game') + '</option>').join('')
    + '</select></label>' + (grades.length ? '<div class="actions"><span class="badge good">' + grades.filter((grade) => ['Good move', 'Checkmate'].includes(grade)).length + ' good</span><span class="badge mistake">' + grades.filter((grade) => grade === 'Mistake').length + ' mistakes</span><span class="badge blunder">' + grades.filter((grade) => grade === 'Blunder').length + ' blunders</span></div>' : '')
    + moveList(list, record.notes, reviewPly)
    + (keyPlies.length ? '<div class="tip"><strong>For your next game</strong><p>' + (tips[theme] || 'Pause before committing and compare at least two candidate moves after each likely reply.') + '</p></div>' : '');
}

function prepareProposal(move) {
  proposal = { move, note: null, choices: [], error: '' };
  selected = '';
  void analyzeProposal();
}

async function evaluateMove(move, history) {
  const after = new Chess(move.after);
  const candidates = await engine.search({ history, count: 3, ms: 510 });
  const best = candidates.lines[0];
  if (!best) throw new Error('No evaluation available.');
  let chosen = candidates.lines.find((item) => item.moves[0] === uci(move));
  if (after.isGameOver() && !after.isCheckmate()) chosen = { type: 'cp', score: 0, moves: [uci(move)] };
  else if (!chosen) {
    const forced = await engine.search({ history, restrict: uci(move), ms: 450 });
    chosen = forced.lines[0];
  }
  const note = { ...explain(move, chosen), grade: assess(chosen, best, after.isCheckmate()), line: chosen, best };
  return { note, candidates: candidates.lines };
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
    target.choices = candidates.filter((line) => line.moves[0] !== uci(move)).slice(0, 2).flatMap((line) => {
      const first = boardLine(move.before, line.moves)[0];
      if (!first) return [];
      const explanation = explain(first, line);
      return [{
        move: first, line, summary: explanation.benefits[0] || ('Look at the reply' + (line.moves[1] ? ' and follow-up.' : '.')),
        note: { ...explanation, grade: assess(line, note.best, first.san.endsWith('#')), line, best: note.best },
      }];
    });
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

function commit(option) {
  if (!proposal) return;
  const { move, note } = option || proposal;
  const recorded = game.move(uci(move));
  soundFor(recorded);
  library.current.moves.push(uci(recorded));
  library.current.notes[library.current.moves.length] = note || {
    ...explain(recorded), grade: recorded.san.endsWith('#') ? 'Checkmate' : 'Unrated', line: null, best: null,
  };
  clearProposal();
  save();
  render();
  void playOpponent();
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

function openVariation(fen, line, option) {
  if (!line) return;
  const moves = boardLine(fen, line.moves);
  if (!moves.length) return;
  variation = { fen, moves, index: 1, option };
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
  'commit-option'(index) { if (proposal?.choices[index]) commit(proposal.choices[index]); },
  'opponent-retry'() { void playOpponent(); },
  option(index) {
    const option = proposal?.choices[index];
    if (option) openVariation(option.move.before, option.line, { ...option, index });
  },
  'proposal-line'() { openVariation(proposal.move.before, proposal.note.line); },
  'line-step'(index) { if (variation) variation.index = Math.max(0, Math.min(Number(index), variation.moves.length)); },
  'close-line'() { variation = null; },
  hint() { hintOn = !hintOn; },
  challenge(index) { challengeIndex = Number(index); resetExercise(); },
  opening(index) { openingIndex = Number(index); resetExercise(); },
  'review-live'(index) { reviewId = library.current.id; reviewPly = Number(index); goTo('review'); },
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
  'retry-line'(kind) { openVariation(reviewRetry.fen, reviewRetry.note?.[kind]); },
  'review-line'(kind) {
    const record = getReview();
    openVariation(reconstruct(record, reviewPly - 1).fen(), record.notes[reviewPly]?.[kind]);
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
  if (!control) return;
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
$('theme-toggle').addEventListener('click', () => {
  appearance.theme = appearance.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  saveAppearance(appearance);
});
$('backup').addEventListener('click', backupDialog);
$('credits').addEventListener('click', () => {
  dialog('<h2>Engine &amp; licenses</h2><p>Stockfish 19 Lite evaluates positions in this browser. Move labels reflect a short search and can change with deeper analysis.</p>'
    + '<p class="tip"><a href="https://github.com/nmrugg/stockfish.js/tree/v19.0.1">Stockfish.js 19.0.1 source and build instructions</a><br><a href="./vendor/stockfish-LICENSE.txt">Stockfish GPLv3 license</a><br><a href="./vendor/chess-js-LICENSE.txt">chess.js BSD license</a></p>'
    + buttons(button('dismiss', 'Close')));
});
$('header-action').addEventListener('click', () => {
  if (mode === 'play') newGameDialog();
  else if (mode === 'review') exportPGN();
  else { resetExercise(); render(); }
});
window.addEventListener('hashchange', () => enterMode(location.hash.slice(1)));
window.addEventListener('keydown', (event) => {
  if (mode !== 'review' || (reviewRetry && !variation) || $('dialog').open || event.target instanceof HTMLSelectElement || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  if (variation) actions['line-step'](variation.index + (event.key === 'ArrowRight' ? 1 : -1));
  else actions['review-ply'](reviewPly + (event.key === 'ArrowRight' ? 1 : -1));
  render();
});

enterMode(location.hash.slice(1));
void playOpponent();
