/**
 * Quais ожидает JSON-RPC с префиксом quai_* (quai_accounts, quai_sendTransaction…).
 * Pelagus иногда отдаёт только eth_* — тогда подпись/деплой не доходят до кошелька.
 * Оборачиваем EIP-1193 провайдер: при ошибке «method not found» пробуем пару eth_*.
 */
const QUA_TO_ETH = {
  quai_accounts: "eth_accounts",
  quai_requestAccounts: "eth_requestAccounts",
  quai_chainId: "eth_chainId",
  quai_getTransactionCount: "eth_getTransactionCount",
  quai_estimateGas: "eth_estimateGas",
  quai_sendTransaction: "eth_sendTransaction",
  quai_call: "eth_call",
  quai_getTransactionByHash: "eth_getTransactionByHash",
  quai_getTransactionReceipt: "eth_getTransactionReceipt",
  quai_getBlockByNumber: "eth_getBlockByNumber",
  quai_gasPrice: "eth_gasPrice",
  quai_maxPriorityFeePerGas: "eth_maxPriorityFeePerGas",
};

function shouldTryEthFallback(error) {
  const msg = String(error?.message ?? error ?? "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("not supported") ||
    msg.includes("unauthorized method") ||
    msg.includes("invalid request") ||
    error?.code === 4200
  );
}

export function wrapEip1193ForQuais(injected) {
  if (!injected?.request) {
    return injected;
  }

  const rawRequest = injected.request.bind(injected);

  return {
    request: async (payload) => {
      const method = payload.method;
      const params = payload.params;
      const shard = payload.shard;

      try {
        return await rawRequest({ method, params, shard });
      } catch (err) {
        const fallback = QUA_TO_ETH[method];
        if (fallback && shouldTryEthFallback(err)) {
          return await rawRequest({ method: fallback, params, shard });
        }
        throw err;
      }
    },
    on: injected.on?.bind(injected),
    removeListener: injected.removeListener?.bind(injected),
  };
}
