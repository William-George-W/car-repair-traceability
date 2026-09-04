import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { AuthService } from "./auth.service";
import { BlockchainService, ChainWriteResult } from "./blockchain.service";
import { AbnormalRecordRow, AuthUser, RepairRecordRow } from "./types";
import { calculateRepairHash, dateForMysql, dateOnly, generateCertificateNo, normalizeDateTime, toAbnormalResponse, toRepairResponse } from "./utils";

export interface CreateRepairInput {
  vehicleNo: string;
  vin: string;
  repairItem: string;
  faultDescription?: string;
  repairTime: string;
  mileage: number;
  partsInfo?: string;
  amount: number;
  warrantyStart: string;
  warrantyEnd?: string;
  warrantyRuleId?: number;
}

interface DetectedAnomaly {
  type: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  ruleExplanation: string;
}

@Injectable()
export class RepairService {
  constructor(private readonly db: DatabaseService, private readonly auth: AuthService, private readonly blockchain: BlockchainService) {}

  async create(input: CreateRepairInput, authUser: AuthUser) {
    const user = await this.auth.currentUser(authUser.userId);
    if (user.role !== "REPAIR_SHOP") throw new ForbiddenException("only repair shops can create repair records");
    this.validateInput(input);
    const vehicles = await this.db.query<any>("SELECT vin FROM vehicle WHERE vehicle_no=? LIMIT 1", [input.vehicleNo]);
    if (!vehicles.length) throw new NotFoundException("vehicle does not exist");
    if (String(vehicles[0].vin) !== input.vin) throw new BadRequestException("VIN does not match the vehicle");
    const warranty = await this.resolveWarranty(input);

    const record: RepairRecordRow = {
      id: 0,
      certificateNo: generateCertificateNo(),
      vehicleNo: input.vehicleNo,
      vin: input.vin,
      repairShopId: user.userId,
      repairItem: warranty.repairItem,
      faultDescription: input.faultDescription,
      repairTime: normalizeDateTime(input.repairTime),
      mileage: Number(input.mileage),
      partsInfo: input.partsInfo,
      amount: Number(input.amount),
      warrantyStart: warranty.warrantyStart,
      warrantyEnd: warranty.warrantyEnd,
      dataHash: "",
      chainAttemptCount: 1,
      lastChainAttemptTime: this.db.now(),
      status: "PENDING_CHAIN",
      createTime: new Date().toISOString(),
    };
    record.dataHash = calculateRepairHash(record);
    try {
      const chainResult = await this.blockchain.addRepairProof(record);
      record.transactionHash = chainResult?.transactionHash;
      record.contractAddress = chainResult?.contractAddress;
      record.chainId = chainResult?.chainId;
      record.chainBlockNumber = chainResult?.blockNumber;
      record.chainTimestamp = chainResult?.chainTimestamp;
      record.status = chainResult ? "ON_CHAIN" : "LOCAL_ONLY";
      if (!chainResult) record.chainErrorMessage = "区块链写入未启用，记录暂存于 MySQL";
    } catch (error) {
      record.status = "LOCAL_ONLY";
      record.chainErrorMessage = this.chainFailureMessage(error);
    }

    const result = await this.db.query<any>(
      "INSERT INTO repair_record (certificate_no,vehicle_no,vin,repair_shop_id,repair_item,fault_description,repair_time,mileage,parts_info,amount,warranty_start,warranty_end,data_hash,transaction_hash,contract_address,chain_id,chain_block_number,chain_timestamp,chain_error_message,chain_attempt_count,last_chain_attempt_time,status,create_time) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [record.certificateNo, record.vehicleNo, record.vin, record.repairShopId, record.repairItem, record.faultDescription || null, dateForMysql(record.repairTime), record.mileage, record.partsInfo || null, Number(record.amount).toFixed(2), record.warrantyStart, record.warrantyEnd, record.dataHash, record.transactionHash || null, record.contractAddress || null, record.chainId || null, record.chainBlockNumber || null, record.chainTimestamp || null, record.chainErrorMessage || null, record.chainAttemptCount, record.lastChainAttemptTime ? dateForMysql(record.lastChainAttemptTime) : null, record.status, this.db.now()],
    );
    record.id = Number(result.insertId);
    await this.detectAndSave(record);
    return toRepairResponse(record);
  }

  async get(certificateNo: string) { return toRepairResponse(await this.find(certificateNo)); }

  async retryChain(certificateNo: string, authUser: AuthUser) {
    const user = await this.auth.currentUser(authUser.userId);
    const record = await this.find(certificateNo);
    if (user.role === "OWNER") throw new ForbiddenException("vehicle owners cannot submit blockchain transactions");
    if (user.role === "REPAIR_SHOP" && record.repairShopId !== user.userId) throw new ForbiddenException("repair shops can only retry their own records");
    if (user.role !== "REPAIR_SHOP" && user.role !== "ADMIN") throw new ForbiddenException("unsupported user role");
    if (record.status === "ON_CHAIN") throw new ConflictException("repair certificate is already on chain");
    if (record.status === "REVOKED") throw new ConflictException("revoked repair certificate cannot be submitted again");
    if (calculateRepairHash(record) !== record.dataHash) throw new ConflictException("repair data hash mismatch; retry is blocked");

    const attemptTime = this.db.now();
    const lockResult = await this.db.query<any>(
      `UPDATE repair_record
       SET status='PENDING_CHAIN',chain_error_message=NULL,
           chain_attempt_count=chain_attempt_count+1,last_chain_attempt_time=?
       WHERE id=? AND (status='LOCAL_ONLY' OR (status='PENDING_CHAIN' AND (last_chain_attempt_time IS NULL OR last_chain_attempt_time<DATE_SUB(NOW(),INTERVAL 2 MINUTE))))`,
      [attemptTime, record.id],
    );
    if (!lockResult.affectedRows) throw new ConflictException("this repair certificate is already being submitted");

    let chainResult: ChainWriteResult;
    try {
      const result = await this.blockchain.addRepairProof(record);
      if (!result) throw new ServiceUnavailableException("区块链写入未启用，请先启用链上服务");
      chainResult = result;
    } catch (error) {
      const message = this.chainFailureMessage(error);
      await this.db.query("UPDATE repair_record SET status='LOCAL_ONLY',chain_error_message=? WHERE id=? AND status='PENDING_CHAIN'", [message, record.id]);
      await this.logChainAttempt(authUser, record, `补链失败：${message}`);
      throw new ServiceUnavailableException(message);
    }
    await this.db.query(
      "UPDATE repair_record SET transaction_hash=?,contract_address=?,chain_id=?,chain_block_number=?,chain_timestamp=?,status='ON_CHAIN',chain_error_message=NULL WHERE id=? AND status='PENDING_CHAIN'",
      [chainResult.transactionHash, chainResult.contractAddress, chainResult.chainId, chainResult.blockNumber, chainResult.chainTimestamp, record.id],
    );
    await this.logChainAttempt(authUser, record, `补链成功，区块 #${chainResult.blockNumber}，交易哈希：${chainResult.transactionHash}`);
    return toRepairResponse(await this.find(certificateNo));
  }

  async history(vehicleNo: string) {
    const rows = await this.db.query<any>("SELECT id,certificate_no AS certificateNo,vehicle_no AS vehicleNo,vin,repair_shop_id AS repairShopId,repair_item AS repairItem,fault_description AS faultDescription,repair_time AS repairTime,mileage,parts_info AS partsInfo,amount,warranty_start AS warrantyStart,warranty_end AS warrantyEnd,data_hash AS dataHash,transaction_hash AS transactionHash,contract_address AS contractAddress,chain_id AS chainId,chain_block_number AS chainBlockNumber,chain_timestamp AS chainTimestamp,chain_error_message AS chainErrorMessage,chain_attempt_count AS chainAttemptCount,last_chain_attempt_time AS lastChainAttemptTime,status,revoke_reason AS revokeReason,create_time AS createTime FROM repair_record WHERE vehicle_no=? ORDER BY repair_time DESC", [vehicleNo]) as RepairRecordRow[];
    return rows.map(toRepairResponse);
  }

  async historyForUser(authUser: AuthUser, vehicleNo?: string) {
    const currentUser = await this.auth.currentUser(authUser.userId);
    const normalizedVehicleNo = String(vehicleNo || "").trim();
    let condition = "";
    const params: Array<string | number> = [];

    if (currentUser.role === "OWNER") {
      condition = "WHERE v.owner_id=?";
      params.push(currentUser.userId);
    } else if (currentUser.role === "REPAIR_SHOP") {
      condition = "WHERE r.repair_shop_id=?";
      params.push(currentUser.userId);
    } else if (currentUser.role !== "ADMIN") {
      throw new ForbiddenException("unsupported user role");
    }

    if (normalizedVehicleNo) {
      condition += condition ? " AND r.vehicle_no=?" : "WHERE r.vehicle_no=?";
      params.push(normalizedVehicleNo);
    }

    const rows = await this.db.query<any>(
      `SELECT r.id,r.certificate_no AS certificateNo,r.vehicle_no AS vehicleNo,r.vin,
        r.repair_shop_id AS repairShopId,v.brand_model AS brandModel,r.repair_item AS repairItem,
        r.fault_description AS faultDescription,r.repair_time AS repairTime,
        r.mileage,r.parts_info AS partsInfo,r.amount,r.warranty_start AS warrantyStart,
        r.warranty_end AS warrantyEnd,r.data_hash AS dataHash,
        r.transaction_hash AS transactionHash,r.contract_address AS contractAddress,
        r.chain_id AS chainId,r.chain_block_number AS chainBlockNumber,r.chain_timestamp AS chainTimestamp,
        r.chain_error_message AS chainErrorMessage,r.chain_attempt_count AS chainAttemptCount,
        r.last_chain_attempt_time AS lastChainAttemptTime,
        r.status,r.revoke_reason AS revokeReason,r.create_time AS createTime
       FROM repair_record r
       INNER JOIN vehicle v ON v.vehicle_no=r.vehicle_no
       ${condition}
       ORDER BY r.repair_time DESC,r.id DESC`,
      params,
    ) as RepairRecordRow[];
    return rows.map((row) => toRepairResponse(this.normalizeRow(row)));
  }

  async verify(certificateNo: string) {
    const record = await this.find(certificateNo);
    const hashMatched = calculateRepairHash(record) === record.dataHash;
    const chainMatched = record.status === "ON_CHAIN" ? await this.blockchain.verifyRepairProof(record) : null;
    const valid = hashMatched && (chainMatched === null || chainMatched) && record.status !== "REVOKED";
    return { certificateNo, valid, hashMatched, chainMatched, status: record.status, message: valid ? "repair record verification passed" : "repair record may have been tampered with" };
  }

  async warranty(certificateNo: string) {
    const record = await this.find(certificateNo);
    const today = dateOnly(new Date().toISOString());
    let warrantyStatus: string;
    let remainingDays = 0;
    if (record.status === "REVOKED") warrantyStatus = "REVOKED";
    else if (today < dateOnly(record.warrantyStart)) { warrantyStatus = "NOT_STARTED"; remainingDays = this.daysBetween(today, dateOnly(record.warrantyEnd)); }
    else if (today > dateOnly(record.warrantyEnd)) warrantyStatus = "EXPIRED";
    else { warrantyStatus = "IN_WARRANTY"; remainingDays = this.daysBetween(today, dateOnly(record.warrantyEnd)); }
    return { certificateNo: record.certificateNo, vehicleNo: record.vehicleNo, repairItem: record.repairItem, warrantyStart: dateOnly(record.warrantyStart), warrantyEnd: dateOnly(record.warrantyEnd), warrantyStatus, remainingDays };
  }

  async rescanAbnormalRecords() {
    const rows = await this.db.query<any>(
      "SELECT id,certificate_no AS certificateNo,vehicle_no AS vehicleNo,vin,repair_shop_id AS repairShopId,repair_item AS repairItem,fault_description AS faultDescription,repair_time AS repairTime,mileage,parts_info AS partsInfo,amount,warranty_start AS warrantyStart,warranty_end AS warrantyEnd,data_hash AS dataHash,transaction_hash AS transactionHash,contract_address AS contractAddress,chain_id AS chainId,chain_block_number AS chainBlockNumber,chain_timestamp AS chainTimestamp,chain_error_message AS chainErrorMessage,chain_attempt_count AS chainAttemptCount,last_chain_attempt_time AS lastChainAttemptTime,status,revoke_reason AS revokeReason,create_time AS createTime FROM repair_record ORDER BY id ASC",
    ) as RepairRecordRow[];
    const records = rows.map((row) => this.normalizeRow(row));
    const existingRows = await this.db.query<any>(
      "SELECT id,repair_record_id AS repairRecordId,abnormal_type AS abnormalType,status,active FROM abnormal_record",
    ) as Array<{ id: number; repairRecordId: number; abnormalType: string; status: string; active: number }>;
    const existingByKey = new Map(existingRows.map((row) => [`${Number(row.repairRecordId)}:${row.abnormalType}`, row]));
    const expectedKeys = new Set<string>();
    let anomaliesCreated = 0;
    let anomaliesUpdated = 0;

    for (const record of records) {
      const vehicleRecords = records.filter((item) => item.vehicleNo === record.vehicleNo && item.id !== record.id);
      for (const anomaly of this.detectAnomalies(record, vehicleRecords)) {
        const key = `${record.id}:${anomaly.type}`;
        expectedKeys.add(key);
        const existing = existingByKey.get(key);
        if (existing) {
          const shouldRemainDismissed = existing.status === "FALSE_POSITIVE";
          await this.db.query(
            "UPDATE abnormal_record SET vehicle_no=?,risk_level=?,description=?,rule_explanation=?,active=? WHERE id=?",
            [record.vehicleNo, anomaly.riskLevel, anomaly.description, anomaly.ruleExplanation, shouldRemainDismissed ? 0 : 1, existing.id],
          );
          anomaliesUpdated++;
        } else {
          await this.db.query(
            "INSERT INTO abnormal_record (repair_record_id,vehicle_no,abnormal_type,risk_level,description,rule_explanation,status,active,create_time) VALUES (?,?,?,?,?,?,?,?,?)",
            [record.id, record.vehicleNo, anomaly.type, anomaly.riskLevel, anomaly.description, anomaly.ruleExplanation, "UNHANDLED", 1, this.db.now()],
          );
          anomaliesCreated++;
        }
      }
    }

    let anomaliesDeactivated = 0;
    for (const existing of existingRows) {
      const key = `${Number(existing.repairRecordId)}:${existing.abnormalType}`;
      if (expectedKeys.has(key)) continue;
      // 人工已确认的风险结论优先于后续规则变更，不应被系统自动撤销。
      if (existing.status === "CONFIRMED") {
        if (!Number(existing.active)) await this.db.query("UPDATE abnormal_record SET active=1 WHERE id=?", [existing.id]);
        continue;
      }
      if (!Number(existing.active)) continue;
      await this.db.query(
        `UPDATE abnormal_record SET active=0,
          handle_note=CASE WHEN status='UNHANDLED' THEN '优化后的检测规则已不再命中，系统自动解除该误报' ELSE handle_note END,
          handled_time=CASE WHEN status='UNHANDLED' THEN ? ELSE handled_time END,
          status=CASE WHEN status='UNHANDLED' THEN 'FALSE_POSITIVE' ELSE status END
         WHERE id=?`,
        [this.db.now(), existing.id],
      );
      anomaliesDeactivated++;
    }
    const activeRows = await this.db.query<any>("SELECT COUNT(*) AS count FROM abnormal_record WHERE active=1");
    return { recordsScanned: records.length, anomaliesCreated, anomaliesUpdated, anomaliesDeactivated, activeSignals: Number(activeRows[0]?.count || 0) };
  }

  private async find(certificateNo: string): Promise<RepairRecordRow> {
    const rows = await this.db.query<any>("SELECT id,certificate_no AS certificateNo,vehicle_no AS vehicleNo,vin,repair_shop_id AS repairShopId,repair_item AS repairItem,fault_description AS faultDescription,repair_time AS repairTime,mileage,parts_info AS partsInfo,amount,warranty_start AS warrantyStart,warranty_end AS warrantyEnd,data_hash AS dataHash,transaction_hash AS transactionHash,contract_address AS contractAddress,chain_id AS chainId,chain_block_number AS chainBlockNumber,chain_timestamp AS chainTimestamp,chain_error_message AS chainErrorMessage,chain_attempt_count AS chainAttemptCount,last_chain_attempt_time AS lastChainAttemptTime,status,revoke_reason AS revokeReason,create_time AS createTime FROM repair_record WHERE certificate_no=? LIMIT 1", [certificateNo]) as RepairRecordRow[];
    if (!rows.length) throw new NotFoundException(`repair certificate not found: ${certificateNo}`);
    return this.normalizeRow(rows[0]);
  }

  private async detectAndSave(record: RepairRecordRow) {
    const previous = await this.db.query<any>("SELECT id,certificate_no AS certificateNo,vehicle_no AS vehicleNo,vin,repair_shop_id AS repairShopId,repair_item AS repairItem,fault_description AS faultDescription,repair_time AS repairTime,mileage,parts_info AS partsInfo,amount,warranty_start AS warrantyStart,warranty_end AS warrantyEnd,data_hash AS dataHash,transaction_hash AS transactionHash,contract_address AS contractAddress,chain_id AS chainId,chain_block_number AS chainBlockNumber,chain_timestamp AS chainTimestamp,chain_error_message AS chainErrorMessage,chain_attempt_count AS chainAttemptCount,last_chain_attempt_time AS lastChainAttemptTime,status,revoke_reason AS revokeReason,create_time AS createTime FROM repair_record WHERE vehicle_no=? AND id<>?", [record.vehicleNo, record.id]) as RepairRecordRow[];
    const anomalies = this.detectAnomalies(record, previous.map((row) => this.normalizeRow(row)));
    let created = 0;
    for (const anomaly of anomalies) {
      const exists = await this.db.query<any>("SELECT id FROM abnormal_record WHERE repair_record_id=? AND abnormal_type=? LIMIT 1", [record.id, anomaly.type]);
      if (!exists.length) {
        await this.db.query(
          "INSERT INTO abnormal_record (repair_record_id,vehicle_no,abnormal_type,risk_level,description,rule_explanation,status,active,create_time) VALUES (?,?,?,?,?,?,?,?,?)",
          [record.id, record.vehicleNo, anomaly.type, anomaly.riskLevel, anomaly.description, anomaly.ruleExplanation, "UNHANDLED", 1, this.db.now()],
        );
        created++;
      }
    }
    return created;
  }

  private detectAnomalies(record: RepairRecordRow, sameVehicleRecords: RepairRecordRow[]): DetectedAnomaly[] {
    const anomalies: DetectedAnomaly[] = [];
    const recordTime = new Date(record.repairTime).getTime();
    const earlier = sameVehicleRecords
      .filter((item) => {
        const itemTime = new Date(item.repairTime).getTime();
        return itemTime < recordTime || (itemTime === recordTime && Number(item.id) < Number(record.id));
      })
      .sort((a, b) => new Date(a.repairTime).getTime() - new Date(b.repairTime).getTime() || Number(a.id) - Number(b.id));
    const duplicate = [...earlier].reverse().find((item) => dateOnly(item.repairTime) === dateOnly(record.repairTime) && item.repairItem === record.repairItem);

    if (earlier.length) {
      const previousMaxMileage = Math.max(...earlier.map((item) => Number(item.mileage)));
      const rollbackDistance = previousMaxMileage - Number(record.mileage);
      const mergedIntoDuplicateSignal = Boolean(duplicate) && rollbackDistance < 5000;
      if (rollbackDistance >= 500 && !mergedIntoDuplicateSignal) {
        anomalies.push({
          type: "MILEAGE_ROLLBACK",
          riskLevel: rollbackDistance >= 2000 ? "HIGH" : "MEDIUM",
          description: `当前里程 ${Number(record.mileage).toLocaleString("zh-CN")} km，比此前记录的最高里程低 ${rollbackDistance.toLocaleString("zh-CN")} km。`,
          ruleExplanation: "仅比较维修时间早于当前凭证的记录；回退不足 500 km 视为录入误差。2,000 km 及以上标记为高风险。",
        });
      }
    }

    if (duplicate) {
      const mileageDifference = Number(duplicate.mileage) - Number(record.mileage);
      const mileageEvidence = mileageDifference >= 500 ? `同时当前里程比先前凭证低 ${mileageDifference.toLocaleString("zh-CN")} km。` : "";
      anomalies.push({
        type: "DUPLICATE_REPAIR",
        riskLevel: "MEDIUM",
        description: `同一天已有相同维修项目，先前凭证为 ${duplicate.certificateNo}。${mileageEvidence}`,
        ruleExplanation: "同一车辆、同一日期、同一维修项目时，只标记后录入的凭证。若同时存在小幅里程差异，将证据合并到本信号，避免重复报警。",
      });
    }

    if (recordTime > Date.now() + 5 * 60 * 1000) {
      anomalies.push({
        type: "FUTURE_REPAIR_TIME",
        riskLevel: "HIGH",
        description: `维修时间 ${normalizeDateTime(record.repairTime).replace("T", " ")} 晚于当前系统时间。`,
        ruleExplanation: "维修时间超过服务器当前时间 5 分钟时报警，预留少量时钟偏差。",
      });
    }

    const recentRepairs = earlier.filter((item) => {
      const itemTime = new Date(item.repairTime).getTime();
      return itemTime >= recordTime - 30 * 86400000 && itemTime <= recordTime;
    });
    if (recentRepairs.length + 1 >= 4) {
      anomalies.push({
        type: "FREQUENT_REPAIR",
        riskLevel: "MEDIUM",
        description: `该车辆在当前维修前 30 天内累计出现 ${recentRepairs.length + 1} 次维修（含本次）。`,
        ruleExplanation: "仅当 30 天内达到第 4 次及以上维修时报警，降低正常返修或分项维修带来的误报。",
      });
    }

    if (calculateRepairHash(record) !== record.dataHash) {
      anomalies.push({
        type: "HASH_MISMATCH",
        riskLevel: "CRITICAL",
        description: "当前维修数据重新计算的 Hash 与数据库中保存的摘要不一致。",
        ruleExplanation: "使用凭证编号、车辆、VIN、维修项目、时间、里程、金额和质保期等核心字段重新计算 SHA-256。",
      });
    }
    return anomalies;
  }

  private async logChainAttempt(authUser: AuthUser, record: RepairRecordRow, detail: string) {
    try {
      await this.db.query(
        "INSERT INTO admin_operation_log (operator_id,action,target_type,target_id,target_label,detail,create_time) VALUES (?,?,?,?,?,?,?)",
        [authUser.userId, "RETRY_CHAIN", "REPAIR_RECORD", String(record.id), record.certificateNo, detail, this.db.now()],
      );
    } catch {
      // 补链结果优先返回，审计日志异常不反向改变已确认的链上交易状态。
    }
  }

  private chainFailureMessage(error: unknown) {
    let raw = error instanceof Error ? error.message : String(error || "");
    if (error instanceof ServiceUnavailableException) {
      const response = error.getResponse();
      if (typeof response === "string") raw = response;
      else if (response && typeof response === "object" && "message" in response) raw = String((response as { message: unknown }).message);
    }
    const normalized = raw.toLowerCase();
    if (normalized.includes("fetch failed") || normalized.includes("econnrefused") || normalized.includes("connect")) return "无法连接本地 Geth 节点，请确认 RPC 服务已启动";
    if (normalized.includes("writing is disabled") || normalized.includes("写入未启用")) return "区块链写入未启用，请检查后端链配置";
    if (normalized.includes("contract address") || normalized.includes("not deployed")) return "RepairProof 合约地址未配置或目标地址没有合约";
    if (normalized.includes("chain id mismatch")) return "Geth 网络 Chain ID 与系统配置不一致";
    if (normalized.includes("account") || normalized.includes("private key") || normalized.includes("unlocked")) return "上链账户未配置或尚未解锁";
    return `链上写入失败：${raw || "未知错误"}`.slice(0, 500);
  }

  private normalizeRow(row: RepairRecordRow): RepairRecordRow {
    return { ...row, id: Number(row.id), repairShopId: Number(row.repairShopId), chainAttemptCount: Number(row.chainAttemptCount || 0), mileage: Number(row.mileage), repairTime: normalizeDateTime(row.repairTime), warrantyStart: dateOnly(row.warrantyStart), warrantyEnd: dateOnly(row.warrantyEnd), lastChainAttemptTime: row.lastChainAttemptTime ? normalizeDateTime(row.lastChainAttemptTime) : undefined };
  }

  private validateInput(input: CreateRepairInput) {
    if (!input.vehicleNo || !input.vin || !input.repairItem || !input.repairTime || !input.warrantyStart) throw new BadRequestException("required repair fields are missing");
    if (input.warrantyRuleId === undefined && !input.warrantyEnd) throw new BadRequestException("warrantyEnd is required when no warranty rule is selected");
    if (!Number.isFinite(Number(input.mileage)) || Number(input.mileage) < 0) throw new BadRequestException("mileage must be a non-negative number");
    if (!Number.isFinite(Number(input.amount)) || Number(input.amount) < 0) throw new BadRequestException("amount must be a non-negative number");
    if (Number.isNaN(new Date(input.repairTime).getTime())) throw new BadRequestException("repairTime is invalid");
  }

  private async resolveWarranty(input: CreateRepairInput) {
    const warrantyStart = dateOnly(input.warrantyStart);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(warrantyStart) || Number.isNaN(Date.parse(`${warrantyStart}T00:00:00Z`))) {
      throw new BadRequestException("warrantyStart is invalid");
    }

    let rule: { id: number; repairItem: string; warrantyDays: number } | undefined;
    if (input.warrantyRuleId !== undefined && input.warrantyRuleId !== null) {
      const ruleId = Number(input.warrantyRuleId);
      if (!Number.isInteger(ruleId) || ruleId < 1) throw new BadRequestException("warrantyRuleId is invalid");
      const rows = await this.db.query<any>("SELECT id,repair_item AS repairItem,warranty_days AS warrantyDays FROM warranty_rule WHERE id=? AND status=1 LIMIT 1", [ruleId]);
      if (!rows.length) throw new BadRequestException("selected warranty rule does not exist or is disabled");
      rule = { id: Number(rows[0].id), repairItem: String(rows[0].repairItem), warrantyDays: Number(rows[0].warrantyDays) };
      if (String(input.repairItem).trim() !== rule.repairItem) throw new BadRequestException("repair item does not match the selected warranty rule");
    } else {
      const rows = await this.db.query<any>("SELECT id,repair_item AS repairItem,warranty_days AS warrantyDays FROM warranty_rule WHERE repair_item=? AND status=1 LIMIT 1", [String(input.repairItem).trim()]);
      if (rows.length) rule = { id: Number(rows[0].id), repairItem: String(rows[0].repairItem), warrantyDays: Number(rows[0].warrantyDays) };
    }

    if (rule) {
      const warrantyEnd = this.addDays(warrantyStart, rule.warrantyDays);
      return { repairItem: rule.repairItem, warrantyStart, warrantyEnd, warrantyRuleId: rule.id };
    }
    const warrantyEnd = dateOnly(input.warrantyEnd || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(warrantyEnd) || Number.isNaN(Date.parse(`${warrantyEnd}T00:00:00Z`))) throw new BadRequestException("warrantyEnd is invalid");
    if (warrantyEnd < warrantyStart) throw new BadRequestException("warrantyEnd must not be before warrantyStart");
    return { repairItem: String(input.repairItem).trim(), warrantyStart, warrantyEnd };
  }

  private addDays(date: string, days: number) {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + Number(days));
    return value.toISOString().slice(0, 10);
  }

  private daysBetween(start: string, end: string) { return Math.max(0, Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000)); }
}
