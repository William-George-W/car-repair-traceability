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

// 仅包含已经人工核对过的旧联调数据，避免误删正式演示数据。
const legacyUsernames = [
  "owner_demo",
  "shop_demo",
  "owner_20260825202530",
  "shop_20260825202530",
  "wilianms",
  "王浩楠",
  "wanghaonan2188@gmail.com",
];

const legacyVehicleNos = ["CAROWNER001", "VH20260825202530", "B2004W", "1"];

const legacyCertificateNos = [
  "CERT202608251946108BC1AD",
  "CERT20260825195643C75467",
  "CERT2026082520051124E8DA",
  "CERT20260825202530811960",
  "CERT20260826172227F64138",
  "CERT20260826184114974FBB",
  "CERT20260901112312A628BD",
  "CERT20260902103853630B39",
];

function placeholders(values) {
  return values.map(() => "?").join(",");
}

async function countTable(connection, table) {
  const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
  return Number(rows[0].count);
}

async function main() {
  const connection = await mysql.createConnection(connectionOptions);
  try {
    const [repairRows] = await connection.query(
      `SELECT id,certificate_no AS certificateNo,vehicle_no AS vehicleNo,repair_item AS repairItem
       FROM repair_record WHERE certificate_no IN (${placeholders(legacyCertificateNos)}) ORDER BY id`,
      legacyCertificateNos,
    );
    const [vehicleRows] = await connection.query(
      `SELECT id,vehicle_no AS vehicleNo,brand_model AS brandModel
       FROM vehicle WHERE vehicle_no IN (${placeholders(legacyVehicleNos)}) ORDER BY id`,
      legacyVehicleNos,
    );
    const [userRows] = await connection.query(
      `SELECT id,username,role FROM sys_user
       WHERE username IN (${placeholders(legacyUsernames)}) ORDER BY id`,
      legacyUsernames,
    );

    console.log(`检测到旧测试数据：账号 ${userRows.length} 个，车辆 ${vehicleRows.length} 辆，维修记录 ${repairRows.length} 条。`);
    for (const row of repairRows) console.log(`  维修记录 ${row.certificateNo} | ${row.vehicleNo} | ${row.repairItem}`);
    for (const row of vehicleRows) console.log(`  车辆 ${row.vehicleNo} | ${row.brandModel}`);
    for (const row of userRows) console.log(`  账号 ${row.username} | ${row.role}`);

    if (String(process.env.CONFIRM_LEGACY_CLEANUP).toLowerCase() !== "true") {
      console.log("当前仅预览。确认目标无误后设置 CONFIRM_LEGACY_CLEANUP=true 再执行。");
      return;
    }

    const repairIds = repairRows.map((row) => Number(row.id));
    await connection.beginTransaction();
    try {
      let deletedLogs = 0;
      let deletedAbnormal = 0;
      if (repairIds.length) {
        const [logResult] = await connection.query(
          `DELETE FROM admin_operation_log
           WHERE target_type='REPAIR_RECORD'
             AND (target_id IN (${placeholders(repairIds)}) OR target_label IN (${placeholders(legacyCertificateNos)}))`,
          [...repairIds.map(String), ...legacyCertificateNos],
        );
        deletedLogs = Number(logResult.affectedRows || 0);

        const [abnormalResult] = await connection.query(
          `DELETE FROM abnormal_record WHERE repair_record_id IN (${placeholders(repairIds)})`,
          repairIds,
        );
        deletedAbnormal = Number(abnormalResult.affectedRows || 0);
      }

      const [repairResult] = await connection.query(
        `DELETE FROM repair_record WHERE certificate_no IN (${placeholders(legacyCertificateNos)})`,
        legacyCertificateNos,
      );
      const [vehicleResult] = await connection.query(
        `DELETE FROM vehicle WHERE vehicle_no IN (${placeholders(legacyVehicleNos)})`,
        legacyVehicleNos,
      );
      const [userResult] = await connection.query(
        `DELETE FROM sys_user WHERE username IN (${placeholders(legacyUsernames)})`,
        legacyUsernames,
      );

      const counts = {
        users: await countTable(connection, "sys_user"),
        vehicles: await countTable(connection, "vehicle"),
        repairs: await countTable(connection, "repair_record"),
        abnormalRecords: await countTable(connection, "abnormal_record"),
      };
      const belowMinimum = Object.entries(counts).filter(([, count]) => count < 50);
      if (belowMinimum.length) {
        throw new Error(`清理后数据量不足：${belowMinimum.map(([name, count]) => `${name}=${count}`).join(", ")}`);
      }

      await connection.commit();
      console.log(`清理完成：账号 ${userResult.affectedRows} 个，车辆 ${vehicleResult.affectedRows} 辆，维修记录 ${repairResult.affectedRows} 条，关联异常 ${deletedAbnormal} 条，关联日志 ${deletedLogs} 条。`);
      console.log(`清理后总量：账号 ${counts.users} 个，车辆 ${counts.vehicles} 辆，维修记录 ${counts.repairs} 条，异常记录 ${counts.abnormalRecords} 条。`);
      console.log("说明：已经写入私有链的历史测试交易不会被删除，这是区块链不可篡改特性的正常表现。它们已不再出现在业务系统中。");
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
