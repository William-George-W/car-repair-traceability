const path = require("path");
const mysql = require("mysql2/promise");
const { ethers } = require("ethers");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || process.env.GETH_RPC_URL || "http://127.0.0.1:8545";
const expectedChainId = Number(process.env.BLOCKCHAIN_CHAIN_ID || process.env.GETH_CHAIN_ID || 1337);
const connectionOptions = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USERNAME || "root",
  password: process.env.MYSQL_PASSWORD || "123456",
  database: process.env.MYSQL_DATABASE || "repair_traceability",
};

async function main() {
  const provider = new ethers.JsonRpcProvider(rpcUrl, expectedChainId);
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(expectedChainId)) throw new Error(`chain id mismatch: expected ${expectedChainId}, got ${network.chainId}`);

  const connection = await mysql.createConnection(connectionOptions);
  let updated = 0;
  let skipped = 0;
  try {
    const [rows] = await connection.query(
      `SELECT id,certificate_no,transaction_hash FROM repair_record
       WHERE transaction_hash IS NOT NULL
         AND (contract_address IS NULL OR contract_address='' OR chain_id IS NULL OR chain_block_number IS NULL OR chain_timestamp IS NULL)
       ORDER BY id`,
    );
    console.log(`开始同步历史链上记录：待处理 ${rows.length} 条，RPC ${rpcUrl}`);
    for (const row of rows) {
      try {
        const transaction = await provider.getTransaction(row.transaction_hash);
        const address = transaction?.to;
        if (!address) {
          skipped++;
          console.warn(`跳过 ${row.id} ${row.certificate_no}：交易不存在或不是合约调用`);
          continue;
        }
        const code = await provider.getCode(address);
        if (!code || code === "0x") {
          skipped++;
          console.warn(`跳过 ${row.id} ${row.certificate_no}：交易目标 ${address} 没有合约代码`);
          continue;
        }
        const receipt = await provider.getTransactionReceipt(row.transaction_hash);
        if (!receipt || receipt.status !== 1) {
          skipped++;
          console.warn(`跳过 ${row.id} ${row.certificate_no}：交易未成功确认`);
          continue;
        }
        const block = await provider.getBlock(receipt.blockNumber);
        if (!block) {
          skipped++;
          console.warn(`跳过 ${row.id} ${row.certificate_no}：无法读取区块 ${receipt.blockNumber}`);
          continue;
        }
        await connection.query(
          "UPDATE repair_record SET contract_address=?,chain_id=?,chain_block_number=?,chain_timestamp=? WHERE id=?",
          [address, Number(network.chainId), receipt.blockNumber, Number(block.timestamp), row.id],
        );
        updated++;
      } catch (error) {
        skipped++;
        console.warn(`跳过 ${row.id} ${row.certificate_no}：${error.message || error}`);
      }
    }
    console.log(`历史链上元数据同步完成：更新 ${updated} 条，跳过 ${skipped} 条。`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
