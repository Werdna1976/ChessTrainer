export const boards = [
  { id: 'slate', name: 'Slate' },
  { id: 'walnut', name: 'Walnut' },
  { id: 'ocean', name: 'Ocean' },
  { id: 'moss', name: 'Moss' },
  { id: 'orchid', name: 'Orchid' },
];

export const sets = [
  { id: 'porcelain', name: 'Porcelain', description: 'Ivory and charcoal' },
  { id: 'royal', name: 'Royal', description: 'Champagne and cobalt' },
  { id: 'lacquer', name: 'Lacquer', description: 'Apricot and deep jade' },
];

const pieceShapes = {
  p: '<circle cx="24" cy="13" r="5.5"/><path d="M20 19h8c-1 6 1 10 5 15H15c4-5 6-9 5-15Z"/>',
  n: '<path d="M13 34c0-7 4-10 9-14l-3-2-5 4-4-5 9-8h5l1-5 6 5c7 3 10 11 8 25Z"/><path class="engraving" d="m27 13-1 1m5 1c4 4 4 8 4 12"/>',
  b: '<path d="M24 5c5 4 10 10 10 15 0 4-3 6-6 7l5 7H15l5-7c-3-1-6-3-6-7 0-5 5-11 10-15Z"/><path class="engraving" d="m28 11-7 9"/>',
  r: '<path d="M12 8h6v6h3V8h6v6h3V8h6v13l-5 5v4l3 4H14l3-4v-4l-5-5Z"/><path class="engraving" d="M15 21h18M18 27h12"/>',
  q: '<path d="m10 15 9 7 5-12 5 12 9-7-6 13 2 6H14l2-6Z"/><circle cx="9" cy="13" r="2.7"/><circle cx="24" cy="8" r="2.7"/><circle cx="39" cy="13" r="2.7"/><path class="engraving" d="M17 28h14"/>',
  k: '<path class="cross" d="M24 5v11m-4-7h8"/><path d="M24 17c-4-6-13-5-14 1-1 4 3 8 7 10l-3 6h20l-3-6c4-2 8-6 7-10-1-6-10-7-14-1Z"/><path class="engraving" d="M24 18v6m-7 4h14"/>',
};

const royalShapes = {
  n: '<path d="M13 34c0-7 5-12 11-16l-4-2-5 4-5-4 9-9 5 1 2-5 5 5c8 2 11 12 8 26Z"/><path class="engraving" d="m26 12-1 1m6 0c4 3 5 9 4 15"/>',
  q: '<path d="M10 13c5 0 7 2 9 7l5-12 5 12c2-5 4-7 9-7-4 7-6 12-6 16l2 5H14l2-5c0-4-2-9-6-16Z"/><circle cx="9" cy="12" r="2.45"/><circle cx="24" cy="7" r="2.45"/><circle cx="39" cy="12" r="2.45"/><path class="engraving" d="M17 29h14m-7-10 3 5-3 3-3-3Z"/>',
  k: '<path class="cross" d="M24 4v12m-5-7h10"/><path d="M24 17C17 10 9 13 9 19c0 5 4 8 8 10l-2 5h18l-2-5c4-2 8-5 8-10 0-6-8-9-15-2Z"/><path class="engraving" d="M24 19v8m-7 1h14"/>',
};
const lacquerShapes = {
  p: '<path d="m24 7 6 5v6l-3 3 5 13H16l5-13-3-3v-6Z"/><path class="engraving" d="M20 25h8"/>',
  n: '<path d="m12 34 8-14-5 2-5-5L23 6l3 3 3-5 8 11 2 19Z"/><path class="engraving" d="m25 12-1 1m7 3 3 6v6"/>',
  b: '<path d="m24 5 10 12v7l-6 4 5 6H15l5-6-6-4v-7Z"/><path class="engraving" d="m28 13-7 8m-3 4h12"/>',
  r: '<path d="M12 9h7v5h3V9h4v5h3V9h7v13l-6 5 4 7H14l4-7-6-5Z"/><path class="engraving" d="M15 21h18m-14 7h10"/>',
  q: '<path d="m9 13 11 7 4-13 4 13 11-7-6 14 2 7H13l2-7Z"/><path class="engraving" d="M16 28h16m-8-9 3 5h-6Z"/>',
  k: '<path class="cross" d="M24 4v12m-4-8h8"/><path d="m10 15 8-2 6 5 6-5 8 2v9l-7 5 3 5H14l3-5-7-5Z"/><path class="engraving" d="m19 23 5 3 5-3m-12 6h14"/>',
};

export function pieceArt(type, color, style) {
  const shape = (style === 'lacquer' ? lacquerShapes[type] : style === 'royal' ? royalShapes[type] : null) || pieceShapes[type];
  const base = style === 'lacquer' ? 'M14 34h20l5 4v5H9v-5Z'
    : style === 'royal' ? 'M15 34h18q1 4 5 5v4H10v-4q4-1 5-5Z'
    : 'M15 34h18l4 5v4H11v-4Z';
  return '<svg class="piece ' + (color === 'w' ? 'white' : 'black') + '" viewBox="0 0 48 48" aria-hidden="true" focusable="false">'
    + '<g class="piece-body">' + shape + '<path class="piece-base" d="' + base + '"/>'
    + '<path class="engraving base-line" d="M13 39h22"/></g></svg>';
}

const preferencesKey = 'chess-trainer-appearance';
export function loadAppearance() {
  const defaults = { board: 'slate', pieces: 'porcelain', sound: true, theme: 'light' };
  try {
    const saved = JSON.parse(localStorage.getItem(preferencesKey));
    if (boards.some(({ id }) => id === saved?.board)) defaults.board = saved.board;
    if (sets.some(({ id }) => id === saved?.pieces)) defaults.pieces = saved.pieces;
    if (typeof saved?.sound === 'boolean') defaults.sound = saved.sound;
    if (saved?.theme === 'dark') defaults.theme = saved.theme;
  } catch {}
  return defaults;
}

export function saveAppearance(preferences) {
  try { localStorage.setItem(preferencesKey, JSON.stringify(preferences)); }
  catch {}
}

let audio;
let samples;

function woodSample(context, capture) {
  const duration = capture ? .15 : .11;
  const length = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let previousNoise = 0;
  for (let i = 0; i < length; i++) {
    const t = i / context.sampleRate;
    const noise = Math.random() * 2 - 1;
    previousNoise = (previousNoise + noise * .35) / 1.35;
    const impact = (.33 * noise + .28 * previousNoise) * Math.exp(-t * 155);
    const low = capture ? 218 : 287;
    const resonance = .45 * Math.sin(2 * Math.PI * low * t) * Math.exp(-t * 57)
      + .18 * Math.sin(2 * Math.PI * low * 2.81 * t) * Math.exp(-t * 92);
    data[i] = (impact + resonance) * Math.min(t * 1800, 1) * (1 - t / duration);
  }
  return buffer;
}

export async function playMoveSound({ captured } = {}, delay = 0) {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audio ??= new Audio();
    if (audio.state === 'suspended') await audio.resume();
    samples ??= [woodSample(audio, false), woodSample(audio, true)];
    const source = audio.createBufferSource();
    const volume = audio.createGain();
    source.buffer = samples[Number(Boolean(captured))];
    volume.gain.value = .42;
    source.connect(volume).connect(audio.destination);
    source.start(audio.currentTime + delay);
  } catch {}
}
