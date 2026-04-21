import "./style.css";
import { initChatWidget } from "./lib/chatWidget.js";

const SYMBOLS = ["🍒", "🍋", "🍊", "🍇", "🍉", "🔔", "⭐", "Q", "🍓"];
const PAY_3 = { "🍒": 4, "🍋": 5, "🍊": 6, "🍇": 7, "🍉": 10, "🔔": 14, "⭐": 20, Q: 35 };
const PAY_4 = { "🍒": 8, "🍋": 10, "🍊": 12, "🍇": 14, "🍉": 20, "🔔": 30, "⭐": 45, Q: 70 };
const PAY_5 = { "🍒": 16, "🍋": 20, "🍊": 24, "🍇": 30, "🍉": 42, "🔔": 70, "⭐": 120, Q: 180 };
const SCATTER_SYMBOL = "🍓";
const SCATTER_PAYS = { 3: 20, 4: 60, 5: 200 };
const PAYLINES = [
  [1, 1, 1, 1, 1], // center
  [0, 0, 0, 0, 0], // top
  [2, 2, 2, 2, 2], // bottom
  [0, 1, 2, 1, 0], // V
  [2, 1, 0, 1, 2], // ^
  [0, 1, 0, 1, 0], // zig-zag top
  [2, 1, 2, 1, 2], // zig-zag bottom
  [1, 0, 1, 2, 1], // zig-zag down
  [1, 2, 1, 0, 1], // zig-zag up
];
const REELS = 5;
const ROWS = 3;
const AUTO_DELAY_MS = 750;
const NORMAL_STEP_MS = 80;
const NORMAL_TOTAL_MS = 900;
const TURBO_STEP_MS = 35;
const TURBO_TOTAL_MS = 360;
const LINES_OPTIONS = [1, 3, 5, 7, 9];
const ACTIVE_LINE_INDEXES = {
  1: [0],
  3: [0, 1, 2],
  5: [0, 1, 2, 3, 4],
  7: [0, 1, 2, 3, 4, 5, 6],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};

const balanceEl = document.getElementById("fruitBalance");
const lastWinEl = document.getElementById("fruitLastWin");
const statusEl = document.getElementById("fruitStatus");
const betCycleBtn = document.getElementById("fruitBetCycle");
const autoCycleBtn = document.getElementById("fruitAutoCycle");
const linesCycleBtn = document.getElementById("fruitLinesCycle");
const spinBtn = document.getElementById("fruitSpinBtn");
const autoBtn = document.getElementById("fruitAutoBtn");
const soundBtn = document.getElementById("fruitSoundBtn");
const turboBtn = document.getElementById("fruitTurboBtn");
const reelsWrapEl = document.getElementById("fruitReels");
const linesCanvasEl = document.getElementById("fruitLinesCanvas");
const reelEls = Array.from({ length: REELS * ROWS }, (_, idx) =>
  document.getElementById(`cell-${idx}`),
);

let balance = 1000;
let lastWin = 0;
let spinInFlight = false;
let autoEnabled = false;
let autoTimerId = null;
let autoLeft = 0;
let soundEnabled = true;
let turboEnabled = false;
let audioCtx = null;
let betValue = 10;
let autoCountValue = 25;
let linesValue = 1;
let linesPreviewTimerId = null;

function randomSymbol() {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

function parseBet() {
  return Math.max(1, Math.min(200, Math.floor(Number(betValue) || 0)));
}

function parseAutoCount() {
  return Math.max(5, Math.min(200, Math.floor(Number(autoCountValue) || 25)));
}

function parseLines() {
  const v = Number(linesValue);
  if (!Number.isFinite(v)) {
    return LINES_OPTIONS[0];
  }
  if (LINES_OPTIONS.includes(v)) {
    return v;
  }
  return LINES_OPTIONS[0];
}

function ensureAudioContext() {
  if (audioCtx) {
    return audioCtx;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    return null;
  }
  audioCtx = new Ctx();
  return audioCtx;
}

function beep(freq, duration, gain = 0.05) {
  if (!soundEnabled) {
    return;
  }
  const ctx = ensureAudioContext();
  if (!ctx) {
    return;
  }
  const osc = ctx.createOscillator();
  const volume = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  volume.gain.value = gain;
  osc.connect(volume);
  volume.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function getCell(grid, reel, row) {
  // Grid in DOM is row-major: [row0 reel0..4, row1 reel0..4, row2 reel0..4]
  return grid[row * REELS + reel];
}

function calcLineWin(line, grid, betPerLine) {
  const countFrom = (fromLeft) => {
    const reelStart = fromLeft ? 0 : REELS - 1;
    const step = fromLeft ? 1 : -1;
    const first = getCell(grid, reelStart, line[reelStart]);
    if (!first || first === SCATTER_SYMBOL) {
      return { symbol: first, count: 0 };
    }
    let count = 1;
    for (let r = reelStart + step; r >= 0 && r < REELS; r += step) {
      if (getCell(grid, r, line[r]) === first) {
        count += 1;
      } else {
        break;
      }
    }
    return { symbol: first, count };
  };

  const payoutFor = (symbol, count) => {
    if (count >= 5) return (PAY_5[symbol] || 0) * betPerLine;
    if (count >= 4) return (PAY_4[symbol] || 0) * betPerLine;
    if (count >= 3) return (PAY_3[symbol] || 0) * betPerLine;
    return 0;
  };

  const left = countFrom(true);
  const right = countFrom(false);
  // Igrosoft-like behavior: each direction is checked independently.
  return payoutFor(left.symbol, left.count) + payoutFor(right.symbol, right.count);
}

function calcWin(grid, totalBet, linesCount) {
  const activeIndexes = ACTIVE_LINE_INDEXES[linesCount] || ACTIVE_LINE_INDEXES[1];
  const betPerLine = Math.max(1, Math.floor(totalBet / activeIndexes.length));
  let sum = 0;
  for (const lineIdx of activeIndexes) {
    const line = PAYLINES[lineIdx];
    if (!line) {
      continue;
    }
    sum += calcLineWin(line, grid, betPerLine);
  }
  // Scatter payout works regardless of active line geometry.
  const scatterCount = grid.reduce(
    (acc, symbol) => (symbol === SCATTER_SYMBOL ? acc + 1 : acc),
    0,
  );
  const scatterMult =
    scatterCount >= 5 ? SCATTER_PAYS[5] : scatterCount >= 4 ? SCATTER_PAYS[4] : scatterCount >= 3 ? SCATTER_PAYS[3] : 0;
  if (scatterMult > 0) {
    sum += scatterMult * betPerLine;
  }
  return sum;
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function renderGrid(grid) {
  reelEls.forEach((el, idx) => {
    if (el) {
      const symbol = grid[idx];
      el.textContent = symbol;
      el.classList.toggle("earn-reel--quai", symbol === "Q");
    }
  });
}

function randomGrid() {
  return Array.from({ length: REELS * ROWS }, () => randomSymbol());
}

function lineColor(index) {
  const colors = [
    "#22d3ee",
    "#f59e0b",
    "#a78bfa",
    "#f43f5e",
    "#34d399",
    "#fb7185",
    "#60a5fa",
    "#f97316",
    "#4ade80",
    "#c084fc",
  ];
  return colors[index % colors.length];
}

function drawActivePaylines(linesCount) {
  if (!reelsWrapEl || !linesCanvasEl) {
    return;
  }
  const rect = reelsWrapEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));
  linesCanvasEl.width = Math.floor(cssW * dpr);
  linesCanvasEl.height = Math.floor(cssH * dpr);
  const ctx = linesCanvasEl.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const activeIndexes = ACTIVE_LINE_INDEXES[linesCount] || ACTIVE_LINE_INDEXES[1];
  for (let i = 0; i < activeIndexes.length; i += 1) {
    const payline = PAYLINES[activeIndexes[i]];
    if (!payline) {
      continue;
    }
    ctx.beginPath();
    for (let reel = 0; reel < REELS; reel += 1) {
      const row = payline[reel];
      const idx = row * REELS + reel;
      const cell = reelEls[idx];
      if (!cell) {
        continue;
      }
      const cellRect = cell.getBoundingClientRect();
      const x = cellRect.left - rect.left + cellRect.width / 2;
      const y = cellRect.top - rect.top + cellRect.height / 2;
      if (reel === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = lineColor(i);
    ctx.lineWidth = 2.2;
    ctx.globalAlpha = 0.95;
    ctx.stroke();
  }
}

function clearPaylinesOverlay() {
  if (!linesCanvasEl) {
    return;
  }
  const ctx = linesCanvasEl.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, linesCanvasEl.width, linesCanvasEl.height);
}

function showPaylinesPreview() {
  drawActivePaylines(parseLines());
  if (linesPreviewTimerId != null) {
    window.clearTimeout(linesPreviewTimerId);
  }
  linesPreviewTimerId = window.setTimeout(() => {
    clearPaylinesOverlay();
    linesPreviewTimerId = null;
  }, 180);
}

async function animateReels() {
  const stepMs = turboEnabled ? TURBO_STEP_MS : NORMAL_STEP_MS;
  const totalMs = turboEnabled ? TURBO_TOTAL_MS : NORMAL_TOTAL_MS;
  const cycles = Math.floor(totalMs / stepMs);
  for (let i = 0; i < cycles; i += 1) {
    renderGrid(randomGrid());
    beep(280 + (i % 4) * 45, 0.06, 0.025);
    await sleep(stepMs);
  }
}

function updateUi() {
  if (balanceEl) {
    balanceEl.textContent = `Balance: ${balance}`;
  }
  if (lastWinEl) {
    lastWinEl.textContent = `Last win: ${lastWin}`;
  }
  const bet = parseBet();
  const lines = parseLines();
  const totalBet = bet * lines;
  const blocked = spinInFlight || balance < totalBet;
  if (spinBtn) {
    spinBtn.disabled = blocked;
  }
  if (autoBtn) {
    autoBtn.disabled = spinInFlight;
    autoBtn.textContent = autoEnabled ? `Auto: ON (${autoLeft})` : "Auto: OFF";
  }
  if (soundBtn) {
    soundBtn.textContent = `Sound: ${soundEnabled ? "ON" : "OFF"}`;
  }
  if (turboBtn) {
    turboBtn.textContent = `Turbo: ${turboEnabled ? "ON" : "OFF"}`;
  }
  if (betCycleBtn) {
    betCycleBtn.textContent = `Bet: ${bet}`;
    betCycleBtn.title = "Tap to change";
  }
  if (autoCycleBtn) {
    autoCycleBtn.textContent = `Auto spins: ${parseAutoCount()}`;
    autoCycleBtn.title = "Tap to change";
  }
  if (linesCycleBtn) {
    linesCycleBtn.textContent = `Lines: ${lines}`;
    linesCycleBtn.title = "Tap to change";
  }
}

async function spinOnce() {
  if (spinInFlight) {
    return;
  }
  const bet = parseBet();
  const lines = parseLines();
  const totalBet = bet * lines;
  if (balance < totalBet) {
    if (statusEl) {
      statusEl.textContent = "Not enough balance for this bet.";
    }
    stopAuto();
    updateUi();
    return;
  }

  spinInFlight = true;
  updateUi();
  balance -= totalBet;
  if (statusEl) {
    statusEl.textContent = `Spinning... Bet ${totalBet} (${lines} lines)`;
  }

  await animateReels();
  const grid = randomGrid();
  renderGrid(grid);

  const win = calcWin(grid, totalBet, lines);
  lastWin = win;
  balance += win;
  if (statusEl) {
    const scatterCount = grid.reduce(
      (acc, symbol) => (symbol === SCATTER_SYMBOL ? acc + 1 : acc),
      0,
    );
    if (win > 0 && scatterCount >= 3) {
      statusEl.textContent = `Win +${win}! Scatter x${scatterCount}`;
    } else {
      statusEl.textContent = win > 0 ? `Win +${win}!` : "No win";
    }
  }
  if (win > 0) {
    beep(740, 0.12, 0.055);
    beep(980, 0.15, 0.04);
  } else {
    beep(180, 0.08, 0.03);
  }

  spinInFlight = false;
  updateUi();

  if (autoEnabled) {
    autoLeft = Math.max(0, autoLeft - 1);
    if (autoLeft <= 0) {
      stopAuto();
      if (statusEl) {
        statusEl.textContent = "Auto-spin finished.";
      }
      updateUi();
      return;
    }
    autoTimerId = window.setTimeout(() => {
      void spinOnce();
    }, AUTO_DELAY_MS);
  }
}

function stopAuto() {
  autoEnabled = false;
  autoLeft = 0;
  if (autoTimerId != null) {
    window.clearTimeout(autoTimerId);
    autoTimerId = null;
  }
}

spinBtn?.addEventListener("click", () => {
  const ctx = ensureAudioContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
  void spinOnce();
});

autoBtn?.addEventListener("click", () => {
  const ctx = ensureAudioContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
  if (autoEnabled) {
    stopAuto();
  } else {
    autoEnabled = true;
    autoLeft = parseAutoCount();
  }
  if (autoEnabled && !spinInFlight) {
    void spinOnce();
  }
  updateUi();
});

soundBtn?.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  const ctx = ensureAudioContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
  updateUi();
});

turboBtn?.addEventListener("click", () => {
  turboEnabled = !turboEnabled;
  updateUi();
});

betCycleBtn?.addEventListener("click", () => {
  betValue = parseBet() >= 25 ? 5 : parseBet() + 5;
  updateUi();
});
autoCycleBtn?.addEventListener("click", () => {
  autoCountValue = parseAutoCount() >= 25 ? 5 : parseAutoCount() + 5;
  updateUi();
});
linesCycleBtn?.addEventListener("click", () => {
  const current = parseLines();
  const idx = LINES_OPTIONS.indexOf(current);
  const nextIdx = idx >= 0 ? (idx + 1) % LINES_OPTIONS.length : 0;
  linesValue = LINES_OPTIONS[nextIdx];
  showPaylinesPreview();
  updateUi();
});

updateUi();
initChatWidget();

window.addEventListener("resize", () => {
  if (linesPreviewTimerId != null) {
    showPaylinesPreview();
  }
});
