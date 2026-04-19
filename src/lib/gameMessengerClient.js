import { BrowserProvider, Contract, ContractFactory, getAddress, keccak256 } from "quais";
import gameMessengerArtifact from "../gameMessengerArtifact.json";
import { prepareWalletUiFocus } from "./wallet/pelagus.js";
import {
  QUAIS_DEPLOY_IPFS_PLACEHOLDER,
  DEPLOY_GAS_LIMIT,
  withTimeout,
} from "./tapCounterClient.js";

export const GAME_MESSENGER_ABI = gameMessengerArtifact.abi;
export const GAME_MESSENGER_GLOBAL_ROOM = `0x${"00".repeat(32)}`;
export const GAME_MESSENGER_POST_GAS_LIMIT = 1_200_000n;

export function walletRoomKey(address) {
  return keccak256(getAddress(String(address).trim()));
}

export async function deployGameMessenger(eip1193Provider) {
  await eip1193Provider.request({ method: "eth_requestAccounts" });

  const browserProvider = new BrowserProvider(eip1193Provider);
  const signer = await browserProvider.getSigner();
  const factory = ContractFactory.fromSolidity(gameMessengerArtifact, signer);
  factory.setIPFSHash(QUAIS_DEPLOY_IPFS_PLACEHOLDER);
  prepareWalletUiFocus();
  const contract = await withTimeout(
    factory.deploy({ gasLimit: DEPLOY_GAS_LIMIT }),
    180_000,
    "Messenger deploy: no response for 3 min. Reload the page and Pelagus.",
  );
  await contract.waitForDeployment();
  return contract.getAddress();
}

export async function postMessage(eip1193Provider, contractAddr, roomKey, text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("Enter a message");
  }

  const browserProvider = new BrowserProvider(eip1193Provider);
  const signer = await browserProvider.getSigner();
  const to = getAddress(String(contractAddr).trim());
  const contract = new Contract(to, GAME_MESSENGER_ABI, signer);
  prepareWalletUiFocus();
  const tx = await contract.postMessage(roomKey, trimmed, {
    gasLimit: GAME_MESSENGER_POST_GAS_LIMIT,
  });
  await tx.wait();
}

export async function readRecentMessages(
  eip1193Provider,
  contractAddr,
  roomKey,
  limit = 25,
) {
  const browserProvider = new BrowserProvider(eip1193Provider);
  const to = getAddress(String(contractAddr).trim());
  const contract = new Contract(to, GAME_MESSENGER_ABI, browserProvider);
  return contract.getRecentMessages(roomKey, limit);
}
