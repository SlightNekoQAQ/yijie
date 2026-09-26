const { test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../app/src/main/assets/rules.js");
const piece = (side, type) => ({ side, type, moved: false });
const empty = (type = "xiangqi", sides = ["xiangqi", "xiangqi"]) => {
  const s = R.create(type, sides);
  s.board = s.board.map((row) => row.map(() => null));
  s.turn = 0;
  s.ep = null;
  s.result = null;
  s.repetitions = {};
  return s;
};
const has = (moves, nx, ny) => moves.some((m) => m.nx === nx && m.ny === ny);

test("board determines layout while each side independently determines its army", () => {
  const standard = R.create();
  assert.equal(standard.width, 9);
  assert.equal(standard.board[7][1].type, "c");
  assert.equal(standard.board[2][7].type, "c");
  assert.equal(standard.board[6][0].type, "p");
  const mixed = R.create("xiangqi", ["western", "xiangqi"]);
  assert.equal(mixed.board[9][2], null);
  assert.equal(
    R.create("xiangqi", ["western", "xiangqi"], "queen").board[9][2].type,
    "q",
  );
  assert.equal(mixed.board[9][3].type, "b");
  assert.equal(mixed.board[9][5], null);
  assert.equal(mixed.board[7][1], null);
  assert.equal(mixed.board[6][2].type, "p");
  assert.equal(mixed.board[2][1].type, "c");
  const reverse = R.create("western", ["xiangqi", "western"]);
  assert.equal(reverse.board[7][3].type, "a");
  assert.equal(reverse.board[7][2].type, "e");
  assert.equal(reverse.board[0][3].type, "q");
});

test("the mixed starting position has no immediate forced mate", () => {
  const s = R.create("xiangqi", ["western", "xiangqi"]);
  for (const move of R.legal(s)) assert.notEqual(R.play(s, move).result, "0");
});

test("xiangqi horse leg, elephant eye and river are enforced", () => {
  const s = empty();
  s.board[9][4] = piece(0, "k");
  s.board[0][3] = piece(1, "k");
  s.board[6][4] = piece(0, "n");
  s.board[5][4] = piece(0, "p");
  assert.equal(
    has(
      R.legal(s).filter((m) => m.x === 4 && m.y === 6),
      5,
      4,
    ),
    false,
  );
  s.board[6][4] = piece(0, "e");
  assert.equal(
    has(
      R.legal(s).filter((m) => m.x === 4 && m.y === 6),
      6,
      4,
    ),
    false,
  );
  s.board[5][4] = null;
  assert.equal(
    has(
      R.legal(s).filter((m) => m.x === 4 && m.y === 6),
      6,
      4,
    ),
    false,
  );
  assert.equal(
    has(
      R.legal(s).filter((m) => m.x === 4 && m.y === 6),
      2,
      8,
    ),
    true,
  );
  s.board[8][4] = piece(0, "e");
  s.board[7][3] = piece(0, "p");
  assert.equal(has(R.pseudo(s, 4, 8), 2, 6), false);
  s.board[7][3] = null;
  assert.equal(has(R.pseudo(s, 4, 8), 2, 6), true);
});

test("a cannon can check a western king across exactly one screen", () => {
  const s = empty("xiangqi", ["western", "xiangqi"]);
  s.board[9][4] = piece(0, "k");
  s.board[0][4] = piece(1, "k");
  s.board[5][1] = piece(1, "c");
  s.board[5][3] = piece(0, "p");
  s.board[5][6] = piece(0, "q");
  assert.equal(R.isAttacked(s, 6, 5, 1), true);
  s.board[5][3] = null;
  assert.equal(R.isAttacked(s, 6, 5, 1), false);
  s.board[5][4] = piece(0, "p");
  assert.equal(R.isAttacked(s, 6, 5, 1), true);
});

test("cannon captures across exactly one screen, not zero or two", () => {
  const s = empty("xiangqi", ["xiangqi", "western"]);
  s.board[9][4] = piece(0, "k");
  s.board[0][3] = piece(1, "k");
  s.board[7][0] = piece(0, "c");
  s.board[4][0] = piece(1, "n");
  assert.equal(has(R.legal(s), 0, 4), false);
  assert.match(R.explain(s, 0, 7, 0, 4), /恰好隔一子/);
  s.board[5][0] = piece(0, "p");
  assert.equal(
    has(
      R.legal(s).filter((m) => m.x === 0 && m.y === 7),
      0,
      4,
    ),
    true,
  );
  s.board[6][0] = piece(0, "p");
  assert.equal(
    has(
      R.legal(s).filter((m) => m.x === 0 && m.y === 7),
      0,
      4,
    ),
    false,
  );
});

test("a player in check cannot make an unrelated move", () => {
  const s = empty("xiangqi", ["western", "xiangqi"]);
  s.board[9][4] = piece(0, "k");
  s.board[0][3] = piece(1, "k");
  s.board[1][4] = piece(1, "r");
  s.board[9][0] = piece(0, "r");
  assert.equal(R.inCheck(s, 0), true);
  assert.equal(
    R.legal(s).some((m) => m.x === 0),
    false,
  );
  assert.match(R.explain(s, 0, 9, 0, 8), /必须先解将/);
});

test("material scores reward captures and penalize losses", () => {
  const s = empty("western", ["western", "western"]);
  s.board[7][4] = piece(0, "k");
  s.board[0][4] = piece(1, "k");
  s.board[4][0] = piece(0, "p");
  s.board[3][1] = piece(1, "n");
  assert.equal(R.materialScore(s, 0), -200);
  s.board[3][1] = null;
  assert.equal(R.materialScore(s, 0), 100);
  s.board[4][0] = null;
  assert.equal(R.materialScore(s, 0), 0);
});

test("AI prefers a terminal win over a material gain", () => {
  const s = empty("western", ["western", "western"]);
  s.turn = 1;
  s.board[0][0] = piece(0, "k");
  s.board[2][2] = piece(1, "k");
  s.board[3][1] = piece(1, "q");
  const move = R.bestMove(s, 2);
  assert.equal(R.play(s, move).result, "1");
});

test("stalemate is a loss, not a draw", () => {
  const s = empty("western", ["western", "western"]);
  s.turn = 1;
  s.board[0][0] = piece(0, "k");
  s.board[2][2] = piece(1, "k");
  s.board[3][1] = piece(1, "q");
  // Black queen b5-b6 leaves the white king a8 without a legal move.
  const next = R.play(s, { x: 1, y: 3, nx: 1, ny: 2 });
  assert.equal(R.inCheck(next, 0), false);
  assert.equal(R.legal(next).length, 0);
  assert.equal(next.result, "1");
});

test("western pawn promotes and en passant removes the passed pawn", () => {
  const s = empty("western", ["western", "western"]);
  s.board[7][4] = piece(0, "k");
  s.board[0][4] = piece(1, "k");
  s.board[3][3] = piece(0, "p");
  s.board[1][4] = piece(1, "p");
  s.turn = 1;
  const first = R.play(s, { x: 4, y: 1, nx: 4, ny: 3 });
  assert.equal(first.ep.x, 4);
  const second = R.play(first, { x: 3, y: 3, nx: 4, ny: 2 });
  assert.equal(second.board[3][4], null);
  assert.equal(second.board[2][4].side, 0);
  const promote = empty("western", ["western", "western"]);
  promote.board[7][4] = piece(0, "k");
  promote.board[0][4] = piece(1, "k");
  promote.board[1][0] = piece(0, "p");
  assert.equal(
    R.play(promote, { x: 0, y: 1, nx: 0, ny: 0 }, "n").board[0][0].type,
    "n",
  );
});

test("a king may not be captured and must answer check", () => {
  const s = empty("xiangqi", ["western", "xiangqi"]);
  s.board[9][4] = piece(0, "k");
  s.board[0][3] = piece(1, "k");
  s.board[2][3] = piece(0, "q");
  assert.equal(
    R.legal(s).some((m) => m.nx === 3 && m.ny === 0),
    false,
  );
  s.turn = 1;
  assert.equal(R.inCheck(s, 1), true);
  assert.equal(
    R.legal(s).every((m) => R.inCheck(R.apply(s, m), 1) === false),
    true,
  );
});

test("three repeated positions end in a draw", () => {
  let s = empty("western", ["western", "western"]);
  s.board[7][0] = piece(0, "k");
  s.board[0][7] = piece(1, "k");
  s.board[7][1] = piece(0, "r");
  s.board[0][6] = piece(1, "r");
  const cycle = [
    { x: 1, y: 7, nx: 1, ny: 6 },
    { x: 6, y: 0, nx: 6, ny: 1 },
    { x: 1, y: 6, nx: 1, ny: 7 },
    { x: 6, y: 1, nx: 6, ny: 0 },
  ];
  for (let ply = 0; ply < 12 && !s.result; ply++) s = R.play(s, cycle[ply % 4]);
  assert.equal(s.result, "draw");
});

test("orthodox castling is available only with a safe path", () => {
  const s = empty("western", ["western", "western"]);
  s.board[7][4] = piece(0, "k");
  s.board[7][7] = piece(0, "r");
  s.board[0][4] = piece(1, "k");
  assert.equal(has(R.legal(s), 6, 7), true);
  const after = R.play(s, { x: 4, y: 7, nx: 6, ny: 7 });
  assert.equal(after.board[7][5].type, "r");
  s.board[0][5] = piece(1, "r");
  assert.equal(
    R.legal(s).some((m) => m.castle !== undefined),
    false,
  );
});
