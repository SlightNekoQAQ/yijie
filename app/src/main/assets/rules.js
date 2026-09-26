/* Shared, deterministic rules for both armies. Red/white is side 0, at the bottom. */
(function (root) {
  "use strict";
  const values = {
    western: { k: 20000, q: 900, r: 500, b: 300, n: 300, p: 100 },
    xiangqi: { k: 20000, r: 900, n: 400, c: 450, e: 200, a: 200, p: 100 },
  };
  const pieceValue = (s, p) => values[s.sides[p.side]][p.type];
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

  function create(
    boardType = "xiangqi",
    sides = ["xiangqi", "xiangqi"],
    variant = "handicap",
  ) {
    const chinese = boardType === "xiangqi";
    const width = chinese ? 9 : 8,
      height = chinese ? 10 : 8;
    const board = Array.from({ length: height }, () => Array(width).fill(null));
    const s = {
      boardType,
      width,
      height,
      sides: [...sides],
      variant,
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
            : [
                "r",
                "n",
                variant === "queen" ? "q" : null,
                "b",
                "k",
                null,
                "b",
                "n",
                variant === "handicap" ? null : "r",
              ];
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
  function explain(s, fromX, fromY, toX, toY) {
    if (s.result) return "对局已结束，请开始新对局";
    const p = at(s, fromX, fromY),
      target = at(s, toX, toY);
    if (!p) return "先选择自己的棋子";
    if (p.side !== s.turn) return "现在不是这一方的回合";
    if (target?.side === p.side) return "不能落在己方棋子的位置";
    if (pseudo(s, fromX, fromY).some((m) => m.nx === toX && m.ny === toY)) {
      if (target?.type === "k") return "将死时直接判胜，不能吃王或将";
      if (
        !legal(s).some(
          (m) => m.x === fromX && m.y === fromY && m.nx === toX && m.ny === toY,
        )
      )
        return "这步会使自己的王或将受到攻击，必须先解将";
      return "";
    }
    if (s.sides[p.side] === "xiangqi") {
      if (p.type === "n") return "马走日字，第一步的马腿不能被挡";
      if (p.type === "e") return "象走田字，不能塞象眼或过河";
      if (p.type === "a" || p.type === "k")
        return "士和将只能在九宫内按各自方向走";
      if (p.type === "c") return "炮直走不越子；吃子必须恰好隔一子";
      if (p.type === "p") return "兵只能前进，过河后才能横走";
    } else if (p.type === "p")
      return "兵直进不能吃子，斜走只能吃子；前方有子不能走";
    return "不符合该棋子的走法，或移动路径被挡";
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
  function materialScore(s, side) {
    let score = 0;
    for (let y = 0; y < s.height; y++)
      for (let x = 0; x < s.width; x++) {
        const p = at(s, x, y);
        if (p) score += (p.side === side ? 1 : -1) * pieceValue(s, p);
      }
    return score;
  }
  function evaluate(s, side) {
    let score = materialScore(s, side);
    for (let y = 0; y < s.height; y++)
      for (let x = 0; x < s.width; x++) {
        const p = at(s, x, y);
        if (p?.type === "p") {
          const progress = Math.abs(back(s, p.side) - y) * 5;
          const riverBonus =
            s.sides[p.side] === "xiangqi" && otherHalf(s, p.side, y) ? 65 : 0;
          score += (p.side === side ? 1 : -1) * (progress + riverBonus);
        }
      }
    return score;
  }
  function bestMove(s, depth = 2) {
    const moves = legal(s);
    if (!moves.length) return null;
    const order = (pos, list) =>
      list.sort(
        (a, b) =>
          (at(pos, b.nx, b.ny) ? pieceValue(pos, at(pos, b.nx, b.ny)) : 0) -
          (at(pos, a.nx, a.ny) ? pieceValue(pos, at(pos, a.nx, a.ny)) : 0),
      );
    order(s, moves);
    let chosen = moves[0];
    const count = s.board.flat().filter(Boolean).length;
    const limit =
      count <= 7
        ? Math.max(depth, 4)
        : count <= 12
          ? Math.max(depth, 3)
          : depth;
    const timeout = Symbol("search timeout");
    let deadline = Infinity,
      nodes = 0;
    function search(pos, remaining, alpha, beta) {
      if ((++nodes & 63) === 0 && Date.now() > deadline) throw timeout;
      if (!remaining) {
        const checked = inCheck(pos, pos.turn);
        if (checked && !legal(pos).length) return -30000;
        // Stalemate is also a loss in this variant; check it in sparse endgames.
        if (count <= 12 && !checked && !legal(pos).length) return -30000;
        return evaluate(pos, pos.turn) - (checked ? 120 : 0);
      }
      const replies = order(pos, legal(pos));
      if (!replies.length) return -30000 - remaining;
      let best = -Infinity;
      for (const m of replies) {
        const score = -search(apply(pos, m), remaining - 1, -beta, -alpha);
        best = Math.max(best, score);
        alpha = Math.max(alpha, score);
        if (alpha >= beta) break;
      }
      return best;
    }
    for (let level = Math.max(1, depth); level <= limit; level++) {
      let top = -Infinity,
        candidate = moves[0],
        complete = true;
      try {
        for (const m of moves) {
          const next = apply(s, m);
          const repeats = s.repetitions?.[key(next)] || 0;
          const score =
            -search(next, level - 1, -Infinity, Infinity) - repeats * 45;
          if (score > top || (score === top && Math.random() < 0.5)) {
            top = score;
            candidate = m;
          }
        }
      } catch (error) {
        if (error !== timeout) throw error;
        complete = false;
      }
      if (!complete) break;
      chosen = candidate;
      moves.splice(moves.indexOf(chosen), 1);
      moves.unshift(chosen);
      // Complete the requested search first; spend at most 650 ms on deeper endgames.
      if (level === depth) deadline = Date.now() + 650;
    }
    return chosen;
  }
  const api = {
    create,
    at,
    pseudo,
    legal,
    play,
    explain,
    apply,
    inCheck,
    isAttacked,
    bestMove,
    materialScore,
    key,
  };
  if (typeof module !== "undefined") module.exports = api;
  root.YijieRules = api;
})(typeof window !== "undefined" ? window : globalThis);
