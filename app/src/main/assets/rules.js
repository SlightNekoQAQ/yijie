/* Shared, deterministic rules for both armies. Red/white is side 0, at the bottom. */
(function (root) {
  "use strict";
  const values = {
    k: 20000,
    q: 950,
    r: 510,
    c: 460,
    b: 340,
    n: 320,
    e: 240,
    a: 190,
    p: 100,
  };
  const inside = (s, x, y) => x >= 0 && x < s.width && y >= 0 && y < s.height;
  const at = (s, x, y) => (inside(s, x, y) ? s.board[y][x] : null);
  const direction = (side) => (side === 0 ? -1 : 1);
  const back = (s, side) => (side === 0 ? s.height - 1 : 0);
  const palace = (s, side, x, y) => {
    const min = s.width === 9 ? 3 : 2;
    return (
      x >= min && x <= s.width - 1 - min && Math.abs(y - back(s, side)) <= 2
    );
  };
  const ownHalf = (s, side, y) =>
    side === 0 ? y >= s.height / 2 : y < s.height / 2;
  const otherHalf = (s, side, y) => !ownHalf(s, side, y);
  const soldierRow = (s, side) =>
    s.width === 9 ? (side === 0 ? 6 : 3) : side === 0 ? 6 : 1;

  function create(boardType = "xiangqi", sides = ["xiangqi", "xiangqi"]) {
    const chinese = boardType === "xiangqi";
    const width = chinese ? 9 : 8,
      height = chinese ? 10 : 8;
    const board = Array.from({ length: height }, () => Array(width).fill(null));
    const s = {
      boardType,
      width,
      height,
      sides: [...sides],
      board,
      turn: 0,
      ep: null,
      ply: 0,
      result: null,
      repetitions: {},
    };
    for (let side = 0; side < 2; side++) {
      const y = back(s, side),
        rules = sides[side];
      if (chinese) {
        const types =
          rules === "xiangqi"
            ? ["r", "n", "e", "a", "k", "a", "e", "n", "r"]
            : ["r", "n", "q", "b", "k", null, "b", "n", "r"];
        types.forEach((type, x) => {
          if (type) board[y][x] = { side, type, moved: false };
        });
        if (rules === "xiangqi")
          for (const x of [1, 7])
            board[y + direction(side) * 2][x] = {
              side,
              type: "c",
              moved: false,
            };
        for (const x of [0, 2, 4, 6, 8])
          board[y + direction(side) * 3][x] = { side, type: "p", moved: false };
      } else {
        const types =
          rules === "western"
            ? ["r", "n", "b", "q", "k", "b", "n", "r"]
            : ["r", "n", "e", "a", "k", "e", "n", "r"];
        types.forEach((type, x) => {
          board[y][x] = { side, type, moved: false };
        });
        for (let x = 0; x < 8; x++)
          board[y + direction(side)][x] = { side, type: "p", moved: false };
      }
    }
    s.repetitions[key(s)] = 1;
    return s;
  }

  function key(s) {
    return (
      s.board
        .map((row) =>
          row
            .map((p) => (p ? `${p.side}${p.type}${p.moved ? 1 : 0}` : ".."))
            .join(""),
        )
        .join("/") + `:${s.turn}:${s.ep ? `${s.ep.x},${s.ep.y}` : "-"}`
    );
  }

  function pseudo(s, x, y, attacks = false) {
    const p = at(s, x, y);
    if (!p) return [];
    const out = [],
      d = direction(p.side),
      xiangqi = s.sides[p.side] === "xiangqi";
    function add(nx, ny, extra) {
      if (!inside(s, nx, ny)) return;
      const target = at(s, nx, ny);
      if (!target || target.side !== p.side)
        out.push({ x, y, nx, ny, ...(extra || {}) });
    }
    function ray(dx, dy, cannon = false) {
      let nx = x + dx,
        ny = y + dy,
        screened = false;
      while (inside(s, nx, ny)) {
        const target = at(s, nx, ny);
        if (!cannon) {
          if (!target || target.side !== p.side) out.push({ x, y, nx, ny });
          if (target) break;
        } else if (!screened) {
          if (!target && !attacks) add(nx, ny);
          if (target) screened = true;
        } else if (target) {
          if (target.side !== p.side) add(nx, ny);
          break;
        }
        nx += dx;
        ny += dy;
      }
    }
    if (p.type === "r" || p.type === "q" || p.type === "c") {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        ray(dx, dy, p.type === "c");
    }
    if (p.type === "b" || p.type === "q") {
      for (const [dx, dy] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ])
        ray(dx, dy);
    }
    if (p.type === "n") {
      for (const [dx, dy] of [
        [1, 2],
        [-1, 2],
        [1, -2],
        [-1, -2],
        [2, 1],
        [2, -1],
        [-2, 1],
        [-2, -1],
      ]) {
        const legX = x + (Math.abs(dx) === 2 ? Math.sign(dx) : 0);
        const legY = y + (Math.abs(dy) === 2 ? Math.sign(dy) : 0);
        if (!xiangqi || !at(s, legX, legY)) add(x + dx, y + dy);
      }
    }
    if (p.type === "e")
      for (const dx of [-2, 2])
        for (const dy of [-2, 2]) {
          if (ownHalf(s, p.side, y + dy) && !at(s, x + dx / 2, y + dy / 2))
            add(x + dx, y + dy);
        }
    if (p.type === "a")
      for (const dx of [-1, 1])
        for (const dy of [-1, 1]) {
          if (palace(s, p.side, x + dx, y + dy)) add(x + dx, y + dy);
        }
    if (p.type === "k") {
      const dirs = xiangqi
        ? [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]
        : [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ];
      for (const [dx, dy] of dirs)
        if (!xiangqi || palace(s, p.side, x + dx, y + dy)) add(x + dx, y + dy);
      if (xiangqi)
        for (const dy of [-1, 1]) {
          let ny = y + dy;
          while (inside(s, x, ny) && !at(s, x, ny)) ny += dy;
          const target = at(s, x, ny);
          if (target && target.type === "k" && target.side !== p.side)
            add(x, ny);
        }
      // Castling is only defined for the orthodox western starting position.
      if (
        !attacks &&
        !xiangqi &&
        s.boardType === "western" &&
        s.sides.every((v) => v === "western") &&
        !p.moved &&
        x === 4 &&
        y === back(s, p.side) &&
        !inCheck(s, p.side)
      ) {
        for (const rookX of [0, 7]) {
          const rook = at(s, rookX, y),
            step = rookX === 0 ? -1 : 1;
          if (!rook || rook.side !== p.side || rook.type !== "r" || rook.moved)
            continue;
          let clear = true;
          for (let cx = x + step; cx !== rookX; cx += step)
            if (at(s, cx, y)) clear = false;
          if (
            clear &&
            !isAttacked(s, x + step, y, 1 - p.side) &&
            !isAttacked(s, x + 2 * step, y, 1 - p.side)
          )
            add(x + 2 * step, y, { castle: rookX });
        }
      }
    }
    if (p.type === "p") {
      if (xiangqi) {
        add(x, y + d);
        if (otherHalf(s, p.side, y)) for (const dx of [-1, 1]) add(x + dx, y);
      } else {
        for (const dx of [-1, 1]) {
          const nx = x + dx,
            ny = y + d;
          if (attacks) add(nx, ny);
          else if (at(s, nx, ny) && at(s, nx, ny).side !== p.side) add(nx, ny);
          else if (s.ep && s.ep.x === nx && s.ep.y === ny)
            add(nx, ny, { enPassant: true });
        }
        if (!attacks && !at(s, x, y + d)) {
          add(x, y + d);
          if (!p.moved && y === soldierRow(s, p.side) && !at(s, x, y + 2 * d))
            add(x, y + 2 * d);
        }
      }
    }
    return out;
  }

  function isAttacked(s, x, y, enemy) {
    for (let py = 0; py < s.height; py++)
      for (let px = 0; px < s.width; px++) {
        const p = at(s, px, py);
        if (
          p &&
          p.side === enemy &&
          pseudo(s, px, py, true).some((m) => m.nx === x && m.ny === y)
        )
          return true;
      }
    return false;
  }
  function inCheck(s, side) {
    for (let y = 0; y < s.height; y++)
      for (let x = 0; x < s.width; x++) {
        const p = at(s, x, y);
        if (p && p.side === side && p.type === "k")
          return isAttacked(s, x, y, 1 - side);
      }
    return true;
  }
  function apply(s, m, promotion = "q") {
    const next = { ...s, board: s.board.map((row) => row.slice()) },
      p = next.board[m.y][m.x];
    next.board[m.y][m.x] = null;
    if (m.enPassant) next.board[m.y][m.nx] = null;
    if (m.castle !== undefined) {
      const rook = next.board[m.y][m.castle];
      next.board[m.y][m.castle] = null;
      next.board[m.y][m.nx > m.x ? m.nx - 1 : m.nx + 1] = {
        ...rook,
        moved: true,
      };
    }
    next.board[m.ny][m.nx] = {
      ...p,
      moved: true,
      type:
        p.type === "p" &&
        next.sides[p.side] === "western" &&
        m.ny === back(next, 1 - p.side)
          ? promotion
          : p.type,
    };
    next.ep =
      p.type === "p" &&
      next.sides[p.side] === "western" &&
      Math.abs(m.ny - m.y) === 2
        ? { x: m.x, y: (m.y + m.ny) / 2 }
        : null;
    next.turn = 1 - s.turn;
    next.ply++;
    next.result = null;
    return next;
  }
  function legal(s, side = s.turn) {
    if (s.result) return [];
    const moves = [];
    for (let y = 0; y < s.height; y++)
      for (let x = 0; x < s.width; x++) {
        const p = at(s, x, y);
        if (p && p.side === side)
          for (const m of pseudo(s, x, y)) {
            if (at(s, m.nx, m.ny)?.type === "k") continue;
            if (!inCheck(apply(s, m), side)) moves.push(m);
          }
      }
    return moves;
  }
  function play(s, m, promotion = "q") {
    const actual = legal(s).find(
      (v) => v.x === m.x && v.y === m.y && v.nx === m.nx && v.ny === m.ny,
    );
    if (!actual) throw Error("Illegal move");
    const next = apply(s, actual, promotion);
    next.repetitions = { ...s.repetitions };
    const hash = key(next);
    next.repetitions[hash] = (next.repetitions[hash] || 0) + 1;
    if (next.repetitions[hash] >= 3) next.result = "draw";
    else if (!legal(next).length) next.result = String(s.turn);
    return next;
  }
  function evaluate(s, side) {
    let score = 0;
    for (let y = 0; y < s.height; y++)
      for (let x = 0; x < s.width; x++) {
        const p = at(s, x, y);
        if (p)
          score +=
            (p.side === side ? 1 : -1) *
            (values[p.type] +
              (p.type === "p" ? Math.abs(back(s, p.side) - y) * 5 : 0));
      }
    return score;
  }
  function bestMove(s, depth = 2) {
    function search(pos, remaining, alpha, beta) {
      if (!remaining) return evaluate(pos, pos.turn);
      const moves = legal(pos);
      if (!moves.length) return -30000 - remaining;
      moves.sort(
        (a, b) =>
          (values[at(pos, b.nx, b.ny)?.type] || 0) -
          (values[at(pos, a.nx, a.ny)?.type] || 0),
      );
      let best = -Infinity;
      for (const m of moves) {
        const score = -search(apply(pos, m), remaining - 1, -beta, -alpha);
        best = Math.max(best, score);
        alpha = Math.max(alpha, score);
        if (alpha >= beta) break;
      }
      return best;
    }
    const moves = legal(s);
    if (!moves.length) return null;
    moves.sort(
      (a, b) =>
        (values[at(s, b.nx, b.ny)?.type] || 0) -
        (values[at(s, a.nx, a.ny)?.type] || 0),
    );
    let chosen = moves[0],
      top = -Infinity;
    for (const m of moves) {
      const score =
        -search(apply(s, m), depth - 1, -Infinity, Infinity) +
        (Math.random() - 0.5) * 3;
      if (score > top) {
        top = score;
        chosen = m;
      }
    }
    return chosen;
  }
  const api = {
    create,
    at,
    pseudo,
    legal,
    play,
    apply,
    inCheck,
    isAttacked,
    bestMove,
    key,
  };
  if (typeof module !== "undefined") module.exports = api;
  root.YijieRules = api;
})(typeof window !== "undefined" ? window : globalThis);
