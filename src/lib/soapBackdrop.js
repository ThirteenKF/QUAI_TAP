/**
 * Атмосферный фон в духе soap.qu.ai: тёплый чёрный + медленные Quai-красные «прожекторы».
 */

const SOAP_BASE = "#0b0201";
const BLOBS = [
  { amp: 0.36, fx: 0.07, fy: 0.11, phase: 0, rScale: 0.92, core: [226, 41, 1], midA: 0.06, edge: [120, 24, 12] },
  { amp: 0.34, fx: 0.09, fy: 0.08, phase: 1.7, rScale: 0.78, core: [255, 85, 45], midA: 0.04, edge: [80, 20, 10] },
  { amp: 0.38, fx: 0.06, fy: 0.1, phase: 3.1, rScale: 0.85, core: [200, 35, 18], midA: 0.05, edge: [60, 15, 8] },
  { amp: 0.32, fx: 0.08, fy: 0.07, phase: 4.4, rScale: 0.7, core: [255, 60, 30], midA: 0.03, edge: [50, 12, 6] },
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
    const offset = (t * 3) % step;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.022)";
    ctx.lineWidth = 1;
    for (let x = -step + offset; x < w + step; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = -step + offset * 0.7; y < h + step; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(
      w * 0.5,
      h * 0.42,
      Math.min(w, h) * 0.12,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.72,
    );
    g.addColorStop(0, "rgba(0, 0, 0, 0)");
    g.addColorStop(0.55, "rgba(0, 0, 0, 0.12)");
    g.addColorStop(1, "rgba(0, 0, 0, 0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawBlobs() {
    const baseR = Math.min(w, h) * 0.55;
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
      const px = nx * w;
      const py = ny * h;
      const r = baseR * b.rScale;
      const [cr, cg, cb] = b.core;
      const [er, eg, eb] = b.edge;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.22)`);
      grad.addColorStop(0.38, `rgba(${cr}, ${cg}, ${cb}, ${b.midA})`);
      grad.addColorStop(0.72, `rgba(${er}, ${eg}, ${eb}, 0.04)`);
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
      t += 0.0045;
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
