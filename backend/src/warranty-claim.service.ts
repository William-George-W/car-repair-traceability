import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { AuthService } from "./auth.service";
import { DatabaseService } from "./database.service";
import { AuthUser } from "./types";

type ClaimAction = "ACCEPT" | "COMPLETE" | "REJECT";

@Injectable()
export class WarrantyClaimService {
  constructor(private readonly db: DatabaseService, private readonly auth: AuthService) {}

  async eligibleRepairs(authUser: AuthUser) {
    const user = await this.auth.currentUser(authUser.userId);
    if (user.role !== "OWNER") throw new ForbiddenException("only vehicle owners can query eligible warranty repairs");
    return this.db.query<any>(
      `SELECT r.id,r.certificate_no AS certificateNo,r.vehicle_no AS vehicleNo,r.vin,
        r.repair_item AS repairItem,r.repair_time AS repairTime,r.warranty_start AS warrantyStart,
        r.warranty_end AS warrantyEnd,r.transaction_hash AS transactionHash,
        v.brand_model AS brandModel,shop.username AS repairShopUsername,
        DATEDIFF(r.warranty_end,CURDATE()) AS remainingDays
       FROM repair_record r
       INNER JOIN vehicle v ON v.vehicle_no=r.vehicle_no
       INNER JOIN sys_user shop ON shop.id=r.repair_shop_id
       WHERE v.owner_id=? AND r.status='ON_CHAIN'
         AND CURDATE() BETWEEN r.warranty_start AND r.warranty_end
         AND NOT EXISTS (
           SELECT 1 FROM warranty_claim c
           WHERE c.repair_record_id=r.id AND c.status IN ('PENDING','ACCEPTED')
         )
       ORDER BY r.warranty_end ASC,r.repair_time DESC`,
      [user.userId],
    );
  }

  async create(certificateNo: string, reason: string, authUser: AuthUser) {
    const user = await this.auth.currentUser(authUser.userId);
    if (user.role !== "OWNER") throw new ForbiddenException("only vehicle owners can submit warranty claims");
    const normalizedReason = String(reason || "").trim();
    if (normalizedReason.length < 5 || normalizedReason.length > 1000) throw new BadRequestException("claim reason must be 5-1000 characters");

    const rows = await this.db.query<any>(
      `SELECT r.id,r.certificate_no AS certificateNo,r.repair_shop_id AS repairShopId,
        r.status,r.warranty_start AS warrantyStart,r.warranty_end AS warrantyEnd,
        v.owner_id AS ownerId
       FROM repair_record r INNER JOIN vehicle v ON v.vehicle_no=r.vehicle_no
       WHERE r.certificate_no=? LIMIT 1`,
      [String(certificateNo || "").trim()],
    );
    if (!rows.length || Number(rows[0].ownerId) !== user.userId) throw new NotFoundException("repair certificate not found or does not belong to the current owner");
    const repair = rows[0];
    if (repair.status !== "ON_CHAIN") throw new ConflictException("only valid on-chain repair certificates can submit warranty claims");
    const today = this.db.now().slice(0, 10);
    if (today < String(repair.warrantyStart).slice(0, 10)) throw new ConflictException("warranty period has not started");
    if (today > String(repair.warrantyEnd).slice(0, 10)) throw new ConflictException("warranty period has expired");

    const activeClaims = await this.db.query<any>("SELECT id FROM warranty_claim WHERE repair_record_id=? AND status IN ('PENDING','ACCEPTED') LIMIT 1", [repair.id]);
    if (activeClaims.length) throw new ConflictException("an active warranty claim already exists for this repair certificate");

    const claimNo = this.generateClaimNo();
    const now = this.db.now();
    try {
      const result = await this.db.query<any>(
        "INSERT INTO warranty_claim (claim_no,repair_record_id,owner_id,repair_shop_id,reason,status,submitted_time,updated_time) VALUES (?,?,?,?,?,'PENDING',?,?)",
        [claimNo, repair.id, user.userId, Number(repair.repairShopId), normalizedReason, now, now],
      );
      await this.log(user.userId, "WARRANTY_CLAIM_SUBMIT", result.insertId, claimNo, `车主提交质保申请，关联凭证 ${repair.certificateNo}`);
      return this.findById(Number(result.insertId), user);
    } catch (error: any) {
      if (error?.code === "ER_DUP_ENTRY") throw new ConflictException("an active warranty claim already exists for this repair certificate");
      throw error;
    }
  }

  async list(status: string | undefined, authUser: AuthUser) {
    const user = await this.auth.currentUser(authUser.userId);
    const params: Array<string | number> = [];
    const conditions: string[] = [];
    if (user.role === "OWNER") { conditions.push("c.owner_id=?"); params.push(user.userId); }
    else if (user.role === "REPAIR_SHOP") { conditions.push("c.repair_shop_id=?"); params.push(user.userId); }
    else if (user.role !== "ADMIN") throw new ForbiddenException("unsupported user role");

    const normalizedStatus = status && ["PENDING", "ACCEPTED", "COMPLETED", "REJECTED"].includes(status) ? status : undefined;
    if (normalizedStatus) { conditions.push("c.status=?"); params.push(normalizedStatus); }
    return this.queryClaims(conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params);
  }

  async process(claimNo: string, action: ClaimAction, note: string | undefined, authUser: AuthUser) {
    const user = await this.auth.currentUser(authUser.userId);
    if (user.role !== "REPAIR_SHOP") throw new ForbiddenException("only repair shops can process warranty claims");
    const rows = await this.db.query<any>("SELECT id,claim_no AS claimNo,repair_shop_id AS repairShopId,status FROM warranty_claim WHERE claim_no=? LIMIT 1", [claimNo]);
    if (!rows.length) throw new NotFoundException("warranty claim not found");
    const claim = rows[0];
    if (Number(claim.repairShopId) !== user.userId) throw new ForbiddenException("repair shops can only process claims assigned to them");

    const normalizedNote = String(note || "").trim();
    if (normalizedNote.length > 1000) throw new BadRequestException("processing note must not exceed 1000 characters");
    const now = this.db.now();
    let result: any;
    let actionCode: string;
    let detail: string;

    if (action === "ACCEPT") {
      if (claim.status !== "PENDING") throw new ConflictException("only pending warranty claims can be accepted");
      const acceptNote = normalizedNote || "维修商已受理，等待安排质保处理";
      result = await this.db.query<any>("UPDATE warranty_claim SET status='ACCEPTED',accept_note=?,accepted_time=?,updated_time=? WHERE id=? AND status='PENDING'", [acceptNote, now, now, claim.id]);
      actionCode = "WARRANTY_CLAIM_ACCEPT";
      detail = `维修商受理质保申请：${acceptNote}`;
    } else if (action === "COMPLETE") {
      if (claim.status !== "ACCEPTED") throw new ConflictException("only accepted warranty claims can be completed");
      if (normalizedNote.length < 2) throw new BadRequestException("completion note must contain at least 2 characters");
      result = await this.db.query<any>("UPDATE warranty_claim SET status='COMPLETED',result_note=?,completed_time=?,updated_time=? WHERE id=? AND status='ACCEPTED'", [normalizedNote, now, now, claim.id]);
      actionCode = "WARRANTY_CLAIM_COMPLETE";
      detail = `质保处理完成：${normalizedNote}`;
    } else if (action === "REJECT") {
      if (!["PENDING", "ACCEPTED"].includes(claim.status)) throw new ConflictException("only pending or accepted warranty claims can be rejected");
      if (normalizedNote.length < 2) throw new BadRequestException("rejection reason must contain at least 2 characters");
      result = await this.db.query<any>("UPDATE warranty_claim SET status='REJECTED',result_note=?,rejected_time=?,updated_time=? WHERE id=? AND status IN ('PENDING','ACCEPTED')", [normalizedNote, now, now, claim.id]);
      actionCode = "WARRANTY_CLAIM_REJECT";
      detail = `质保申请驳回：${normalizedNote}`;
    } else {
      throw new BadRequestException("unsupported warranty claim action");
    }

    if (!result.affectedRows) throw new ConflictException("warranty claim status has changed; please refresh and try again");
    await this.log(user.userId, actionCode, claim.id, claim.claimNo, detail);
    return this.findById(Number(claim.id), user);
  }

  private async findById(id: number, user: { userId: number; role: string }) {
    const conditions = ["c.id=?"];
    const params: Array<number> = [id];
    if (user.role === "OWNER") { conditions.push("c.owner_id=?"); params.push(user.userId); }
    if (user.role === "REPAIR_SHOP") { conditions.push("c.repair_shop_id=?"); params.push(user.userId); }
    const rows = await this.queryClaims(`WHERE ${conditions.join(" AND ")}`, params);
    if (!rows.length) throw new NotFoundException("warranty claim not found");
    return rows[0];
  }

  private async queryClaims(whereClause: string, params: Array<string | number>) {
    const rows = await this.db.query<any>(
      `SELECT c.id,c.claim_no AS claimNo,c.repair_record_id AS repairRecordId,
        c.owner_id AS ownerId,owner.username AS ownerUsername,
        c.repair_shop_id AS repairShopId,shop.username AS repairShopUsername,
        c.reason,c.status,c.accept_note AS acceptNote,c.result_note AS resultNote,
        c.submitted_time AS submittedTime,c.accepted_time AS acceptedTime,
        c.completed_time AS completedTime,c.rejected_time AS rejectedTime,c.updated_time AS updatedTime,
        r.certificate_no AS certificateNo,r.vehicle_no AS vehicleNo,r.vin,r.repair_item AS repairItem,
        r.repair_time AS repairTime,r.warranty_start AS warrantyStart,r.warranty_end AS warrantyEnd,
        r.transaction_hash AS transactionHash,v.brand_model AS brandModel
       FROM warranty_claim c
       INNER JOIN repair_record r ON r.id=c.repair_record_id
       INNER JOIN vehicle v ON v.vehicle_no=r.vehicle_no
       INNER JOIN sys_user owner ON owner.id=c.owner_id
       INNER JOIN sys_user shop ON shop.id=c.repair_shop_id
       ${whereClause}
       ORDER BY FIELD(c.status,'PENDING','ACCEPTED','COMPLETED','REJECTED'),c.updated_time DESC,c.id DESC`,
      params,
    );
    return rows.map((row: any) => ({
      ...row,
      id: Number(row.id),
      repairRecordId: Number(row.repairRecordId),
      ownerId: Number(row.ownerId),
      repairShopId: Number(row.repairShopId),
    }));
  }

  private async log(operatorId: number, action: string, targetId: number, claimNo: string, detail: string) {
    await this.db.query(
      "INSERT INTO admin_operation_log (operator_id,action,target_type,target_id,target_label,detail,create_time) VALUES (?,?,?,?,?,?,?)",
      [operatorId, action, "WARRANTY_CLAIM", String(targetId), claimNo, detail, this.db.now()],
    );
  }

  private generateClaimNo() {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `WC${stamp}${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  }
}
