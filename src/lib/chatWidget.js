import { getGameMessengerAddress } from "../contractConfig.js";
import {
  GAME_MESSENGER_GLOBAL_ROOM,
  assertMessengerContractReadable,
  postMessage,
  readRecentMessages,
  walletRoomKey,
} from "./gameMessengerClient.js";
import { ensureActiveQuaiChain, getPelagusEip1193 } from "./wallet/pelagus.js";

const CHAT_COLLAPSE_KEY = "quai_chat_collapsed_v1";

function shortenAddress(address) {
  if (!address || address.length < 10) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatChatTimestamp(ts) {
  const n = Number(ts ?? 0);
  if (!Number.isFinite(n) || n <= 0) {
    return "—";
  }
  return new Date(n * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function initChatWidget() {
  const chatPanel = document.getElementById("chatPanel");
  const chatToggleBtn = document.getElementById("chatToggleBtn");
  const chatTabGlobal = document.getElementById("chatTabGlobal");
  const chatTabRoom = document.getElementById("chatTabRoom");
  const chatMessages = document.getElementById("chatMessages");
  const chatInput = document.getElementById("chatInput");
  const chatSendBtn = document.getElementById("chatSendBtn");
  const chatStatus = document.getElementById("chatStatus");
  const chatContractHint = document.getElementById("chatContractHint");

  if (!chatPanel || !chatMessages) {
    return;
  }

  let account = "";
  let activeChatRoom = "global";
  let chatSendInFlight = false;
  let chatMessagesCache = [];
  let isChatCollapsed = false;

  function currentChatRoomKey() {
    if (activeChatRoom === "room" && account) {
      try {
        return walletRoomKey(account);
      } catch {
        return GAME_MESSENGER_GLOBAL_ROOM;
      }
    }
    return GAME_MESSENGER_GLOBAL_ROOM;
  }

  function renderChatMessages() {
    if (!chatMessagesCache.length) {
      chatMessages.innerHTML =
        '<li class="chat-message chat-message--empty">No messages yet.</li>';
      return;
    }
    const ordered = [...chatMessagesCache].sort((a, b) => {
      const ta = BigInt(a?.timestamp ?? 0n);
      const tb = BigInt(b?.timestamp ?? 0n);
      if (tb > ta) return 1;
      if (tb < ta) return -1;
      return 0;
    });
    chatMessages.innerHTML = "";
    for (const msg of ordered) {
      const item = document.createElement("li");
      item.className = "chat-message";
      item.innerHTML = `<span class="chat-message__meta">${shortenAddress(msg.author || "")} · ${formatChatTimestamp(msg.timestamp)}</span><span class="chat-message__text"></span>`;
      item.querySelector(".chat-message__text").textContent = msg.text || "";
      chatMessages.append(item);
    }
  }

  function updateUi() {
    const messengerAddr = getGameMessengerAddress();
    if (chatContractHint) {
      chatContractHint.textContent = messengerAddr
        ? `Contract: ${shortenAddress(messengerAddr)}`
        : "Contract: not configured";
    }
    if (chatTabGlobal && chatTabRoom) {
      chatTabGlobal.classList.toggle("chat-tab--active", activeChatRoom === "global");
      chatTabRoom.classList.toggle("chat-tab--active", activeChatRoom === "room");
      chatTabRoom.disabled = !account;
    }
    if (chatSendBtn) {
      chatSendBtn.disabled =
        !account ||
        !messengerAddr ||
        !chatInput?.value?.trim() ||
        chatSendInFlight;
    }
    chatPanel.classList.toggle("chat-panel--collapsed", isChatCollapsed);
    if (chatToggleBtn) {
      chatToggleBtn.textContent = isChatCollapsed ? "▴" : "▾";
      chatToggleBtn.setAttribute(
        "aria-label",
        isChatCollapsed ? "Expand chat" : "Collapse chat",
      );
    }
  }

  async function detectAccount() {
    const provider = getPelagusEip1193();
    if (!provider) {
      account = "";
      updateUi();
      return;
    }
    try {
      const accounts = await provider.request({ method: "eth_accounts" });
      account = accounts?.[0] || "";
    } catch {
      account = "";
    }
    updateUi();
  }

  async function loadMessages() {
    const contractAddr = getGameMessengerAddress();
    const provider = getPelagusEip1193();
    if (!provider || !contractAddr) {
      chatMessagesCache = [];
      renderChatMessages();
      return;
    }
    try {
      await assertMessengerContractReadable(provider, contractAddr);
      const rows = await readRecentMessages(
        provider,
        contractAddr,
        currentChatRoomKey(),
        20,
      );
      chatMessagesCache = rows.map((m) => ({
        author: String(m.author ?? ""),
        timestamp: BigInt(m.timestamp ?? 0n),
        text: String(m.text ?? ""),
      }));
      renderChatMessages();
      if (chatStatus && !chatSendInFlight) {
        chatStatus.textContent = "";
      }
    } catch (error) {
      chatMessagesCache = [];
      renderChatMessages();
      if (chatStatus) {
        const msg = error?.shortMessage || error?.message || "Chat load error";
        chatStatus.textContent = msg.length > 120 ? `${msg.slice(0, 117)}…` : msg;
      }
    }
  }

  async function onSend() {
    if (chatSendInFlight || !chatInput?.value?.trim()) {
      return;
    }
    const contractAddr = getGameMessengerAddress();
    const provider = getPelagusEip1193();
    if (!provider || !contractAddr) {
      return;
    }
    chatSendInFlight = true;
    updateUi();
    if (chatStatus) {
      chatStatus.textContent = "Confirm chat transaction in wallet…";
    }
    try {
      await ensureActiveQuaiChain(provider);
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      account = accounts?.[0] || "";
      await assertMessengerContractReadable(provider, contractAddr);
      await postMessage(
        provider,
        contractAddr,
        currentChatRoomKey(),
        chatInput.value.trim(),
      );
      chatInput.value = "";
      if (chatStatus) {
        chatStatus.textContent = "Message sent.";
      }
      await loadMessages();
    } catch (error) {
      if (chatStatus) {
        const msg = error?.shortMessage || error?.message || "Send failed";
        chatStatus.textContent = msg.length > 120 ? `${msg.slice(0, 117)}…` : msg;
      }
    } finally {
      chatSendInFlight = false;
      updateUi();
    }
  }

  try {
    isChatCollapsed = localStorage.getItem(CHAT_COLLAPSE_KEY) === "1";
  } catch {
    isChatCollapsed = false;
  }

  chatInput?.addEventListener("input", updateUi);
  chatSendBtn?.addEventListener("click", () => {
    void onSend();
  });
  chatToggleBtn?.addEventListener("click", () => {
    isChatCollapsed = !isChatCollapsed;
    try {
      localStorage.setItem(CHAT_COLLAPSE_KEY, isChatCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
    updateUi();
  });
  chatTabGlobal?.addEventListener("click", () => {
    activeChatRoom = "global";
    updateUi();
    void loadMessages();
  });
  chatTabRoom?.addEventListener("click", () => {
    if (!account) {
      if (chatStatus) {
        chatStatus.textContent = "Connect wallet to open My Room.";
      }
      return;
    }
    activeChatRoom = "room";
    updateUi();
    void loadMessages();
  });

  void detectAccount();
  void loadMessages();
  window.setInterval(() => {
    void detectAccount();
    void loadMessages();
  }, 8000);
  updateUi();
}
