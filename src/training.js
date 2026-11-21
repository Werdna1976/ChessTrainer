export const topics = [
  { id: 'safety', name: 'King safety', icon: '♚', description: 'Spot checks and mating threats before they decide the game.' },
  { id: 'tactics', name: 'Tactics', icon: '♞', description: 'Create two threats at once or exploit pieces on the same line.' },
  { id: 'defense', name: 'Defense', icon: '♜', description: 'Rescue loose pieces, break pins, and stop an attacker.' },
  { id: 'endgame', name: 'Endgames', icon: '♟', description: 'Convert a winning position and keep stalemate off the board.' },
];

const queenCorner = '7k/8/6K1/6Q1/8/8/8/8 w - - 0 1';
const promotionCorner = '8/k1P5/2K5/8/8/8/8/8 w - - 0 1';
const fork = 'q3k3/5pp1/7p/3N4/8/8/PPP2PPP/4K3 w - - 0 1';
const backRank = '4r1k1/5ppp/8/8/8/8/R4PPP/6K1 w - - 0 1';
const pin = '2b1k3/8/2n5/8/8/8/8/4KB2 w - - 0 1';
const rescue = '4k3/8/4r3/8/2B1N3/8/4P3/4K3 w - - 0 1';
const skewer = 'q7/k7/8/8/8/8/8/1R4K1 w - - 0 1';
const exposed = '4r1k1/8/8/8/8/8/3B4/4K3 w - - 0 1';
const lookout = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3';
const lookoutWhite = lookout.replace(' b ', ' w ');

export const lessons = [
  {
    id: 'stalemate', topic: 'endgame', name: 'Win without stalemating', cue: 'Count escape squares',
    description: 'See how an overwhelming lead can become a draw, then deliver a clean mate.',
    takeaway: 'Before a quiet move against a trapped king, check whether your opponent has any legal move. If the king has none, your move must give check to be mate.',
    steps: [
      { fen: queenCorner, show: ['Qd5'], title: 'The quiet move that draws', prompt: 'White has a queen and Black has only a king. Watch what happens when White moves the queen to d5.',
        marks: ['g8', 'g7', 'h7'], feedback: 'Black’s king can move to none of the marked squares. The queen on d5 doesn’t give check, so Black has no legal move and the game is drawn.' },
      { fen: queenCorner, goal: 'mate', solutions: ['Qd8#'], title: 'Close the net with check', prompt: 'Reset the position. Find a move that covers the escapes and gives check at the same time.',
        hint: 'Your king covers g7 and h7. Can your queen give check along the eighth rank?', marks: ['g8', 'g7', 'h7'],
        feedback: 'The queen checks along the eighth rank and covers g8. Your king covers g7 and h7. Black is in check with no escape, so this time it’s mate.' },
    ],
  },
  {
    id: 'forks', topic: 'tactics', name: 'Fork king and queen', cue: 'Find the forcing target',
    description: 'Make a knight attack two valuable pieces. Then cash in once the king moves.',
    takeaway: 'Ask which two pieces the knight would attack from its landing square. A check often makes the fork forcing.',
    steps: [
      { fen: fork, show: ['Nc7+'], title: 'Two targets, one knight', prompt: 'The knight is on d5. Watch how c7 puts both the king and queen under attack.',
        marks: ['e8', 'a8'], feedback: 'The knight on c7 attacks the king on e8 and the queen on a8. Black must answer the check before saving the queen.' },
      { fen: fork, solutions: ['Nc7+'], title: 'Make the fork yourself', prompt: 'Find the knight check that also attacks the queen.',
        hint: 'Trace a knight’s jump backward from a8. Which landing square also attacks e8?', feedback: 'That check forces the king to move. The queen is still attacked.' },
      { setup: { fen: fork, moves: ['Nc7+', 'Kd7'] }, solutions: ['Nxa8'], title: 'Take the prize',
        prompt: 'Black has moved the king to d7. Now complete the fork.', hint: 'The knight can still jump to a8.', feedback: 'You win the queen. Always follow a fork through until you collect the target.' },
    ],
  },
  {
    id: 'back-rank', topic: 'safety', name: 'Give your king air', cue: 'Check the back rank',
    description: 'See the mating threat, make an escape square, and use it under pressure.',
    takeaway: 'When your king sits behind an unbroken row of pawns, imagine an enemy rook landing on the back rank. Give the king a safe escape if the threat is real.',
    steps: [
      { fen: backRank.replace(' w ', ' b '), show: ['Re1#'], title: 'Spot the back-rank trap', prompt: 'Imagine Black gets one free move. Watch the rook come down the open e-file.',
        marks: ['f2', 'g2', 'h2'], feedback: 'White’s own pawns cover every escape. The rook on a2 can’t block or take the rook on e1 in one move.' },
      { fen: backRank, solutions: ['h3', 'h4'], reply: 'Re1+', title: 'Make room on the h-file', prompt: 'It’s really White’s turn. Move the h-pawn to make an escape at h2.',
        hint: 'An escape square only helps if the king can reach it. The h2 square is next to your king.', marks: ['h2'], feedback: 'Black can still give check on e1. Now White has h2 available.' },
      { setup: { fen: backRank, moves: ['h3', 'Re1+'] }, solutions: ['Kh2'], title: 'Use the escape square', prompt: 'Play out the defense after Black’s rook check.',
        hint: 'Find the square your h-pawn cleared.', feedback: 'The king steps to h2. The same rook move is now just a check.' },
    ],
  },
  {
    id: 'pins', topic: 'defense', name: 'Break an absolute pin', cue: 'Look behind the piece',
    description: 'See why a knight cannot move, then give it its freedom back.',
    takeaway: 'Trace the line behind an attacked piece. If moving it would expose your king, you can break the pin by blocking the line, moving the king, or taking the attacker.',
    steps: [
      { fen: pin, show: ['Bb5'], title: 'The knight that cannot move', prompt: 'Watch White’s bishop line up with the knight on c6 and Black’s king on e8.',
        marks: ['b5', 'c6', 'd7', 'e8'], feedback: 'The knight can’t legally move. Moving it would uncover the bishop’s attack on the king along b5–c6–d7–e8.' },
      { setup: { fen: pin, moves: ['Bb5'] }, solutions: ['Bd7'], title: 'Put a piece behind the knight', prompt: 'Play as Black. Place your bishop between the pinned knight and your king.',
        hint: 'On d7 your bishop keeps the king shielded, even if the knight on c6 moves.', feedback: 'The bishop on d7 blocks the line to e8. The knight is now free to move on a later turn.' },
    ],
  },
  {
    id: 'loose-pieces', topic: 'defense', name: 'Take the attacker', cue: 'Look for a countercapture',
    description: 'Recognize a hanging knight and discover a better defense than retreating.',
    takeaway: 'When a piece is threatened, consider capturing the attacker, adding a defender, and moving the piece. Check which option leaves you best placed.',
    steps: [
      { fen: rescue.replace(' w ', ' b '), show: ['Rxe4'], title: 'Find the loose knight', prompt: 'Give Black a free move to see what the rook on e6 is threatening.',
        marks: ['e4', 'e6'], feedback: 'Black takes the undefended knight. White’s e2-pawn can’t recapture a rook two squares ahead of it.' },
      { fen: rescue, solutions: ['Bxe6'], title: 'Save it without moving it', prompt: 'It’s White’s turn. Save the knight by capturing the rook.',
        hint: 'Trace the bishop’s diagonal from c4 through d5.', feedback: 'The bishop takes the rook before it can touch the knight. White keeps both minor pieces.' },
    ],
  },
  {
    id: 'promotion', topic: 'endgame', name: 'Promote with a purpose', cue: 'Choose the right piece',
    description: 'Compare queen and rook promotion in a position where the choice changes the result.',
    takeaway: 'A queen is usually the strongest promotion. In a tight corner, check whether its extra diagonal control would take away the last legal move.',
    steps: [
      { fen: promotionCorner, show: ['c8=Q'], title: 'A queen can cover too much', prompt: 'The pawn on c7 is ready to promote. Watch the natural choice of a queen.',
        marks: ['a6', 'a8', 'b7'], feedback: 'The queen covers a6 from c8 along the diagonal. Black has no legal square and is not in check. That’s stalemate.' },
      { fen: promotionCorner, solutions: ['c8=R'], reply: 'Ka6', title: 'Leave one legal square', prompt: 'Promote to a piece that still wins with the king, while leaving a6 free.',
        hint: 'Which piece moves along the eighth rank but has no diagonal attack on a6?', feedback: 'A rook keeps control of the eighth rank and allows Black’s king to step to a6. White keeps a winning rook-and-king endgame.' },
    ],
  },
  {
    id: 'skewers', topic: 'tactics', name: 'Skewer the queen', cue: 'Line up the targets',
    description: 'Drive a king off a file to reveal a piece behind it.',
    takeaway: 'For a skewer, put the more valuable target in front. Once it moves away, the piece behind it is exposed.',
    steps: [
      { fen: skewer, solutions: ['Ra1+'], reply: 'Kb6', title: 'Force the front piece to move', prompt: 'Put the rook on the file shared by Black’s king and queen. Give check.',
        hint: 'The king and queen are both on the a-file.', feedback: 'The king moves clear of the a-file. The queen is now in the rook’s line.' },
      { setup: { fen: skewer, moves: ['Ra1+', 'Kb6'] }, solutions: ['Rxa8'], title: 'Collect the piece behind', prompt: 'Finish the tactic after Black’s king steps to b6.',
        hint: 'The rook now has a clear path up the a-file.', feedback: 'The rook takes the exposed queen. The check forced the king off the line.' },
    ],
  },
  {
    id: 'checks', topic: 'safety', name: 'Checks, captures, threats', cue: 'Check the danger first',
    description: 'Defuse the f7 attack, then practice getting out of a forcing check.',
    takeaway: 'Scan the opponent’s checks first. If you are already in check, ask whether you can take the attacker, block the line, or move the king.',
    steps: [
      { fen: lookoutWhite, show: ['Qxf7#'], title: 'Look for their check', prompt: 'It’s Black’s turn in the real position. Give White a free move to see the danger on f7.',
        marks: ['h5', 'c4', 'f7', 'e8'], feedback: 'The queen takes on f7 with check, and the bishop protects it from c4. Black’s king can’t capture a protected queen.' },
      { fen: lookout, solutions: ['g6', 'Qe7', 'Qf6'], title: 'Stop mate before you attack', prompt: 'Play as Black. Block the queen’s approach to f7 or add a defender to f7.',
        hint: 'g6 cuts the queen’s diagonal from h5. A queen move to e7 or f6 can also defend f7.', feedback: 'The immediate mate is gone. Check the threat again whenever two enemy pieces point toward your king.' },
      { fen: exposed, solutions: ['Kf2', 'Kd1', 'Kf1'], title: 'Step away from a rook check',
        prompt: 'White is already in check. Move the king to a safe square.', hint: 'The rook controls the e-file. Look at the squares beside your king.', feedback: 'Your king left the attacked file. When in check, solve that problem before starting a plan elsewhere.' },
    ],
  },
];
