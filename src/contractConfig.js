import { getActiveChain } from "./config/chains.js";

const LOCAL_CONTRACT_KEY = "quai_tap_counter_address";
/** Если "1" — не подставлять VITE_TAP_COUNTER_ADDRESS (нужен новый деплой из браузера). */
const IGNORE_VITE_CONTRACT_KEY = "quai_tap_ignore_vite_contract";

const LOCAL_MINERS_DONATE_KEY = "quai_miners_room_donate_address";
const IGNORE_VITE_MINERS_DONATE_KEY = "quai_miners_room_donate_ignore_vite";

const chain = getActiveChain();

/** ID активной сети (из VITE_QUAI_CHAIN_ID + таблица в config/chains.js). */
export const QUAI_CHAIN_ID = chain.id;

/** RPC для wallet_addEthereumChain; можно переопределить VITE_QUAI_RPC_URL. */
export const QUAI_RPC_URL =
  import.meta.env.VITE_QUAI_RPC_URL?.trim() || chain.rpcUrls.default.http[0];

/**
 * Адрес контракта: сначала то, что сохранено после деплоя из приложения (localStorage),
 * иначе VITE_TAP_COUNTER_ADDRESS — чтобы после подписи в Pelagus адрес сразу подхватывался без правок .env.
 */
export function getTapCounterAddress() {
  try {
    const fromStorage = localStorage.getItem(LOCAL_CONTRACT_KEY)?.trim();
    if (fromStorage) {
      return fromStorage;
    }
  } catch {
    // ignore
  }
  try {
    if (localStorage.getItem(IGNORE_VITE_CONTRACT_KEY) === "1") {
      return "";
    }
  } catch {
    // ignore
  }
  return import.meta.env.VITE_TAP_COUNTER_ADDRESS?.trim() || "";
}

export function setTapCounterAddress(address) {
  try {
    if (address) {
      localStorage.setItem(LOCAL_CONTRACT_KEY, address);
      localStorage.removeItem(IGNORE_VITE_CONTRACT_KEY);
    } else {
      localStorage.removeItem(LOCAL_CONTRACT_KEY);
    }
  } catch {
    // ignore
  }
}

/** Сброс привязки: убрать адрес из браузера и не использовать адрес из VITE (кнопка «Развернуть» снова активна). */
export function clearTapCounterBinding() {
  try {
    localStorage.removeItem(LOCAL_CONTRACT_KEY);
    localStorage.setItem(IGNORE_VITE_CONTRACT_KEY, "1");
  } catch {
    // ignore
  }
}

/**
 * Контракт Miners Room Donate: localStorage → иначе VITE_MINERS_ROOM_DONATE_ADDRESS.
 */
export function getMinersRoomDonateAddress() {
  try {
    const fromStorage = localStorage.getItem(LOCAL_MINERS_DONATE_KEY)?.trim();
    if (fromStorage) {
      return fromStorage;
    }
  } catch {
    // ignore
  }
  try {
    if (localStorage.getItem(IGNORE_VITE_MINERS_DONATE_KEY) === "1") {
      return "";
    }
  } catch {
    // ignore
  }
  return import.meta.env.VITE_MINERS_ROOM_DONATE_ADDRESS?.trim() || "";
}

export function setMinersRoomDonateAddress(address) {
  try {
    if (address) {
      localStorage.setItem(LOCAL_MINERS_DONATE_KEY, address);
      localStorage.removeItem(IGNORE_VITE_MINERS_DONATE_KEY);
    } else {
      localStorage.removeItem(LOCAL_MINERS_DONATE_KEY);
    }
  } catch {
    // ignore
  }
}
