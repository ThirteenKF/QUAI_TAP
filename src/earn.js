import "./style.css";

const SYMBOLS = ["🍒", "🍋", "🍊", "🍇", "🍉", "🔔", "⭐"];
const PAY_3 = { "🍒": 4, "🍋": 5, "🍊": 6, "🍇": 7, "🍉": 10, "🔔": 14, "⭐": 20 };
const PAY_4 = { "🍒": 8, "🍋": 10, "🍊": 12, "🍇": 14, "🍉": 20, "🔔": 30, "⭐": 45 };
const PAY_5 = { "🍒": 16, "🍋": 20, "🍊": 24, "🍇": 30, "🍉": 42, "🔔": 70, "⭐": 120 };
const PAYLINES = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 1, 1, 2],
];
const REELS = 5;
const ROWS = 3;
const AUTO_DELAY_MS = 750;
const NORMAL_STEP_MS = 80;
const NORMAL_TOTAL_MS = 900;
const TURBO_STEP_MS = 35;
const TURBO_TOTAL_MS = 360;

const balanceEl = document.getElementById("fruitBalance");
const lastWinEl = document.getElementById("fruitLastWin");
const statusEl = document.getElementById("fruitStatus");
const betEl = document.getElementById("fruitBet");
const autoCountEl = document.getElementById("fruitAutoCount");
const linesEl = document.getElementById("fruitLines");
const spinBtn = document.getElementById("fruitSpinBtn");
const autoBtn = document.getElementById("fruitAutoBtn");
const soundBtn = document.getElementById("fruitSoundBtn");
const turboBtn = document.getElementById("fruitTurboBtn");
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

function randomSymbol() {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

function parseBet() {
  const raw = Number(betEl?.value ?? 0);
  if (!Number.isFinite(raw)) {
    return 0;
  }
  return Math.max(1, Math.min(200, Math.floor(raw)));
}

function parseAutoCount() {
  const raw = Number(autoCountEl?.value ?? 0);
  if (!Number.isFinite(raw)) {
    return 25;
  }
  return Math.max(5, Math.min(200, Math.floor(raw)));
}

function parseLines() {
  const raw = Number(linesEl?.value ?? 10);
  if (!Number.isFinite(raw)) {
    return 10;
  }
  return Math.max(1, Math.min(10, Math.floor(raw)));
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
  return grid[reel * ROWS + row];
}

function calcLineWin(line, grid, betPerLine) {
  const first = getCell(grid, 0, line[0]);
  let count = 1;
  for (let reel = 1; reel < REELS; reel += 1) {
    if (getCell(grid, reel, line[reel]) === first) {
      count += 1;
    } else {
      break;
    }
  }
  if (count >= 5) return (PAY_5[first] || 0) * betPerLine;
  if (count >= 4) return (PAY_4[first] || 0) * betPerLine;
  if (count >= 3) return (PAY_3[first] || 0) * betPerLine;
  return 0;
}

function calcWin(grid, totalBet, linesCount) {
  const betPerLine = Math.max(1, Math.floor(totalBet / linesCount));
  let sum = 0;
  for (let i = 0; i < linesCount; i += 1) {
    sum += calcLineWin(PAYLINES[i], grid, betPerLine);
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
    if (el) el.textContent = grid[idx];
  });
}

function randomGrid() {
  return Array.from({ length: REELS * ROWS }, () => randomSymbol());
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
    statusEl.textContent = win > 0 ? `Win +${win}!` : "No win";
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

betEl?.addEventListener("input", () => {
  const bet = parseBet();
  betEl.value = String(bet);
  updateUi();
});

autoCountEl?.addEventListener("input", () => {
  const count = parseAutoCount();
  autoCountEl.value = String(count);
  updateUi();
});

linesEl?.addEventListener("input", () => {
  const lines = parseLines();
  linesEl.value = String(lines);
  updateUi();
});

updateUi();
