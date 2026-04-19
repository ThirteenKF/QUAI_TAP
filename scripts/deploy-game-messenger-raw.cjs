const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet } = require("quais");
require("dotenv").config();

const RPC_URL = process.env.RPC_URL || "https://rpc.quai.network/cyprus1";
const CHAIN_ID = 9;
const GAS_LIMIT = 6_000_000n;

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
        },
      },
      (res) => {
        let out = "";
        res.on("data", (c) => {
          out += c;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(out);
            if (parsed.error) {
              reject(new Error(parsed.error.message || "RPC error"));
              return;
            }
            resolve(parsed.result);
          } catch (e) {
            reject(e);
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
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const pk = process.env.PRIVATE_KEY || process.env.CYPRUS1_PK;
  if (!pk) {
    throw new Error("Missing PRIVATE_KEY/CYPRUS1_PK");
  }
  const wallet = new Wallet(pk);

  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "GameMessenger.sol",
    "GameMessenger.json",
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error("Missing artifact. Run: npm run compile");
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const bytecode = artifact.bytecode;
  if (!bytecode || bytecode === "0x") {
    throw new Error("Empty bytecode in artifact");
  }

  const [nonceHex, gasPriceHex, balanceHex] = await Promise.all([
    rpc("eth_getTransactionCount", [wallet.address, "latest"]),
    rpc("eth_gasPrice", []),
    rpc("eth_getBalance", [wallet.address, "latest"]),
  ]);
  const nonce = BigInt(nonceHex);
  const gasPrice = BigInt(gasPriceHex);
  const balance = BigInt(balanceHex);
  const required = gasPrice * GAS_LIMIT;
  if (balance < required) {
    throw new Error(
      `Insufficient balance. Need at least ${required} wei, got ${balance} wei`,
    );
  }

  const tx = {
    chainId: CHAIN_ID,
    nonce,
    gasPrice,
    gasLimit: GAS_LIMIT,
    value: 0n,
    data: bytecode,
  };
  const signed = await wallet.signTransaction(tx);
  const txHash = await rpc("eth_sendRawTransaction", [signed]);
  console.log("Transaction broadcasted:", txHash);

  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (receipt && receipt.contractAddress) {
      console.log("GameMessenger deployed to:", receipt.contractAddress);
      return;
    }
    await sleep(4000);
  }
  throw new Error("Timed out waiting for deployment receipt");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
