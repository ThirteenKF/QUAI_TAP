/**
 * Деплой MinersRoomDonate (то же окружение, что и TapCounter).
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
  const ipfsHash = await hre.deployMetadata.pushMetadataToIPFS("MinersRoomDonate");
  if (!ipfsHash || String(ipfsHash).length !== 46) {
    throw new Error(
      "IPFS-метаданные для деплоя не получены. Проверь bytecodeHash: 'ipfs' в hardhat.config и доступ к IPFS.",
    );
  }

  const provider = new quais.JsonRpcProvider(url, undefined, {
    usePathing: true,
  });
  const wallet = new quais.Wallet(pk, provider);

  const artifact = await hre.artifacts.readArtifact("MinersRoomDonate");
  const factory = new quais.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet,
    ipfsHash,
  );

  const c = await factory.deploy();
  const deployTx = c.deploymentTransaction();
  if (deployTx?.hash) {
    console.log("Transaction broadcasted:", deployTx.hash);
  }
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log("MinersRoomDonate deployed to:", addr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
