const LEADERBOARD_KEY = "quai_tapalka_leaderboard_v1";
export const LEADERBOARD_LIMIT = 10;
/** 10 тапов в контракте = 1 тикет (как TAP_BATCH в TapCounter). */
const TAPS_PER_TICKET = 10n;
/** Старое дефолтное имя до локализации UI — одноразово переписываем в storage. */
const LEGACY_PLAYER_NAME_RU = "Игрок";

function toBigIntTotal(value) {
  if (typeof value === "bigint") {
    return value;
  }
  if (value === undefined || value === null) {
    return 0n;
  }
  try {
    return BigInt(String(value));
  } catch {
    return 0n;
  }
}

function ticketsFromTapTotalSafe(total) {
  const b = toBigIntTotal(total);
  const tickets = b / TAPS_PER_TICKET;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (tickets > max) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Number(tickets);
}

/**
 * Читает таблицу лидеров из localStorage (топ по score).
 */
export function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    let migrated = false;
    const withFixedNames = parsed.map((entry) => {
      if (
        entry &&
        typeof entry === "object" &&
        entry.name === LEGACY_PLAYER_NAME_RU
      ) {
        migrated = true;
        return { ...entry, name: "Player" };
      }
      return entry;
    });
    if (migrated) {
      try {
        localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(withFixedNames));
      } catch {
        // ignore
      }
    }
    const filtered = withFixedNames.filter((entry) => {
      return (
        entry &&
        typeof entry.name === "string" &&
        Number.isFinite(entry.score) &&
        typeof entry.wallet === "string"
      );
    });
    filtered.sort((a, b) => b.score - a.score);
    return filtered.slice(0, LEADERBOARD_LIMIT);
  } catch {
    return [];
  }
}

function loadAllStoredEntries() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Обновляет запись игрока по тикетам: 10 тапов в контракте = 1 тикет.
 * На входе — сумма тапов из контракта (totalTaps).
 */
export function syncLeaderboardFromWallet(wallet, chainTotalBigInt) {
  if (!wallet || typeof wallet !== "string") {
    return;
  }
  const score = ticketsFromTapTotalSafe(chainTotalBigInt);
  if (!Number.isFinite(score) || score <= 0) {
    return;
  }

  const w = wallet.toLowerCase();
  const all = loadAllStoredEntries().filter(
    (e) =>
      e &&
      typeof e.name === "string" &&
      Number.isFinite(e.score) &&
      typeof e.wallet === "string",
  );

  const idx = all.findIndex((e) => e.wallet.toLowerCase() === w);
  const entry = {
    name: "Player",
    score,
    wallet,
  };
  if (idx >= 0) {
    all[idx] = entry;
  } else {
    all.push(entry);
  }

  all.sort((a, b) => b.score - a.score);
  const trimmed = all.slice(0, LEADERBOARD_LIMIT);
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore quota / private mode
  }
}
