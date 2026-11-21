import { Chess, DEFAULT_POSITION } from './vendor/chess.js';
import { Engine, levels, uci, pieceNames, assess, explain, formatScore, boardLine, describeMove, moveImpact } from './engine.js';
import { openings, challenges } from './content.js';
import { boards, sets, soundProfiles, pieceArt, loadAppearance, saveAppearance, playMoveSound } from './appearance.js';
import { openingPositionKey } from './book.js';
import { chapters, phasePositions, chapterStory, moveThemes, compareChoices, moveNumber } from './review.js';
import { lessons, topics } from './training.js';
import { newProgress, readProgress, logPractice, isDue } from './progress.js';
import { renderTrainingRoom } from './training-ui.js';

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
  training: ['Training Room', 'Practice a skill, revisit a mistake, or start a guided lesson.', 'Coach & play'],
  lesson: ['Guided lesson', 'See the idea on the board, then play it yourself.', 'Training Room'],
  challenges: ['Chess challenges', 'Find a forcing move and play the idea through.', 'Restart puzzle'],
  openings: ['Opening trainers', 'Practice the first moves and learn what each one sets up.', 'Restart lesson'],
  review: ['Game review', 'Follow the flow of the game, then replay the decisions that shaped it.', 'Export PGN'],
};
const classifications = ['Checkmate', 'Good move', 'Playable', 'Inaccuracy', 'Mistake', 'Blunder', 'Missed mate', 'Unrated'];
const gradeStyle = (grade) => ({ Checkmate: 'good', 'Good move': 'good', Inaccuracy: 'mistake', Mistake: 'mistake', Blunder: 'blunder', 'Missed mate': 'blunder' })[grade] || '';
const newRecord = (color = 'w', level = 'casual') => ({ id: crypto.randomUUID(), date: new Date().toISOString(), color, level, moves: [], notes: {} });
const defaultStore = () => ({ version: 1, current: newRecord(), archive: [], solved: [], learned: [], training: newProgress() });
let library = loadStore();
let game = reconstruct(library.current);
let mode = 'play';
let facing = library.current.color;
let selected = '';
let proposal = null;
let firstProposal = null;
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
let lessonRun = null;
let challengeRun = null;
let challengeFilter = 'all';
let practiceOnEntry = false;
let boardFrame = '';
let scanOn = false;
const scoring = new Map();
const reviewHistories = new WeakMap();

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
      const proposed = note.original?.move;
      const original = typeof proposed === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(proposed)
        && proposed !== input.moves[index - 1] && boardLine(history[index - 1].before, [proposed]).length
        ? { move: proposed, line: note.original.line?.moves?.[0] === proposed ? line(note.original.line) : null } : undefined;
      const savedRisks = list(note.risks);
      const usesOldWording = savedRisks.some((risk) => /^(Test your idea against |Watch |Your opponent can (answer with|play) )/.test(risk));
      const currentRisks = playedLine && usesOldWording ? explain(history[index - 1], playedLine).risks : [];
      notes[index] = {
        grade: note.grade, benefits: list(note.benefits), risks: currentRisks.length ? currentRisks : savedRisks,
        highlights: list(note.highlights), tag: typeof note.tag === 'string' ? note.tag : '',
        line: playedLine, best: line(note.best), original,
      };
    }
    const name = typeof input.name === 'string' ? input.name.slice(0, 120) : undefined;
    const result = ['1-0', '0-1', '1/2-1/2'].includes(input.result) ? input.result : undefined;
    const players = typeof input.players?.w === 'string' && typeof input.players?.b === 'string'
      ? { w: input.players.w.slice(0, 60), b: input.players.b.slice(0, 60) } : undefined;
    return { id: input.id, date: input.date, color: input.color, level: input.level, moves: history.map(uci), notes, name, result, players };
  }
  const current = record(raw.current);
  const archive = raw.archive.map(record);
  return {
    version: 1, current, archive,
    solved: [...new Set(raw.solved.filter((index) => Number.isInteger(index) && challenges[index]))],
    learned: [...new Set(raw.learned.filter((index) => Number.isInteger(index) && openings[index]))],
    training: readProgress(raw.training, lessons.map(({ id }) => id), challenges.length, [current, ...archive]),
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
function gameName(record) { return record.name || (record === library.current ? 'Current game' : dateLabel(record)); }
function positionKey(id, ply) { return encodeURIComponent(id) + ':' + ply; }
function playerTurn() { return !game.isGameOver() && game.turn() === library.current.color; }
function engineLevel() { return levels.find((level) => level.id === library.current.level); }
function soundFor(move, delay = 0) {
  if (appearance.sound) void playMoveSound(move, delay, appearance.soundProfile, appearance.volume);
}
function successSound() { soundFor({ success: true }, .23); }

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

function enterMode(next, id) {
  if (!Object.hasOwn(modes, next)) next = 'play';
  if (next === 'lesson' && !lessons.some((lesson) => lesson.id === id)) next = 'training';
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
    facing = challenges[challengeIndex].fen.split(' ')[1];
  }
  if (next === 'openings') {
    if (exerciseMode !== next) resetExercise();
    facing = openings[openingIndex].color;
  }
  if (next === 'lesson') {
    if (lessonRun?.lesson.id !== id) startLesson(id);
    facing = lessonRun.side;
  }
  if (next === 'review') {
    facing = getReview().color;
    if (practiceOnEntry) actions['review-retry']();
    practiceOnEntry = false;
  }
  render();
}

function enterRoute() {
  const [next, id] = location.hash.slice(1).split('/');
  enterMode(next, id);
}

function goTo(next, id) {
  const route = next + (id ? '/' + id : '');
  if (location.hash !== '#' + route) location.hash = route;
  else enterRoute();
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
    challengeRun = { started: false, imperfect: false, hint: 0, seenHints: new Set() };
    facing = exercise.turn();
  } else {
    exercise = new Chess();
    const lesson = openings[openingIndex];
    if (lesson.color === 'b') exercise.move(lesson.moves[exerciseStep++]);
    facing = lesson.color;
  }
}

function setLessonStep(index) {
  const step = lessonRun.lesson.steps[index];
  const position = new Chess(step.setup?.fen || step.fen);
  for (const san of step.setup?.moves || []) position.move(san);
  Object.assign(lessonRun, { index, position, side: position.turn(), result: '', hint: 0, passed: false, guide: null });
  facing = position.turn();
  selected = '';
}

function startLesson(id) {
  lessonRun = { lesson: lessons.find((item) => item.id === id), started: false, imperfect: false, completed: false, seenHints: new Set(), cleared: new Set() };
  setLessonStep(0);
}

function beginPractice(run, kind, id) {
  if (!run.started) {
    logPractice(library.training, kind, id, 'start');
    run.started = true;
    save();
  }
}

function practiceEvent(run, kind, id, event) {
  beginPractice(run, kind, id);
  if (['hint', 'miss'].includes(event)) run.imperfect = true;
  logPractice(library.training, kind, id, event, !run.imperfect);
  save();
}

function finishLessonStep() {
  const run = lessonRun;
  run.passed = true;
  run.cleared.add(run.index);
  if (!run.completed && run.cleared.size === run.lesson.steps.length) {
    run.completed = true;
    practiceEvent(run, 'lessons', run.lesson.id, 'complete');
    successSound();
    announce('Lesson complete. ' + run.lesson.name);
  }
}

function lessonMove(move) {
  const run = lessonRun;
  const step = run.lesson.steps[run.index];
  beginPractice(run, 'lessons', run.lesson.id);
  const after = new Chess(move.after);
  const correct = step.goal === 'mate' ? after.isCheckmate() : step.solutions.includes(move.san);
  if (!correct) {
    practiceEvent(run, 'lessons', run.lesson.id, 'miss');
    run.result = after.isStalemate() ? 'That leaves the other side with no legal move and no check. It’s stalemate. Try another move.'
      : after.isCheckmate() ? 'That gives mate. For this exercise, try the specific idea in the instruction.'
        : 'That move is legal. Look again at the goal for this position.';
    announce(run.result);
    return;
  }
  const played = run.position.move(uci(move));
  soundFor(played);
  run.guide = played;
  if (step.reply) soundFor(run.position.move(step.reply), .13);
  run.result = '';
  finishLessonStep();
}

function guideMove(position, solutions) {
  return position.moves({ verbose: true }).find((move) => solutions.includes(move.san));
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
  if (mode === 'lesson') {
    const run = lessonRun;
    const step = run.lesson.steps[run.index];
    const guide = run.passed ? run.guide : run.hint > 1 ? guideMove(run.position, step.solutions) : null;
    return { position: run.position, last: run.position.history({ verbose: true }).at(-1),
      highlights: run.passed ? step.marks || [] : guide ? [guide.from, guide.to] : [], guide };
  }
  if (mode === 'challenges') {
    const challenge = challenges[challengeIndex];
    const guide = challengeRun.hint > 1 && exerciseStep < 2
      ? guideMove(exercise, exerciseStep ? challenge.finish || exercise.moves().filter((san) => san.endsWith('#')) : challenge.solutions) : null;
    return { position: exercise, last: exercise.history({ verbose: true }).at(-1), highlights: guide ? [guide.from, guide.to] : [], guide };
  }
  const hint = mode === 'openings' && hintOn && openings[openingIndex].moves[exerciseStep];
  const guide = hint ? exercise.moves({ verbose: true }).find((move) => move.san === hint) : null;
  return { position: exercise, last: exercise.history({ verbose: true }).at(-1), highlights: guide ? [guide.from, guide.to] : [] };
}

function canMove() {
  if (variation) return false;
  if (mode === 'review') return Boolean(reviewRetry && !reviewRetry.move);
  if (mode === 'play') return livePly === null && !busy && !proposal && playerTurn();
  if (mode === 'lesson') return !lessonRun.passed && !lessonRun.lesson.steps[lessonRun.index].show;
  return mode === 'challenges' ? exerciseStep < 2 : exerciseStep < openings[openingIndex].moves.length;
}

function renderBoard() {
  const { position, last, highlights = [], guide } = boardContext();
  const interactive = canMove();
  const legal = interactive && selected ? position.moves({ square: selected, verbose: true }).map((move) => move.to) : [];
  const board = position.board();
  const original = mode === 'play' && livePly === null ? proposal?.move : null;
  const scan = mode === 'play' && livePly === null && (original || (scanOn && playerTurn()));
  const originalSquares = original ? [original.from, original.to] : [];
  const onOriginalMove = last && original && last.before === original.before && uci(last) === uci(original);
  const lastSquares = last && !onOriginalMove ? [last.from, last.to] : [];
  const inCheck = position.isCheck();
  $('board-legend').hidden = !scan;
  $('board-legend').querySelector('.original-key').hidden = !original;
  const coords = Array.from({ length: 8 }, (_, index) => index);
  const rows = facing === 'w' ? coords : [...coords].reverse();
  const cols = facing === 'w' ? coords : [...coords].reverse();
  const point = (square) => [cols.indexOf(squares.indexOf(square[0])) + .5, rows.indexOf(8 - Number(square[1])) + .5];
  const frame = mode + ':' + facing + ':' + position.fen();
  const animate = !guide && last && boardFrame === mode + ':' + facing + ':' + last.before;
  boardFrame = frame;
  const focused = document.activeElement?.dataset.square;
  $('board').innerHTML = rows.map((row, i) => cols.map((col, j) => {
    const square = squares[col] + (8 - row);
    const piece = board[row][col];
    const attacked = scan && piece && position.isAttacked(square, piece.color === 'w' ? 'b' : 'w');
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
    let pieceHtml = piece ? pieceArt(piece.type, piece.color, appearance.pieces) : '';
    if (animate && piece && last.to === square) {
      const [fromX, fromY] = point(last.from);
      pieceHtml = '<span class="piece-arrival" style="--dx:' + ((fromX - j - .5) * 100) + '%;--dy:' + ((fromY - i - .5) * 100) + '%">' + pieceHtml + '</span>';
    }
    return '<button class="square ' + classes + '" data-square="' + square + '" draggable="' + Boolean(interactive && piece?.color === position.turn()) + '" aria-label="' + label + '"' + (interactive ? ' aria-pressed="' + (selected === square) + '"' : ' disabled') + '>'
      + (j === 0 ? '<span class="coordinate rank">' + (8 - row) + '</span>' : '')
      + pieceHtml + (i === 7 ? '<span class="coordinate file">' + squares[col] + '</span>' : '') + '</button>';
  }).join('')).join('');
  if (guide) {
    const [x, y] = point(guide.from);
    const [toX, toY] = point(guide.to);
    const angle = Math.atan2(toY - y, toX - x);
    const start = [x + Math.cos(angle) * .26, y + Math.sin(angle) * .26];
    const tip = [toX - Math.cos(angle) * .24, toY - Math.sin(angle) * .24];
    $('board').insertAdjacentHTML('beforeend', '<svg class="board-guide" viewBox="0 0 8 8" aria-hidden="true" focusable="false">'
      + '<line x1="' + start[0] + '" y1="' + start[1] + '" x2="' + tip[0] + '" y2="' + tip[1] + '"/>'
      + '<path d="M0 0 L-.34 -.19 L-.34 .19 Z" transform="translate(' + tip.join(' ') + ') rotate(' + (angle * 180 / Math.PI) + ')"/></svg>');
  }
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
  $('title').textContent = mode === 'lesson' ? lessonRun.lesson.name : title;
  $('subtitle').textContent = mode === 'lesson' ? lessonRun.lesson.description : subtitle;
  $('header-action').textContent = action;
  $('header-action').disabled = mode === 'review' && !getReview().moves.length;
  $('details').classList.toggle('move-tracker', mode === 'play' || mode === 'review');
  $('review-story').hidden = mode !== 'review';
  $('training-room').hidden = mode !== 'training';
  $('workspace').hidden = mode === 'training';
  $('import-pgn').hidden = mode !== 'review';
  $('difficulty-control').hidden = mode !== 'play';
  syncDifficulty($('difficulty'), $('difficulty-level'), library.current.level);
  for (const link of document.querySelectorAll('[data-mode]')) {
    if (link.dataset.mode === (mode === 'lesson' ? 'training' : mode)) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  $('engine-status').firstElementChild.dataset.status = engineError ? 'error' : 'ready';
  $('engine-status').lastChild.textContent = engineError ? ' Stockfish unavailable' : ' Stockfish 19 Lite';
  if (mode === 'training') { renderTraining(); return; }
  renderBoard();
  if (mode === 'play') renderPlay();
  if (mode === 'challenges') renderChallenge();
  if (mode === 'openings') renderOpening();
  if (mode === 'review') renderReview();
  if (mode === 'lesson') renderLesson();
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
  const pending = list.filter((_, index) => needsScoring(record.notes[index + 1])).length;
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

function threatScanCopy() {
  const color = library.current.color;
  const opponent = color === 'w' ? 'b' : 'w';
  const priority = { q: 5, r: 4, b: 3, n: 3, p: 2 };
  const pressured = game.board().flat().filter((piece) => piece?.color === color && piece.type !== 'k' && game.isAttacked(piece.square, opponent));
  const loose = pressured.filter((piece) => !game.isAttacked(piece.square, color))
    .sort((a, b) => priority[b.type] - priority[a.type]).slice(0, 3);
  const readout = loose.length ? 'Look first at your ' + new Intl.ListFormat('en').format(loose.map((piece) => pieceNames[piece.type] + ' on ' + piece.square))
    + '. ' + (loose.length === 1 ? 'It is' : 'Each is') + ' under attack and has no defender.'
    : pressured.length ? 'The red squares mark pieces under attack. Each has a defender. Check who benefits from the exchange.'
      : 'None of your pieces are under direct attack. Think about what might change when you move a defender.';
  return '<div class="tip"><strong>Threat scan</strong><p>' + escape(readout) + '</p></div>';
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
    if (scanOn) panel += threatScanCopy();
    panel += buttons(button('threat-scan', scanOn ? 'Hide threat scan' : 'Scan for threats'));
  }
  $('panel').innerHTML = panel;
  if (focusedCandidate !== null) $('panel').querySelector('[data-action="option"][data-value="' + focusedCandidate + '"]')?.focus({ preventScroll: true });
  renderTracker(record, list, livePly ?? list.length, '<div class="card-head"><h2>Move tracker</h2>'
    + (list.length ? button('review-live', 'Review', 'text-button', livePly ?? list.length) : '') + '</div>');
}

function renderTraining() {
  const records = [library.current, ...library.archive];
  const saved = library.training.saved.flatMap(({ id, ply }) => {
    const record = records.find((item) => item.id === id);
    if (!record) return [];
    const move = reviewHistory(record).moves[ply - 1];
    return move ? [{ key: positionKey(id, ply), move: 'Before ' + moveNumber(ply) + move.san, name: gameName(record) }] : [];
  });
  const ranked = { Blunder: 3, 'Missed mate': 3, Mistake: 2, Inaccuracy: 1 };
  const recent = records.slice(0, 5).flatMap((record) => Object.entries(record.notes).flatMap(([index, note]) => {
    const ply = Number(index);
    if (!ranked[note.grade] || ply % 2 !== (record.color === 'w' ? 1 : 0)) return [];
    return [{ record, ply, rank: ranked[note.grade] }];
  })).sort((a, b) => b.rank - a.rank)[0];
  const practice = recent ? { key: positionKey(recent.record.id, recent.ply),
    move: moveNumber(recent.ply) + reviewHistory(recent.record).moves[recent.ply - 1].san } : null;
  $('training-room').innerHTML = renderTrainingRoom(library.training, records, challenges, library.solved, saved, practice, escape, button);
}

function renderLesson() {
  const run = lessonRun;
  const lesson = run.lesson;
  const step = lesson.steps[run.index];
  const final = run.passed && run.index === lesson.steps.length - 1;
  const hint = run.hint === 1 ? step.hint : run.hint > 1 ? step.hint + ' Follow the marked squares.' : '';
  let html = '<p class="kicker">' + (step.show ? 'Watch' : playerName(run.side) + ' to move') + '</p><h2>' + escape(step.title) + '</h2>'
    + '<p class="muted">' + escape(step.prompt) + '</p>';
  if (run.result) html += '<p class="tip lesson-feedback" role="status">' + escape(run.result) + '</p>';
  if (run.passed) html += '<div class="tip lesson-success" role="status"><strong>' + (final ? 'Lesson complete' : step.show ? 'What happened' : 'Well played') + '</strong><p>' + escape(step.feedback) + '</p></div>';
  else if (hint) html += '<div class="tip"><strong>Hint</strong><p>' + escape(hint) + '</p></div>';
  if (final) {
    html += '<p class="lesson-takeaway"><strong>' + escape(lesson.cue) + '</strong><br>' + escape(lesson.takeaway) + '</p>'
      + buttons(button('training-room', 'Back to Training Room', 'primary') + button('lesson-restart', 'Practice again'));
  } else if (run.passed) html += buttons(button('lesson-step', 'Continue', 'primary', run.index + 1));
  else if (step.show) html += buttons(button('lesson-watch', 'Show example', 'primary'));
  else html += buttons(button('lesson-hint', run.hint === 0 ? 'Get a hint' : run.hint === 1 ? 'Show squares' : 'Hide hint'));
  $('panel').innerHTML = html;
  $('details').innerHTML = '<div class="card-head"><h2>Lesson steps</h2><span class="badge">' + run.cleared.size + ' / ' + lesson.steps.length + '</span></div>'
    + '<div class="lesson-progress" aria-hidden="true">' + lesson.steps.map((_, index) => '<span' + (run.cleared.has(index) ? ' class="complete"' : '') + '></span>').join('') + '</div>'
    + '<ol class="lesson-steps">' + lesson.steps.map((part, index) => '<li><button class="choice" data-action="lesson-step" data-value="' + index + '"'
      + (index === run.index ? ' aria-current="step"' : '') + (index > 0 && !run.cleared.has(index - 1) ? ' disabled' : '') + '>'
      + escape(part.title) + (run.cleared.has(index) ? '<small>Complete</small>' : '') + '</button></li>').join('') + '</ol>';
}

function challengeTopic(index) {
  return challenges[index].topic || ['endgame', 'tactics', 'safety', 'endgame'][index];
}

function renderChallenge() {
  const challenge = challenges[challengeIndex];
  const done = exerciseStep === 2;
  const who = playerName(exercise.turn());
  const prompt = exerciseStep ? who + ' to move. Finish the idea.' : challenge.prompt
    || (challenge.mate === 2 ? who + ' to move and force mate in two.' : challenge.mate ? who + ' to move and give mate in one.' : who + ' to move. Find the strongest move.');
  $('panel').innerHTML = '<p class="kicker">' + challenge.type + '</p><h2>' + challenge.name + '</h2><p class="muted">'
    + escape(done ? challenge.takeaway : prompt) + '</p>'
    + (exerciseMessage ? '<p class="tip" role="status">' + escape(exerciseMessage) + '</p>' : '')
    + (challengeRun.hint && !done ? '<p class="tip">' + escape(exerciseStep ? challenge.follow : challenge.hint)
      + (challengeRun.hint > 1 ? ' Follow the marked squares.' : '') + '</p>' : '')
    + buttons(done ? button('next-challenge', 'Next challenge', 'primary') : button('challenge-hint', challengeRun.hint === 0 ? 'Get a hint' : challengeRun.hint === 1 ? 'Show squares' : 'Hide hint'));
  $('details').innerHTML = '<div class="card-head"><h2>Challenge library</h2><span class="badge">' + library.solved.length + ' / ' + challenges.length + ' solved</span></div>'
    + '<label class="field">Filter by skill<select id="challenge-filter">' + [['all', 'All challenges'], ['due', 'Ready to review'], ...topics.map(({ id, name }) => [id, name])]
      .map(([id, name]) => '<option value="' + id + '"' + (id === challengeFilter ? ' selected' : '') + '>' + name + '</option>').join('') + '</select></label>'
    + '<div class="lesson-list challenge-list">'
    + (filteredChallenges().map((index) => {
      const item = challenges[index];
      return '<button class="choice' + (index === challengeIndex ? ' active' : '') + '" data-action="challenge" data-value="' + index + '">' + escape(item.name)
        + '<small>' + [item.type, item.difficulty, isDue(library.training.challenges[index]) ? 'Review due' : library.solved.includes(index) ? 'Solved' : ''].filter(Boolean).join(' · ') + '</small></button>';
    }).join('') || '<p class="muted">No challenges are due yet.</p>')
    + '</div>';
}

function filteredChallenges() {
  return challenges.map((_, index) => index).filter((index) => challengeFilter === 'all'
    || (challengeFilter === 'due' ? isDue(library.training.challenges[index]) : challengeTopic(index) === challengeFilter));
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

function reviewHistory(record) {
  let cached = reviewHistories.get(record);
  if (cached?.moves.length !== record.moves.length) {
    const game = reconstruct(record);
    const importedResult = { '1-0': 'White won.', '0-1': 'Black won.', '1/2-1/2': 'The game was drawn.' }[record.result];
    cached = { moves: game.history({ verbose: true }), result: resultText(game) || importedResult };
    reviewHistories.set(record, cached);
  }
  return cached;
}

function renderGameStory(record, history, chapterViews, current) {
  const story = $('review-story');
  const focused = story.contains(document.activeElement) ? document.activeElement.dataset.phase : null;
  const hasMoves = history.moves.length > 0;
  const scored = chapterViews.reduce((sum, chapter) => sum + (chapter.story?.coverage || 0), 0);
  const result = history.result || (record === library.current ? 'Game in progress' : 'Game saved before a result');
  story.innerHTML = '<div class="story-heading"><div><h2>Game story</h2><p class="muted">'
    + (hasMoves ? 'You played ' + playerName(record.color) + '. ' + result + (result.endsWith('.') ? '' : '.') : 'Play a game to see how its opening, middlegame, and endgame unfold.')
    + '</p></div>' + (hasMoves ? '<span class="badge">' + scored + ' of ' + history.moves.length + ' moves scored</span>' : '') + '</div>'
    + '<div class="story-chapters">' + chapterViews.map(({ phase, positions, story: account }) => {
      const first = positions[0];
      const last = positions.at(-1);
      const range = first ? moveNumber(first.ply) + first.move.san + (first === last ? '' : ' to ' + moveNumber(last.ply) + last.move.san) : 'Phase not reached';
      return '<button class="story-chapter" data-action="review-chapter" data-phase="' + phase.id + '" data-value="' + (account?.focus || '') + '"'
        + (current === phase.id ? ' aria-current="true"' : '') + (account ? '' : ' disabled') + '><span class="chapter-title">'
        + phase.name + '</span><span class="chapter-range">' + escape(range) + '</span><span class="chapter-summary">'
        + escape(account?.summary || phase.question) + '</span></button>';
    }).join('') + '</div>';
  if (focused) story.querySelector('[data-phase="' + focused + '"]')?.focus({ preventScroll: true });
}

function chapterDrill(phase, story) {
  if (!story) return '';
  return '<section class="chapter-drill" aria-label="' + phase.name + ' themes"><h3>' + phase.name + ' themes</h3>'
    + (story.arc ? '<p>' + escape(story.arc) + '</p>' : '')
    + (story.moments.length ? '<div class="story-moments">' + story.moments.map((moment) =>
      '<button class="story-moment" data-action="review-ply" data-value="' + moment.ply + '"' + (moment.ply === reviewPly ? ' aria-current="step"' : '') + '>'
      + '<span class="moment-top"><span>' + escape(moment.label) + '</span><strong>' + escape(moveNumber(moment.ply) + moment.move.san) + '</strong></span>'
      + '<span>' + escape(moment.text) + '</span></button>').join('') + '</div>' : '')
    + '<p class="chapter-lesson"><strong>Take it into your next game</strong><br>' + escape(story.lesson) + '</p></section>';
}

function reviewComparison(comparison) {
  if (!comparison) return '';
  const { choices, stronger, reason } = comparison;
  const verdict = stronger !== null ? 'Stockfish favors ' + choices[stronger].move.san + '.'
    : choices.every((choice) => choice.line) ? 'Stockfish rates these moves close together.' : 'Compare the two ideas on the board.';
  return '<section class="review-comparison" aria-label="Move comparison"><h3>Why choose a different move?</h3>'
    + '<p><strong>' + escape(verdict) + '</strong> ' + escape(reason) + '</p><div class="review-choices">'
    + choices.map((choice, index) => {
      const theme = choice.themes.defense || choice.themes.attack || choice.themes.plan || choice.themes.risk;
      return '<button class="review-choice' + (stronger === index ? ' preferred-choice' : '') + '" data-action="review-choice" data-value="' + index
        + '" aria-pressed="' + (variation?.comparisonIndex === index) + '">'
        + '<span class="moment-top"><span>' + choice.label + '</span><strong>' + escape(choice.move.san) + '</strong></span>'
        + (theme ? '<span>' + escape(theme) + '</span>' : '') + (choice.reply ? '<span>' + escape(choice.reply) + '</span>' : '')
        + (choice.line ? '<span class="choice-score">Stockfish evaluation ' + escape(formatScore(choice.line)) + '</span>' : '')
        + '</button>';
    }).join('') + '</div></section>';
}

function renderReview() {
  const record = getReview();
  const history = reviewHistory(record);
  const list = history.moves;
  const positions = phasePositions(list);
  const chapterViews = chapters.map((phase) => {
    const section = positions.filter(({ chapter }) => chapter === phase.id);
    return { phase, positions: section, story: section.length ? chapterStory(section, record.notes, bookEntry) : null };
  });
  const currentChapter = positions[reviewPly - 1]?.chapter;
  const view = chapterViews.find(({ phase }) => phase.id === currentChapter);
  renderGameStory(record, history, chapterViews, currentChapter);
  const played = list[reviewPly - 1];
  const note = record.notes[reviewPly];
  const keyPlies = Object.entries(record.notes).filter(([, item]) => ['Blunder', 'Mistake', 'Inaccuracy', 'Missed mate'].includes(item.grade)).map(([ply]) => Number(ply));
  let copy = (view && !reviewRetry ? chapterDrill(view.phase, view.story) : '') + '<p class="kicker">Analysis board</p>';
  if (played) {
    copy += recordedMoveCopy(record, played, reviewPly);
    const themes = moveThemes(played);
    const context = [themes.defense, themes.attack, themes.risk].filter(Boolean);
    if (context.length) copy += '<p class="review-context">' + escape(context.join(' ')) + '</p>';
    const comparison = played.color === record.color ? compareChoices(played, note) : null;
    copy += reviewComparison(comparison);
    if (note && !variation) copy += buttons((note.line?.moves.length > 1 ? button('review-line', 'Show reply', 'secondary', 'line') : '')
      + (!comparison && note.best && note.best.moves[0] !== uci(played) ? button('review-line', 'See alternative', 'secondary', 'best') : '')
      + button('review-retry', 'Retry position'));
    const saved = library.training.saved.some((item) => item.id === record.id && item.ply === reviewPly);
    if (!variation) copy += buttons(button('save-position', saved ? 'Remove from saved positions' : 'Save for practice'));
    if (!moveImpact(note) && !scoring.get(record)?.running) copy += buttons(button('score-review-move', 'Score this move', 'secondary', reviewPly));
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
      + escape(index ? gameName(item) + ' · ' + playerName(item.color) + ' · ' + item.moves.length + ' plies' : 'Current game') + '</option>').join('')
    + '</select></label>');
}

function prepareProposal(move) {
  proposal = { move, note: null, choices: [], selectedOption: null, error: '' };
  firstProposal ??= proposal;
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

function needsScoring(note) {
  return !moveImpact(note) || Boolean(note?.original && !note.original.line);
}

function scoreMoves(record, plies) {
  const job = scoring.get(record) || { queue: new Set(), running: false, failed: false };
  for (const ply of plies) {
    if (needsScoring(record.notes[ply])) job.queue.add(ply);
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
      const history = record.moves.slice(0, ply - 1);
      let note = record.notes[ply];
      if (!moveImpact(note)) {
        const after = reconstruct(record, ply);
        const move = after.history({ verbose: true }).at(-1);
        const evaluated = await evaluateMove(move, history, { fast: true, after });
        if (!moveImpact(evaluated.note)) throw new Error('Stockfish did not score the move.');
        note = { ...evaluated.note, original: note?.original };
      }
      if (note.original && !note.original.line && retained()) {
        const { move: code } = note.original;
        let line = note.best?.moves[0] === code ? note.best : null;
        if (!line) {
          const result = await engine.search({ history, restrict: code, ms: 250 });
          line = result.lines[0];
        }
        if (line?.moves[0] !== code) throw new Error('Stockfish did not score the original proposal.');
        note = { ...note, original: { move: code, line } };
      }
      if (retained()) {
        record.notes[ply] = note;
        save();
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
  const scored = note || {
    ...explain(recorded), grade: recorded.san.endsWith('#') ? 'Checkmate' : 'Unrated', line: null, best: null,
  };
  const original = firstProposal && uci(firstProposal.move) !== uci(recorded)
    ? { move: uci(firstProposal.move), line: firstProposal.note?.line || null } : undefined;
  library.current.notes[library.current.moves.length] = original ? { ...scored, original } : scored;
  clearProposal();
  save();
  render();
  void playOpponent();
  scoreMoves(record, [record.moves.length]);
}

function clearProposal({ keepOriginal = false } = {}) {
  proposal = null;
  if (!keepOriginal) firstProposal = null;
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
  beginPractice(challengeRun, 'challenges', challengeIndex);
  const correct = exerciseStep === 0 ? (challenge.mate === 1 ? move.san.endsWith('#') : challenge.solutions.includes(move.san))
    : challenge.mate ? move.san.endsWith('#') : challenge.finish.includes(move.san);
  if (!correct) {
    practiceEvent(challengeRun, 'challenges', challengeIndex, 'miss');
    exerciseMessage = new Chess(move.after).isStalemate() ? 'That would draw by stalemate. Try a move that gives check or leaves a legal escape.'
      : 'Try another move. Look for the idea in the challenge.';
    announce(exerciseMessage);
    return;
  }
  soundFor(exercise.move(uci(move)));
  challengeRun.hint = 0;
  if (exerciseStep === 0 && challenge.reply) {
    const reply = exercise.move(challenge.reply);
    soundFor(reply, .13);
    exerciseStep = 1;
    exerciseMessage = playerName(reply.color) + ' played ' + challenge.reply + '. Find the follow-up.';
    return;
  }
  exerciseStep = 2;
  exerciseMessage = 'Solved!';
  if (!library.solved.includes(challengeIndex)) library.solved.push(challengeIndex);
  practiceEvent(challengeRun, 'challenges', challengeIndex, 'complete');
  successSound();
  announce(exerciseMessage);
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
    successSound();
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
  if (mode === 'lesson') lessonMove(move);
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
  position.setHeader('White', record.players?.w || (record.color === 'w' ? 'Player' : 'Stockfish'));
  position.setHeader('Black', record.players?.b || (record.color === 'b' ? 'Player' : 'Stockfish'));
  for (const [index, code] of record.moves.entries()) {
    position.move(code);
    const note = record.notes[index + 1];
    if (note) position.setComment([note.grade, ...note.benefits, ...note.risks].join(' '));
  }
  const result = position.isCheckmate() ? (position.turn() === 'w' ? '0-1' : '1-0') : (position.isDraw() ? '1/2-1/2' : '*');
  position.setHeader('Result', result === '*' ? record.result || '*' : result);
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
    + '<div class="sound-settings"><label class="field">Sound profile<select id="sound-profile">' + soundProfiles.map(({ id, name }) =>
      '<option value="' + id + '"' + (id === appearance.soundProfile ? ' selected' : '') + '>' + name + '</option>').join('')
    + '</select></label><label class="field">Volume<input id="sound-volume" type="range" min="0" max="100" value="' + appearance.volume + '"></label></div>'
    + buttons(button('dismiss', 'Done', 'primary')) + '</div>');
}

function backupDialog() {
  dialog('<h2>Training backups</h2><p class="muted">Export your games, coach notes, lesson progress, and saved positions. Importing a backup replaces this browser’s current training data.</p>'
    + '<label class="field">Choose a backup to restore<input type="file" id="restore-file" accept=".json,application/json"></label><p id="backup-message" role="status"></p>'
    + buttons(button('save-backup', 'Export backup') + button('restore', 'Restore backup', 'primary') + button('dismiss', 'Close')));
}

function importPgnDialog() {
  dialog('<h2>Import a PGN</h2><p class="muted">Paste one game played from the standard starting position. It will appear in Game Review.</p>'
    + '<label class="field">Game PGN<textarea id="pgn-source" rows="8" spellcheck="false" placeholder="[Event &quot;Training game&quot;]&#10;1. e4 e5 …"></textarea></label>'
    + '<label class="field">Your side<select id="pgn-side"><option value="w">White</option><option value="b">Black</option></select></label>'
    + '<p id="pgn-message" class="lesson-feedback" role="status"></p>'
    + buttons(button('dismiss', 'Cancel') + button('import-game', 'Import game', 'primary')));
}

function importGame() {
  const pgn = $('pgn-source').value.trim();
  const message = $('pgn-message');
  if (!pgn || pgn.length > 250000 || (pgn.match(/^\s*\[Event\s/gm) || []).length > 1) {
    message.textContent = 'Paste one complete PGN game.';
    return;
  }
  const replay = new Chess();
  try { replay.loadPgn(pgn); }
  catch { message.textContent = 'This PGN could not be read. Check that the moves belong to a single legal game.'; return; }
  const headers = replay.getHeaders();
  const moves = replay.history({ verbose: true });
  if (!moves.length || moves[0].before !== DEFAULT_POSITION) {
    message.textContent = 'Import needs a game with moves from the standard starting position.';
    return;
  }
  const cleanName = (name, side) => name && name !== '?' ? name.replace(/[\u0000-\u001f"]/g, '').slice(0, 60) || side : side;
  const players = { w: cleanName(headers.White, 'White'), b: cleanName(headers.Black, 'Black') };
  const record = newRecord($('pgn-side').value);
  record.players = players;
  record.name = players.w + ' vs ' + players.b;
  record.moves = moves.map(uci);
  record.result = ['1-0', '0-1', '1/2-1/2'].includes(headers.Result) ? headers.Result : undefined;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(headers.Date || '')) {
    const stamp = new Date(headers.Date.replaceAll('.', '-') + 'T12:00:00Z');
    if (Number.isFinite(stamp.valueOf())) record.date = stamp.toISOString();
  }
  library.archive.unshift(record);
  reviewId = record.id;
  reviewPly = 0;
  toast = 'Game imported. Select Analyze game to score the moves.';
  save();
  dismiss();
  goTo('review');
}

const actions = {
  cancel() { clearProposal({ keepOriginal: true }); },
  analyze() { void analyzeProposal(); },
  commit() { commit(); },
  'opponent-retry'() { void playOpponent(); },
  'threat-scan'() { scanOn = !scanOn; },
  lesson(id) { goTo('lesson', id); },
  'training-room'() { goTo('training'); },
  'lesson-restart'() { startLesson(lessonRun.lesson.id); },
  'lesson-step'(index) { setLessonStep(Number(index)); },
  'lesson-watch'() {
    const run = lessonRun;
    const step = run.lesson.steps[run.index];
    if (!step.show || run.passed) return;
    for (const [index, san] of step.show.entries()) {
      run.guide = run.position.move(san);
      soundFor(run.guide, index * .2);
    }
    finishLessonStep();
  },
  'lesson-hint'() {
    const run = lessonRun;
    run.hint = (run.hint + 1) % 3;
    const key = run.index + ':' + run.hint;
    if (run.hint && !run.seenHints.has(key)) {
      run.seenHints.add(key);
      practiceEvent(run, 'lessons', run.lesson.id, 'hint');
    }
  },
  'open-challenge'(index) {
    challengeIndex = Number(index);
    challengeFilter = 'all';
    exerciseMode = '';
    goTo('challenges');
  },
  'challenge-hint'() {
    challengeRun.hint = (challengeRun.hint + 1) % 3;
    const key = exerciseStep + ':' + challengeRun.hint;
    if (challengeRun.hint && !challengeRun.seenHints.has(key)) {
      challengeRun.seenHints.add(key);
      practiceEvent(challengeRun, 'challenges', challengeIndex, 'hint');
    }
  },
  'next-challenge'() {
    const available = filteredChallenges();
    if (!available.length) challengeFilter = 'all';
    const index = available.indexOf(challengeIndex);
    actions.challenge(available[(index + 1) % available.length] ?? (challengeIndex + 1) % challenges.length);
  },
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
  'review-chapter'(index) { actions['review-ply'](index); },
  'save-position'() {
    const { id } = getReview();
    const positions = library.training.saved;
    const index = positions.findIndex((item) => item.id === id && item.ply === reviewPly);
    if (index >= 0) positions.splice(index, 1);
    else positions.unshift({ id, ply: reviewPly });
    save();
  },
  'practice-position'(key) {
    const ply = Number(key.slice(key.lastIndexOf(':') + 1));
    const record = [library.current, ...library.archive].find((item) => positionKey(item.id, ply) === key);
    if (!record || !Number.isInteger(ply) || ply < 1 || ply > record.moves.length) return;
    reviewId = record.id;
    reviewPly = ply;
    practiceOnEntry = true;
    goTo('review');
  },
  'import-game': importGame,
  'score-review-move'(index) { scoreMoves(getReview(), [Number(index)]); },
  'review-choice'(index) {
    const record = getReview();
    const played = reviewHistory(record).moves[reviewPly - 1];
    const choice = compareChoices(played, record.notes[reviewPly])?.choices[index];
    if (!choice) return;
    openVariation(played.before, choice.line || { moves: [uci(choice.move)] });
    if (variation) variation.comparisonIndex = Number(index);
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
  'preview-sound'() { soundFor(); soundFor({ captured: 'p', san: 'Nxe5+' }, .24); },
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
  if (control.dataset.action === 'review-chapter') $('workspace').scrollIntoView({ block: 'nearest' });
});
document.addEventListener('input', ({ target }) => {
  if (target.id === 'difficulty') {
    library.current.level = levels[target.valueAsNumber].id;
    save();
    render();
  }
  if (target.id === 'game-level') syncDifficulty(target, $('game-level-label'), levels[target.valueAsNumber].id);
  if (target.id === 'sound-volume') {
    appearance.volume = target.valueAsNumber;
    saveAppearance(appearance);
  }
});
document.addEventListener('change', ({ target }) => {
  if (target.id === 'challenge-filter') {
    challengeFilter = target.value;
    const available = filteredChallenges();
    if (available.length && !available.includes(challengeIndex)) actions.challenge(available[0]);
    render();
    $('challenge-filter')?.focus({ preventScroll: true });
    return;
  }
  if (target.id === 'timeline-position') {
    actions.timeline(target.value);
    render();
  }
  if (target.id === 'move-sounds') {
    appearance.sound = target.checked;
    saveAppearance(appearance);
    $('dialog').querySelector('[data-action="preview-sound"]').disabled = !appearance.sound;
  }
  if (target.id === 'sound-profile') {
    appearance.soundProfile = target.value;
    saveAppearance(appearance);
    soundFor();
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
$('import-pgn').addEventListener('click', importPgnDialog);
$('credits').addEventListener('click', () => {
  dialog('<h2>Engine &amp; licenses</h2><p>Stockfish 19 Lite evaluates positions in this browser. Move labels reflect a short search and can change with deeper analysis.</p>'
    + '<p class="tip"><a href="https://github.com/nmrugg/stockfish.js/tree/v19.0.1">Stockfish.js 19.0.1 source and build instructions</a><br><a href="./vendor/stockfish-LICENSE.txt">Stockfish GPLv3 license</a><br><a href="./vendor/chess-js-LICENSE.txt">chess.js BSD license</a><br><a href="https://github.com/lichess-org/chess-openings">Lichess opening catalog</a> · <a href="./vendor/chess-openings-LICENSE.txt">CC0 license</a></p>'
    + buttons(button('dismiss', 'Close')));
});
$('header-action').addEventListener('click', () => {
  if (mode === 'play') newGameDialog();
  else if (mode === 'review') exportPGN();
  else if (mode === 'lesson') goTo('training');
  else if (mode === 'training') goTo('play');
  else { resetExercise(); render(); }
});
window.addEventListener('hashchange', enterRoute);
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
enterRoute();
void playOpponent();
fetch(new URL('./opening-book.json', import.meta.url))
  .then((response) => response.ok ? response.json() : {})
  .then((positions) => {
    openingBook = positions;
    if (mode === 'play') renderPlay();
    if (mode === 'review') renderReview();
  })
  .catch(() => {});
