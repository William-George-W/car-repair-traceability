import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ethers } from "ethers";
import { epochSecondsForDate, epochSecondsForDateTime } from "./utils";
import { RepairRecordRow } from "./types";

const repairProofAbi = [
  "function addRepairProof(string certificateNo,string vehicleNo,bytes32 dataHash,uint256 repairTime,uint256 warrantyStart,uint256 warrantyEnd)",
  "function revokeRepairProof(string certificateNo)",
  "function verifyRepairProof(string certificateNo,bytes32 dataHash) view returns (bool)",
];

export interface ChainWriteResult {
  transactionHash: string;
  contractAddress: string;
  chainId: number;
  blockNumber: number;
  chainTimestamp: number;
}

@Injectable()
export class BlockchainService {
  private enabled = String(process.env.BLOCKCHAIN_ENABLED || (process.env.GETH_RPC_URL ? "true" : "false")).toLowerCase() === "true";

  private rpcUrl() { return process.env.BLOCKCHAIN_RPC_URL || process.env.GETH_RPC_URL || "http://127.0.0.1:8545"; }
  private chainId() { return Number(process.env.BLOCKCHAIN_CHAIN_ID || process.env.GETH_CHAIN_ID || 1337); }
  private contractAddress() { return process.env.BLOCKCHAIN_CONTRACT_ADDRESS || ""; }
  configuredContractAddress() { return this.contractAddress(); }
  private legacyContractAddresses() {
    const configured = process.env.BLOCKCHAIN_LEGACY_CONTRACT_ADDRESSES || process.env.GETH_LEGACY_CONTRACT_ADDRESSES || "";
    return configured.split(",").map((address) => address.trim()).filter(Boolean);
  }
  private privateKey() { return process.env.BLOCKCHAIN_PRIVATE_KEY || process.env.GETH_PRIVATE_KEY || ""; }
  private accountAddress() { return process.env.BLOCKCHAIN_ACCOUNT_ADDRESS || process.env.GETH_ACCOUNT_ADDRESS || ""; }

  private provider() {
    const address = this.contractAddress();
    if (!address) throw new ServiceUnavailableException("blockchain contract address is not configured");
    return { provider: new ethers.JsonRpcProvider(this.rpcUrl(), this.chainId()), address };
  }

  private async assertChainReady(provider: ethers.JsonRpcProvider, address: string) {
    const expectedChainId = BigInt(this.chainId());
    const network = await provider.getNetwork();
    if (network.chainId !== expectedChainId) throw new Error(`blockchain chain id mismatch: expected ${expectedChainId}, got ${network.chainId}`);
    const code = await provider.getCode(address);
    if (!code || code === "0x") throw new Error("RepairProof contract is not deployed at the configured address");
  }

  private async signer(provider: ethers.JsonRpcProvider): Promise<ethers.Signer> {
    const privateKey = this.privateKey();
    const accountAddress = this.accountAddress();
    if (privateKey) return new ethers.Wallet(privateKey, provider);
    if (!accountAddress) throw new Error("blockchain account or private key is not configured");
    const accounts = (await provider.send("eth_accounts", [])) as string[];
    if (!accounts.some((account) => account.toLowerCase() === accountAddress.toLowerCase())) throw new Error("Geth account is not unlocked");
    return provider.getSigner(accountAddress);
  }

  async status() {
    const address = this.contractAddress();
    if (!this.enabled) return { enabled: false, available: false, chainId: null, message: "链上写入未启用" };
    if (!address) return { enabled: true, available: false, chainId: null, message: "未配置 RepairProof 合约地址" };
    try {
      const { provider } = this.provider();
      await this.assertChainReady(provider, address);
      const configuredAccount = this.accountAddress().toLowerCase();
      if (!this.privateKey() && !configuredAccount) return { enabled: true, available: false, chainId: this.chainId(), message: "未配置 Geth 上链账户" };
      if (!this.privateKey() && configuredAccount) {
        const accounts = (await provider.send("eth_accounts", [])) as string[];
        if (!accounts.some((account) => account.toLowerCase() === configuredAccount)) return { enabled: true, available: false, chainId: this.chainId(), message: "Geth 账户未解锁" };
      }
      return { enabled: true, available: true, chainId: this.chainId(), message: "链上服务正常" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "链上服务不可用";
      return { enabled: true, available: false, chainId: null, message };
    }
  }

  async addRepairProof(record: RepairRecordRow): Promise<ChainWriteResult | null> {
    if (!this.enabled) return null;
    const { provider, address } = this.provider();
    try {
      await this.assertChainReady(provider, address);
      const signer = await this.signer(provider);
      const contract = new ethers.Contract(address, repairProofAbi, signer);
      const transaction = await contract.addRepairProof(
        record.certificateNo,
        record.vehicleNo,
        `0x${record.dataHash}`,
        epochSecondsForDateTime(record.repairTime),
        epochSecondsForDate(record.warrantyStart),
        epochSecondsForDate(record.warrantyEnd),
      );
      const receipt = await transaction.wait();
      if (!receipt || receipt.status !== 1) throw new Error("blockchain transaction was not confirmed");
      const block = await provider.getBlock(receipt.blockNumber);
      if (!block) throw new Error("confirmed blockchain block could not be loaded");
      return {
        transactionHash: receipt.hash,
        contractAddress: address,
        chainId: this.chainId(),
        blockNumber: receipt.blockNumber,
        chainTimestamp: Number(block.timestamp),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "blockchain transaction failed";
      throw new ServiceUnavailableException(message);
    }
  }

  async revokeRepairProof(record: Pick<RepairRecordRow, "certificateNo" | "status" | "transactionHash" | "contractAddress">): Promise<string | null> {
    if (record.status !== "ON_CHAIN") return null;
    if (!this.enabled) throw new ServiceUnavailableException("blockchain writing is disabled; on-chain revocation cannot be synchronized");

    try {
      const provider = new ethers.JsonRpcProvider(this.rpcUrl(), this.chainId());
      const network = await provider.getNetwork();
      const expectedChainId = BigInt(this.chainId());
      if (network.chainId !== expectedChainId) throw new Error(`blockchain chain id mismatch: expected ${expectedChainId}, got ${network.chainId}`);

      let transactionContract: string | undefined;
      if (record.transactionHash) {
        const transaction = await provider.getTransaction(record.transactionHash);
        transactionContract = transaction?.to || undefined;
      }
      const candidates = [record.contractAddress, transactionContract, this.contractAddress(), ...this.legacyContractAddresses()]
        .filter((address): address is string => Boolean(address))
        .filter((address, index, list) => list.findIndex((item) => item.toLowerCase() === address.toLowerCase()) === index);
      if (!candidates.length) throw new Error("blockchain contract address is not configured");

      let lastError: unknown;
      for (const address of candidates) {
        try {
          await this.assertChainReady(provider, address);
          const contract = new ethers.Contract(address, repairProofAbi, await this.signer(provider));
          const transaction = await contract.revokeRepairProof(record.certificateNo);
          const receipt = await transaction.wait();
          if (!receipt || receipt.status !== 1) throw new Error("blockchain revocation transaction was not confirmed");
          return receipt.hash;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("blockchain revocation failed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "blockchain revocation failed";
      throw new ServiceUnavailableException(message);
    }
  }

  async verifyRepairProof(record: RepairRecordRow): Promise<boolean | null> {
    if (!this.enabled) return null;
    try {
      const provider = new ethers.JsonRpcProvider(this.rpcUrl(), this.chainId());
      const network = await provider.getNetwork();
      const expectedChainId = BigInt(this.chainId());
      if (network.chainId !== expectedChainId) throw new Error(`blockchain chain id mismatch: expected ${expectedChainId}, got ${network.chainId}`);

      // 优先根据交易的 to 地址定位历史记录实际使用的合约，兼容合约重新部署后的旧凭证。
      let transactionContract: string | undefined;
      if (record.transactionHash) {
        const transaction = await provider.getTransaction(record.transactionHash);
        transactionContract = transaction?.to || undefined;
      }
      const candidates = [record.contractAddress, transactionContract, this.contractAddress(), ...this.legacyContractAddresses()]
        .filter((address): address is string => Boolean(address))
        .filter((address, index, list) => list.findIndex((item) => item.toLowerCase() === address.toLowerCase()) === index);
      if (!candidates.length) throw new Error("blockchain contract address is not configured");

      let lastError: unknown;
      let checkedContract = false;
      for (const address of candidates) {
        try {
          await this.assertChainReady(provider, address);
          checkedContract = true;
          const contract = new ethers.Contract(address, repairProofAbi, provider);
          const matched = Boolean(await contract.verifyRepairProof(record.certificateNo, `0x${record.dataHash}`));
          // 记录已保存合约地址时，该地址就是唯一可信来源；不要用其他合约结果覆盖它。
          if (record.contractAddress) return matched;
          if (matched) return true;
        } catch (error) {
          lastError = error;
        }
      }
      if (!checkedContract && lastError) throw lastError;
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : "blockchain verification failed";
      throw new ServiceUnavailableException(message);
    }
  }
}
