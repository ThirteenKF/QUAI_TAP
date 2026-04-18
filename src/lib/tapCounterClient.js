import {
  BrowserProvider,
  Contract,
  ContractFactory,
  parseQuai,
  getAddress,
} from "quais";
import tapCounterArtifact from "../tapCounterArtifact.json";
import { prepareWalletUiFocus } from "./wallet/pelagus.js";

/** Quais ContractFactory.deploy() требует setIPFSHash ровно из 46 символов. */
export const QUAIS_DEPLOY_IPFS_PLACEHOLDER = `Qm${"0".repeat(44)}`;

/** Деплой с «солью» для Quai shard — данных больше, чем у чистого bytecode; заниженный лимит даёт откат в Pelagus. */
export const DEPLOY_GAS_LIMIT = 6_000_000n;
/** Коммит с переводом 10 QUAI + прокид value — запас по газу для Quai. */
export const COMMIT_TAPS_GAS_LIMIT = 2_500_000n;

/** 10 QUAI (18 decimals, как в контракте FEE_PER_BATCH). */
export const FEE_PER_BATCH_WEI = parseQuai("10");
export const EXPECTED_FEE_RECIPIENT = getAddress(
  "0x006a2868356044940BEb8773B0ca13a2b0A4AF62",
);
export const EXPECTED_TAP_BATCH = 10n;

export const TAP_ABI = tapCounterArtifact.abi;

export function withTimeout(promise, ms, errorText) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(errorText || `Timeout ${ms} ms`));
      }, ms);
    }),
  ]);
}

export async function readTotalTaps(eip1193Provider, contractAddr, userAddr) {
  const browserProvider = new BrowserProvider(eip1193Provider);
  const to = getAddress(String(contractAddr).trim());
  const who = getAddress(String(userAddr).trim());
  const contract = new Contract(to, TAP_ABI, browserProvider);
  return contract.totalTaps(who);
}

/**
 * Деплой из браузера (как «write contract» в Rabby).
 */
export async function deployTapCounter(eip1193Provider) {
  await eip1193Provider.request({ method: "eth_requestAccounts" });

  const browserProvider = new BrowserProvider(eip1193Provider);
  const signer = await browserProvider.getSigner();
  const factory = ContractFactory.fromSolidity(tapCounterArtifact, signer);
  factory.setIPFSHash(QUAIS_DEPLOY_IPFS_PLACEHOLDER);
  prepareWalletUiFocus();
  const contract = await withTimeout(
    factory.deploy({ gasLimit: DEPLOY_GAS_LIMIT }),
    180_000,
    "Deploy: no response for 3 min. Reload the page and Pelagus (error “Receiving end does not exist” — try restarting the extension).",
  );
  await contract.waitForDeployment();
  return contract.getAddress();
}

/**
 * Запись партии из 10 тапов + перевод 10 QUAI на адрес из контракта.
 */
export async function sendCommitTenTapsPay(eip1193Provider, contractAddr) {
  const browserProvider = new BrowserProvider(eip1193Provider);
  const signer = await browserProvider.getSigner();
  const to = getAddress(String(contractAddr).trim());
  const contract = new Contract(to, TAP_ABI, signer);
  prepareWalletUiFocus();
  const tx = await contract.commitTenTapsAndPay({
    gasLimit: COMMIT_TAPS_GAS_LIMIT,
    value: FEE_PER_BATCH_WEI,
  });
  await tx.wait();
}

const contractValidationCache = new Map();

/**
 * Проверяет, что контракт по адресу действительно отправляет 10 QUAI на Miners Room.
 * Если адрес указывает на старую версию контракта, бросает понятную ошибку.
 */
export async function assertTapCounterPaymentConfig(
  eip1193Provider,
  contractAddr,
) {
  const to = getAddress(String(contractAddr).trim());
  const cached = contractValidationCache.get(to);
  if (cached === true) {
    return;
  }

  const browserProvider = new BrowserProvider(eip1193Provider);
  const contract = new Contract(to, TAP_ABI, browserProvider);

  let feePerBatch;
  let feeRecipient;
  let tapBatch;
  try {
    [feePerBatch, feeRecipient, tapBatch] = await Promise.all([
      contract.FEE_PER_BATCH(),
      contract.FEE_RECIPIENT(),
      contract.TAP_BATCH(),
    ]);
  } catch {
    throw new Error(
      "Контракт не поддерживает оплату 10 QUAI. Нужен новый деплой через «Запустить игру».",
    );
  }

  const feeOk = BigInt(String(feePerBatch)) === FEE_PER_BATCH_WEI;
  const recipientOk =
    getAddress(String(feeRecipient)) === EXPECTED_FEE_RECIPIENT;
  const batchOk = BigInt(String(tapBatch)) === EXPECTED_TAP_BATCH;

  if (!feeOk || !recipientOk || !batchOk) {
    throw new Error(
      "Outdated contract address. Deploy a new contract with Start game.",
    );
  }

  contractValidationCache.set(to, true);
}
