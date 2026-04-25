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
const CHAT_FLOOD_MESSAGES_KEY = "quai_chat_flood_local_v1";
const CHAT_FLOOD_MAX_MESSAGES = 120;

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
  const chatTabFlood = document.getElementById("chatTabFlood");
  const chatTabDirect = document.getElementById("chatTabDirect");
  const chatTabs = Array.from(chatPanel.querySelectorAll(".chat-tab"));
  const chatTabsWrap = chatPanel.querySelector(".chat-tabs");
  const chatDirectWrap = document.getElementById("chatDirectWrap");
  const chatDirectTo = document.getElementById("chatDirectTo");
  const chatMessages = document.getElementById("chatMessages");
  const chatInput = document.getElementById("chatInput");
  const chatSendBtn = document.getElementById("chatSendBtn");
  const chatStatus = document.getElementById("chatStatus");
  const chatContractHint = document.getElementById("chatContractHint");
  const chatDeployBtn = document.getElementById("chatDeployBtn");

  if (!chatPanel || !chatMessages) {
    return;
  }

  let account = "";
  let activeChatRoom = "flood";
  let chatSendInFlight = false;
  let chatMessagesCache = [];
  let isChatCollapsed = false;
  let chatLoadToken = 0;

  function isValidAddress(value) {
    return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
  }

  function directTargetAddress() {
    return String(chatDirectTo?.value || "").trim();
  }

  function syncActiveTabs() {
    for (const tab of chatTabs) {
      const room = tab.getAttribute("data-room");
      tab.className = room === activeChatRoom ? "chat-tab chat-tab--active" : "chat-tab";
    }
  }

  function setActiveChatRoom(nextRoom, { load = true } = {}) {
    activeChatRoom = nextRoom;
    syncActiveTabs();
    // Immediately reset visible list on channel switch to avoid stale overlap.
    chatMessagesCache = [];
    renderChatMessages();
    updateUi();
    if (load) {
      void loadMessages();
    }
  }

  function readFloodMessages() {
    try {
      const raw = localStorage.getItem(CHAT_FLOOD_MESSAGES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((m) => ({
          author: String(m?.author ?? ""),
          text: String(m?.text ?? ""),
          timestamp: BigInt(Number(m?.timestamp ?? 0)),
        }))
        .filter((m) => m.text.trim().length > 0);
    } catch {
      return [];
    }
  }

  function writeFloodMessages(rows) {
    try {
      const payload = rows.slice(-CHAT_FLOOD_MAX_MESSAGES).map((m) => ({
        author: String(m.author ?? ""),
        text: String(m.text ?? ""),
        timestamp: Number(m.timestamp ?? 0n),
      }));
      localStorage.setItem(CHAT_FLOOD_MESSAGES_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  function currentChatRoomKey() {
    if (activeChatRoom === "direct") {
      const to = directTargetAddress();
      if (isValidAddress(to)) {
        try {
          return walletRoomKey(to);
        } catch {
          return GAME_MESSENGER_GLOBAL_ROOM;
        }
      }
      return GAME_MESSENGER_GLOBAL_ROOM;
    }
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
    syncActiveTabs();
    const messengerAddr = getGameMessengerAddress();
    if (chatContractHint) {
      if (activeChatRoom === "flood") {
        chatContractHint.textContent = "Flood: private local channel (off-chain)";
      } else if (activeChatRoom === "direct") {
        const to = directTargetAddress();
        chatContractHint.textContent = isValidAddress(to)
          ? `Direct room: ${shortenAddress(to)}`
          : "Direct room: enter valid 0x address";
      } else {
        chatContractHint.textContent = messengerAddr
          ? `Contract: ${shortenAddress(messengerAddr)}`
          : "Contract: not configured";
      }
    }
    if (chatTabGlobal) {
      chatTabGlobal.disabled = false;
    }
    if (chatTabFlood) {
      chatTabFlood.disabled = false;
    }
    if (chatTabDirect) {
      chatTabDirect.disabled = false;
    }
    if (chatTabRoom) {
      chatTabRoom.disabled = !account;
    }
    if (chatDirectWrap) {
      chatDirectWrap.hidden = activeChatRoom !== "direct";
    }
    if (chatSendBtn) {
      if (activeChatRoom === "flood") {
        chatSendBtn.disabled = !chatInput?.value?.trim() || chatSendInFlight;
      } else {
        const directOk = activeChatRoom !== "direct" || isValidAddress(directTargetAddress());
        chatSendBtn.disabled =
          !account ||
          !messengerAddr ||
          !directOk ||
          !chatInput?.value?.trim() ||
          chatSendInFlight;
      }
    }
    if (chatDeployBtn) {
      chatDeployBtn.hidden = true;
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
    const token = ++chatLoadToken;
    const roomAtStart = activeChatRoom;

    if (activeChatRoom === "flood") {
      const rows = readFloodMessages();
      if (token !== chatLoadToken || activeChatRoom !== roomAtStart) {
        return;
      }
      chatMessagesCache = rows;
      renderChatMessages();
      if (chatStatus && !chatSendInFlight) {
        chatStatus.textContent = "Flood channel is private and stored only in this browser.";
      }
      return;
    }

    if (activeChatRoom === "direct" && !isValidAddress(directTargetAddress())) {
      chatMessagesCache = [];
      renderChatMessages();
      if (chatStatus && !chatSendInFlight) {
        chatStatus.textContent = "Enter recipient wallet address for Direct chat.";
      }
      return;
    }

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
      if (token !== chatLoadToken || activeChatRoom !== roomAtStart) {
        return;
      }
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
      if (token !== chatLoadToken || activeChatRoom !== roomAtStart) {
        return;
      }
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

    if (activeChatRoom === "flood") {
      chatSendInFlight = true;
      updateUi();
      const rows = readFloodMessages();
      rows.push({
        author: account || "Local",
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
        text: chatInput.value.trim(),
      });
      writeFloodMessages(rows);
      chatInput.value = "";
      chatMessagesCache = rows;
      renderChatMessages();
      if (chatStatus) {
        chatStatus.textContent = "Message sent to private flood channel.";
      }
      chatSendInFlight = false;
      updateUi();
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
  chatDirectTo?.addEventListener("input", () => {
    updateUi();
    if (activeChatRoom === "direct") {
      void loadMessages();
    }
  });
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
  for (const tab of chatTabs) {
    tab.addEventListener("click", () => {
      const room = tab.getAttribute("data-room");
      if (room === "room" && !account) {
        if (chatStatus) {
          chatStatus.textContent = "Connect wallet to open My Room.";
        }
        return;
      }
      if (room === "global" || room === "room" || room === "flood") {
        setActiveChatRoom(room);
      } else if (room === "direct") {
        setActiveChatRoom(room);
      }
    });
  }

  // Fallback path: delegated click handling to avoid edge cases
  // where per-button listeners are not firing due to DOM/runtime quirks.
  chatTabsWrap?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const btn = target.closest(".chat-tab");
    if (!(btn instanceof HTMLButtonElement)) {
      return;
    }
    const room = btn.getAttribute("data-room");
    if (room === "room" && !account) {
      if (chatStatus) {
        chatStatus.textContent = "Connect wallet to open My Room.";
      }
      return;
    }
    if (room === "global" || room === "room" || room === "flood" || room === "direct") {
      setActiveChatRoom(room);
    }
  });

  void detectAccount();
  setActiveChatRoom("flood", { load: false });
  void loadMessages();
  window.setInterval(() => {
    void detectAccount();
    void loadMessages();
  }, 8000);
  updateUi();
}
