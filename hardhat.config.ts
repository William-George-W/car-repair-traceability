import "@nomicfoundation/hardhat-toolbox";
import type { HardhatUserConfig } from "hardhat/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    },
    geth: {
      url: process.env.GETH_RPC_URL || "http://127.0.0.1:8545",
      chainId: process.env.GETH_CHAIN_ID ? Number(process.env.GETH_CHAIN_ID) : 1337,
      accounts: process.env.GETH_PRIVATE_KEY ? [process.env.GETH_PRIVATE_KEY] : []
    }
  }
};

export default config;
