import "./style.css";
import { initChatWidget } from "./lib/chatWidget.js";

const SYMBOLS = ["🍒", "🍋", "🍎", "🍐", "🍉", "🍸", "🎰", "🍑", "🍓"];
const WILD_SYMBOL = "🍸";
const LOGO_SYMBOL = "🎰";
const SCATTER_SYMBOL = "🍓";
const BONUS_CENTER_SYMBOLS = ["🍒", "🍋", "🍎", "🍐", "🍉", "🍑"];
const BONUS_RING = [
  "🍒",
  "🍑",
  "🍋",
  "EXIT",
  "🍎",
  "🍐",
  "🍉",
  "EXIT",
  "🍒",
  "🍑",
  "🍋",
  "EXIT",
  "🍎",
  "🍐",
  "🍉",
  "EXIT",
];
const BONUS_MULTIPLIERS = {
  "🍒": 2,
  "🍑": 3,
  "🍋": 5,
  "🍎": 10,
  "🍐": 20,
  "🍉": 100,
};
const PAY_3 = { "🎰": 200, "🍸": 100, "🍉": 30, "🍐": 20, "🍎": 10, "🍋": 5, "🍑": 3, "🍒": 2 };
const PAY_4 = { "🎰": 1000, "🍸": 500, "🍉": 100, "🍐": 50, "🍎": 30, "🍋": 10, "🍑": 5, "🍒": 3 };
const PAY_5 = { "🎰": 5000, "🍸": 2000, "🍉": 500, "🍐": 200, "🍎": 100, "🍋": 50, "🍑": 20, "🍒": 10 };
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
const BET_OPTIONS = [1, 2, 3, 4, 5, 10, 20, 25];
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
const combosEl = document.getElementById("fruitCombos");
const betCycleBtn = document.getElementById("fruitBetCycle");
const autoCycleBtn = document.getElementById("fruitAutoCycle");
const linesCycleBtn = document.getElementById("fruitLinesCycle");
const riskBtn = document.getElementById("fruitRiskBtn");
const spinBtn = document.getElementById("fruitSpinBtn");
const autoBtn = document.getElementById("fruitAutoBtn");
const soundBtn = document.getElementById("fruitSoundBtn");
const turboBtn = document.getElementById("fruitTurboBtn");
const reelsWrapEl = document.getElementById("fruitReels");
const linesCanvasEl = document.getElementById("fruitLinesCanvas");
const riskModal = document.getElementById("riskModal");
const riskDealerEl = document.getElementById("riskDealer");
const riskStatusEl = document.getElementById("riskStatus");
const riskCardsEl = document.getElementById("riskCards");
const riskCloseBtn = document.getElementById("riskCloseBtn");
const bonusModal = document.getElementById("bonusModal");
const bonusLivesEl = document.getElementById("bonusLives");
const bonusCenterEl = document.getElementById("bonusCenter");
const bonusRingEl = document.getElementById("bonusRing");
const bonusSpinBtn = document.getElementById("bonusSpinBtn");
const bonusCloseBtn = document.getElementById("bonusCloseBtn");
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
let betValue = 1;
let autoCountValue = 0;
let linesValue = 1;
let linesPreviewTimerId = null;
let lastWinningCombos = [];
let lastRoundWin = 0;
let bonusLives = 0;
let bonusSpinInFlight = false;

function randomSymbol() {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

function parseBet() {
  return Number(betValue) || 1;
}

function parseAutoCount() {
  return Math.max(0, Math.min(100, Math.floor(Number(autoCountValue) || 0)));
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
      const next = getCell(grid, r, line[r]);
      // Wild substitutes fruits but not logo/scatter.
      const canWildSub =
        first !== LOGO_SYMBOL &&
        first !== SCATTER_SYMBOL &&
        (next === WILD_SYMBOL || next === first);
      const strictMatch = next === first;
      if (strictMatch || canWildSub) {
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
  const combos = [];
  const leftPay = payoutFor(left.symbol, left.count);
  if (leftPay > 0) {
    combos.push({
      symbol: left.symbol,
      count: left.count,
      direction: "L→R",
      payout: leftPay,
    });
  }
  const rightPay = payoutFor(right.symbol, right.count);
  if (rightPay > 0) {
    combos.push({
      symbol: right.symbol,
      count: right.count,
      direction: "R→L",
      payout: rightPay,
    });
  }
  return combos;
}

function calcWin(grid, totalBet, linesCount) {
  const activeIndexes = ACTIVE_LINE_INDEXES[linesCount] || ACTIVE_LINE_INDEXES[1];
  const betPerLine = Math.max(1, Math.floor(totalBet / activeIndexes.length));
  let sum = 0;
  const combos = [];
  for (const lineIdx of activeIndexes) {
    const line = PAYLINES[lineIdx];
    if (!line) {
      continue;
    }
    const lineCombos = calcLineWin(line, grid, betPerLine);
    for (const combo of lineCombos) {
      combos.push({ ...combo, line: lineIdx + 1 });
      sum += combo.payout;
    }
  }
  return { total: sum, combos };
}

function drawRiskCards() {
  if (!riskCardsEl) return;
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const dealer = values[Math.floor(Math.random() * values.length)];
  if (riskDealerEl) riskDealerEl.textContent = `Dealer: ${dealer}`;
  if (riskStatusEl) riskStatusEl.textContent = "Choose one closed card.";
  riskCardsEl.innerHTML = "";
  for (let i = 0; i < 4; i += 1) {
    const v = values[Math.floor(Math.random() * values.length)];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "earn-cycle-btn";
    btn.textContent = "?";
    btn.addEventListener("click", () => {
      btn.textContent = String(v);
      if (v > dealer) {
        lastRoundWin *= 2;
        balance += lastRoundWin;
        if (riskStatusEl) riskStatusEl.textContent = `Win! x2 -> +${lastRoundWin}`;
      } else if (v < dealer) {
        if (riskStatusEl) riskStatusEl.textContent = "Lose! Round win burned.";
        lastRoundWin = 0;
      } else if (riskStatusEl) {
        riskStatusEl.textContent = "Tie. Try again.";
      }
      updateUi();
    });
    riskCardsEl.append(btn);
  }
}

function openRisk() {
  if (!riskModal || lastRoundWin <= 0) {
    if (statusEl) statusEl.textContent = "Need a win first to use Risk.";
    return;
  }
  riskModal.hidden = false;
  drawRiskCards();
}

function closeRisk() {
  if (riskModal) riskModal.hidden = true;
}

function openBonus(scatterCount, totalBet) {
  if (!bonusModal) return;
  bonusLives = scatterCount >= 5 ? 3 : scatterCount >= 4 ? 2 : 1;
  if (bonusLivesEl) bonusLivesEl.textContent = `Lives: ${bonusLives}`;
  const bonusCenterSymbols = [
    BONUS_CENTER_SYMBOLS[Math.floor(Math.random() * BONUS_CENTER_SYMBOLS.length)],
    BONUS_CENTER_SYMBOLS[Math.floor(Math.random() * BONUS_CENTER_SYMBOLS.length)],
    BONUS_CENTER_SYMBOLS[Math.floor(Math.random() * BONUS_CENTER_SYMBOLS.length)],
  ];
  if (bonusCenterEl) bonusCenterEl.textContent = bonusCenterSymbols.join(" ");
  if (bonusRingEl) {
    bonusRingEl.innerHTML = "";
    for (const s of BONUS_RING) {
      const n = document.createElement("span");
      n.className = "earn-combos__item";
      n.textContent = s;
      bonusRingEl.append(n);
    }
  }
  bonusModal.hidden = false;
  if (!bonusSpinBtn) {
    return;
  }
  bonusSpinBtn.onclick = async () => {
    if (bonusSpinInFlight || !bonusRingEl) {
      return;
    }
    bonusSpinInFlight = true;
    bonusSpinBtn.disabled = true;

    const ringItems = Array.from(bonusRingEl.children);
    let pointer = Math.floor(Math.random() * BONUS_RING.length);
    const hops = 18 + Math.floor(Math.random() * 10);
    for (let i = 0; i < hops; i += 1) {
      pointer = (pointer + 1) % BONUS_RING.length;
      ringItems.forEach((el) => el.classList.remove("earn-combos__item--active"));
      ringItems[pointer]?.classList.add("earn-combos__item--active");
      // eslint-disable-next-line no-await-in-loop
      await sleep(45 + i * 3);
    }

    const landed = BONUS_RING[pointer];
    if (landed === "EXIT") {
      bonusLives -= 1;
      if (bonusLivesEl) bonusLivesEl.textContent = `Lives: ${bonusLives}`;
      if (statusEl) statusEl.textContent = `Bonus hit EXIT. Lives left: ${bonusLives}`;
      if (bonusLives <= 0) {
        bonusModal.hidden = true;
      }
    } else {
      const matched = bonusCenterSymbols.includes(landed);
      if (matched) {
        const mult = BONUS_MULTIPLIERS[landed] || 2;
        const gain = totalBet * mult;
        balance += gain;
        if (statusEl) statusEl.textContent = `Bonus ${landed} x${mult}: +${gain}`;
      } else if (statusEl) {
        statusEl.textContent = `Bonus missed (${landed}). Spin again or exit.`;
      }
      updateUi();
    }

    bonusSpinInFlight = false;
    bonusSpinBtn.disabled = false;
  };
}

function closeBonus() {
  if (bonusModal) {
    bonusModal.hidden = true;
  }
  bonusSpinInFlight = false;
  if (bonusSpinBtn) {
    bonusSpinBtn.disabled = false;
  }
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
  if (riskBtn) {
    riskBtn.disabled = spinInFlight || lastRoundWin <= 0;
  }
  if (betCycleBtn) {
    betCycleBtn.textContent = `Bet: ${bet}`;
    betCycleBtn.title = "Tap to change";
  }
  if (linesCycleBtn) {
    linesCycleBtn.textContent = `${lines} Line${lines > 1 ? "s" : ""}`;
    linesCycleBtn.title = "Tap to change";
  }
  if (combosEl) {
    if (!lastWinningCombos.length) {
      combosEl.innerHTML =
        '<li class="earn-combos__empty">Winning combinations will appear here</li>';
    } else {
      combosEl.innerHTML = "";
      for (const combo of lastWinningCombos) {
        const item = document.createElement("li");
        item.className = "earn-combos__item";
        if (combo.scatter) {
          item.textContent = `${combo.symbol} scatter x${combo.count} = +${combo.payout}`;
        } else {
          item.textContent = `Line ${combo.line} · ${combo.symbol} x${combo.count} (${combo.direction}) = +${combo.payout}`;
        }
        combosEl.append(item);
      }
    }
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

  const winData = calcWin(grid, totalBet, lines);
  lastWin = winData.total;
  lastRoundWin = winData.total;
  lastWinningCombos = winData.combos;
  balance += winData.total;
  if (statusEl) {
    const scatterCount = grid.reduce(
      (acc, symbol) => (symbol === SCATTER_SYMBOL ? acc + 1 : acc),
      0,
    );
    if (winData.total > 0 && scatterCount >= 3) {
      statusEl.textContent = `Win +${winData.total}! Scatter x${scatterCount}`;
    } else {
      statusEl.textContent = winData.total > 0 ? `Win +${winData.total}!` : "No win";
    }
  }
  if (winData.total > 0) {
    beep(740, 0.12, 0.055);
    beep(980, 0.15, 0.04);
  } else {
    beep(180, 0.08, 0.03);
  }
  const scatterCount = grid.reduce(
    (acc, symbol) => (symbol === SCATTER_SYMBOL ? acc + 1 : acc),
    0,
  );
  if (scatterCount >= 3) {
    openBonus(scatterCount, totalBet);
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
    autoLeft = Math.max(1, parseAutoCount());
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
  const idx = BET_OPTIONS.indexOf(parseBet());
  const next = idx >= 0 ? (idx + 1) % BET_OPTIONS.length : 0;
  betValue = BET_OPTIONS[next];
  updateUi();
});
autoCycleBtn?.addEventListener("click", () => {
  autoCountValue = parseAutoCount() >= 25 ? 0 : parseAutoCount() + 5;
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
riskBtn?.addEventListener("click", openRisk);
riskCloseBtn?.addEventListener("click", closeRisk);
bonusCloseBtn?.addEventListener("click", closeBonus);
bonusModal?.addEventListener("click", (event) => {
  if (event.target === bonusModal) {
    closeBonus();
  }
});
riskModal?.addEventListener("click", (event) => {
  if (event.target === riskModal) {
    closeRisk();
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeBonus();
    closeRisk();
  }
});

updateUi();
initChatWidget();

window.addEventListener("resize", () => {
  if (linesPreviewTimerId != null) {
    showPaylinesPreview();
  }
});
