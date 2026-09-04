const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const connectionOptions = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USERNAME || "root",
  password: process.env.MYSQL_PASSWORD || "123456",
  database: process.env.MYSQL_DATABASE || "repair_traceability",
};

const foreignKeys = [
  { name: "fk_vehicle_owner", table: "vehicle", column: "owner_id", referencedTable: "sys_user", referencedColumn: "id", orphanSql: "SELECT v.id FROM vehicle v LEFT JOIN sys_user u ON u.id=v.owner_id WHERE u.id IS NULL" },
  { name: "fk_repair_vehicle", table: "repair_record", column: "vehicle_no", referencedTable: "vehicle", referencedColumn: "vehicle_no", orphanSql: "SELECT r.id,r.certificate_no,r.vehicle_no FROM repair_record r LEFT JOIN vehicle v ON v.vehicle_no=r.vehicle_no WHERE v.id IS NULL" },
  { name: "fk_repair_shop", table: "repair_record", column: "repair_shop_id", referencedTable: "sys_user", referencedColumn: "id", orphanSql: "SELECT r.id FROM repair_record r LEFT JOIN sys_user u ON u.id=r.repair_shop_id WHERE u.id IS NULL" },
  { name: "fk_abnormal_repair", table: "abnormal_record", column: "repair_record_id", referencedTable: "repair_record", referencedColumn: "id", orphanSql: "SELECT a.id FROM abnormal_record a LEFT JOIN repair_record r ON r.id=a.repair_record_id WHERE r.id IS NULL" },
  { name: "fk_abnormal_vehicle", table: "abnormal_record", column: "vehicle_no", referencedTable: "vehicle", referencedColumn: "vehicle_no", orphanSql: "SELECT a.id FROM abnormal_record a LEFT JOIN vehicle v ON v.vehicle_no=a.vehicle_no WHERE v.id IS NULL" },
  { name: "fk_admin_log_operator", table: "admin_operation_log", column: "operator_id", referencedTable: "sys_user", referencedColumn: "id", orphanSql: "SELECT l.id FROM admin_operation_log l LEFT JOIN sys_user u ON u.id=l.operator_id WHERE u.id IS NULL" },
];

const defaultWarrantyRules = [
  ["定期保养（机油及机滤）", 180, "常规保养项目，覆盖机油与机滤更换后的基础服务期"],
  ["更换前制动片", 180, "制动片及相关传感器更换后的部件服务期"],
  ["四轮定位与轮胎检查", 90, "定位参数调整和轮胎检查后的基础服务期"],
  ["更换蓄电池", 365, "蓄电池更换后的部件服务期"],
  ["空调系统清洗", 90, "空调清洗及滤芯更换后的基础服务期"],
  ["发动机冷却液更换", 180, "冷却液更换后的基础服务期"],
  ["更换火花塞", 365, "火花塞更换后的部件服务期"],
  ["变速箱油更换", 180, "变速箱油更换后的基础服务期"],
  ["车身钣金喷漆", 365, "钣金喷漆施工后的漆面服务期"],
  ["悬挂系统检修", 180, "悬挂部件检修后的基础服务期"],
];

async function ensureWarrantyRuleTable(connection) {
  await connection.query(
    "CREATE TABLE IF NOT EXISTS warranty_rule (id BIGINT AUTO_INCREMENT PRIMARY KEY, repair_item VARCHAR(255) NOT NULL UNIQUE, warranty_days INT NOT NULL, description VARCHAR(500), status TINYINT NOT NULL DEFAULT 1, create_time TIMESTAMP NOT NULL, update_time TIMESTAMP NOT NULL, INDEX idx_warranty_rule_status (status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  );
  for (const [repairItem, warrantyDays, description] of defaultWarrantyRules) {
    await connection.query(
      "INSERT IGNORE INTO warranty_rule (repair_item,warranty_days,description,status,create_time,update_time) VALUES (?,?,?,?,?,?)",
      [repairItem, warrantyDays, description, 1, new Date(), new Date()],
    );
  }
}

async function ensureWarrantyClaimTable(connection) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS warranty_claim (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      claim_no VARCHAR(50) NOT NULL UNIQUE,
      repair_record_id BIGINT NOT NULL,
      owner_id BIGINT NOT NULL,
      repair_shop_id BIGINT NOT NULL,
      reason VARCHAR(1000) NOT NULL,
      status VARCHAR(20) NOT NULL,
      accept_note VARCHAR(500),
      result_note VARCHAR(1000),
      submitted_time TIMESTAMP NOT NULL,
      accepted_time TIMESTAMP NULL,
      completed_time TIMESTAMP NULL,
      rejected_time TIMESTAMP NULL,
      updated_time TIMESTAMP NOT NULL,
      active_repair_id BIGINT GENERATED ALWAYS AS (CASE WHEN status IN ('PENDING','ACCEPTED') THEN repair_record_id ELSE NULL END) STORED,
      UNIQUE KEY uk_warranty_claim_active_repair (active_repair_id),
      INDEX idx_warranty_claim_owner (owner_id,status),
      INDEX idx_warranty_claim_shop (repair_shop_id,status),
      CONSTRAINT fk_warranty_claim_repair FOREIGN KEY (repair_record_id) REFERENCES repair_record(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT fk_warranty_claim_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_warranty_claim_shop FOREIGN KEY (repair_shop_id) REFERENCES sys_user(id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
}

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1",
    [table, column],
  );
  return rows.length > 0;
}

async function ensureColumns(connection) {
  if (!(await columnExists(connection, "repair_record", "contract_address"))) {
    await connection.query("ALTER TABLE repair_record ADD COLUMN contract_address VARCHAR(42) NULL AFTER transaction_hash");
    console.log("已添加 repair_record.contract_address 字段");
  }
  if (!(await columnExists(connection, "repair_record", "chain_id"))) {
    await connection.query("ALTER TABLE repair_record ADD COLUMN chain_id BIGINT NULL AFTER contract_address");
    console.log("已添加 repair_record.chain_id 字段");
  }
  if (!(await columnExists(connection, "repair_record", "chain_block_number"))) {
    await connection.query("ALTER TABLE repair_record ADD COLUMN chain_block_number BIGINT NULL AFTER chain_id");
    console.log("已添加 repair_record.chain_block_number 字段");
  }
  if (!(await columnExists(connection, "repair_record", "chain_timestamp"))) {
    await connection.query("ALTER TABLE repair_record ADD COLUMN chain_timestamp BIGINT NULL AFTER chain_block_number");
    console.log("已添加 repair_record.chain_timestamp 字段");
  }
  if (!(await columnExists(connection, "repair_record", "revoke_transaction_hash"))) {
    await connection.query("ALTER TABLE repair_record ADD COLUMN revoke_transaction_hash VARCHAR(100) NULL AFTER revoke_reason");
    console.log("已添加 repair_record.revoke_transaction_hash 字段");
  }
  if (!(await columnExists(connection, "repair_record", "chain_error_message"))) {
    await connection.query("ALTER TABLE repair_record ADD COLUMN chain_error_message VARCHAR(500) NULL AFTER contract_address");
    console.log("已添加 repair_record.chain_error_message 字段");
  }
  if (!(await columnExists(connection, "repair_record", "chain_attempt_count"))) {
    await connection.query("ALTER TABLE repair_record ADD COLUMN chain_attempt_count INT NOT NULL DEFAULT 0 AFTER chain_error_message");
    console.log("已添加 repair_record.chain_attempt_count 字段");
  }
  if (!(await columnExists(connection, "repair_record", "last_chain_attempt_time"))) {
    await connection.query("ALTER TABLE repair_record ADD COLUMN last_chain_attempt_time TIMESTAMP NULL AFTER chain_attempt_count");
    console.log("已添加 repair_record.last_chain_attempt_time 字段");
  }
  if (!(await columnExists(connection, "abnormal_record", "risk_level"))) {
    await connection.query("ALTER TABLE abnormal_record ADD COLUMN risk_level VARCHAR(10) NOT NULL DEFAULT 'MEDIUM' AFTER abnormal_type");
    console.log("已添加 abnormal_record.risk_level 字段");
  }
  if (!(await columnExists(connection, "abnormal_record", "rule_explanation"))) {
    await connection.query("ALTER TABLE abnormal_record ADD COLUMN rule_explanation VARCHAR(500) NULL AFTER description");
    console.log("已添加 abnormal_record.rule_explanation 字段");
  }
  if (!(await columnExists(connection, "abnormal_record", "active"))) {
    await connection.query("ALTER TABLE abnormal_record ADD COLUMN active TINYINT NOT NULL DEFAULT 1 AFTER status");
    console.log("已添加 abnormal_record.active 字段");
  }
  await connection.query(
    "UPDATE repair_record SET chain_attempt_count=1,last_chain_attempt_time=COALESCE(last_chain_attempt_time,create_time) WHERE transaction_hash IS NOT NULL AND chain_attempt_count=0",
  );
  await connection.query("UPDATE abnormal_record SET status='CONFIRMED' WHERE status='HANDLED'");
}

async function relationExists(connection, relation) {
  const [rows] = await connection.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?
       AND REFERENCED_TABLE_NAME=? AND REFERENCED_COLUMN_NAME=? LIMIT 1`,
    [relation.table, relation.column, relation.referencedTable, relation.referencedColumn],
  );
  return rows.length > 0;
}

async function cleanOrphans(connection) {
  const orphanRepairRows = await connection.query(foreignKeys[1].orphanSql).then(([rows]) => rows);
  const orphanAbnormalRows = await connection.query(foreignKeys[3].orphanSql).then(([rows]) => rows);
  const orphanVehicleOwnerRows = await connection.query(foreignKeys[0].orphanSql).then(([rows]) => rows);
  const orphanRepairShopRows = await connection.query(foreignKeys[2].orphanSql).then(([rows]) => rows);
  const orphanAbnormalVehicleRows = await connection.query(foreignKeys[4].orphanSql).then(([rows]) => rows);
  const orphanLogRows = await connection.query(foreignKeys[5].orphanSql).then(([rows]) => rows);

  if (orphanRepairRows.length) {
    console.log(`发现 ${orphanRepairRows.length} 条无车辆维修记录：${orphanRepairRows.map((row) => `${row.id}:${row.certificate_no}`).join(", ")}`);
  }
  if (orphanAbnormalRows.length) console.log(`发现 ${orphanAbnormalRows.length} 条无维修记录异常数据`);

  const unsupported = [
    ["车辆车主", orphanVehicleOwnerRows],
    ["维修商", orphanRepairShopRows],
    ["异常车辆", orphanAbnormalVehicleRows],
    ["管理员日志操作人", orphanLogRows],
  ].filter(([, rows]) => rows.length);
  if (unsupported.length) {
    throw new Error(`存在无法安全自动修复的关联数据：${unsupported.map(([name, rows]) => `${name} ${rows.length} 条`).join("；")}`);
  }

  if (!orphanRepairRows.length && !orphanAbnormalRows.length) return;
  if (String(process.env.CLEANUP_ORPHAN_DATA).toLowerCase() !== "true") {
    throw new Error("检测到孤儿数据。确认清理旧联调记录后，请设置 CLEANUP_ORPHAN_DATA=true 再执行 npm run migrate:integrity");
  }

  await connection.beginTransaction();
  try {
    for (const row of orphanAbnormalRows) await connection.query("DELETE FROM abnormal_record WHERE id=?", [row.id]);
    for (const row of orphanRepairRows) {
      await connection.query("DELETE FROM abnormal_record WHERE repair_record_id=?", [row.id]);
      await connection.query("DELETE FROM repair_record WHERE id=?", [row.id]);
    }
    await connection.commit();
    console.log(`已清理 ${orphanRepairRows.length} 条无车辆维修记录和 ${orphanAbnormalRows.length} 条无效异常记录`);
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function ensureForeignKeys(connection) {
  for (const relation of foreignKeys) {
    if (await relationExists(connection, relation)) continue;
    const [orphans] = await connection.query(relation.orphanSql);
    if (orphans.length) throw new Error(`外键 ${relation.name} 仍有 ${orphans.length} 条孤儿数据，未执行创建`);
    const onDelete = relation.name === "fk_abnormal_repair" ? "CASCADE" : "RESTRICT";
    await connection.query(
      `ALTER TABLE \`${relation.table}\` ADD CONSTRAINT \`${relation.name}\` FOREIGN KEY (\`${relation.column}\`) REFERENCES \`${relation.referencedTable}\`(\`${relation.referencedColumn}\`) ON UPDATE CASCADE ON DELETE ${onDelete}`,
    );
    console.log(`已创建外键 ${relation.name}`);
  }
}

async function main() {
  const connection = await mysql.createConnection(connectionOptions);
  try {
    console.log(`开始执行数据库完整性迁移：${connectionOptions.database}`);
    await ensureWarrantyRuleTable(connection);
    await ensureWarrantyClaimTable(connection);
    await ensureColumns(connection);
    await cleanOrphans(connection);
    await ensureForeignKeys(connection);
    console.log("数据库完整性迁移完成：字段、孤儿数据和外键检查通过。");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
