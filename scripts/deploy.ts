import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

type RepairProofArtifact = {
  abi: ethers.InterfaceAbi;
  bytecode: string;
};

async function main() {
  const rpcUrl = process.env.GETH_RPC_URL || "http://127.0.0.1:8545";
  const expectedChainId = Number(process.env.GETH_CHAIN_ID || "1337");
  const configuredAddress = process.env.GETH_ACCOUNT_ADDRESS || process.env.BLOCKCHAIN_ACCOUNT_ADDRESS || "";
  const artifactPath = path.resolve("artifacts/contracts/RepairProof.sol/RepairProof.json");

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`contract artifact not found: ${artifactPath}; run npm run compile first`);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as RepairProofArtifact;
  const provider = new ethers.JsonRpcProvider(rpcUrl, expectedChainId);
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(expectedChainId)) {
    throw new Error(`chain id mismatch: expected ${expectedChainId}, got ${network.chainId}`);
  }

  const accounts = (await provider.send("eth_accounts", [])) as string[];
  const deployerAddress = configuredAddress || accounts[0] || "";
  if (!deployerAddress) {
    throw new Error("no unlocked Geth account available; set GETH_ACCOUNT_ADDRESS or unlock an account");
  }
  if (!accounts.some((account) => account.toLowerCase() === deployerAddress.toLowerCase())) {
    throw new Error(`Geth account is not unlocked: ${deployerAddress}`);
  }

  const deployer = await provider.getSigner(deployerAddress);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const contract = await factory.deploy();
  const deploymentTransaction = contract.deploymentTransaction();
  await contract.waitForDeployment();

  console.log(`rpc: ${rpcUrl}`);
  console.log(`chainId: ${network.chainId}`);
  console.log(`deployer: ${deployerAddress}`);
  console.log(`deployment transaction: ${deploymentTransaction?.hash || "unknown"}`);
  console.log(`RepairProof: ${await contract.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
