const fs = require("fs");
const path = require("path");
const https = require("https");
const quais = require("quais");
require("dotenv").config();

const RPC_URL = process.env.RPC_URL || "https://rpc.quai.network/cyprus1";
const CHAIN_ID = 9;
const BUMP_GAS_LIMIT = 21_000n;
const DEPLOY_GAS_LIMIT = 6_000_000n;
const TARGET_ZONE = "0x00";

function rpc(method, params) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params,
  });
  return new Promise((resolve, reject) => {
    const req = https.request(
      RPC_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        let out = "";
        res.on("data", (d) => {
          out += d;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(out);
            if (parsed.error) {
              reject(new Error(parsed.error.message || "RPC error"));
              return;
            }
            resolve(parsed.result);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitReceipt(txHash, timeoutMs = 600_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (receipt) {
      return receipt;
    }
    await sleep(3000);
  }
  throw new Error(`Timeout waiting receipt: ${txHash}`);
}

function findTargetNonce(from, startNonce) {
  for (let nonce = startNonce; nonce < startNonce + 10_000; nonce += 1) {
    const addr = quais.getCreateAddress({ from, nonce });
    if (quais.getZoneForAddress(addr) === TARGET_ZONE) {
      return { nonce, address: addr };
    }
  }
  throw new Error("Could not find target nonce for zone 0x00");
}

async function main() {
  const pk = process.env.PRIVATE_KEY || process.env.CYPRUS1_PK;
  if (!pk) {
    throw new Error("Missing PRIVATE_KEY/CYPRUS1_PK in .env");
  }

  const wallet = new quais.Wallet(pk);
  const from = wallet.address;

  const nonceHex = await rpc("eth_getTransactionCount", [from, "latest"]);
  const gasPriceHex = await rpc("eth_gasPrice", []);
  const startNonce = Number(BigInt(nonceHex));
  const gasPrice = BigInt(gasPriceHex);

  const target = findTargetNonce(from, startNonce);
  console.log("Current nonce:", startNonce);
  console.log("Target nonce:", target.nonce);
  console.log("Target contract address:", target.address);
  console.log("Bump tx count:", target.nonce - startNonce);

  for (let nonce = startNonce; nonce < target.nonce; nonce += 1) {
    const tx = {
      type: 0,
      chainId: CHAIN_ID,
      nonce,
      to: from,
      value: 0n,
      gasLimit: BUMP_GAS_LIMIT,
      gasPrice,
    };
    const signed = await wallet.signTransaction(tx);
    const txHash = await rpc("eth_sendRawTransaction", [signed]);
    if ((nonce - startNonce + 1) % 10 === 0 || nonce === target.nonce - 1) {
      console.log(`Bump ${nonce - startNonce + 1}/${target.nonce - startNonce}: ${txHash}`);
    }
  }

  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "GameMessenger.sol",
    "GameMessenger.json",
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const deployTx = {
    type: 0,
    chainId: CHAIN_ID,
    nonce: target.nonce,
    gasPrice,
    gasLimit: DEPLOY_GAS_LIMIT,
    value: 0n,
    data: artifact.bytecode,
  };
  const deploySigned = await wallet.signTransaction(deployTx);
  const deployHash = await rpc("eth_sendRawTransaction", [deploySigned]);
  console.log("Deploy tx:", deployHash);

  const receipt = await waitReceipt(deployHash, 1_200_000);
  console.log("GameMessenger deployed to:", receipt.contractAddress || target.address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
