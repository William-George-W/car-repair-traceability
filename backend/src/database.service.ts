import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import mysql, { Pool, PoolOptions, ResultSetHeader, RowDataPacket } from "mysql2/promise";

const schema = [
  `CREATE TABLE IF NOT EXISTS sys_user (id BIGINT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, role VARCHAR(20) NOT NULL, blockchain_address VARCHAR(100), status INT NOT NULL, create_time TIMESTAMP NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS vehicle (id BIGINT AUTO_INCREMENT PRIMARY KEY, vehicle_no VARCHAR(50) NOT NULL UNIQUE, vin VARCHAR(50) NOT NULL UNIQUE, plate_no VARCHAR(20) NOT NULL, brand_model VARCHAR(100) NOT NULL, owner_id BIGINT NOT NULL, create_time TIMESTAMP NOT NULL, CONSTRAINT fk_vehicle_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON UPDATE CASCADE ON DELETE RESTRICT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS repair_record (id BIGINT AUTO_INCREMENT PRIMARY KEY, certificate_no VARCHAR(50) NOT NULL UNIQUE, vehicle_no VARCHAR(50) NOT NULL, vin VARCHAR(50) NOT NULL, repair_shop_id BIGINT NOT NULL, repair_item VARCHAR(255) NOT NULL, fault_description VARCHAR(2000), repair_time TIMESTAMP NOT NULL, mileage INT NOT NULL, parts_info VARCHAR(2000), amount DECIMAL(10, 2) NOT NULL, warranty_start DATE NOT NULL, warranty_end DATE NOT NULL, data_hash VARCHAR(64) NOT NULL, transaction_hash VARCHAR(100), contract_address VARCHAR(42), chain_id BIGINT, chain_block_number BIGINT, chain_timestamp BIGINT, chain_error_message VARCHAR(500), chain_attempt_count INT NOT NULL DEFAULT 0, last_chain_attempt_time TIMESTAMP NULL, status VARCHAR(20) NOT NULL, revoke_reason VARCHAR(255), revoke_transaction_hash VARCHAR(100), create_time TIMESTAMP NOT NULL, CONSTRAINT fk_repair_vehicle FOREIGN KEY (vehicle_no) REFERENCES vehicle(vehicle_no) ON UPDATE CASCADE ON DELETE RESTRICT, CONSTRAINT fk_repair_shop FOREIGN KEY (repair_shop_id) REFERENCES sys_user(id) ON UPDATE CASCADE ON DELETE RESTRICT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS abnormal_record (id BIGINT AUTO_INCREMENT PRIMARY KEY, repair_record_id BIGINT NOT NULL, vehicle_no VARCHAR(50) NOT NULL, abnormal_type VARCHAR(40) NOT NULL, risk_level VARCHAR(10) NOT NULL DEFAULT 'MEDIUM', description VARCHAR(500) NOT NULL, rule_explanation VARCHAR(500), status VARCHAR(20) NOT NULL, active TINYINT NOT NULL DEFAULT 1, handle_note VARCHAR(500), handled_by BIGINT, handled_time TIMESTAMP NULL, create_time TIMESTAMP NOT NULL, CONSTRAINT fk_abnormal_repair FOREIGN KEY (repair_record_id) REFERENCES repair_record(id) ON UPDATE CASCADE ON DELETE CASCADE, CONSTRAINT fk_abnormal_vehicle FOREIGN KEY (vehicle_no) REFERENCES vehicle(vehicle_no) ON UPDATE CASCADE ON DELETE RESTRICT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS warranty_claim (id BIGINT AUTO_INCREMENT PRIMARY KEY, claim_no VARCHAR(50) NOT NULL UNIQUE, repair_record_id BIGINT NOT NULL, owner_id BIGINT NOT NULL, repair_shop_id BIGINT NOT NULL, reason VARCHAR(1000) NOT NULL, status VARCHAR(20) NOT NULL, accept_note VARCHAR(500), result_note VARCHAR(1000), submitted_time TIMESTAMP NOT NULL, accepted_time TIMESTAMP NULL, completed_time TIMESTAMP NULL, rejected_time TIMESTAMP NULL, updated_time TIMESTAMP NOT NULL, active_repair_id BIGINT GENERATED ALWAYS AS (CASE WHEN status IN ('PENDING','ACCEPTED') THEN repair_record_id ELSE NULL END) STORED, UNIQUE KEY uk_warranty_claim_active_repair (active_repair_id), INDEX idx_warranty_claim_owner (owner_id,status), INDEX idx_warranty_claim_shop (repair_shop_id,status), CONSTRAINT fk_warranty_claim_repair FOREIGN KEY (repair_record_id) REFERENCES repair_record(id) ON UPDATE RESTRICT ON DELETE RESTRICT, CONSTRAINT fk_warranty_claim_owner FOREIGN KEY (owner_id) REFERENCES sys_user(id) ON UPDATE CASCADE ON DELETE RESTRICT, CONSTRAINT fk_warranty_claim_shop FOREIGN KEY (repair_shop_id) REFERENCES sys_user(id) ON UPDATE CASCADE ON DELETE RESTRICT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS admin_operation_log (id BIGINT AUTO_INCREMENT PRIMARY KEY, operator_id BIGINT NOT NULL, action VARCHAR(40) NOT NULL, target_type VARCHAR(40) NOT NULL, target_id VARCHAR(100) NOT NULL, target_label VARCHAR(255), detail VARCHAR(1000) NOT NULL, create_time TIMESTAMP NOT NULL, INDEX idx_admin_log_time (create_time), INDEX idx_admin_log_operator (operator_id), CONSTRAINT fk_admin_log_operator FOREIGN KEY (operator_id) REFERENCES sys_user(id) ON UPDATE CASCADE ON DELETE RESTRICT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS warranty_rule (id BIGINT AUTO_INCREMENT PRIMARY KEY, repair_item VARCHAR(255) NOT NULL UNIQUE, warranty_days INT NOT NULL, description VARCHAR(500), status TINYINT NOT NULL DEFAULT 1, create_time TIMESTAMP NOT NULL, update_time TIMESTAMP NOT NULL, INDEX idx_warranty_rule_status (status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
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

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  async onModuleInit() {
    const options: PoolOptions = {
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USERNAME || "root",
      password: process.env.MYSQL_PASSWORD || "123456",
      database: process.env.MYSQL_DATABASE || "repair_traceability",
      waitForConnections: true,
      connectionLimit: 10,
      dateStrings: true,
      timezone: "+08:00",
    };
    const bootstrap = await mysql.createConnection({ host: options.host, port: options.port, user: options.user, password: options.password });
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${options.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await bootstrap.end();
    this.pool = mysql.createPool(options);
    for (const statement of schema) await this.pool.query(statement);
    await this.ensureAdminAuditColumns();
    await this.ensureDefaultWarrantyRules();
    await this.ensureForeignKeys();
  }

  private async ensureDefaultWarrantyRules() {
    const timestamp = this.now();
    for (const [repairItem, warrantyDays, description] of defaultWarrantyRules) {
      await this.pool.query(
        "INSERT IGNORE INTO warranty_rule (repair_item,warranty_days,description,status,create_time,update_time) VALUES (?,?,?,?,?,?)",
        [repairItem, warrantyDays, description, 1, timestamp, timestamp],
      );
    }
  }

  private async ensureAdminAuditColumns() {
    const columns = [
      ["repair_record", "revoked_by", "BIGINT NULL"],
      ["repair_record", "revoked_time", "TIMESTAMP NULL"],
      ["repair_record", "contract_address", "VARCHAR(42) NULL"],
      ["repair_record", "chain_id", "BIGINT NULL"],
      ["repair_record", "chain_block_number", "BIGINT NULL"],
      ["repair_record", "chain_timestamp", "BIGINT NULL"],
      ["repair_record", "revoke_transaction_hash", "VARCHAR(100) NULL"],
      ["repair_record", "chain_error_message", "VARCHAR(500) NULL"],
      ["repair_record", "chain_attempt_count", "INT NOT NULL DEFAULT 0"],
      ["repair_record", "last_chain_attempt_time", "TIMESTAMP NULL"],
      ["abnormal_record", "handle_note", "VARCHAR(500) NULL"],
      ["abnormal_record", "handled_by", "BIGINT NULL"],
      ["abnormal_record", "handled_time", "TIMESTAMP NULL"],
      ["abnormal_record", "risk_level", "VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'"],
      ["abnormal_record", "rule_explanation", "VARCHAR(500) NULL"],
      ["abnormal_record", "active", "TINYINT NOT NULL DEFAULT 1"],
    ];
    for (const [table, column, definition] of columns) {
      const existing = await this.pool.query<RowDataPacket[]>(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1",
        [table, column],
      );
      if (!(existing[0] as RowDataPacket[]).length) {
        await this.pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      }
    }
    await this.pool.query(
      "UPDATE repair_record SET chain_attempt_count=1,last_chain_attempt_time=COALESCE(last_chain_attempt_time,create_time) WHERE transaction_hash IS NOT NULL AND chain_attempt_count=0",
    );
    await this.pool.query("UPDATE abnormal_record SET status='CONFIRMED' WHERE status='HANDLED'");
  }

  private async ensureForeignKeys() {
    const relations = [
      { name: "fk_vehicle_owner", table: "vehicle", column: "owner_id", referencedTable: "sys_user", referencedColumn: "id", orphanSql: "SELECT COUNT(*) AS count FROM vehicle v LEFT JOIN sys_user u ON u.id=v.owner_id WHERE u.id IS NULL" },
      { name: "fk_repair_vehicle", table: "repair_record", column: "vehicle_no", referencedTable: "vehicle", referencedColumn: "vehicle_no", orphanSql: "SELECT COUNT(*) AS count FROM repair_record r LEFT JOIN vehicle v ON v.vehicle_no=r.vehicle_no WHERE v.id IS NULL" },
      { name: "fk_repair_shop", table: "repair_record", column: "repair_shop_id", referencedTable: "sys_user", referencedColumn: "id", orphanSql: "SELECT COUNT(*) AS count FROM repair_record r LEFT JOIN sys_user u ON u.id=r.repair_shop_id WHERE u.id IS NULL" },
      { name: "fk_abnormal_repair", table: "abnormal_record", column: "repair_record_id", referencedTable: "repair_record", referencedColumn: "id", orphanSql: "SELECT COUNT(*) AS count FROM abnormal_record a LEFT JOIN repair_record r ON r.id=a.repair_record_id WHERE r.id IS NULL" },
      { name: "fk_abnormal_vehicle", table: "abnormal_record", column: "vehicle_no", referencedTable: "vehicle", referencedColumn: "vehicle_no", orphanSql: "SELECT COUNT(*) AS count FROM abnormal_record a LEFT JOIN vehicle v ON v.vehicle_no=a.vehicle_no WHERE v.id IS NULL" },
      { name: "fk_admin_log_operator", table: "admin_operation_log", column: "operator_id", referencedTable: "sys_user", referencedColumn: "id", orphanSql: "SELECT COUNT(*) AS count FROM admin_operation_log l LEFT JOIN sys_user u ON u.id=l.operator_id WHERE u.id IS NULL" },
    ];

    for (const relation of relations) {
      const existing = await this.pool.query<RowDataPacket[]>(
        `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
         WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?
           AND REFERENCED_TABLE_NAME=? AND REFERENCED_COLUMN_NAME=? LIMIT 1`,
        [relation.table, relation.column, relation.referencedTable, relation.referencedColumn],
      );
      if ((existing[0] as RowDataPacket[]).length) continue;

      const orphanRows = await this.pool.query<RowDataPacket[]>(relation.orphanSql);
      const orphanCount = Number((orphanRows[0] as RowDataPacket[])[0]?.count || 0);
      if (orphanCount > 0) {
        throw new Error(`数据库存在 ${orphanCount} 条孤儿数据，无法创建外键 ${relation.name}；请先执行 npm run migrate:integrity`);
      }
      await this.pool.query(
        `ALTER TABLE \`${relation.table}\` ADD CONSTRAINT \`${relation.name}\` FOREIGN KEY (\`${relation.column}\`) REFERENCES \`${relation.referencedTable}\`(\`${relation.referencedColumn}\`) ON UPDATE CASCADE ON DELETE ${relation.name === "fk_abnormal_repair" ? "CASCADE" : "RESTRICT"}`,
      );
    }
  }

  async onModuleDestroy() { if (this.pool) await this.pool.end(); }

  async query<T extends RowDataPacket[] | ResultSetHeader = RowDataPacket[]>(sql: string, params: unknown[] = []): Promise<T> {
    const [rows] = await this.pool.query<T>(sql, params);
    return rows;
  }

  now() {
    const value = new Date();
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
}
