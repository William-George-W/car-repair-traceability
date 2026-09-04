import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { AuthService } from "./auth.service";
import { AuthUser, VehicleRow, AbnormalRecordRow } from "./types";
import { toAbnormalResponse, toVehicleResponse } from "./utils";

@Injectable()
export class VehicleService {
  constructor(private readonly db: DatabaseService, private readonly auth: AuthService) {}

  async create(body: { vehicleNo: string; vin: string; plateNo: string; brandModel: string }, authUser: AuthUser) {
    const user = await this.auth.currentUser(authUser.userId);
    if (user.role !== "OWNER") throw new ForbiddenException("only vehicle owners can bind vehicles");
    const existing = await this.db.query<any>("SELECT id FROM vehicle WHERE vehicle_no=? OR vin=? LIMIT 1", [body.vehicleNo, body.vin]);
    if (existing.length) throw new ConflictException("vehicle number or VIN already exists");
    const result = await this.db.query<any>("INSERT INTO vehicle (vehicle_no,vin,plate_no,brand_model,owner_id,create_time) VALUES (?,?,?,?,?,?)", [body.vehicleNo, body.vin, body.plateNo, body.brandModel, user.userId, this.db.now()]);
    return toVehicleResponse({ id: Number(result.insertId), ...body, ownerId: user.userId, createTime: new Date().toISOString() });
  }

  async list(authUser: AuthUser) {
    const user = await this.auth.currentUser(authUser.userId);
    // 维修商需要从平台车辆档案中选择本次服务对象；车主仍然只能看到自己绑定的车辆。
    const canViewAllVehicles = user.role === "ADMIN" || user.role === "REPAIR_SHOP";
    const sql = canViewAllVehicles
      ? "SELECT id,vehicle_no AS vehicleNo,vin,plate_no AS plateNo,brand_model AS brandModel,owner_id AS ownerId,create_time AS createTime FROM vehicle ORDER BY create_time DESC"
      : "SELECT id,vehicle_no AS vehicleNo,vin,plate_no AS plateNo,brand_model AS brandModel,owner_id AS ownerId,create_time AS createTime FROM vehicle WHERE owner_id=? ORDER BY create_time DESC";
    const rows = await this.db.query<any>(sql, canViewAllVehicles ? [] : [user.userId]) as VehicleRow[];
    return rows.map(toVehicleResponse);
  }

  async get(vehicleNo: string, authUser: AuthUser) {
    const user = await this.auth.currentUser(authUser.userId);
    const condition = user.role === "OWNER" ? "AND owner_id=?" : "";
    const params = user.role === "OWNER" ? [vehicleNo, user.userId] : [vehicleNo];
    const rows = await this.db.query<any>(`SELECT id,vehicle_no AS vehicleNo,vin,plate_no AS plateNo,brand_model AS brandModel,owner_id AS ownerId,create_time AS createTime FROM vehicle WHERE vehicle_no=? ${condition} LIMIT 1`, params) as VehicleRow[];
    if (!rows.length) throw new NotFoundException("vehicle not found or access denied");
    return toVehicleResponse(rows[0]);
  }

  async assertAccessible(vehicleNo: string, authUser: AuthUser) {
    return this.get(vehicleNo, authUser);
  }

  async abnormalRecords(vehicleNo: string) {
    const rows = await this.db.query<any>("SELECT id,repair_record_id AS repairRecordId,vehicle_no AS vehicleNo,abnormal_type AS abnormalType,risk_level AS riskLevel,description,rule_explanation AS ruleExplanation,status,active,handle_note AS handleNote,handled_by AS handledBy,handled_time AS handledTime,create_time AS createTime FROM abnormal_record WHERE vehicle_no=? AND active=1 ORDER BY FIELD(risk_level,'CRITICAL','HIGH','MEDIUM','LOW'),create_time DESC", [vehicleNo]) as AbnormalRecordRow[];
    return rows.map(toAbnormalResponse);
  }
}
