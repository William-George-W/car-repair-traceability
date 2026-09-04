import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { AuthService } from "./auth.service";
import { AuthUser, WarrantyRuleRow } from "./types";

export interface CreateWarrantyRuleInput {
  repairItem: string;
  warrantyDays: number;
  description?: string;
}

export interface UpdateWarrantyRuleInput {
  repairItem?: string;
  warrantyDays?: number;
  description?: string;
}

@Injectable()
export class WarrantyRuleService {
  constructor(private readonly db: DatabaseService, private readonly auth: AuthService) {}

  async activeRules(authUser: AuthUser) {
    await this.auth.currentUser(authUser.userId);
    const rows = await this.db.query<any>(
      "SELECT id,repair_item AS repairItem,warranty_days AS warrantyDays,description,status,create_time AS createTime,update_time AS updateTime FROM warranty_rule WHERE status=1 ORDER BY repair_item ASC",
    ) as WarrantyRuleRow[];
    return rows.map((row) => this.toResponse(row));
  }

  async allRules(authUser: AuthUser) {
    await this.assertAdmin(authUser);
    const rows = await this.db.query<any>(
      "SELECT id,repair_item AS repairItem,warranty_days AS warrantyDays,description,status,create_time AS createTime,update_time AS updateTime FROM warranty_rule ORDER BY status DESC,update_time DESC,id DESC",
    ) as WarrantyRuleRow[];
    return rows.map((row) => this.toResponse(row));
  }

  async create(input: CreateWarrantyRuleInput, authUser: AuthUser) {
    await this.assertAdmin(authUser);
    const repairItem = String(input.repairItem || "").trim();
    const warrantyDays = Number(input.warrantyDays);
    const description = this.normalizeDescription(input.description);
    this.validateValues(repairItem, warrantyDays);
    const duplicate = await this.db.query<any>("SELECT id FROM warranty_rule WHERE repair_item=? LIMIT 1", [repairItem]);
    if (duplicate.length) throw new ConflictException("warranty rule for this repair item already exists");

    const timestamp = this.db.now();
    const result = await this.db.query<any>(
      "INSERT INTO warranty_rule (repair_item,warranty_days,description,status,create_time,update_time) VALUES (?,?,?,?,?,?)",
      [repairItem, warrantyDays, description, 1, timestamp, timestamp],
    );
    await this.log(authUser, "CREATE_WARRANTY_RULE", "WARRANTY_RULE", result.insertId, repairItem, `新增质保规则：${warrantyDays} 天`);
    return this.toResponse({ id: Number(result.insertId), repairItem, warrantyDays, description, status: 1, createTime: timestamp, updateTime: timestamp });
  }

  async update(id: number, input: UpdateWarrantyRuleInput, authUser: AuthUser) {
    await this.assertAdmin(authUser);
    const ruleId = this.parseId(id);
    const rows = await this.db.query<any>(
      "SELECT id,repair_item AS repairItem,warranty_days AS warrantyDays,description,status,create_time AS createTime,update_time AS updateTime FROM warranty_rule WHERE id=? LIMIT 1",
      [ruleId],
    ) as WarrantyRuleRow[];
    if (!rows.length) throw new NotFoundException("warranty rule not found");

    const current = this.toResponse(rows[0]);
    const repairItem = input.repairItem === undefined ? current.repairItem : String(input.repairItem).trim();
    const warrantyDays = input.warrantyDays === undefined ? current.warrantyDays : Number(input.warrantyDays);
    const description = input.description === undefined ? current.description : this.normalizeDescription(input.description);
    this.validateValues(repairItem, warrantyDays);
    const duplicate = await this.db.query<any>("SELECT id FROM warranty_rule WHERE repair_item=? AND id<>? LIMIT 1", [repairItem, ruleId]);
    if (duplicate.length) throw new ConflictException("warranty rule for this repair item already exists");

    const updateTime = this.db.now();
    await this.db.query(
      "UPDATE warranty_rule SET repair_item=?,warranty_days=?,description=?,update_time=? WHERE id=?",
      [repairItem, warrantyDays, description, updateTime, ruleId],
    );
    await this.log(authUser, "UPDATE_WARRANTY_RULE", "WARRANTY_RULE", ruleId, repairItem, `更新质保规则：${warrantyDays} 天`);
    return this.toResponse({ ...current, id: ruleId, repairItem, warrantyDays, description, updateTime });
  }

  async updateStatus(id: number, status: number, authUser: AuthUser) {
    await this.assertAdmin(authUser);
    const ruleId = this.parseId(id);
    const normalizedStatus = Number(status);
    if (![0, 1].includes(normalizedStatus)) throw new BadRequestException("status must be 0 or 1");
    const rows = await this.db.query<any>("SELECT repair_item AS repairItem FROM warranty_rule WHERE id=? LIMIT 1", [ruleId]);
    if (!rows.length) throw new NotFoundException("warranty rule not found");
    await this.db.query("UPDATE warranty_rule SET status=?,update_time=? WHERE id=?", [normalizedStatus, this.db.now(), ruleId]);
    await this.log(
      authUser,
      normalizedStatus === 1 ? "ENABLE_WARRANTY_RULE" : "DISABLE_WARRANTY_RULE",
      "WARRANTY_RULE",
      ruleId,
      rows[0].repairItem,
      normalizedStatus === 1 ? "启用质保规则" : "停用质保规则",
    );
    return { id: ruleId, status: normalizedStatus, message: normalizedStatus === 1 ? "warranty rule enabled" : "warranty rule disabled" };
  }

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

  private validateValues(repairItem: string, warrantyDays: number) {
    if (!repairItem || repairItem.length > 255) throw new BadRequestException("repair item must be 1-255 characters");
    if (!Number.isInteger(warrantyDays) || warrantyDays < 1 || warrantyDays > 3650) throw new BadRequestException("warranty days must be an integer between 1 and 3650");
  }

  private normalizeDescription(value?: string) {
    const description = String(value || "").trim();
    if (description.length > 500) throw new BadRequestException("description must not exceed 500 characters");
    return description || null;
  }

  private parseId(value: number) {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) throw new BadRequestException("warranty rule id is invalid");
    return id;
  }

  private toResponse(row: WarrantyRuleRow) {
    return {
      ...row,
      id: Number(row.id),
      warrantyDays: Number(row.warrantyDays),
      status: Number(row.status),
    };
  }
}
