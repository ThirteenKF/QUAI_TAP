/**
 * Конфиг сетей Quai (аналог defineChain в viem / chain в wagmi).
 * Активная сеть выбирается через VITE_QUAI_CHAIN_ID.
 */

const raw = import.meta.env.VITE_QUAI_CHAIN_ID;
const chainIdFromEnv =
  raw !== undefined && raw !== "" ? Number.parseInt(String(raw), 10) : 9;

/** Mainnet Cyprus-1 */
export const quaiMainnet = {
  id: 9,
  name: "Quai Network",
  nativeCurrency: { name: "QUAI", symbol: "QUAI", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.quai.network/cyprus1"] },
  },
};

/** Orchard testnet */
export const quaiOrchard = {
  id: 15000,
  name: "Quai Orchard Testnet",
  nativeCurrency: { name: "QUAI", symbol: "QUAI", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://orchard.rpc.quai.network/cyprus1"] },
  },
};

const byId = {
  9: quaiMainnet,
  15000: quaiOrchard,
};

export function getActiveChain() {
  if (byId[chainIdFromEnv]) {
    return byId[chainIdFromEnv];
  }
  const rpc = import.meta.env.VITE_QUAI_RPC_URL?.trim();
  if (rpc && Number.isFinite(chainIdFromEnv)) {
    return {
      id: chainIdFromEnv,
      name: `Quai (chain ${chainIdFromEnv})`,
      nativeCurrency: { name: "QUAI", symbol: "QUAI", decimals: 18 },
      rpcUrls: { default: { http: [rpc] } },
    };
  }
  return quaiMainnet;
}

export const ACTIVE_CHAIN = getActiveChain();
