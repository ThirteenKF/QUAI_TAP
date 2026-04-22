import "./style.css";
import { initChatWidget } from "./lib/chatWidget.js";

const wheelCanvas = document.getElementById("wheelCanvas");
const spinBtn = document.getElementById("wheelSpinBtn");
const statusEl = document.getElementById("wheelStatus");

const SECTORS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const COLORS = ["#dc2626", "#0ea5e9"];
const FULL_CIRCLE = Math.PI * 2;
const SECTOR_ANGLE = FULL_CIRCLE / SECTORS.length;

let currentAngle = 0;
let spinInFlight = false;

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
  const glow = ctx.createRadialGradient(cx, cy, innerR * 0.2, cx, cy, outerR * 1.1);
  glow.addColorStop(0, "rgba(14,165,233,0.22)");
  glow.addColorStop(0.6, "rgba(220,38,38,0.16)");
  glow.addColorStop(1, "rgba(2,6,23,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR * 1.15, 0, FULL_CIRCLE);
  ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

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
      segGradient.addColorStop(0, "#ef4444");
      segGradient.addColorStop(1, "#991b1b");
    } else {
      segGradient.addColorStop(0, "#22d3ee");
      segGradient.addColorStop(1, "#1d4ed8");
    }
    ctx.fillStyle = segGradient;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "rgba(2,6,23,0.9)";
    ctx.stroke();

    const mid = start + SECTOR_ANGLE / 2;
    const tx = Math.cos(mid) * outerR * 0.72;
    const ty = Math.sin(mid) * outerR * 0.72;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(mid + Math.PI / 2);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "700 40px 'Bai Jamjuree', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(SECTORS[i], 0, 0);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, innerR, 0, FULL_CIRCLE);
  const centerGradient = ctx.createRadialGradient(0, -innerR * 0.2, innerR * 0.1, 0, 0, innerR);
  centerGradient.addColorStop(0, "#111827");
  centerGradient.addColorStop(1, "#020617");
  ctx.fillStyle = centerGradient;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(125,211,252,0.85)";
  ctx.stroke();
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 48px 'Bai Jamjuree', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SPIN", 0, 6);

  ctx.restore();
}

function sectorAtPointer(angle) {
  const normalized = ((Math.PI * 1.5 - angle) % FULL_CIRCLE + FULL_CIRCLE) % FULL_CIRCLE;
  const idx = Math.floor(normalized / SECTOR_ANGLE) % SECTORS.length;
  return idx;
}

async function spinWheel() {
  if (spinInFlight || !(spinBtn instanceof HTMLButtonElement)) return;
  spinInFlight = true;
  spinBtn.disabled = true;

  const targetIndex = Math.floor(Math.random() * SECTORS.length);
  const targetAngle =
    FULL_CIRCLE * (4 + Math.random() * 2) + (Math.PI * 1.5 - (targetIndex + 0.5) * SECTOR_ANGLE);
  const startAngle = currentAngle;
  const duration = 4200;
  const start = performance.now();

  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const ease = 1 - (1 - t) ** 3;
    currentAngle = startAngle + (targetAngle - startAngle) * ease;
    drawWheel(currentAngle);
    if (t < 1) {
      requestAnimationFrame(tick);
      return;
    }
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
initChatWidget();
