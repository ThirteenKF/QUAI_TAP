/**
 * Атмосферный фон в духе soap.qu.ai: тёплый чёрный + медленные Quai-красные «прожекторы».
 */

const SOAP_BASE = "#0b0201";
const BLOBS = [
  { amp: 0.36, fx: 0.082, fy: 0.125, phase: 0, rScale: 0.92, core: [226, 41, 1], midA: 0.075, edge: [120, 24, 12] },
  { amp: 0.34, fx: 0.1, fy: 0.092, phase: 1.7, rScale: 0.78, core: [255, 85, 45], midA: 0.052, edge: [80, 20, 10] },
  { amp: 0.38, fx: 0.072, fy: 0.115, phase: 3.1, rScale: 0.85, core: [200, 35, 18], midA: 0.063, edge: [60, 15, 8] },
  { amp: 0.32, fx: 0.095, fy: 0.082, phase: 4.4, rScale: 0.7, core: [255, 60, 30], midA: 0.04, edge: [50, 12, 6] },
];

/**
 * @param {HTMLElement | null} host
 */
export function initSoapBackdrop(host) {
  if (!host) {
    return;
  }

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const canvas = document.createElement("canvas");
  canvas.className = "soap-backdrop__canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;
  let raf = 0;
  let running = !prefersReduced;

  function resize() {
    dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawGrid() {
    const step = Math.max(48, Math.min(w, h) / 14);
    const ox = (t * 5.1) % step;
    const oy = (t * 2.85 + step * 0.31) % step;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.028)";
    ctx.lineWidth = 1;
    for (let x = -step + ox; x < w + step; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = -step + oy; y < h + step; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255, 240, 235, 0.018)";
    const step2 = step * 1.12;
    const ox2 = (t * 1.45 + step * 0.5) % step2;
    const oy2 = (t * 3.55) % step2;
    for (let x = -step2 + ox2; x < w + step2; x += step2) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = -step2 + oy2; y < h + step2; y += step2) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawVignette() {
    const m = Math.min(w, h);
    const cx = w * (0.5 + 0.038 * Math.sin(t * 0.125 + 0.4));
    const cy = h * (0.44 + 0.03 * Math.cos(t * 0.102 + 1.1));
    const g = ctx.createRadialGradient(
      cx,
      cy,
      m * 0.11,
      w * 0.5 + m * 0.016 * Math.sin(t * 0.082),
      h * 0.5 + m * 0.014 * Math.cos(t * 0.09),
      Math.max(w, h) * (0.7 + 0.052 * Math.sin(t * 0.058)),
    );
    g.addColorStop(0, "rgba(0, 0, 0, 0)");
    g.addColorStop(0.55, "rgba(0, 0, 0, 0.14)");
    g.addColorStop(1, "rgba(0, 0, 0, 0.58)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawBlobs() {
    const m = Math.min(w, h);
    const baseR = m * 0.55;
    for (const b of BLOBS) {
      const nx =
        0.5 +
        b.amp *
          (0.88 * Math.sin(t * b.fx + b.phase) +
            0.12 * Math.sin(t * b.fx * 2.4 + b.phase));
      const ny =
        0.5 +
        b.amp *
          (0.9 * Math.cos(t * b.fy + b.phase * 1.15) +
            0.1 * Math.cos(t * b.fy * 1.6 + b.phase * 2));
      const driftX =
        m * 0.058 * Math.sin(t * 0.021 + b.phase * 1.7) +
        m * 0.024 * Math.sin(t * 0.062 + b.phase);
      const driftY =
        m * 0.05 * Math.cos(t * 0.019 + b.phase * 1.3) +
        m * 0.02 * Math.cos(t * 0.054 + b.phase * 0.8);
      const px = nx * w + driftX;
      const py = ny * h + driftY;
      const rPulse = 1 + 0.095 * Math.sin(t * 0.072 + b.phase * 2.1);
      const r = baseR * b.rScale * rPulse;
      const [cr, cg, cb] = b.core;
      const [er, eg, eb] = b.edge;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.29)`);
      grad.addColorStop(0.38, `rgba(${cr}, ${cg}, ${cb}, ${b.midA})`);
      grad.addColorStop(0.72, `rgba(${er}, ${eg}, ${eb}, 0.055)`);
      grad.addColorStop(1, `rgba(${er}, ${eg}, ${eb}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function frame() {
    ctx.fillStyle = SOAP_BASE;
    ctx.fillRect(0, 0, w, h);
    drawBlobs();
    drawGrid();
    drawVignette();
    if (running) {
      t += 0.0064;
      raf = requestAnimationFrame(frame);
    }
  }

  function onVisibility() {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!prefersReduced) {
      running = true;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    }
  }

  resize();
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", onVisibility);

  if (prefersReduced) {
    t = 0.9;
    frame();
  } else {
    raf = requestAnimationFrame(frame);
  }
}
