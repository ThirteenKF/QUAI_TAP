import { getGameMessengerAddress } from "../contractConfig.js";
import {
  GAME_MESSENGER_GLOBAL_ROOM,
  assertMessengerContractReadable,
  postMessage,
  readRecentMessages,
  walletRoomKey,
} from "./gameMessengerClient.js";
import { createOffchainFloodRealtime } from "./offchainFloodRealtime.js";
import { ensureActiveQuaiChain, getPelagusEip1193 } from "./wallet/pelagus.js";

const CHAT_COLLAPSE_KEY = "quai_chat_collapsed_v1";
const CHAT_FLOOD_MESSAGES_KEY = "quai_chat_flood_local_v1";
const CHAT_FLOOD_MAX_MESSAGES = 120;
const DIRECT_TAB_BASE_LABEL = "Onchain Secret Direct";
const DIRECT_PREFIX = "@d1:";
const FLOOD_ONCHAIN_MODE = true;

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
  let lastDirectSeenTs = 0n;
  let hasUnreadDirect = false;
  let floodRealtime = null;

  function isValidAddress(value) {
    return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
  }

  function directTargetAddress() {
    return String(chatDirectTo?.value || "").trim();
  }

  function encodeDirectEnvelope(to, text) {
    return `${DIRECT_PREFIX}${to.toLowerCase()}:${text}`;
  }

  function parseDirectEnvelope(rawText) {
    const text = String(rawText || "");
    if (!text.startsWith(DIRECT_PREFIX)) {
      return null;
    }
    const rest = text.slice(DIRECT_PREFIX.length);
    const splitAt = rest.indexOf(":");
    if (splitAt < 0) {
      return null;
    }
    const to = rest.slice(0, splitAt).trim().toLowerCase();
    const body = rest.slice(splitAt + 1);
    if (!/^0x[a-f0-9]{40}$/.test(to) || !body.trim()) {
      return null;
    }
    return { to, body };
  }

  function syncActiveTabs() {
    for (const tab of chatTabs) {
      const room = tab.getAttribute("data-room");
      tab.className = room === activeChatRoom ? "chat-tab chat-tab--active" : "chat-tab";
    }
    if (chatTabDirect) {
      chatTabDirect.textContent = hasUnreadDirect
        ? `${DIRECT_TAB_BASE_LABEL} •`
        : DIRECT_TAB_BASE_LABEL;
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
          id: String(m?.id ?? ""),
          author: String(m?.author ?? ""),
          text: String(m?.text ?? ""),
          timestamp: BigInt(Number(m?.timestamp ?? 0)),
        }))
        .filter((m) => m.id && m.text.trim().length > 0);
    } catch {
      return [];
    }
  }

  function writeFloodMessages(rows) {
    try {
      const payload = rows.slice(-CHAT_FLOOD_MAX_MESSAGES).map((m) => ({
        id: String(m.id ?? ""),
        author: String(m.author ?? ""),
        text: String(m.text ?? ""),
        timestamp: Number(m.timestamp ?? 0n),
      }));
      localStorage.setItem(CHAT_FLOOD_MESSAGES_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  function normalizeFloodMessage(m) {
    const id = String(m?.id ?? "").trim();
    const author = String(m?.author ?? "").trim();
    const text = String(m?.text ?? "").trim();
    const ts = Number(m?.timestamp ?? 0);
    if (!id || !text) {
      return null;
    }
    const safeTs = Number.isFinite(ts) && ts > 0 ? ts : Math.floor(Date.now() / 1000);
    return {
      id,
      author,
      text,
      timestamp: BigInt(safeTs),
    };
  }

  function mergeFloodMessage(payload, { rerender = true } = {}) {
    const next = normalizeFloodMessage(payload);
    if (!next) {
      return;
    }
    const rows = readFloodMessages();
    if (rows.some((m) => m.id === next.id)) {
      return;
    }
    rows.push(next);
    writeFloodMessages(rows);
    if (rerender && activeChatRoom === "flood") {
      chatMessagesCache = rows;
      renderChatMessages();
    }
  }

  function currentChatRoomKey() {
    if (activeChatRoom === "flood") {
      return GAME_MESSENGER_GLOBAL_ROOM;
    }
    if (activeChatRoom === "direct") {
      if (!account) {
        return GAME_MESSENGER_GLOBAL_ROOM;
      }
      // Contract only allows GLOBAL or sender room for postMessage().
      // Direct uses global envelope + recipient filtering.
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
        chatContractHint.textContent = FLOOD_ONCHAIN_MODE
          ? "Flood: on-chain global channel"
          : floodRealtime?.enabled === true
            ? "Flood: off-chain realtime channel"
            : "Flood: local-only (set Supabase env for realtime)";
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
      if (activeChatRoom === "flood" && !FLOOD_ONCHAIN_MODE) {
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

    if (activeChatRoom === "flood" && !FLOOD_ONCHAIN_MODE) {
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
      const mapped = rows.map((m) => ({
        author: String(m.author ?? ""),
        timestamp: BigInt(m.timestamp ?? 0n),
        text: String(m.text ?? ""),
      }));
      if (activeChatRoom === "direct" && account) {
        const me = account.toLowerCase();
        chatMessagesCache = mapped
          .map((m) => {
            const env = parseDirectEnvelope(m.text);
            if (!env || env.to !== me) {
              return null;
            }
            return { ...m, text: env.body };
          })
          .filter(Boolean);
      } else {
        chatMessagesCache = mapped;
      }
      if (activeChatRoom === "direct") {
        const newestTs = chatMessagesCache.reduce(
          (max, m) => (m.timestamp > max ? m.timestamp : max),
          0n,
        );
        lastDirectSeenTs = newestTs;
        hasUnreadDirect = false;
      }
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

    if (activeChatRoom === "flood" && !FLOOD_ONCHAIN_MODE) {
      chatSendInFlight = true;
      updateUi();
      const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        author: account || "Local",
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
        text: chatInput.value.trim(),
      };
      const rows = readFloodMessages();
      rows.push(message);
      writeFloodMessages(rows);
      if (floodRealtime?.enabled) {
        try {
          await floodRealtime.sendMessage({
            ...message,
            timestamp: Number(message.timestamp),
          });
        } catch {
          // keep local send even if realtime failed
        }
      }
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
      const roomKey =
        activeChatRoom === "direct"
          ? (() => {
              const to = directTargetAddress();
              if (!isValidAddress(to)) {
                throw new Error("Enter valid recipient 0x address.");
              }
              return GAME_MESSENGER_GLOBAL_ROOM;
            })()
          : currentChatRoomKey();
      const outgoingText =
        activeChatRoom === "direct"
          ? encodeDirectEnvelope(directTargetAddress(), chatInput.value.trim())
          : chatInput.value.trim();
      await postMessage(
        provider,
        contractAddr,
        roomKey,
        outgoingText,
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

  async function pollDirectInbox() {
    if (!account) {
      return;
    }
    const contractAddr = getGameMessengerAddress();
    const provider = getPelagusEip1193();
    if (!provider || !contractAddr) {
      return;
    }
    try {
      await assertMessengerContractReadable(provider, contractAddr);
      const roomKey = GAME_MESSENGER_GLOBAL_ROOM;
      const rows = await readRecentMessages(provider, contractAddr, roomKey, 20);
      const me = account.toLowerCase();
      const mapped = rows
        .map((m) => ({
          author: String(m.author ?? ""),
          timestamp: BigInt(m.timestamp ?? 0n),
          text: String(m.text ?? ""),
        }))
        .map((m) => {
          const env = parseDirectEnvelope(m.text);
          if (!env || env.to !== me) {
            return null;
          }
          return { ...m, text: env.body };
        })
        .filter(Boolean);
      const newestTs = mapped.reduce(
        (max, m) => (m.timestamp > max ? m.timestamp : max),
        0n,
      );
      if (newestTs > lastDirectSeenTs) {
        // Don't mark unread while already in direct tab.
        if (activeChatRoom !== "direct") {
          hasUnreadDirect = true;
          if (chatStatus) {
            const newest = [...mapped].sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1))[0];
            if (newest) {
              chatStatus.textContent = `New direct message from ${shortenAddress(newest.author)}.`;
            }
          }
          updateUi();
        }
        lastDirectSeenTs = newestTs;
      }
    } catch {
      // ignore background poll errors
    }
  }

  try {
    isChatCollapsed = localStorage.getItem(CHAT_COLLAPSE_KEY) === "1";
  } catch {
    isChatCollapsed = false;
  }

  chatInput?.addEventListener("input", updateUi);
  chatDirectTo?.addEventListener("input", updateUi);
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
        hasUnreadDirect = false;
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
      if (room === "direct") {
        hasUnreadDirect = false;
      }
      setActiveChatRoom(room);
    }
  });

  void detectAccount();
  if (!FLOOD_ONCHAIN_MODE) {
    floodRealtime = createOffchainFloodRealtime((payload) => {
      mergeFloodMessage(payload);
    });
  }
  setActiveChatRoom("flood", { load: false });
  void loadMessages();
  if (!FLOOD_ONCHAIN_MODE) {
    window.addEventListener("storage", (event) => {
      if (event.key !== CHAT_FLOOD_MESSAGES_KEY) {
        return;
      }
      if (activeChatRoom === "flood") {
        void loadMessages();
      }
    });
  }
  window.setInterval(() => {
    void detectAccount();
    void loadMessages();
    void pollDirectInbox();
  }, 8000);
  updateUi();
}
