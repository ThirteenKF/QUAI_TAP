/**
 * Конфигурация по документации Quai / dominant-strategies hardhat-example:
 * https://github.com/dominant-strategies/hardhat-example/tree/main/Solidity
 */
require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");
require("@quai/quais-upgrades");
require("@quai/hardhat-deploy-metadata");

const accounts = () => {
  const pk = process.env.CYPRUS1_PK || process.env.PRIVATE_KEY;
  return pk ? [pk] : [];
};

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  defaultNetwork: "cyprus1",
  networks: {
    cyprus1: {
      url:
        process.env.RPC_URL ||
        process.env.QUAI_MAINNET_RPC ||
        "https://rpc.quai.network/cyprus1",
      accounts: accounts(),
      chainId: 9,
    },
    orchard: {
      url:
        process.env.RPC_URL ||
        process.env.QUAI_RPC_URL ||
        "https://orchard.rpc.quai.network/cyprus1",
      accounts: accounts(),
      chainId: 15000,
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: { enabled: true, runs: 1000 },
          metadata: {
            bytecodeHash: "ipfs",
            useLiteralContent: true,
          },
          evmVersion: "london",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 20000,
  },
};
