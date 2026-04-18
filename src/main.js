import "./style.css";
import {
  getTapCounterAddress,
  setTapCounterAddress,
  clearTapCounterBinding,
  getMinersRoomDonateAddress,
  setMinersRoomDonateAddress,
} from "./contractConfig.js";
import {
  getPelagusEip1193,
  ensureActiveQuaiChain,
  prepareWalletUiFocus,
} from "./lib/wallet/pelagus.js";
import {
  readTotalTaps,
  deployTapCounter,
  sendCommitTenTapsPay,
  assertTapCounterPaymentConfig,
} from "./lib/tapCounterClient.js";
import {
  deployMinersRoomDonate,
  sendMinersRoomDonate,
} from "./lib/minersRoomDonateClient.js";
import { syncLeaderboardFromWallet } from "./lib/leaderboardStore.js";
import { initSoapBackdrop } from "./lib/soapBackdrop.js";

const STORAGE_KEY = "quai_tapalka_state_v1";

const TAP_IMG_REVISION = "10";
const TAP_BTN_ART_FILE = "tap-style-a.svg";

function tapButtonImageUrl(filename) {
  const base = import.meta.env.BASE_URL ?? "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}images/${filename}?r=${TAP_IMG_REVISION}`;
}

const connectBtn = document.getElementById("connectBtn");
const walletStatus = document.getElementById("walletStatus");
const tapBtn = document.getElementById("tapBtn");
const tapBtnArt = document.getElementById("tapBtnArt");
const deployTestBtn = document.getElementById("deployTestBtn");
const ticketLine = document.getElementById("ticketLine");
const txStatus = document.getElementById("txStatus");
const donateAmountInput = document.getElementById("donateAmount");
const donateBtn = document.getElementById("donateBtn");
const deployDonateBtn = document.getElementById("deployDonateBtn");
const donateStatus = document.getElementById("donateStatus");

let count = 0;
let account = "";
let connectionSignature = "";
/** Сумма тапов, уже записанная в контракте для текущего адреса. */
let chainTotal = 0n;
let commitInFlight = false;
let deployInFlight = false;
let deployDonateInFlight = false;
let donateInFlight = false;

/** Один раз за сессию страницы — иначе дублируются accountsChanged. */
let walletEventsBound = false;

function sanitizeSessionCount() {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
    count = 0;
  } else {
    count = Math.floor(count);
  }
}

function loadState() {
  /** Локальные тапы после F5 не восстанавливаются (счётчик на экране не показываем). */
  count = 0;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    account = typeof parsed.account === "string" ? parsed.account : "";
    connectionSignature =
      typeof parsed.connectionSignature === "string"
        ? parsed.connectionSignature
        : "";
    if (parsed.chainTotal !== undefined && parsed.chainTotal !== null) {
      try {
        chainTotal = BigInt(parsed.chainTotal);
      } catch {
        chainTotal = 0n;
      }
    }
  } catch {
    account = "";
    connectionSignature = "";
    chainTotal = 0n;
    count = 0;
  }
  sanitizeSessionCount();
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      count,
      account,
      connectionSignature,
      chainTotal: chainTotal.toString(),
    }),
  );
}

function shortenAddress(address) {
  if (!address || address.length < 10) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getWallet() {
  return getPelagusEip1193();
}

/** Партия тапов, записываемая одной транзакцией (как в контракте TAP_BATCH). */
const TAP_BATCH = 10n;

/** uint256 из quais/ethers может прийти не как bigint — без этого ломается `chainTotal + TAP_BATCH`. */
function asBigIntTotal(value) {
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

/** 10 записанных в контракте тапов = 1 тикет. */
function ticketsFromChainTotal(total) {
  try {
    const t = asBigIntTotal(total) / TAP_BATCH;
    if (t > BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number.MAX_SAFE_INTEGER;
    }
    return Number(t);
  } catch {
    return 0;
  }
}

function localTapBigInt() {
  const n = Number(count);
  if (!Number.isFinite(n) || n < 0) {
    return 0n;
  }
  return BigInt(Math.floor(n));
}

async function fetchChainTotal(addr) {
  const contractAddr = getTapCounterAddress();
  if (!contractAddr || !addr) {
    return;
  }

  const provider = getWallet();
  if (!provider) {
    return;
  }

  try {
    const total = await readTotalTaps(provider, contractAddr, addr);
    chainTotal = asBigIntTotal(total);
    saveState();
    syncLeaderboardFromWallet(addr, chainTotal);
    if (txStatus) {
      txStatus.textContent = "";
    }
  } catch {
    if (txStatus) {
      txStatus.textContent = "Network unavailable";
    }
  }
}

function needsOnchainBatchCommit() {
  const contractAddr = getTapCounterAddress();
  if (!contractAddr) {
    return false;
  }
  /** `count` — тапы только текущей сессии, не «всего времени»; сравнение с chainTotal ломало 2+ партию. */
  try {
    return localTapBigInt() >= TAP_BATCH;
  } catch {
    return false;
  }
}

function updateUI() {
  if (tapBtn) {
    tapBtn.disabled =
      commitInFlight ||
      deployInFlight ||
      donateInFlight ||
      deployDonateInFlight;
  }

  if (!account) {
    walletStatus.textContent = "Wallet not connected";
    connectBtn.textContent = "Wallet";
  } else {
    walletStatus.textContent = shortenAddress(account);
    connectBtn.textContent = "Disconnect";
  }

  const contractAddr = getTapCounterAddress();

  if (ticketLine) {
    if (!contractAddr || !account) {
      ticketLine.textContent = "Tickets: —";
    } else {
      ticketLine.textContent = `Tickets: ${ticketsFromChainTotal(chainTotal)}`;
    }
  }

  if (deployTestBtn) {
    const hasContract = Boolean(contractAddr);
    deployTestBtn.hidden = !account || hasContract;
    deployTestBtn.disabled =
      deployInFlight || deployDonateInFlight || donateInFlight;
  }

  const donateContractAddr = getMinersRoomDonateAddress();
  if (deployDonateBtn) {
    deployDonateBtn.hidden = !account || Boolean(donateContractAddr);
    deployDonateBtn.disabled =
      deployDonateInFlight ||
      deployInFlight ||
      donateInFlight ||
      commitInFlight;
  }
  if (donateBtn) {
    donateBtn.disabled =
      !account ||
      !donateContractAddr ||
      donateInFlight ||
      deployDonateInFlight ||
      deployInFlight ||
      commitInFlight;
  }
}

async function signConnection(provider, address) {
  const message = `QUAITAP: I confirm connecting my wallet to this site.\nTime: ${new Date().toISOString()}`;

  prepareWalletUiFocus();
  try {
    return await provider.request({
      method: "personal_sign",
      params: [message, address],
    });
  } catch {
    return provider.request({
      method: "personal_sign",
      params: [address, message],
    });
  }
}

async function connectWallet() {
  if (account) {
    account = "";
    connectionSignature = "";
    saveState();
    updateUI();
    return;
  }

  const provider = getWallet();
  if (!provider) {
    walletStatus.textContent = "Install the Pelagus wallet";
    return;
  }

  try {
    const accounts = await provider.request({
      method: "eth_requestAccounts",
    });

    if (!accounts || !accounts.length) {
      walletStatus.textContent = "Wallet did not respond";
      return;
    }

    const nextAccount = accounts[0];
    const signature = await signConnection(provider, nextAccount);
    if (!signature) {
      walletStatus.textContent = "Connection cancelled";
      return;
    }

    await ensureActiveQuaiChain(provider);

    account = nextAccount;
    connectionSignature = signature;
    saveState();
    updateUI();

    bindProviderEvents();

    await fetchChainTotal(account);
    updateUI();
    await maybeCommitTenTaps();
  } catch (error) {
    const message = error?.message || "Error";
    walletStatus.textContent = message;
  }
}

function bindProviderEvents() {
  const provider = getWallet();
  if (!provider || typeof provider.on !== "function") {
    return;
  }
  if (walletEventsBound) {
    return;
  }
  walletEventsBound = true;

  provider.on("accountsChanged", async (accounts) => {
    account = accounts?.[0] || "";
    connectionSignature = "";
    chainTotal = 0n;
    saveState();
    updateUI();
    if (account) {
      await fetchChainTotal(account);
      updateUI();
      await maybeCommitTenTaps();
    }
  });

  provider.on("chainChanged", async () => {
    updateUI();
    if (account) {
      await fetchChainTotal(account);
      updateUI();
    }
  });
}

async function deployContractFromWallet() {
  if (deployInFlight || deployDonateInFlight || !account) {
    return;
  }

  if (getTapCounterAddress()) {
    return;
  }

  const provider = getWallet();
  if (!provider) {
    if (txStatus) {
      txStatus.textContent = "Wallet not found";
    }
    return;
  }

  deployInFlight = true;
  if (txStatus) {
    txStatus.textContent = "Wait… opening your wallet";
  }
  updateUI();

  try {
    await ensureActiveQuaiChain(provider);
    const addr = await deployTapCounter(provider);
    setTapCounterAddress(addr);

    try {
      await navigator.clipboard.writeText(addr);
    } catch {
      // ignore
    }

    await fetchChainTotal(account);
    updateUI();
    await maybeCommitTenTaps();

    if (txStatus) {
      txStatus.textContent = "Ready — start tapping!";
    }
  } catch (error) {
    const detail =
      error?.shortMessage ||
      error?.reason ||
      error?.message ||
      String(error);
    if (txStatus) {
      txStatus.textContent = detail;
    }
  } finally {
    deployInFlight = false;
    updateUI();
  }
}

async function deployMinersRoomDonateFromWallet() {
  if (
    deployDonateInFlight ||
    deployInFlight ||
    donateInFlight ||
    commitInFlight ||
    !account
  ) {
    return;
  }
  if (getMinersRoomDonateAddress()) {
    return;
  }

  const provider = getWallet();
  if (!provider) {
    if (donateStatus) {
      donateStatus.textContent = "Wallet not found";
    }
    return;
  }

  deployDonateInFlight = true;
  if (donateStatus) {
    donateStatus.textContent = "Wait… deploy donation contract in wallet";
  }
  updateUI();

  try {
    await ensureActiveQuaiChain(provider);
    const addr = await deployMinersRoomDonate(provider);
    setMinersRoomDonateAddress(addr);

    try {
      await navigator.clipboard.writeText(addr);
    } catch {
      // ignore
    }

    if (donateStatus) {
      donateStatus.textContent = "Donate contract ready — enter an amount and tap Donate.";
    }
  } catch (error) {
    const detail =
      error?.shortMessage ||
      error?.reason ||
      error?.message ||
      String(error);
    if (donateStatus) {
      donateStatus.textContent =
        detail.length > 140 ? `${detail.slice(0, 137)}…` : detail;
    }
  } finally {
    deployDonateInFlight = false;
    updateUI();
  }
}

async function onDonateMinersRoom() {
  if (
    donateInFlight ||
    deployDonateInFlight ||
    deployInFlight ||
    commitInFlight ||
    !account
  ) {
    return;
  }

  const contractAddr = getMinersRoomDonateAddress();
  if (!contractAddr) {
    if (donateStatus) {
      donateStatus.textContent = "Deploy the donate contract first or set the address in .env";
    }
    return;
  }

  const raw = donateAmountInput?.value?.trim() ?? "";
  if (!raw) {
    if (donateStatus) {
      donateStatus.textContent = "Enter an amount in QUAI";
    }
    return;
  }

  const provider = getWallet();
  if (!provider) {
    if (donateStatus) {
      donateStatus.textContent = "Wallet not found";
    }
    return;
  }

  donateInFlight = true;
  if (donateStatus) {
    donateStatus.textContent = "Confirm in wallet…";
  }
  updateUI();

  try {
    await ensureActiveQuaiChain(provider);
    await provider.request({ method: "eth_requestAccounts" });
    await sendMinersRoomDonate(provider, contractAddr, raw);
    if (donateStatus) {
      donateStatus.textContent = "Thanks! Transfer sent.";
    }
  } catch (error) {
    const msg =
      error?.shortMessage ||
      error?.info?.error?.message ||
      error?.message ||
      "Transfer error";
    if (donateStatus) {
      donateStatus.textContent =
        msg.length > 140 ? `${msg.slice(0, 137)}…` : msg;
    }
  } finally {
    donateInFlight = false;
    updateUI();
  }
}

/**
 * Каждые 10 тапов — пауза: транзакция записывает партию и отправляет 10 QUAI на адрес из контракта.
 */
async function maybeCommitTenTaps() {
  sanitizeSessionCount();
  if (commitInFlight) {
    return;
  }

  const contractAddr = getTapCounterAddress();
  let needsCommit;
  try {
    needsCommit = localTapBigInt() >= TAP_BATCH;
  } catch {
    return;
  }

  if (!needsCommit) {
    return;
  }

  if (!account) {
    if (txStatus) {
      txStatus.textContent = "Connect your wallet first";
    }
    return;
  }

  if (!contractAddr) {
    if (txStatus) {
      txStatus.textContent = "Tap Start game first";
    }
    return;
  }

  commitInFlight = true;
  let failed = false;
  try {
    updateUI();

    const step = Number(TAP_BATCH);
    while (localTapBigInt() >= TAP_BATCH) {
      const provider = getWallet();
      if (!provider) {
        if (txStatus) {
          txStatus.textContent = "Wallet not found";
        }
        failed = true;
        break;
      }

      if (txStatus) {
        txStatus.textContent = "Sign the transaction in your wallet";
      }

      try {
        await ensureActiveQuaiChain(provider);
        await provider.request({ method: "eth_requestAccounts" });
        await assertTapCounterPaymentConfig(provider, contractAddr);

        await sendCommitTenTapsPay(provider, contractAddr);

        await fetchChainTotal(account);
        syncLeaderboardFromWallet(account, chainTotal);
        count = Math.max(0, count - step);
        saveState();
        updateUI();
      } catch (error) {
        failed = true;
        const msg =
          error?.shortMessage ||
          error?.info?.error?.message ||
          error?.message ||
          "Write error";
        if (
          msg.includes("Outdated contract address") ||
          msg.includes("does not support the 10 QUAI fee") ||
          msg.includes("устаревший адрес контракта") ||
          msg.includes("не поддерживает оплату 10 QUAI")
        ) {
          clearTapCounterBinding();
        }
        if (txStatus) {
          txStatus.textContent =
            msg.length > 120 ? `${msg.slice(0, 117)}…` : msg;
        }
        break;
      }
    }

    if (!failed) {
      if (txStatus) {
        txStatus.textContent = "";
      }
      saveState();
    }
  } finally {
    commitInFlight = false;
    updateUI();
  }
}

function tap() {
  if (deployInFlight || donateInFlight || deployDonateInFlight) {
    return;
  }

  sanitizeSessionCount();

  if (needsOnchainBatchCommit()) {
    void maybeCommitTenTaps();
    return;
  }

  if (commitInFlight) {
    return;
  }

  count += 1;
  saveState();
  updateUI();
  void maybeCommitTenTaps();
}

async function init() {
  initSoapBackdrop(document.getElementById("soapBackdrop"));
  loadState();
  if (tapBtnArt) {
    tapBtnArt.src = tapButtonImageUrl(TAP_BTN_ART_FILE);
  }

  updateUI();
  bindProviderEvents();

  if (account) {
    const provider = getWallet();
    if (provider) {
      try {
        await ensureActiveQuaiChain(provider);
        await fetchChainTotal(account);
      } catch {
        if (txStatus) {
          txStatus.textContent = "Check the network in your wallet";
        }
      }
      updateUI();
      await maybeCommitTenTaps();
    } else {
      walletStatus.textContent = "Open this page in a browser with Pelagus";
    }
  }

  connectBtn?.addEventListener("click", connectWallet);
  tapBtn?.addEventListener("click", tap);
  deployTestBtn?.addEventListener("click", deployContractFromWallet);
  donateBtn?.addEventListener("click", onDonateMinersRoom);
  deployDonateBtn?.addEventListener("click", deployMinersRoomDonateFromWallet);
}

init();
