const path = require("path");
const mysql = require("mysql2/promise");
const { ethers } = require("ethers");
const { calculateRepairHash, epochSecondsForDate, epochSecondsForDateTime } = require("../dist/utils");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const writeEnabled = process.argv.includes("--write");
const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || process.env.GETH_RPC_URL || "http://127.0.0.1:8545";
const expectedChainId = Number(process.env.BLOCKCHAIN_CHAIN_ID || process.env.GETH_CHAIN_ID || 1337);
const contractAddress = process.env.BLOCKCHAIN_CONTRACT_ADDRESS || process.env.GETH_CONTRACT_ADDRESS || "";
const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY || process.env.GETH_PRIVATE_KEY || "";
const accountAddress = process.env.BLOCKCHAIN_ACCOUNT_ADDRESS || process.env.GETH_ACCOUNT_ADDRESS || "";
const batchSizeArg = process.argv.find((argument) => argument.startsWith("--batch-size="));
const batchSize = Math.max(1, Math.min(30, Number(batchSizeArg?.split("=")[1] || 15)));

const connectionOptions = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USERNAME || "root",
  password: process.env.MYSQL_PASSWORD || "123456",
  database: process.env.MYSQL_DATABASE || "repair_traceability",
  dateStrings: true,
  timezone: "+08:00",
};

const abi = [
  "function addRepairProof(string certificateNo,string vehicleNo,bytes32 dataHash,uint256 repairTime,uint256 warrantyStart,uint256 warrantyEnd)",
  "function revokeRepairProof(string certificateNo)",
  "function getRepairProof(string certificateNo) view returns (tuple(string certificateNo,string vehicleNo,bytes32 dataHash,uint256 repairTime,uint256 warrantyStart,uint256 warrantyEnd,address repairShop,bool revoked,bool exists))",
];

function localMysqlTime() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function existingProof(contract, certificateNo) {
  try {
    const proof = await contract.getRepairProof(certificateNo);
    return {
      exists: Boolean(proof.exists),
      dataHash: String(proof.dataHash).toLowerCase(),
      revoked: Boolean(proof.revoked),
    };
  } catch (error) {
    const message = String(error?.shortMessage || error?.message || error);
    if (message.includes("certificate not found") || message.includes("execution reverted")) return null;
    throw error;
  }
}

async function sendBatch(batch, contract, provider, signerAddress, connection) {
  let nextNonce = await provider.getTransactionCount(signerAddress, "pending");
  const submitted = [];

  for (const row of batch) {
    const transaction = await contract.addRepairProof(
      row.certificateNo,
      row.vehicleNo,
      `0x${row.dataHash}`,
      epochSecondsForDateTime(row.repairTime),
      epochSecondsForDate(row.warrantyStart),
      epochSecondsForDate(row.warrantyEnd),
      { nonce: nextNonce++ },
    );
    submitted.push({ row, transaction });
    console.log(`  已提交 ${row.certificateNo} ${transaction.hash}`);
  }

  const confirmed = [];
  for (const item of submitted) {
    const receipt = await item.transaction.wait();
    if (!receipt || receipt.status !== 1) throw new Error(`${item.row.certificateNo} 上链交易未成功确认`);
    const block = await provider.getBlock(receipt.blockNumber);
    if (!block) throw new Error(`${item.row.certificateNo} 所在区块无法读取`);
    confirmed.push({ ...item, receipt, block });
  }

  const revokedRows = confirmed.filter((item) => item.row.status === "REVOKED");
  const revokeHashes = new Map();
  if (revokedRows.length) {
    nextNonce = await provider.getTransactionCount(signerAddress, "pending");
    const revokeTransactions = [];
    for (const item of revokedRows) {
      const transaction = await contract.revokeRepairProof(item.row.certificateNo, { nonce: nextNonce++ });
      revokeTransactions.push({ row: item.row, transaction });
    }
    for (const item of revokeTransactions) {
      const receipt = await item.transaction.wait();
      if (!receipt || receipt.status !== 1) throw new Error(`${item.row.certificateNo} 撤销交易未成功确认`);
      revokeHashes.set(item.row.id, receipt.hash);
    }
  }

  for (const item of confirmed) {
    await connection.query(
      `UPDATE repair_record
       SET transaction_hash=?,contract_address=?,chain_id=?,chain_block_number=?,chain_timestamp=?,revoke_transaction_hash=COALESCE(?,revoke_transaction_hash),
           chain_error_message=NULL,chain_attempt_count=chain_attempt_count+1,last_chain_attempt_time=?
       WHERE id=?`,
      [item.receipt.hash, contractAddress, expectedChainId, item.receipt.blockNumber, Number(item.block.timestamp), revokeHashes.get(item.row.id) || null, localMysqlTime(), item.row.id],
    );
  }
  return confirmed.length;
}

async function main() {
  if (!contractAddress) throw new Error("未配置 RepairProof 合约地址");
  const provider = new ethers.JsonRpcProvider(rpcUrl, expectedChainId);
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(expectedChainId)) throw new Error(`链 ID 不匹配：期望 ${expectedChainId}，实际 ${network.chainId}`);
  const code = await provider.getCode(contractAddress);
  if (!code || code === "0x") throw new Error(`当前链的 ${contractAddress} 没有合约代码`);

  const baseSigner = privateKey
    ? new ethers.Wallet(privateKey, provider)
    : await provider.getSigner(accountAddress);
  const signerAddress = await baseSigner.getAddress();
  if (accountAddress && signerAddress.toLowerCase() !== accountAddress.toLowerCase()) {
    throw new Error(`签名账户不匹配：期望 ${accountAddress}，实际 ${signerAddress}`);
  }

  const readContract = new ethers.Contract(contractAddress, abi, provider);
  const writeContract = new ethers.Contract(contractAddress, abi, baseSigner);
  const connection = await mysql.createConnection(connectionOptions);
  try {
    const [rows] = await connection.query(
      `SELECT id,certificate_no AS certificateNo,vehicle_no AS vehicleNo,vin,
              repair_item AS repairItem,fault_description AS faultDescription,
              repair_time AS repairTime,mileage,parts_info AS partsInfo,amount,
              warranty_start AS warrantyStart,warranty_end AS warrantyEnd,data_hash AS dataHash,status
       FROM repair_record WHERE status IN ('ON_CHAIN','REVOKED') ORDER BY id`,
    );

    const missing = [];
    const conflicts = [];
    let matched = 0;
    console.log(`开始链账对账：${rows.length} 条声明已上链的记录，合约 ${contractAddress}`);
    for (const row of rows) {
      const calculatedHash = calculateRepairHash(row);
      if (calculatedHash !== row.dataHash) {
        conflicts.push({ certificateNo: row.certificateNo, reason: "数据库内容与摘要不一致" });
        continue;
      }
      const proof = await existingProof(readContract, row.certificateNo);
      if (!proof?.exists) {
        missing.push(row);
        continue;
      }
      const expectedRevoked = row.status === "REVOKED";
      if (proof.dataHash === `0x${row.dataHash}`.toLowerCase() && proof.revoked === expectedRevoked) {
        matched++;
      } else {
        conflicts.push({ certificateNo: row.certificateNo, reason: "当前合约已有同编号但摘要或撤销状态不一致" });
      }
    }

    console.log(`对账结果：一致 ${matched} 条，缺失 ${missing.length} 条，冲突 ${conflicts.length} 条。`);
    for (const conflict of conflicts) console.warn(`  冲突 ${conflict.certificateNo}：${conflict.reason}`);
    if (!writeEnabled) {
      console.log("当前为只读检查；确认后使用 --write 写入缺失凭证。");
      return;
    }
    if (conflicts.length) throw new Error("存在链账冲突，已停止写入，请先人工复核");

    let repaired = 0;
    for (let index = 0; index < missing.length; index += batchSize) {
      const batch = missing.slice(index, index + batchSize);
      console.log(`正在补链 ${index + 1}-${index + batch.length}/${missing.length}`);
      repaired += await sendBatch(batch, writeContract, provider, signerAddress, connection);
    }

    if (repaired > 0) {
      const [admins] = await connection.query("SELECT id FROM sys_user WHERE role='ADMIN' AND status=1 ORDER BY id LIMIT 1");
      if (admins.length) {
        await connection.query(
          "INSERT INTO admin_operation_log (operator_id,action,target_type,target_id,target_label,detail,create_time) VALUES (?,?,?,?,?,?,?)",
          [admins[0].id, "RECONCILE_CHAIN", "BLOCKCHAIN", contractAddress, "历史维修凭证", `完成链账对账并补链 ${repaired} 条`, localMysqlTime()],
        );
      }
    }
    console.log(`链账修复完成：新补链 ${repaired} 条。`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
