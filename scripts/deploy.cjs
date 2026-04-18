/**
 * Деплой TapCounter через quais + deployMetadata (как в hardhat-example).
 * @see https://github.com/dominant-strategies/hardhat-example/tree/main/Solidity
 */
const hre = require("hardhat");
const quais = require("quais");

async function main() {
  const pk = hre.network.config.accounts?.[0];
  if (!pk) {
    throw new Error(
      "Задай CYPRUS1_PK или PRIVATE_KEY в .env (см. .env.example).",
    );
  }

  const url = hre.network.config.url;
  const ipfsHash = await hre.deployMetadata.pushMetadataToIPFS("TapCounter");
  if (!ipfsHash || String(ipfsHash).length !== 46) {
    throw new Error(
      "IPFS-метаданные для деплоя не получены. Нужны: bytecodeHash: 'ipfs' в hardhat.config, компиляция и доступ к https://ipfs.qu.ai (см. @quai/hardhat-deploy-metadata).",
    );
  }

  const provider = new quais.JsonRpcProvider(url, undefined, {
    usePathing: true,
  });
  const wallet = new quais.Wallet(pk, provider);

  const artifact = await hre.artifacts.readArtifact("TapCounter");
  const factory = new quais.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet,
    ipfsHash,
  );

  const tapCounter = await factory.deploy();
  const deployTx = tapCounter.deploymentTransaction();
  if (deployTx?.hash) {
    console.log("Transaction broadcasted:", deployTx.hash);
  }
  await tapCounter.waitForDeployment();
  const addr = await tapCounter.getAddress();
  console.log("TapCounter deployed to:", addr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
