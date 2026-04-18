import {
  BrowserProvider,
  Contract,
  ContractFactory,
  getAddress,
  parseQuai,
} from "quais";
import minersRoomDonateArtifact from "../minersRoomDonateArtifact.json";
import { prepareWalletUiFocus } from "./wallet/pelagus.js";
import {
  QUAIS_DEPLOY_IPFS_PLACEHOLDER,
  DEPLOY_GAS_LIMIT,
  withTimeout,
} from "./tapCounterClient.js";

export const DONATE_ABI = minersRoomDonateArtifact.abi;

/** Простой форвардинг value — лимит с запасом под Quai. */
export const DONATE_GAS_LIMIT = 800_000n;

export async function deployMinersRoomDonate(eip1193Provider) {
  await eip1193Provider.request({ method: "eth_requestAccounts" });

  const browserProvider = new BrowserProvider(eip1193Provider);
  const signer = await browserProvider.getSigner();
  const factory = ContractFactory.fromSolidity(minersRoomDonateArtifact, signer);
  factory.setIPFSHash(QUAIS_DEPLOY_IPFS_PLACEHOLDER);
  prepareWalletUiFocus();
  const contract = await withTimeout(
    factory.deploy({ gasLimit: DEPLOY_GAS_LIMIT }),
    180_000,
    "Donate deploy: no response for 3 min. Reload the page and Pelagus.",
  );
  await contract.waitForDeployment();
  return contract.getAddress();
}

/**
 * @param {string} amountQuai — например "0.5" или "10"
 */
export async function sendMinersRoomDonate(eip1193Provider, contractAddr, amountQuai) {
  const value = parseQuai(String(amountQuai).trim());
  if (value <= 0n) {
    throw new Error("Enter an amount greater than 0");
  }

  const browserProvider = new BrowserProvider(eip1193Provider);
  const signer = await browserProvider.getSigner();
  const to = getAddress(String(contractAddr).trim());
  const contract = new Contract(to, DONATE_ABI, signer);
  prepareWalletUiFocus();
  const tx = await contract.donate({
    gasLimit: DONATE_GAS_LIMIT,
    value,
  });
  await tx.wait();
}
