import "./style.css";
import { loadLeaderboard } from "./lib/leaderboardStore.js";
import { QUAI_RPC_URL, getTapCounterAddress } from "./contractConfig.js";

const leaderboardList = document.getElementById("leaderboardList");
const TAPS_PER_TICKET = 10n;
const MAX_BLOCK_RANGE = 5_000n;
const TEN_TAPS_COMMITTED_TOPIC =
  "0x6cfbb6b5dda8a561b6c2f7d1f7322004391578f045de6b7e97052ad1674cceab";
const SHARED_TAP_COUNTER_ADDRESS =
  import.meta.env.VITE_TAP_COUNTER_ADDRESS?.trim() || "";

function resolveLeaderboardContractAddress() {
  // For global leaderboard prefer one shared contract address from env.
  if (SHARED_TAP_COUNTER_ADDRESS) {
    return SHARED_TAP_COUNTER_ADDRESS;
  }
  // If shared address is not configured, scan by event topic across all contracts.
  return "";
}

function shortenAddress(address) {
  if (!address || address.length < 10) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function parseBigIntHex(hexValue) {
  if (typeof hexValue !== "string" || !hexValue.startsWith("0x")) {
    return 0n;
  }
  try {
    return BigInt(hexValue);
  } catch {
    return 0n;
  }
}

function topicToAddress(topic) {
  if (typeof topic !== "string" || !topic.startsWith("0x") || topic.length < 42) {
    return "";
  }
  return `0x${topic.slice(-40)}`.toLowerCase();
}

async function fetchOnchainLeaderboard() {
  const contractAddress = resolveLeaderboardContractAddress();
  const fallbackContractAddress = getTapCounterAddress();

  const rpcCall = async (method, params, attempts = 3) => {
    const payload = {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    };
    let lastError = null;
    for (let i = 0; i < attempts; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const response = await fetch(QUAI_RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(`RPC error ${response.status}`);
        }
        // eslint-disable-next-line no-await-in-loop
        const json = await response.json();
        if (json?.error) {
          throw new Error(String(json.error.message || "RPC method failed"));
        }
        return json?.result;
      } catch (err) {
        lastError = err;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)));
      }
    }
    throw lastError || new Error("RPC request failed");
  };

  const latestHex = await rpcCall("eth_blockNumber", []);
  const latest = parseBigIntHex(latestHex);
  const byWallet = new Map();
  let deployBlock = 0n;

  // Find first block where contract code exists to avoid scanning from genesis.
  const hasCodeAt = async (block) => {
    if (!contractAddress) {
      return false;
    }
    const code = await rpcCall("eth_getCode", [
      contractAddress,
      `0x${block.toString(16)}`,
    ]);
    return typeof code === "string" && code !== "0x";
  };
  if (latest > 0n && contractAddress) {
    try {
      const hasCodeLatest = await hasCodeAt(latest);
      if (hasCodeLatest) {
        let lo = 0n;
        let hi = latest;
        while (lo < hi) {
          const mid = (lo + hi) / 2n;
          // eslint-disable-next-line no-await-in-loop
          const exists = await hasCodeAt(mid);
          if (exists) {
            hi = mid;
          } else {
            lo = mid + 1n;
          }
        }
        deployBlock = lo;
      }
    } catch {
      // Some Quai RPC providers do not support historic block arg in eth_getCode.
      deployBlock = 0n;
    }
  }

  for (let from = deployBlock; from <= latest; from += MAX_BLOCK_RANGE) {
    const to = from + MAX_BLOCK_RANGE - 1n > latest ? latest : from + MAX_BLOCK_RANGE - 1n;
    let logs = [];
    try {
      // eslint-disable-next-line no-await-in-loop
      const filter = {
        fromBlock: `0x${from.toString(16)}`,
        toBlock: `0x${to.toString(16)}`,
        topics: [TEN_TAPS_COMMITTED_TOPIC],
      };
      if (contractAddress) {
        filter.address = contractAddress;
      }
      logs = await rpcCall("eth_getLogs", [
        filter,
      ]);
    } catch {
      continue;
    }
    const safeLogs = Array.isArray(logs) ? logs : [];
    for (const log of safeLogs) {
      const wallet = topicToAddress(log?.topics?.[1]);
      if (!wallet) {
        continue;
      }
      const prev = byWallet.get(wallet) || 0;
      byWallet.set(wallet, prev + 1);
    }
  }

  // Safety fallback for old single-contract clients when global scan returns nothing.
  if (!byWallet.size && fallbackContractAddress && !contractAddress) {
    const logs = await rpcCall("eth_getLogs", [
      {
        address: fallbackContractAddress,
        fromBlock: "0x0",
        toBlock: "latest",
        topics: [TEN_TAPS_COMMITTED_TOPIC],
      },
    ]);
    const safeLogs = Array.isArray(logs) ? logs : [];
    for (const log of safeLogs) {
      const wallet = topicToAddress(log?.topics?.[1]);
      if (!wallet) {
        continue;
      }
      const prev = byWallet.get(wallet) || 0;
      byWallet.set(wallet, prev + 1);
    }
  }

  return [...byWallet.entries()]
    .map(([wallet, score]) => ({
      name: "Player",
      wallet,
      score,
    }))
    .sort((a, b) => b.score - a.score);
}

function renderLeaderboard(leaderboard) {
  leaderboardList.innerHTML = "";

  if (!leaderboard.length) {
    const emptyRow = document.createElement("li");
    emptyRow.textContent = "No entries yet";
    leaderboardList.append(emptyRow);
    return;
  }

  for (const entry of leaderboard) {
    const item = document.createElement("li");
    const walletLabel = entry.wallet ? ` (${shortenAddress(entry.wallet)})` : "";
    const name = entry.name === "Игрок" ? "Player" : entry.name;
    item.textContent = `${name} — ${entry.score} tickets${walletLabel}`;
    leaderboardList.append(item);
  }
}

async function initLeaderboard() {
  const localLeaderboard = loadLeaderboard();
  renderLeaderboard(localLeaderboard);

  try {
    const onchainLeaderboard = await fetchOnchainLeaderboard();
    if (onchainLeaderboard.length) {
      renderLeaderboard(onchainLeaderboard);
      return;
    }
    if (!localLeaderboard.length) {
      renderLeaderboard([]);
    }
  } catch {
    if (!localLeaderboard.length) {
      renderLeaderboard([]);
    }
  }
}

initLeaderboard();
