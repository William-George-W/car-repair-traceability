import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { AuthService } from "./auth.service";
import { AbnormalRecordRow, AuthUser } from "./types";
import { toAbnormalResponse, toRepairResponse } from "./utils";
import { RepairService } from "./repair.service";
import { BlockchainService } from "./blockchain.service";

@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService, private readonly auth: AuthService, private readonly repairsService: RepairService, private readonly blockchain: BlockchainService) {}

  private async assertAdmin(authUser: AuthUser) {
    const user = await this.auth.currentUser(authUser.userId);
    if (user.role !== "ADMIN") throw new ForbiddenException("administrator access required");
  }

  private async log(authUser: AuthUser, action: string, targetType: string, targetId: string | number, targetLabel: string, detail: string) {
    await this.db.query(
      "INSERT INTO admin_operation_log (operator_id,action,target_type,target_id,target_label,detail,create_time) VALUES (?,?,?,?,?,?,?)",
      [authUser.userId, action, targetType, String(targetId), targetLabel, detail, this.db.now()],
    );
  }

  async users(authUser: AuthUser) {
    await this.assertAdmin(authUser);
    return this.db.query<any>("SELECT id AS userId,username,role,status,blockchain_address AS blockchainAddress,create_time AS createTime FROM sys_user ORDER BY create_time DESC");
  }

  async operationLogs(limit: string | undefined, authUser: AuthUser) {
    await this.assertAdmin(authUser);
    const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return this.db.query<any>(
      `SELECT l.id,l.action,l.target_type AS targetType,l.target_id AS targetId,
        l.target_label AS targetLabel,l.detail,l.create_time AS createTime,
        l.operator_id AS operatorId,u.username AS operatorUsername
       FROM admin_operation_log l
       LEFT JOIN sys_user u ON u.id=l.operator_id
       ORDER BY l.create_time DESC,l.id DESC LIMIT ${parsedLimit}`,
    );
  }

  async updateUserStatus(userId: number, status: number, authUser: AuthUser) {
    await this.assertAdmin(authUser);
    if (![0, 1].includes(Number(status))) throw new BadRequestException("status must be 0 or 1");
    if (Number(userId) === authUser.userId && Number(status) === 0) throw new BadRequestException("cannot disable the current administrator");
    const result = await this.db.query<any>("UPDATE sys_user SET status=? WHERE id=?", [Number(status), Number(userId)]);
    if (!result.affectedRows) throw new NotFoundException("user not found");
    const targetRows = await this.db.query<any>("SELECT username FROM sys_user WHERE id=? LIMIT 1", [Number(userId)]);
    await this.log(authUser, Number(status) === 1 ? "ENABLE_USER" : "DISABLE_USER", "USER", userId, targetRows[0]?.username || `用户 #${userId}`, Number(status) === 1 ? "启用平台账号" : "停用平台账号");
    return { userId: Number(userId), status: Number(status), message: Number(status) === 1 ? "user enabled" : "user disabled" };
  }

  async repairs(authUser: AuthUser) {
    await this.assertAdmin(authUser);
    const rows = await this.db.query<any>(
      `SELECT r.id,r.certificate_no AS certificateNo,r.vehicle_no AS vehicleNo,r.vin,
        r.repair_shop_id AS repairShopId,shop.username AS repairShopUsername,
        owner.username AS ownerUsername,v.brand_model AS brandModel,
        r.repair_item AS repairItem,r.fault_description AS faultDescription,
        r.repair_time AS repairTime,r.mileage,r.parts_info AS partsInfo,r.amount,
        r.warranty_start AS warrantyStart,r.warranty_end AS warrantyEnd,
        r.data_hash AS dataHash,r.transaction_hash AS transactionHash,r.contract_address AS contractAddress,
        r.chain_id AS chainId,r.chain_block_number AS chainBlockNumber,r.chain_timestamp AS chainTimestamp,
        r.chain_error_message AS chainErrorMessage,r.chain_attempt_count AS chainAttemptCount,
        r.last_chain_attempt_time AS lastChainAttemptTime,
        r.revoke_transaction_hash AS revokeTransactionHash,r.status,
        r.revoke_reason AS revokeReason,r.revoked_by AS revokedBy,
        revoked.username AS revokedByUsername,r.revoked_time AS revokedTime,r.create_time AS createTime
       FROM repair_record r
       LEFT JOIN vehicle v ON v.vehicle_no=r.vehicle_no
       LEFT JOIN sys_user shop ON shop.id=r.repair_shop_id
       LEFT JOIN sys_user owner ON owner.id=v.owner_id
       LEFT JOIN sys_user revoked ON revoked.id=r.revoked_by
       ORDER BY r.repair_time DESC, r.id DESC`,
    );
    return rows.map(toRepairResponse).map((row: any, index: number) => ({
      ...row,
      repairShopUsername: rows[index].repairShopUsername,
      ownerUsername: rows[index].ownerUsername,
      brandModel: rows[index].brandModel,
      revokedByUsername: rows[index].revokedByUsername,
    }));
  }

  async revokeRepair(certificateNo: string, reason: string, authUser: AuthUser) {
    await this.assertAdmin(authUser);
    const normalizedReason = String(reason || "").trim();
    if (normalizedReason.length < 2 || normalizedReason.length > 255) throw new BadRequestException("revoke reason must be 2-255 characters");
    const rows = await this.db.query<any>("SELECT id,status,transaction_hash AS transactionHash,contract_address AS contractAddress FROM repair_record WHERE certificate_no=? LIMIT 1", [certificateNo]);
    if (!rows.length) throw new NotFoundException("repair certificate not found");
    if (rows[0].status === "REVOKED") throw new ConflictException("repair certificate is already revoked");
    const chainRevokeTransactionHash = await this.blockchain.revokeRepairProof({ certificateNo, status: rows[0].status, transactionHash: rows[0].transactionHash, contractAddress: rows[0].contractAddress });
    await this.db.query("UPDATE repair_record SET status='REVOKED',revoke_reason=?,revoked_by=?,revoked_time=?,revoke_transaction_hash=? WHERE id=?", [normalizedReason, authUser.userId, this.db.now(), chainRevokeTransactionHash, rows[0].id]);
    const chainDetail = chainRevokeTransactionHash ? `；链上撤销交易：${chainRevokeTransactionHash}` : "；该记录无链上凭证，仅更新链下状态";
    await this.log(authUser, "REVOKE_REPAIR", "REPAIR_RECORD", rows[0].id, certificateNo, `撤销维修凭证：${normalizedReason}${chainDetail}`);
    return { certificateNo, status: "REVOKED", revokeReason: normalizedReason, revokeTransactionHash: chainRevokeTransactionHash || undefined, message: "repair certificate revoked" };
  }

  async abnormalRecords(status: string | undefined, authUser: AuthUser) {
    await this.assertAdmin(authUser);
    const normalizedStatus = status && ["UNHANDLED", "CONFIRMED", "FALSE_POSITIVE"].includes(status) ? status : undefined;
    const whereClause = normalizedStatus === "FALSE_POSITIVE"
      ? "WHERE a.status=?"
      : normalizedStatus
        ? "WHERE a.status=? AND a.active=1"
        : "WHERE a.active=1";
    const rows = await this.db.query<any>(
      `SELECT a.id,a.repair_record_id AS repairRecordId,a.vehicle_no AS vehicleNo,
        a.abnormal_type AS abnormalType,a.risk_level AS riskLevel,a.description,
        a.rule_explanation AS ruleExplanation,a.status,a.active,a.handle_note AS handleNote,
        a.handled_by AS handledBy,handler.username AS handledByUsername,
        a.handled_time AS handledTime,a.create_time AS createTime,
        r.certificate_no AS certificateNo,r.repair_item AS repairItem
       FROM abnormal_record a
       LEFT JOIN repair_record r ON r.id=a.repair_record_id
       LEFT JOIN sys_user handler ON handler.id=a.handled_by
       ${whereClause}
       ORDER BY FIELD(a.risk_level,'CRITICAL','HIGH','MEDIUM','LOW'),a.status='UNHANDLED' DESC,a.create_time DESC`,
      normalizedStatus ? [normalizedStatus] : [],
    ) as any[];
    return rows.map((row) => ({ ...toAbnormalResponse(row as AbnormalRecordRow), certificateNo: row.certificateNo, repairItem: row.repairItem, handledByUsername: row.handledByUsername }));
  }

  async handleAbnormal(id: number, note: string, resolution: "CONFIRMED" | "FALSE_POSITIVE", authUser: AuthUser) {
    await this.assertAdmin(authUser);
    const normalizedNote = String(note || "").trim();
    if (normalizedNote.length < 2 || normalizedNote.length > 500) throw new BadRequestException("handling note must be 2-500 characters");
    if (!["CONFIRMED", "FALSE_POSITIVE"].includes(resolution)) throw new BadRequestException("invalid abnormal resolution");
    const targetRows = await this.db.query<any>("SELECT vehicle_no AS vehicleNo,abnormal_type AS abnormalType,status,active FROM abnormal_record WHERE id=? LIMIT 1", [Number(id)]);
    if (!targetRows.length) throw new NotFoundException("abnormal record not found");
    if (targetRows[0].status !== "UNHANDLED" || !Number(targetRows[0].active)) throw new ConflictException("abnormal record has already been reviewed");
    const active = resolution === "CONFIRMED" ? 1 : 0;
    const result = await this.db.query<any>("UPDATE abnormal_record SET status=?,active=?,handle_note=?,handled_by=?,handled_time=? WHERE id=? AND status='UNHANDLED' AND active=1", [resolution, active, normalizedNote, authUser.userId, this.db.now(), Number(id)]);
    if (!result.affectedRows) throw new NotFoundException("abnormal record not found");
    const action = resolution === "FALSE_POSITIVE" ? "DISMISS_ABNORMAL" : "HANDLE_ABNORMAL";
    const resultLabel = resolution === "FALSE_POSITIVE" ? "解除误报" : "确认风险";
    await this.log(authUser, action, "ABNORMAL_RECORD", id, `${targetRows[0].vehicleNo} · ${targetRows[0].abnormalType}`, `${resultLabel}：${normalizedNote}`);
    return { id: Number(id), status: resolution, active: Boolean(active), handleNote: normalizedNote, handledBy: authUser.userId, message: "abnormal record reviewed" };
  }

  async rescanAbnormalRecords(authUser: AuthUser) {
    await this.assertAdmin(authUser);
    const result = await this.repairsService.rescanAbnormalRecords();
    await this.log(authUser, "RESCAN_ABNORMAL", "ABNORMAL_RECORD", "ALL", "全量维修记录", `重新扫描 ${result.recordsScanned} 条维修记录，新增 ${result.anomaliesCreated} 条，自动解除 ${result.anomaliesDeactivated} 条，当前有效信号 ${result.activeSignals} 条`);
    return { ...result, message: "abnormal records rescanned" };
  }
}
