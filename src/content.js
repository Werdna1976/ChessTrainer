export const challenges = [
  {
    name: 'Seal the escape squares', type: 'Mate in two', difficulty: 'Foundations',
    fen: '7k/6p1/4K3/8/4Q3/8/8/8 w - - 0 1', solutions: ['Kf7'], mate: 2,
    reply: 'g5', hint: 'Start with your king. Which square lets it control both e8 and g8?',
    follow: 'The king has no escape squares. Look for a queen check on the h-file.',
    takeaway: 'Bring your king in to cover escape squares before delivering the check.',
  },
  {
    name: 'A fork worth a queen', type: 'Find the best move', difficulty: 'Foundations',
    fen: 'q3k3/5pp1/7p/3N4/8/8/PPP2PPP/4K3 w - - 0 1', solutions: ['Nc7+'],
    reply: 'Kd7', finish: ['Nxa8'], hint: 'A knight can attack two targets at once. Look for a check from c7.',
    follow: 'The king had to move. Which piece is still under attack?',
    takeaway: 'Look for knight checks that also attack an undefended queen or rook.',
  },
  {
    name: 'The crowded back rank', type: 'Find the best move', difficulty: 'Foundations',
    fen: '6k1/5ppp/8/8/3p4/6P1/5P1P/4R1K1 w - - 0 1', solutions: ['Re8#'], mate: 1,
    hint: 'Black’s pawns cover the squares where the king might otherwise escape.',
    takeaway: 'Check the back rank when the opposing king is boxed in by its own pawns.',
  },
  {
    name: 'Take away the corner', type: 'Mate in two', difficulty: 'Developing',
    fen: '7k/1p6/4K3/2Q5/8/8/8/8 w - - 0 1', solutions: ['Kf7'], mate: 2,
    reply: 'Kh7', hint: 'Move the king close enough to cover the escape squares on the seventh and eighth ranks.',
    follow: 'The black king has stepped to h7. Find the queen check on the same file.',
    takeaway: 'A threat is forced when every legal reply still lets you deliver mate.',
  },
];

export const openings = [
  {
    name: 'French Defense', variation: 'Advance variation', color: 'b',
    idea: 'Build a solid center, then attack the base of White’s pawn chain.',
    moves: ['e4', 'e6', 'd4', 'd5', 'e5', 'c5', 'c3', 'Nc6', 'Nf3', 'Qb6'],
    prompts: ['Prepare to challenge e4 with your d-pawn.', 'Challenge White’s central pawns directly.', 'Strike at the base of the pawn chain on d4.', 'Develop a piece that adds pressure to d4.', 'Bring the queen out to pressure b2 and support the attack on d4.'],
    recap: 'White has space on e5. Your counterplay is against d4, where the pawn chain starts.',
  },
  {
    name: 'Sicilian Defense', variation: 'Najdorf setup', color: 'b',
    idea: 'Trade a flank pawn for a central pawn and develop with pressure on e4.',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
    prompts: ['Use a flank pawn to fight for d4.', 'Control e5 with a pawn and open a diagonal for your light-squared bishop.', 'Trade your c-pawn for White’s central d-pawn.', 'Develop a knight and attack e4 at the same time.', 'Keep White’s pieces off b5 and prepare queenside expansion.'],
    recap: 'Black’s half-open c-file gives you room for counterplay. Watch the e4-pawn and develop before launching an attack.',
  },
  {
    name: 'London System', variation: 'Core setup', color: 'w',
    idea: 'Develop the dark-squared bishop early and build around a sturdy d4-pawn.',
    moves: ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'e6', 'Nf3', 'Bd6', 'Bg3', 'O-O', 'Bd3'],
    prompts: ['Take central space with your queen’s pawn.', 'Develop your bishop before closing its diagonal with e3.', 'Support d4 and free the other bishop.', 'Develop toward the center and support d4.', 'Keep the bishop active. If Black trades on g3, your h-pawn can recapture.', 'Develop your remaining bishop onto the diagonal toward h7.'],
    recap: 'The typical London setup gets your bishops working early and gives you a clear route to castling.',
  },
  {
    name: 'Italian Game', variation: 'Quiet center', color: 'w',
    idea: 'Develop quickly, put pressure on f7, and prepare a central pawn break.',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'Nf6', 'O-O', 'd6', 'c3'],
    prompts: ['Claim the center and open the bishop’s diagonal.', 'Develop and put pressure on the e5-pawn.', 'Aim a bishop at f7, which Black’s king alone defends.', 'Support e4 and open a diagonal for your other bishop.', 'Bring your king to safety while your position is ready for it.', 'Prepare d4 by giving your d-pawn another supporter.'],
    recap: 'You have a safe king and a bishop aimed at f7. The c3-pawn helps you prepare d4 when the time is right.',
  },
];
