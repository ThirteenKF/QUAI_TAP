import "./style.css";
import { loadLeaderboard } from "./lib/leaderboardStore.js";

const leaderboardList = document.getElementById("leaderboardList");

function shortenAddress(address) {
  if (!address || address.length < 10) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function renderLeaderboard() {
  const leaderboard = loadLeaderboard();
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

renderLeaderboard();
