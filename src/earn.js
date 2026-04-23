import "./style.css";
import { initChatWidget } from "./lib/chatWidget.js";
import { initSoapBackdrop } from "./lib/soapBackdrop.js";

const wheelCanvas = document.getElementById("wheelCanvas");
const spinBtn = document.getElementById("wheelSpinBtn");
const statusEl = document.getElementById("wheelStatus");

const SECTORS = ["0", "100Q", "WL", "200Q", "NFT QM", "500Q", "NFT", "1000Q"];
const FULL_CIRCLE = Math.PI * 2;
const SECTOR_ANGLE = FULL_CIRCLE / SECTORS.length;
const centerLogo = new Image();
let centerLogoReady = false;
const CENTER_LOGO_SCALE = 1.82;
let wheelFaceCache = null;

let currentAngle = 0;
let spinInFlight = false;

centerLogo.src = "/images/tap-style-a-icon-only.svg";
centerLogo.addEventListener("load", () => {
  centerLogoReady = true;
  drawWheel(currentAngle);
});

function getWheelFace(width, height, outerR) {
  if (wheelFaceCache && wheelFaceCache.width === width && wheelFaceCache.height === height) {
    return wheelFaceCache.canvas;
  }

  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext("2d");
  if (!ctx) {
    return null;
  }

  const cx = width / 2;
  const cy = height / 2;
  ctx.translate(cx, cy);

  for (let i = 0; i < SECTORS.length; i += 1) {
    const start = i * SECTOR_ANGLE - Math.PI / 2;
    const end = start + SECTOR_ANGLE;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, outerR, start, end);
    ctx.closePath();
    const segGradient = ctx.createLinearGradient(
      Math.cos(start) * outerR,
      Math.sin(start) * outerR,
      Math.cos(end) * outerR,
      Math.sin(end) * outerR,
    );
    if (i % 2 === 0) {
      segGradient.addColorStop(0, "#ff6a2a");
      segGradient.addColorStop(0.45, "#ff3b17");
      segGradient.addColorStop(1, "#9f1c09");
    } else {
      segGradient.addColorStop(0, "#fff8f3");
      segGradient.addColorStop(1, "#ffd9c8");
    }
    ctx.fillStyle = segGradient;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(2,6,23,0.9)";
    ctx.stroke();

    const mid = start + SECTOR_ANGLE / 2;
    const tx = Math.cos(mid) * outerR * 0.72;
    const ty = Math.sin(mid) * outerR * 0.72;
    const label = SECTORS[i];
    const lines = label.includes(" ") ? label.split(" ") : [label];
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(mid + Math.PI / 2);
    ctx.fillStyle = i % 2 === 0 ? "#fffaf7" : "#190b07";
    const longestLine = lines.reduce((max, part) => Math.max(max, part.length), 0);
    const fontSize = longestLine >= 5 ? 30 : longestLine >= 4 ? 34 : 40;
    ctx.font = `700 ${fontSize}px 'Bai Jamjuree', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(1.2, fontSize * 0.07);
    ctx.strokeStyle = i % 2 === 0 ? "rgba(40, 8, 2, 0.72)" : "rgba(255, 245, 237, 0.72)";
    ctx.shadowColor = i % 2 === 0 ? "rgba(0,0,0,0.35)" : "rgba(226, 41, 1, 0.28)";
    ctx.shadowBlur = 8;
    if (lines.length === 1) {
      ctx.strokeText(lines[0], 0, 0);
      ctx.fillText(lines[0], 0, 0);
    } else {
      const lineGap = fontSize * 0.95;
      ctx.strokeText(lines[0], 0, -lineGap / 2);
      ctx.fillText(lines[0], 0, -lineGap / 2);
      ctx.strokeText(lines[1], 0, lineGap / 2);
      ctx.fillText(lines[1], 0, lineGap / 2);
    }
    ctx.restore();
  }

  wheelFaceCache = { width, height, canvas: offscreen };
  return offscreen;
}

function drawWheel(angle) {
  if (!(wheelCanvas instanceof HTMLCanvasElement)) return;
  const ctx = wheelCanvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = wheelCanvas;
  const cx = width / 2;
  const cy = height / 2;
  const outerR = Math.min(width, height) * 0.48;
  const innerR = outerR * 0.42;

  ctx.clearRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(cx, cy, innerR * 0.15, cx, cy, outerR * 1.16);
  glow.addColorStop(0, "rgba(255,82,25,0.26)");
  glow.addColorStop(0.52, "rgba(226,41,1,0.2)");
  glow.addColorStop(0.8, "rgba(120,18,18,0.14)");
  glow.addColorStop(1, "rgba(2,6,23,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR * 1.15, 0, FULL_CIRCLE);
  ctx.fill();

  const wheelFace = getWheelFace(width, height, outerR);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  if (wheelFace) {
    ctx.drawImage(wheelFace, -width / 2, -height / 2);
  }
  ctx.restore();

  // Keep center cap static while outer wheel spins.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, 0, innerR, 0, FULL_CIRCLE);
  const centerGradient = ctx.createRadialGradient(0, -innerR * 0.2, innerR * 0.1, 0, 0, innerR);
  centerGradient.addColorStop(0, "#111827");
  centerGradient.addColorStop(1, "#020617");
  ctx.fillStyle = centerGradient;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(239,68,68,0.82)";
  ctx.stroke();
  if (centerLogoReady) {
    const logoSize = innerR * CENTER_LOGO_SCALE;
    const logoX = -logoSize / 2;
    const logoY = -logoSize / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, innerR * 0.84, 0, FULL_CIRCLE);
    ctx.clip();
    ctx.drawImage(centerLogo, logoX, logoY, logoSize, logoSize);
    ctx.restore();
  } else {
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "700 48px 'Bai Jamjuree', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SPIN", 0, 6);
  }
  ctx.restore();
}

function sectorAtPointer(angle) {
  // Sector 0 starts at top boundary when angle = 0.
  const normalized = ((-angle % FULL_CIRCLE) + FULL_CIRCLE) % FULL_CIRCLE;
  const idx = Math.floor(normalized / SECTOR_ANGLE) % SECTORS.length;
  return idx;
}

async function spinWheel() {
  if (spinInFlight || !(spinBtn instanceof HTMLButtonElement)) return;
  spinInFlight = true;
  spinBtn.disabled = true;

  const targetAngle = FULL_CIRCLE * (4 + Math.random() * 2) + Math.random() * FULL_CIRCLE;
  const startAngle = currentAngle;
  const duration = 3000;
  const start = performance.now();

  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const ease = 1 - (1 - t) ** 4;
    currentAngle = startAngle + (targetAngle - startAngle) * ease;
    drawWheel(currentAngle);
    if (t < 1) {
      requestAnimationFrame(tick);
      return;
    }
    currentAngle %= FULL_CIRCLE;
    const landedIndex = sectorAtPointer(currentAngle);
    if (statusEl) {
      statusEl.textContent = `Выпало число: ${SECTORS[landedIndex]}`;
    }
    spinInFlight = false;
    spinBtn.disabled = false;
  };

  requestAnimationFrame(tick);
}

spinBtn?.addEventListener("click", () => {
  void spinWheel();
});

drawWheel(currentAngle);
initSoapBackdrop(document.getElementById("soapBackdrop"));
initChatWidget();
