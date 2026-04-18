/** Spot USD price for QUAI: CoinGecko when available, DefiLlama as fallback (no key). */

const COINGECKO_ID = "quai-network";
const LLAMA_KEY = "coingecko:quai-network";
const POLL_MS = 45_000;

/** @returns {AbortSignal | undefined} */
function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

function formatUsd(usd) {
  if (!Number.isFinite(usd) || usd <= 0) {
    return null;
  }
  if (usd < 0.0001) {
    return usd.toPrecision(4);
  }
  if (usd < 1) {
    return usd.toFixed(4);
  }
  if (usd < 1000) {
    return usd.toFixed(2);
  }
  return usd.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

/**
 * @returns {Promise<{ usd: number; change24h: number | undefined }>}
 */
async function fetchCoingecko() {
  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", COINGECKO_ID);
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_24hr_change", "true");
  const demoKey = import.meta.env?.VITE_COINGECKO_DEMO_API_KEY;
  if (typeof demoKey === "string" && demoKey.length > 0) {
    url.searchParams.set("x_cg_demo_api_key", demoKey);
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: timeoutSignal(14_000),
  });
  if (!res.ok) {
    throw new Error(`CoinGecko HTTP ${res.status}`);
  }
  const data = await res.json();
  const row = data[COINGECKO_ID];
  const raw = row?.usd;
  const usd = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error("CoinGecko: no usd");
  }
  const chRaw = row?.usd_24h_change;
  let change24hFinal;
  if (chRaw != null) {
    const n = typeof chRaw === "number" ? chRaw : Number(chRaw);
    if (Number.isFinite(n)) {
      change24hFinal = n;
    }
  }
  return { usd, change24h: change24hFinal };
}

/**
 * @returns {Promise<{ usd: number; change24h: undefined }>}
 */
async function fetchLlama() {
  const url = `https://coins.llama.fi/prices/current/${encodeURIComponent(LLAMA_KEY)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: timeoutSignal(14_000),
  });
  if (!res.ok) {
    throw new Error(`Llama HTTP ${res.status}`);
  }
  const data = await res.json();
  const raw = data?.coins?.[LLAMA_KEY]?.price;
  const usd = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error("Llama: no price");
  }
  return { usd, change24h: undefined };
}

/**
 * @param {HTMLElement | null} el
 * @returns {() => void}
 */
export function startQuaiPriceTicker(el) {
  if (!el) {
    return () => {};
  }

  let timer = null;

  function setTrendClass(changePct) {
    el.classList.remove("quai-price--up", "quai-price--down", "quai-price--flat");
    if (typeof changePct !== "number" || !Number.isFinite(changePct)) {
      el.classList.add("quai-price--flat");
      return;
    }
    if (changePct > 0) {
      el.classList.add("quai-price--up");
      return;
    }
    if (changePct < 0) {
      el.classList.add("quai-price--down");
      return;
    }
    el.classList.add("quai-price--flat");
  }

  async function tick() {
    try {
      let usd;
      let change24h;
      try {
        ({ usd, change24h } = await fetchCoingecko());
      } catch {
        ({ usd, change24h } = await fetchLlama());
      }

      const priceStr = formatUsd(usd);
      if (!priceStr) {
        throw new Error("Invalid usd");
      }

      let line = `QUAI ≈ $${priceStr}`;
      if (typeof change24h === "number" && Number.isFinite(change24h)) {
        const sign = change24h >= 0 ? "+" : "";
        line += ` (${sign}${change24h.toFixed(1)}% 24h)`;
      }
      el.textContent = line;
      setTrendClass(change24h);
      el.removeAttribute("title");
    } catch {
      el.textContent = "QUAI price — unavailable";
      setTrendClass(undefined);
      el.title = "Could not load price (CoinGecko or DefiLlama)";
    }
  }

  el.textContent = "QUAI — …";
  setTrendClass(undefined);
  void tick();
  timer = window.setInterval(tick, POLL_MS);

  return () => {
    if (timer != null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}
