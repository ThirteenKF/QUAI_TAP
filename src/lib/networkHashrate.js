const RPC_URL = "https://rpc.quai.network/cyprus1";
const POLL_MS = 30_000;

function hexToBigInt(hex) {
  if (typeof hex !== "string") {
    return 0n;
  }
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

function formatHashrate(hps) {
  if (!Number.isFinite(hps) || hps <= 0) {
    return null;
  }
  const units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"];
  let value = hps;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

let rpcId = 1;

async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcId++,
      method,
      params,
    }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const payload = await res.json();
  if (payload?.error) {
    throw new Error(payload.error.message || "RPC error");
  }
  return payload.result;
}

/**
 * Estimated network hashrate from latest zone block (difficulty / block time).
 */
export function startNetworkHashrateTicker(el) {
  if (!el) {
    return () => {};
  }

  let timer = null;

  async function tick() {
    try {
      const latestHex = await rpc("quai_blockNumber", []);
      const latestNum = hexToBigInt(latestHex);
      if (latestNum <= 1n) {
        throw new Error("Not enough blocks");
      }
      const prevHex = `0x${(latestNum - 1n).toString(16)}`;

      const [latest, prev] = await Promise.all([
        rpc("quai_getBlockByNumber", [latestHex, false]),
        rpc("quai_getBlockByNumber", [prevHex, false]),
      ]);

      const latestTs = Number(hexToBigInt(latest?.woHeader?.timestamp));
      const prevTs = Number(hexToBigInt(prev?.woHeader?.timestamp));
      const dtSec = Math.max(1, latestTs - prevTs);

      const difficulty = Number(hexToBigInt(latest?.woHeader?.difficulty));
      const hashrate = formatHashrate(difficulty / dtSec);

      el.textContent = hashrate
        ? `Network hashrate: ${hashrate}`
        : "Network hashrate — unavailable";
      el.removeAttribute("title");
    } catch {
      el.textContent = "Network hashrate — unavailable";
      el.title = "Could not load hashrate (RPC)";
    }
  }

  el.textContent = "Network hashrate — …";
  void tick();
  timer = window.setInterval(tick, POLL_MS);
  return () => {
    if (timer != null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}
