import { getActiveChain } from "../../config/chains.js";
import { wrapEip1193ForQuais } from "../quaiEip1193Shim.js";

/**
 * Pelagus для Quai: сначала window.pelagus, иначе провайдер с флагом Pelagus в window.ethereum (EIP-6963 / multi-wallet).
 * Не подставляем «первый попавшийся» MetaMask — только явно помеченный Pelagus.
 */
export function getPelagusEip1193() {
  const fromGlobal = window.pelagus?.ethereum || window.pelagus;
  if (fromGlobal?.request) {
    return wrapEip1193ForQuais(fromGlobal);
  }

  const injected = window.ethereum;
  if (!injected?.request) {
    return null;
  }

  if (Array.isArray(injected.providers) && injected.providers.length) {
    const pelagusProvider = injected.providers.find((provider) => {
      return (
        provider?.isPelagus ||
        provider?.providerInfo?.name?.toLowerCase?.().includes("pelagus") ||
        provider?.constructor?.name?.toLowerCase?.().includes("pelagus")
      );
    });
    if (pelagusProvider?.request) {
      return wrapEip1193ForQuais(pelagusProvider);
    }
    return null;
  }

  if (injected.isPelagus) {
    return wrapEip1193ForQuais(injected);
  }

  return null;
}

export function chainIdToHex(chainId) {
  return `0x${BigInt(chainId).toString(16)}`;
}

/**
 * Поднимает окно браузера с вкладкой на передний план перед запросом к кошельку.
 * Окно расширения рисует сам браузер; так меньше шанс, что Pelagus окажется «под» другим окном ОС.
 */
export function prepareWalletUiFocus() {
  try {
    window.focus();
  } catch {
    // ignore
  }
}

/**
 * Переключение сети: wallet_switchEthereumChain → при 4902 — wallet_addEthereumChain.
 */
export async function ensureActiveQuaiChain(provider) {
  const chain = getActiveChain();
  const hex = await provider.request({ method: "eth_chainId" });
  const current = BigInt(hex);
  const expected = BigInt(chain.id);
  if (current === expected) {
    return;
  }

  prepareWalletUiFocus();
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdToHex(chain.id) }],
    });
  } catch (error) {
    const code = error?.code ?? error?.data?.originalError?.code;
    if (code === 4902) {
      prepareWalletUiFocus();
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdToHex(chain.id),
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [chain.rpcUrls.default.http[0]],
          },
        ],
      });
      prepareWalletUiFocus();
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdToHex(chain.id) }],
      });
      return;
    }
    throw error;
  }
}
