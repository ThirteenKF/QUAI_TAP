import "./style.css";
import { loadLeaderboard } from "./lib/leaderboardStore.js";
import { QUAI_RPC_URL, getTapCounterAddress } from "./contractConfig.js";

const leaderboardList = document.getElementById("leaderboardList");
const TAPS_PER_TICKET = 10n;
const MAX_BLOCK_RANGE = 10_000n;
const TEN_TAPS_COMMITTED_TOPIC =
  "0x6cfbb6b5dda8a561b6c2f7d1f7322004391578f045de6b7e97052ad1674cceab";

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
  const contractAddress = getTapCounterAddress();
  if (!contractAddress) {
    return [];
  }

  const rpcCall = async (method, params) => {
    const payload = {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    };

    const response = await fetch(QUAI_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`RPC error ${response.status}`);
    }
    const json = await response.json();
    if (json?.error) {
      throw new Error(String(json.error.message || "RPC method failed"));
    }
    return json?.result;
  };

  const latestHex = await rpcCall("eth_blockNumber", []);
  const latest = parseBigIntHex(latestHex);
  const byWallet = new Map();

  for (let from = 0n; from <= latest; from += MAX_BLOCK_RANGE) {
    const to = from + MAX_BLOCK_RANGE - 1n > latest ? latest : from + MAX_BLOCK_RANGE - 1n;
    const logs = await rpcCall("eth_getLogs", [
      {
        address: contractAddress,
        fromBlock: `0x${from.toString(16)}`,
        toBlock: `0x${to.toString(16)}`,
        topics: [TEN_TAPS_COMMITTED_TOPIC],
      },
    ]);
    const safeLogs = Array.isArray(logs) ? logs : [];
    for (const log of safeLogs) {
      const wallet = topicToAddress(log?.topics?.[1]);
      if (!wallet) {
        continue;
      }
      const newTotal = parseBigIntHex(log?.data);
      const tickets = Number(newTotal / TAPS_PER_TICKET);
      if (!Number.isFinite(tickets) || tickets <= 0) {
        continue;
      }
      byWallet.set(wallet, tickets);
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
  let leaderboard = [];
  try {
    leaderboard = await fetchOnchainLeaderboard();
  } catch {
    leaderboard = [];
  }

  if (!leaderboard.length) {
    leaderboard = loadLeaderboard();
  }
  renderLeaderboard(leaderboard);
}

initLeaderboard();
