/**
 * Проверка shim: при «method not found» для quai_accounts вызывается eth_accounts.
 * Запуск: node scripts/test-quai-shim.mjs
 */
import { wrapEip1193ForQuais } from "../src/lib/quaiEip1193Shim.js";

const mock = {
  request: async ({ method }) => {
    if (method === "quai_accounts") {
      const e = new Error("the method quai_accounts does not exist");
      e.code = 4200;
      throw e;
    }
    if (method === "eth_accounts") {
      return ["0x0000000000000000000000000000000000000001"];
    }
    throw new Error(`unexpected ${method}`);
  },
};

const wrapped = wrapEip1193ForQuais(mock);
const out = await wrapped.request({ method: "quai_accounts", params: [] });
if (out[0] !== "0x0000000000000000000000000000000000000001") {
  console.error("FAIL", out);
  process.exit(1);
}
console.log("OK: quai_accounts -> eth_accounts fallback works");
