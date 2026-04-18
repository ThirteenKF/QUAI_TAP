/** Spot USD price for Quai Network (QUAI) via CoinGecko public API. */

const COINGECKO_ID = "quai-network";
const POLL_MS = 45_000;

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
 * @param {HTMLElement | null} el
 * @returns {() => void}
 */
export function startQuaiPriceTicker(el) {
  if (!el) {
    return () => {};
  }

  let timer = null;

  async function tick() {
    try {
      const url = new URL("https://api.coingecko.com/api/v3/simple/price");
      url.searchParams.set("ids", COINGECKO_ID);
      url.searchParams.set("vs_currencies", "usd");
      url.searchParams.set("include_24hr_change", "true");

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const row = data[COINGECKO_ID];
      const usd = row?.usd;
      const priceStr = formatUsd(Number(usd));
      if (!priceStr) {
        throw new Error("No price");
      }

      let line = `QUAI ≈ $${priceStr}`;
      const ch = row?.usd_24h_change;
      if (typeof ch === "number" && Number.isFinite(ch)) {
        const sign = ch >= 0 ? "+" : "";
        line += ` (${sign}${ch.toFixed(1)}% 24h)`;
      }
      el.textContent = line;
      el.removeAttribute("title");
    } catch {
      el.textContent = "QUAI price — unavailable";
      el.title = "Could not load price (CoinGecko)";
    }
  }

  el.textContent = "QUAI — …";
  void tick();
  timer = window.setInterval(tick, POLL_MS);

  return () => {
    if (timer != null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}
