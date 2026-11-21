const day = 24 * 60 * 60 * 1000;
const counts = ['attempts', 'misses', 'hints', 'completed', 'clean', 'streak'];

export function newProgress() {
  return { lessons: {}, challenges: {}, saved: [] };
}

export function readProgress(input, lessonIds, challengeCount, records) {
  const progress = newProgress();
  for (const [kind, keys] of [['lessons', lessonIds], ['challenges', Array.from({ length: challengeCount }, (_, index) => String(index))]]) {
    for (const id of keys) {
      const old = input?.[kind]?.[id];
      if (!old || typeof old !== 'object') continue;
      const entry = {};
      for (const key of counts) entry[key] = Number.isSafeInteger(old[key]) && old[key] >= 0 ? old[key] : 0;
      for (const key of ['last', 'due']) entry[key] = Number.isFinite(old[key]) && old[key] >= 0 ? old[key] : 0;
      progress[kind][id] = entry;
    }
  }
  if (Array.isArray(input?.saved)) {
    const movesById = new Map(records.map((record) => [record.id, record.moves.length]));
    const seen = new Set();
    progress.saved = input.saved.filter((item) => {
      const key = item?.id + ':' + item?.ply;
      if (!Number.isInteger(item?.ply) || item.ply < 1 || !(item.ply <= movesById.get(item.id)) || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(({ id, ply }) => ({ id, ply }));
  }
  return progress;
}

export function logPractice(progress, kind, id, event, clean = false, now = Date.now()) {
  const entry = progress[kind][id] ??= { attempts: 0, misses: 0, hints: 0, completed: 0, clean: 0, streak: 0, last: 0, due: 0 };
  entry.last = now;
  if (event === 'start') entry.attempts += 1;
  if (event === 'miss') entry.misses += 1;
  if (event === 'hint') entry.hints += 1;
  if (event === 'complete') {
    entry.completed += 1;
    if (clean) entry.clean += 1;
    entry.streak = clean ? entry.streak + 1 : 0;
    entry.due = now + [1, 1, 3, 7, 14][Math.min(entry.streak, 4)] * day;
  }
}

export function isDue(entry, now = Date.now()) {
  return Boolean(entry?.due && entry.due <= now);
}

export function focusFromGames(records) {
  const topicByTag = { 'Loose pieces': 'defense', 'King safety': 'safety', 'Forcing replies': 'tactics' };
  const mistakes = ['Blunder', 'Mistake', 'Missed mate', 'Inaccuracy'];
  const totals = {};
  for (const record of records.slice(0, 8)) {
    const parity = record.color === 'w' ? 1 : 0;
    for (const [ply, note] of Object.entries(record.notes)) {
      if (Number(ply) % 2 !== parity || !mistakes.includes(note.grade)) continue;
      const topic = topicByTag[note.tag];
      if (topic) totals[topic] = (totals[topic] || 0) + 1;
    }
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0];
}
