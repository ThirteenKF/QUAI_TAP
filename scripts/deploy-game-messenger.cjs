/**
 * Деплой GameMessenger через quais + deployMetadata.
 */
const hre = require("hardhat");
const quais = require("quais");
const DEPLOY_GAS_LIMIT = 2_800_000n;

async function main() {
  const pk = hre.network.config.accounts?.[0];
  if (!pk) {
    throw new Error("Задай CYPRUS1_PK или PRIVATE_KEY в .env.");
  }

  const url = hre.network.config.url;
  const ipfsHash = await hre.deployMetadata.pushMetadataToIPFS("GameMessenger");
  if (!ipfsHash || String(ipfsHash).length !== 46) {
    throw new Error(
      "IPFS-метаданные для деплоя не получены. Проверь bytecodeHash: 'ipfs' и доступ к https://ipfs.qu.ai.",
    );
  }

  const provider = new quais.JsonRpcProvider(url, undefined, {
    usePathing: true,
  });
  const wallet = new quais.Wallet(pk, provider);

  const artifact = await hre.artifacts.readArtifact("GameMessenger");
  const factory = new quais.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet,
    ipfsHash,
  );

  console.log("Sending deployment transaction...");
  const c = await withTimeout(
    factory.deploy({ gasLimit: DEPLOY_GAS_LIMIT }),
    900_000,
    "Deploy transaction was not created in 900s. Check RPC and wallet key balance.",
  );
  const deployTx = c.deploymentTransaction();
  if (deployTx?.hash) {
    console.log("Transaction broadcasted:", deployTx.hash);
  }
  await withTimeout(
    c.waitForDeployment(),
    300_000,
    "Deployment tx was sent but not confirmed in 300s.",
  );
  const addr = await c.getAddress();
  console.log("GameMessenger deployed to:", addr);
}

function withTimeout(promise, ms, errorText) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(errorText || `Timeout ${ms} ms`)), ms);
    }),
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
