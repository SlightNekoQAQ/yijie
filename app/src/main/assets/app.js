(() => {
  "use strict";
  const R = window.YijieRules;
  const $ = (id) => document.getElementById(id);
  const glyphs = {
    western: [
      { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
      { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
    ],
    xiangqi: [
      {
        k: "帅",
        r: "车",
        n: "马",
        e: "相",
        a: "仕",
        c: "炮",
        p: "兵",
        q: "后",
        b: "象",
      },
      {
        k: "将",
        r: "車",
        n: "馬",
        e: "象",
        a: "士",
        c: "砲",
        p: "卒",
        q: "后",
        b: "象",
      },
    ],
  };
  let game,
    snapshots = [],
    records = [],
    controls = ["human", "ai"],
    selected = null,
    flipped = false,
    paused = false,
    timer = null,
    generation = 0,
    soundEnabled = true,
    audio = null,
    flight = null,
    flightTimer = null,
    feedbackTimer = null;
  function stopAI() {
    clearTimeout(timer);
    timer = null;
    generation++;
  }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem("yijie-save"));
      if (
        saved?.game?.board?.length === saved.game.height &&
        saved.game.sides?.length === 2
      ) {
        ({ game, snapshots, records, controls, flipped, paused } = saved);
        game.variant ??= "queen";
        soundEnabled = saved.soundEnabled !== false;
        return;
      }
    } catch (_) {
      /* Ignore damaged local saves. */
    }
    game = R.create();
    snapshots = [];
    records = [];
    controls = ["human", "ai"];
    flipped = false;
    paused = false;
  }
  function persist() {
    try {
      localStorage.setItem(
        "yijie-save",
        JSON.stringify({
          game,
          snapshots,
          records,
          controls,
          flipped,
          paused,
          soundEnabled,
        }),
      );
    } catch (_) {
      /* Play remains available without storage. */
    }
  }
  function name(side) {
    return game.boardType === "xiangqi"
      ? side === 0
        ? "红方"
        : "黑方"
      : side === 0
        ? "白方"
        : "黑方";
  }
  function label(piece) {
    return glyphs[game.sides[piece.side]][piece.side][piece.type];
  }
  function xy(x, y) {
    return `${"abcdefghi"[x]}${game.height - y}`;
  }
  function displayCoords(x, y) {
    return flipped ? [game.width - 1 - x, game.height - 1 - y] : [x, y];
  }
  function pieceClass(p) {
    return (
      `piece side${p.side}` +
      (game.boardType === "western" && game.sides[p.side] === "xiangqi"
        ? " chinese-army"
        : "") +
      (game.boardType === "xiangqi" && game.sides[p.side] === "western"
        ? " western-army"
        : "")
    );
  }
  function cancelFlight() {
    clearTimeout(flightTimer);
    if (flight) {
      flight.destination.classList.remove("arriving");
      flight.piece.remove();
      flight = null;
    }
  }
  function animateMove(move, piece) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const board = $("board"),
      [sx, sy] = displayCoords(move.x, move.y),
      [tx, ty] = displayCoords(move.nx, move.ny);
    const destination = $("pieces").children[ty * game.width + tx];
    if (!destination) return;
    const moving = document.createElement("span");
    moving.className = pieceClass(piece) + " flying-piece";
    moving.textContent = label(piece);
    moving.style.width = `${82 / game.width}%`;
    moving.style.height = `${82 / game.height}%`;
    moving.style.left = `${((sx + 0.5) * 100) / game.width}%`;
    moving.style.top = `${((sy + 0.5) * 100) / game.height}%`;
    destination.classList.add("arriving");
    board.append(moving);
    flight = { piece: moving, destination };
    moving.getBoundingClientRect();
    moving.style.left = `${((tx + 0.5) * 100) / game.width}%`;
    moving.style.top = `${((ty + 0.5) * 100) / game.height}%`;
    flightTimer = setTimeout(cancelFlight, 250);
  }
  function unlockAudio() {
    if (!soundEnabled) return null;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return null;
      audio ??= new Audio();
      if (audio.state === "suspended") audio.resume().catch(() => {});
      return audio;
    } catch (_) {
      return null;
    }
  }
  function playSound(kind) {
    const ctx = unlockAudio();
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const notes =
      kind === "win"
        ? [520, 780]
        : kind === "capture"
          ? [240, 170]
          : kind === "check"
            ? [350, 510]
            : [360];
    notes.forEach((frequency, index) => {
      const osc = ctx.createOscillator(),
        gain = ctx.createGain(),
        start = now + index * 0.07;
      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.13, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.11);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.12);
    });
  }
  function showStatus() {
    $("status").classList.remove("feedback");
    $("status").textContent =
      game.result === "draw"
        ? "三次重复 · 和棋"
        : game.result !== null
          ? `${name(Number(game.result))}获胜`
          : `${name(game.turn)}走棋${R.inCheck(game, game.turn) ? " · 将军！" : ""}${paused && controls[game.turn] === "ai" ? " · 已暂停" : ""}`;
  }
  function hint(message) {
    clearTimeout(feedbackTimer);
    $("status").textContent = message;
    $("status").classList.add("feedback");
    feedbackTimer = setTimeout(showStatus, 2500);
  }
  function updatePresetVisibility() {
    $("presetField").hidden =
      $("boardType").value !== "xiangqi" ||
      ($("redRules").value !== "western" &&
        $("blackRules").value !== "western");
  }
  function renderBoard() {
    const board = $("board");
    board.className =
      "board " + (game.boardType === "xiangqi" ? "chinese" : "western");
    const holder = $("pieces");
    holder.replaceChildren();
    const available =
      selected && !game.result && controls[game.turn] === "human"
        ? R.legal(game).filter((m) => m.x === selected.x && m.y === selected.y)
        : [];
    for (let sy = 0; sy < game.height; sy++)
      for (let sx = 0; sx < game.width; sx++) {
        const [x, y] = displayCoords(sx, sy),
          p = R.at(game, x, y);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "square";
        cell.style.left = `${((sx + 0.5) * 100) / game.width}%`;
        cell.style.top = `${((sy + 0.5) * 100) / game.height}%`;
        cell.style.width = `${100 / game.width}%`;
        cell.style.height = `${100 / game.height}%`;
        const dest = available.find((m) => m.nx === x && m.ny === y);
        if (dest) cell.classList.add(p ? "capture" : "legal");
        if (selected?.x === x && selected?.y === y)
          cell.classList.add("selected");
        cell.setAttribute("role", "gridcell");
        cell.setAttribute(
          "aria-label",
          `${xy(x, y)} ${p ? name(p.side) + label(p) : "空位"}`,
        );
        if (p) {
          const piece = document.createElement("span");
          piece.className = pieceClass(p);
          piece.textContent = label(p);
          cell.append(piece);
        }
        cell.addEventListener("click", () => tap(x, y));
        holder.append(cell);
      }
    drawBoard();
  }
  function drawBoard() {
    const canvas = $("boardCanvas"),
      box = canvas.getBoundingClientRect(),
      ratio = window.devicePixelRatio || 1;
    if (!box.width || !box.height) return;
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    const w = box.width / game.width,
      h = box.height / game.height;
    if (game.boardType === "western") {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          ctx.fillStyle = (x + y) % 2 ? "#7e9a82" : "#e8d7af";
          ctx.fillRect(x * w, y * h, w, h);
        }
    } else {
      ctx.strokeStyle = "#7b5436";
      ctx.lineWidth = 1.1;
      for (let y = 0; y < 10; y++) {
        ctx.beginPath();
        ctx.moveTo(w / 2, (y + 0.5) * h);
        ctx.lineTo(8.5 * w, (y + 0.5) * h);
        ctx.stroke();
      }
      for (let x = 0; x < 9; x++) {
        for (const [first, last] of [
          [0.5, 4.5],
          [5.5, 9.5],
        ]) {
          ctx.beginPath();
          ctx.moveTo((x + 0.5) * w, first * h);
          ctx.lineTo((x + 0.5) * w, last * h);
          ctx.stroke();
        }
      }
      for (const [y1, y2] of [
        [0.5, 2.5],
        [7.5, 9.5],
      ])
        for (const dx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(4.5 * w, ((y1 + y2) / 2) * h);
          ctx.lineTo((4.5 + dx) * w, y1 * h);
          ctx.moveTo(4.5 * w, ((y1 + y2) / 2) * h);
          ctx.lineTo((4.5 + dx) * w, y2 * h);
          ctx.stroke();
        }
      ctx.fillStyle = "#79583b";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${Math.min(w * 0.45, 20)}px serif`;
      ctx.fillText("楚 河", 2.5 * w, 5 * h);
      ctx.fillText("汉 界", 6.5 * w, 5 * h);
    }
  }
  function render() {
    $("variant").textContent =
      `${game.boardType === "xiangqi" ? "中国象棋棋盘" : "国际象棋棋盘"} · ${game.sides[0] === game.sides[1] ? "对称走法" : "不对称走法"}`;
    $("moveCount").textContent = `第 ${Math.floor(game.ply / 2) + 1} 回合`;
    for (const side of [0, 1]) {
      const id = side === 0 ? "bottom" : "top";
      $(id + "Name").textContent = name(side);
      $(id + "Rules").textContent =
        game.sides[side] === "xiangqi" ? "中国象棋走法" : "国际象棋走法";
      $(id + "Control").value = controls[side];
    }
    clearTimeout(feedbackTimer);
    showStatus();
    $("undoButton").disabled = !snapshots.length;
    $("pauseButton").textContent = paused ? "继续" : "暂停";
    $("pauseButton").style.visibility =
      controls.includes("ai") && !game.result ? "visible" : "hidden";
    $("moveList").replaceChildren(
      ...records.map((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        return li;
      }),
    );
    $("boardType").value = game.boardType;
    $("redRules").value = game.sides[0];
    $("blackRules").value = game.sides[1];
    $("mixedPreset").value = game.variant;
    $("soundToggle").checked = soundEnabled;
    updatePresetVisibility();
    renderBoard();
    persist();
    scheduleAI();
  }
  function commit(move, promotion = "q") {
    stopAI();
    cancelFlight();
    const piece = R.at(game, move.x, move.y),
      captured = R.at(game, move.nx, move.ny) || move.enPassant,
      description = `${name(game.turn)} ${label(piece)} ${xy(move.x, move.y)} → ${xy(move.nx, move.ny)}`;
    const next = R.play(game, move, promotion);
    snapshots.push(game);
    records.push(
      description +
        (piece.type === "p" && next.board[move.ny][move.nx].type !== "p"
          ? ` = ${promotion.toUpperCase()}`
          : ""),
    );
    game = next;
    selected = null;
    render();
    animateMove(move, piece);
    playSound(
      game.result
        ? "win"
        : R.inCheck(game, game.turn)
          ? "check"
          : captured
            ? "capture"
            : "move",
    );
  }
  function tap(x, y) {
    if (flight) cancelFlight();
    if (game.result) return hint("对局已结束，请开始新对局");
    if (controls[game.turn] !== "human")
      return hint("当前由 AI 走棋，可切换为玩家接手");
    const p = R.at(game, x, y),
      moves = selected
        ? R.legal(game).filter(
            (m) =>
              m.x === selected.x &&
              m.y === selected.y &&
              m.nx === x &&
              m.ny === y,
          )
        : [];
    if (moves.length) {
      const m = moves[0],
        moving = R.at(game, m.x, m.y);
      if (
        moving.type === "p" &&
        game.sides[moving.side] === "western" &&
        m.ny === (moving.side === 0 ? 0 : game.height - 1)
      ) {
        const dialog = $("promotionDialog"),
          choices = $("promotionChoices");
        choices.replaceChildren();
        for (const type of ["q", "r", "b", "n"]) {
          const button = document.createElement("button");
          button.textContent = glyphs.western[moving.side][type];
          button.setAttribute(
            "aria-label",
            `升变为${{ q: "后", r: "车", b: "象", n: "马" }[type]}`,
          );
          button.onclick = () => {
            dialog.close();
            commit(m, type);
          };
          choices.append(button);
        }
        dialog.showModal();
        return;
      }
      commit(m);
      return;
    }
    if (p?.side === game.turn) {
      selected = selected?.x === x && selected?.y === y ? null : { x, y };
      renderBoard();
      if (selected && !R.legal(game).some((m) => m.x === x && m.y === y))
        hint("这枚棋子当前没有合法走法，可能被挡或需要先解将");
      else showStatus();
      return;
    }
    hint(
      selected
        ? R.explain(game, selected.x, selected.y, x, y)
        : "先选择己方棋子",
    );
  }
  function scheduleAI() {
    stopAI();
    if (paused || game.result || controls[game.turn] !== "ai") return;
    const version = generation;
    timer = setTimeout(
      () => {
        if (version !== generation) return;
        const move = R.bestMove(game, 2);
        if (move && version === generation) commit(move);
      },
      controls.every((c) => c === "ai") ? 650 : 320,
    );
  }
  load();
  $("settingsButton").onclick = () => $("settingsDialog").showModal();
  for (const id of ["boardType", "redRules", "blackRules"])
    $(id).onchange = updatePresetVisibility;
  $("soundToggle").onchange = (event) => {
    soundEnabled = event.target.checked;
    if (soundEnabled) unlockAudio();
    persist();
  };
  $("startButton").onclick = () => {
    const type = $("boardType").value,
      sides = [$("redRules").value, $("blackRules").value],
      variant = $("mixedPreset").value;
    if (game.ply && !confirm("开始新对局？当前棋局会被替换。")) return;
    stopAI();
    cancelFlight();
    unlockAudio();
    game = R.create(type, sides, variant);
    snapshots = [];
    records = [];
    selected = null;
    paused = false;
    flipped = false;
    $("settingsDialog").close();
    render();
  };
  for (const side of [0, 1])
    $(side === 0 ? "bottomControl" : "topControl").onchange = (event) => {
      controls[side] = event.target.value;
      cancelFlight();
      unlockAudio();
      paused = false;
      selected = null;
      render();
    };
  $("pauseButton").onclick = () => {
    paused = !paused;
    render();
  };
  $("undoButton").onclick = () => {
    if (!snapshots.length) return;
    stopAI();
    cancelFlight();
    game = snapshots.pop();
    records.pop();
    selected = null;
    paused = true;
    render();
  };
  $("flipButton").onclick = () => {
    cancelFlight();
    flipped = !flipped;
    render();
  };
  $("historyButton").onclick = () => $("historyDialog").showModal();
  $("closeHistory").onclick = () => $("historyDialog").close();
  $("newButton").onclick = () => {
    $("settingsDialog").showModal();
  };
  window.addEventListener("resize", drawBoard);
  render();
})();
